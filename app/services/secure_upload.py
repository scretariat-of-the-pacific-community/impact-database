"""
Secure file upload service with comprehensive validation and robust MinIO integration.
This service provides enterprise-grade upload security for the Impact Database API.
"""

import os
import re
import io
import time
import hashlib
import magic
import mimetypes
from datetime import datetime
from typing import Optional, Tuple, Dict, Any, List, BinaryIO
from pathlib import Path

from fastapi import HTTPException, UploadFile
import logging

from .minio_robust import get_robust_minio_client, MinIOError, MinIOUploadError

logger = logging.getLogger(__name__)

# Security Configuration
class UploadConfig:
    """Configuration for secure uploads"""
    
    # File size limits (in bytes)
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    MIN_FILE_SIZE = 1024  # 1KB
    
    # Allowed file extensions (case-insensitive)
    ALLOWED_EXTENSIONS = {
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', 
        '.webp', '.avif', '.heic', '.heif'
    }
    
    # Allowed MIME types
    ALLOWED_MIME_TYPES = {
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
        'image/bmp', 'image/tiff', 'image/webp', 'image/avif',
        'image/heic', 'image/heif'
    }
    
    # Magic bytes for content verification (first 4 bytes)
    MAGIC_BYTES = {
        b'\xFF\xD8\xFF': 'image/jpeg',  # JPEG
        b'\x89\x50\x4E\x47': 'image/png',  # PNG
        b'\x47\x49\x46': 'image/gif',  # GIF
        b'\x42\x4D': 'image/bmp',  # BMP  
        b'\x49\x49\x2A\x00': 'image/tiff',  # TIFF (little endian)
        b'\x4D\x4D\x00\x2A': 'image/tiff',  # TIFF (big endian)
        b'\x52\x49\x46\x46': 'image/webp',  # WebP (partial check)
    }
    
    # Dangerous filename patterns
    FORBIDDEN_PATTERNS = [
        r'\.\./',  # Directory traversal
        r'[<>:"|?*]',  # Windows forbidden characters
        r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$',  # Windows reserved names
        r'^\.',  # Hidden files starting with dot
        r'\x00',  # Null bytes
    ]
    
    # Maximum filename length
    MAX_FILENAME_LENGTH = 255


class UploadValidator:
    """Validates uploaded files for security compliance"""
    
    def __init__(self, config: UploadConfig = None):
        self.config = config or UploadConfig()
    
    async def validate_upload(self, file: UploadFile) -> Tuple[bytes, Dict[str, Any]]:
        """
        Comprehensive upload validation.
        
        Returns:
            Tuple[bytes, Dict]: File content and validation metadata
            
        Raises:
            HTTPException: If validation fails
        """
        # Step 1: Basic file checks
        if not file.filename:
            raise HTTPException(
                status_code=400, 
                detail="Filename is required"
            )
        
        if not file.content_type:
            raise HTTPException(
                status_code=400,
                detail="Content-Type header is required"
            )
        
        # Step 2: Read and validate file content
        try:
            content = await file.read()
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to read file content: {str(e)}"
            )
        
        # Reset file position for potential re-reads
        await file.seek(0)
        
        # Step 3: Size validation
        self._validate_file_size(content)
        
        # Step 4: Filename validation and sanitization
        safe_filename = self._validate_and_sanitize_filename(file.filename)
        
        # Step 5: Extension validation
        self._validate_file_extension(safe_filename)
        
        # Step 6: MIME type validation
        declared_mime = self._validate_declared_mime_type(file.content_type)
        
        # Step 7: Content sniffing and validation
        detected_mime = self._detect_content_type(content)
        
        # Step 8: Cross-validate MIME types
        self._cross_validate_mime_types(declared_mime, detected_mime, safe_filename)
        
        # Step 9: Security content scan
        self._scan_content_security(content)
        
        # Create validation metadata
        validation_metadata = {
            'original_filename': file.filename,
            'safe_filename': safe_filename,
            'file_size': len(content),
            'declared_mime_type': declared_mime,
            'detected_mime_type': detected_mime,
            'file_hash': hashlib.sha256(content).hexdigest(),
            'validation_timestamp': datetime.utcnow().isoformat(),
        }
        
        logger.info(f"Upload validation successful for {safe_filename}: {validation_metadata}")
        
        return content, validation_metadata
    
    def _validate_file_size(self, content: bytes) -> None:
        """Validate file size is within allowed limits"""
        size = len(content)
        
        if size < self.config.MIN_FILE_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"File too small. Minimum size: {self.config.MIN_FILE_SIZE} bytes"
            )
        
        if size > self.config.MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,  # Payload Too Large
                detail=f"File too large. Maximum size: {self.config.MAX_FILE_SIZE} bytes ({self.config.MAX_FILE_SIZE // (1024*1024)}MB)"
            )
    
    def _validate_and_sanitize_filename(self, filename: str) -> str:
        """Validate and sanitize filename for security"""
        if len(filename) > self.config.MAX_FILENAME_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"Filename too long. Maximum length: {self.config.MAX_FILENAME_LENGTH} characters"
            )
        
        # Check for dangerous patterns
        for pattern in self.config.FORBIDDEN_PATTERNS:
            if re.search(pattern, filename, re.IGNORECASE):
                raise HTTPException(
                    status_code=400,
                    detail=f"Filename contains forbidden pattern: {filename}"
                )
        
        # Sanitize filename
        # Remove or replace dangerous characters
        safe_filename = re.sub(r'[^\w\-_\.]', '_', filename)
        
        # Ensure filename has proper extension
        if '.' not in safe_filename:
            raise HTTPException(
                status_code=400,
                detail="Filename must have a valid extension"
            )
        
        # Prevent double extensions like .jpg.exe
        parts = safe_filename.split('.')
        if len(parts) > 2:
            # Keep only the last extension
            safe_filename = f"{'.'.join(parts[:-1]).replace('.', '_')}.{parts[-1]}"
        
        return safe_filename
    
    def _validate_file_extension(self, filename: str) -> None:
        """Validate file extension is allowed"""
        ext = Path(filename).suffix.lower()
        
        if not ext:
            raise HTTPException(
                status_code=400,
                detail="File must have an extension"
            )
        
        if ext not in self.config.ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"File extension '{ext}' not allowed. Allowed extensions: {', '.join(sorted(self.config.ALLOWED_EXTENSIONS))}"
            )
    
    def _validate_declared_mime_type(self, content_type: str) -> str:
        """Validate declared MIME type"""
        # Remove any parameters like charset
        mime_type = content_type.split(';')[0].strip().lower()
        
        if mime_type not in self.config.ALLOWED_MIME_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"MIME type '{mime_type}' not allowed. Allowed types: {', '.join(sorted(self.config.ALLOWED_MIME_TYPES))}"
            )
        
        return mime_type
    
    def _detect_content_type(self, content: bytes) -> str:
        """Detect actual content type using magic bytes and libmagic"""
        # First, try magic bytes detection (fast)
        for magic_bytes, mime_type in self.config.MAGIC_BYTES.items():
            if content.startswith(magic_bytes):
                return mime_type
        
        # Fallback to python-magic if available
        try:
            import magic
            mime_type = magic.from_buffer(content[:2048], mime=True)  # Check first 2KB
            return mime_type.lower()
        except ImportError:
            logger.warning("python-magic not available, skipping advanced content detection")
        except Exception as e:
            logger.warning(f"Magic detection failed: {e}")
        
        # Final fallback - assume based on size and basic checks
        if len(content) > 100 and content[:4] not in [b'\x00\x00\x00\x00']:
            return 'application/octet-stream'  # Generic binary
        
        raise HTTPException(
            status_code=400,
            detail="Could not determine file type - file may be corrupted or not a valid image"
        )
    
    def _cross_validate_mime_types(self, declared: str, detected: str, filename: str) -> None:
        """Cross-validate declared vs detected MIME types"""
        # Map similar MIME types that should be considered equivalent
        mime_equivalents = {
            'image/jpeg': ['image/jpg'],
            'image/jpg': ['image/jpeg'],
        }
        
        # Check if they match exactly
        if declared == detected:
            return
        
        # Check if they're equivalent
        declared_equivalents = mime_equivalents.get(declared, [])
        if detected in declared_equivalents:
            return
        
        # Check if extension matches detected type
        ext = Path(filename).suffix.lower()
        expected_mime = None
        
        mime_to_ext = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png', '.gif': 'image/gif',
            '.bmp': 'image/bmp', '.tiff': 'image/tiff', '.tif': 'image/tiff',
            '.webp': 'image/webp', '.avif': 'image/avif',
        }
        
        expected_mime = mime_to_ext.get(ext)
        
        # If detected matches extension but not declared, prefer detected
        if detected == expected_mime:
            logger.warning(f"MIME type mismatch: declared={declared}, detected={detected}, extension matches detected")
            return
        
        # If neither matches extension, it's suspicious
        if declared != expected_mime and detected != expected_mime:
            raise HTTPException(
                status_code=400,
                detail=f"File type mismatch: declared={declared}, detected={detected}, extension={ext}"
            )
    
    def _scan_content_security(self, content: bytes) -> None:
        """Perform basic security scanning of file content"""
        # Check for embedded scripts or executables in first few KB
        dangerous_signatures = [
            b'<script',  # JavaScript
            b'javascript:',  # JavaScript URLs
            b'<?php',  # PHP
            b'<%',  # ASP/JSP starts
            # Note: Removed MZ signature as it can appear in legitimate image data
            b'\x7fELF',  # Linux ELF header (first 4 bytes)
            b'#!/bin/sh',  # Shell script (more specific)
            b'#!/bin/bash',  # Bash script (more specific)
        ]
        
        # Check first 4KB for dangerous content - but be more careful with image data
        check_content = content[:4096]
        
        # For images, only check for script-like content, not binary signatures
        # that might legitimately appear in compressed image data
        for signature in dangerous_signatures:
            if signature in check_content:
                # Additional validation: make sure it's not just binary coincidence
                if signature.startswith(b'<') or signature.startswith(b'#!') or b'script' in signature:
                    raise HTTPException(
                        status_code=400,
                        detail="File contains potentially dangerous content"
                    )
        
        # Basic polyglot detection (file that can be interpreted as multiple formats)
        if b'<html' in check_content and len(content) > 10000:
            raise HTTPException(
                status_code=400,
                detail="File appears to be a polyglot (HTML embedded in image) which is not allowed"
            )


class SecureUploadService:
    """Main service class for handling secure uploads with robust MinIO integration"""
    
    def __init__(self):
        self.validator = UploadValidator()
        self._minio_client = None
    
    def get_minio_client(self):
        """Get MinIO client with lazy initialization"""
        if self._minio_client is None:
            self._minio_client = get_robust_minio_client()
        return self._minio_client

    async def process_upload(self, file: UploadFile) -> Tuple[bytes, str, Dict[str, Any]]:
        """
        Process an upload with full security validation.
        
        Args:
            file: FastAPI UploadFile object
            
        Returns:
            Tuple[bytes, str, Dict]: (file_content, safe_filename, metadata)
            
        Raises:
            HTTPException: If validation fails
        """
        try:
            content, metadata = await self.validator.validate_upload(file)
            safe_filename = metadata['safe_filename']
            
            logger.info(f"Secure upload processed successfully: {safe_filename}")
            
            return content, safe_filename, metadata
            
        except HTTPException:
            # Re-raise HTTP exceptions as-is
            raise
        except Exception as e:
            logger.error(f"Unexpected error during upload processing: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Internal server error during file processing"
            )
    
    async def upload_to_storage(
        self,
        content: bytes,
        filename: str,
        content_type: str,
        metadata: Optional[Dict[str, Any]] = None,
        bucket_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Upload file to MinIO storage with robust error handling.
        
        Args:
            content: File content bytes
            filename: Target filename
            content_type: MIME content type
            metadata: Additional metadata
            bucket_name: Target bucket (optional)
            
        Returns:
            Dict with upload result information
            
        Raises:
            HTTPException: If upload fails
        """
        try:
            minio_client = self.get_minio_client()
            
            # Prepare metadata for MinIO
            minio_metadata = {
                'content-type': content_type,
                'upload-timestamp': datetime.utcnow().isoformat(),
                'file-size': str(len(content)),
                'original-filename': filename
            }
            
            if metadata:
                # Add validation metadata
                minio_metadata.update({
                    'validation-passed': 'true',
                    'mime-validated': metadata.get('detected_mime', ''),
                    'security-scan': 'passed'
                })
            
            # Create data stream
            data_stream = io.BytesIO(content)
            
            # Upload with robust error handling
            upload_result = minio_client.upload_object(
                object_name=filename,
                data=data_stream,
                length=len(content),
                content_type=content_type,
                bucket_name=bucket_name,
                metadata=minio_metadata
            )
            
            logger.info(f"File uploaded to storage successfully: {filename}")
            
            return {
                'status': 'success',
                'filename': filename,
                'bucket_name': upload_result['bucket_name'],
                'object_name': upload_result['object_name'],
                'size': upload_result['size'],
                'etag': upload_result['etag'],
                'upload_time': upload_result['upload_time'],
                'storage_metadata': minio_metadata
            }
            
        except MinIOUploadError as e:
            logger.error(f"MinIO upload failed for {filename}: {e}")
            raise HTTPException(
                status_code=503,
                detail=f"Storage service temporarily unavailable: {str(e)}"
            )
        except MinIOError as e:
            logger.error(f"MinIO error for {filename}: {e}")
            raise HTTPException(
                status_code=502,
                detail=f"Storage service error: {str(e)}"
            )
        except Exception as e:
            logger.error(f"Unexpected error uploading {filename}: {e}")
            raise HTTPException(
                status_code=500,
                detail="Internal server error during storage upload"
            )
    
    async def process_and_upload(
        self,
        file: UploadFile,
        bucket_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Complete upload processing pipeline: validate -> upload -> queue processing.
        
        Args:
            file: FastAPI UploadFile object
            bucket_name: Target bucket (optional)
            
        Returns:
            Dict with complete processing result
            
        Raises:
            HTTPException: If any step fails
        """
        try:
            # Step 1: Process and validate upload
            content, safe_filename, metadata = await self.process_upload(file)
            
            # Step 2: Upload to storage with robust handling
            upload_result = await self.upload_to_storage(
                content=content,
                filename=safe_filename,
                content_type=metadata['detected_mime'],
                metadata=metadata,
                bucket_name=bucket_name
            )
            
            # Step 3: Queue background processing
            try:
                from workers.tasks_robust import process_upload_robust
                
                file_metadata = {
                    'filename': safe_filename,
                    'size': len(content),
                    'content_type': metadata['detected_mime'],
                    'original_filename': file.filename,
                    'upload_timestamp': datetime.utcnow().isoformat(),
                    'validation_metadata': metadata
                }
                
                # Queue robust processing task
                processing_task = process_upload_robust.delay(
                    file_metadata=file_metadata,
                    object_key=safe_filename,
                    bucket_name=upload_result['bucket_name']
                )
                
                upload_result.update({
                    'processing_task_id': processing_task.id,
                    'processing_queued': True
                })
                
                logger.info(f"Background processing queued for {safe_filename}: {processing_task.id}")
                
            except Exception as e:
                logger.warning(f"Failed to queue background processing for {safe_filename}: {e}")
                # Don't fail the upload for background processing issues
                upload_result.update({
                    'processing_task_id': None,
                    'processing_queued': False,
                    'processing_error': str(e)
                })
            
            # Step 4: Return complete result
            result = {
                'status': 'success',
                'message': 'File uploaded and processing queued successfully',
                'upload': upload_result,
                'validation': metadata,
                'total_processing_time': time.time() - upload_result.get('start_time', time.time())
            }
            
            logger.info(f"Complete upload pipeline succeeded for {safe_filename}")
            return result
            
        except HTTPException:
            # Re-raise HTTP exceptions as-is
            raise
        except Exception as e:
            logger.error(f"Unexpected error in upload pipeline: {e}")
            raise HTTPException(
                status_code=500,
                detail="Internal server error in upload pipeline"
            )
    
    def generate_unique_filename(self, original_filename: str, content: bytes) -> str:
        """Generate a unique filename to prevent conflicts"""
        # Get file extension
        ext = Path(original_filename).suffix.lower()
        
        # Create hash of content + timestamp for uniqueness
        content_hash = hashlib.sha256(content).hexdigest()[:16]
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        
        # Sanitize base filename
        base = Path(original_filename).stem
        safe_base = re.sub(r'[^\w\-_]', '_', base)[:50]  # Limit length
        
        return f"{safe_base}_{timestamp}_{content_hash}{ext}"


# Global service instance
secure_upload_service = SecureUploadService()
