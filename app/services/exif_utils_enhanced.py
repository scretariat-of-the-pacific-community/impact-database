"""Enhanced EXIF extraction with exifread library support."""

import logging
from io import BytesIO
from typing import Optional, Dict, Any, BinaryIO
from datetime import datetime
import hashlib

from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS

from core.config import settings

logger = logging.getLogger(__name__)

# Conditional import based on configuration
EXIF_LIBRARY = getattr(settings, 'EXIF_LIBRARY', 'PIL')  # 'PIL' or 'exifread'

if EXIF_LIBRARY == 'exifread':
    try:
        import exifread
        EXIFREAD_AVAILABLE = True
    except ImportError:
        logger.warning("exifread not installed, falling back to PIL")
        EXIFREAD_AVAILABLE = False
else:
    EXIFREAD_AVAILABLE = False


def _convert_to_degrees(value) -> float:
    """Convert GPS coordinates from DMS to decimal degrees."""
    if EXIFREAD_AVAILABLE and hasattr(value, 'values'):
        # exifread IfdTag format
        d, m, s = [float(x.num) / float(x.den) for x in value.values]
    else:
        # PIL format
        d = float(value[0])
        m = float(value[1])
        s = float(value[2])
    
    return d + (m / 60.0) + (s / 3600.0)


def _extract_exif_pil(image_file: BinaryIO) -> Dict[str, Any]:
    """Extract EXIF data using PIL/Pillow."""
    try:
        image = Image.open(image_file)
        exif_data = image._getexif()
        
        if not exif_data:
            return {}
        
        # Convert to readable tags
        exif = {}
        for tag_id, value in exif_data.items():
            tag = TAGS.get(tag_id, tag_id)
            exif[tag] = value
        
        result = {}
        
        # Extract GPS data
        gps_info = exif.get('GPSInfo', {})
        if gps_info:
            gps_data = {}
            for key, val in gps_info.items():
                decode = GPSTAGS.get(key, key)
                gps_data[decode] = val
            
            # Latitude
            if 'GPSLatitude' in gps_data and 'GPSLatitudeRef' in gps_data:
                lat = _convert_to_degrees(gps_data['GPSLatitude'])
                if gps_data['GPSLatitudeRef'] == 'S':
                    lat = -lat
                result['latitude'] = lat
            
            # Longitude
            if 'GPSLongitude' in gps_data and 'GPSLongitudeRef' in gps_data:
                lon = _convert_to_degrees(gps_data['GPSLongitude'])
                if gps_data['GPSLongitudeRef'] == 'W':
                    lon = -lon
                result['longitude'] = lon
            
            # Altitude
            if 'GPSAltitude' in gps_data:
                altitude = float(gps_data['GPSAltitude'])
                altitude_ref = gps_data.get('GPSAltitudeRef', 0)
                if altitude_ref == 1:
                    altitude = -altitude
                result['altitude'] = altitude
                result['altitude_ref'] = altitude_ref
            
            # Camera bearing/direction
            if 'GPSImgDirection' in gps_data:
                result['camera_bearing'] = float(gps_data['GPSImgDirection'])
        
        # Orientation
        if 'Orientation' in exif:
            result['orientation'] = int(exif['Orientation'])
        
        # Camera info
        if 'Make' in exif:
            result['camera_make'] = str(exif['Make']).strip()
        if 'Model' in exif:
            result['camera_model'] = str(exif['Model']).strip()
        
        # Timestamps (priority: DateTimeOriginal > DateTimeDigitized > DateTime)
        for tag in ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime']:
            if tag in exif:
                try:
                    dt_str = str(exif[tag])
                    result['timestamp'] = datetime.strptime(dt_str, '%Y:%m:%d %H:%M:%S')
                    break
                except ValueError:
                    continue
        
        # Store full EXIF for reference
        result['raw_exif'] = {
            k: str(v) for k, v in exif.items()
            if k not in ['MakerNote', 'UserComment']  # Exclude binary data
        }
        
        return result
        
    except Exception as e:
        logger.error(f"PIL EXIF extraction failed: {e}")
        return {}


def _extract_exif_exifread(image_file: BinaryIO) -> Dict[str, Any]:
    """Extract EXIF data using exifread library."""
    try:
        tags = exifread.process_file(image_file, details=False)
        
        if not tags:
            return {}
        
        result = {}
        
        # Extract GPS data
        if 'GPS GPSLatitude' in tags and 'GPS GPSLatitudeRef' in tags:
            lat = _convert_to_degrees(tags['GPS GPSLatitude'])
            if str(tags['GPS GPSLatitudeRef']) == 'S':
                lat = -lat
            result['latitude'] = lat
        
        if 'GPS GPSLongitude' in tags and 'GPS GPSLongitudeRef' in tags:
            lon = _convert_to_degrees(tags['GPS GPSLongitude'])
            if str(tags['GPS GPSLongitudeRef']) == 'W':
                lon = -lon
            result['longitude'] = lon
        
        # Altitude
        if 'GPS GPSAltitude' in tags:
            altitude = float(tags['GPS GPSAltitude'].values[0].num) / float(
                tags['GPS GPSAltitude'].values[0].den
            )
            altitude_ref = int(str(tags.get('GPS GPSAltitudeRef', 0)))
            if altitude_ref == 1:
                altitude = -altitude
            result['altitude'] = altitude
            result['altitude_ref'] = altitude_ref
        
        # Camera bearing
        if 'GPS GPSImgDirection' in tags:
            direction = float(tags['GPS GPSImgDirection'].values[0].num) / float(
                tags['GPS GPSImgDirection'].values[0].den
            )
            result['camera_bearing'] = direction
        
        # Orientation
        if 'Image Orientation' in tags:
            result['orientation'] = int(str(tags['Image Orientation']))
        
        # Camera info
        if 'Image Make' in tags:
            result['camera_make'] = str(tags['Image Make']).strip()
        if 'Image Model' in tags:
            result['camera_model'] = str(tags['Image Model']).strip()
        
        # Timestamps
        for tag in ['EXIF DateTimeOriginal', 'EXIF DateTimeDigitized', 'Image DateTime']:
            if tag in tags:
                try:
                    dt_str = str(tags[tag])
                    result['timestamp'] = datetime.strptime(dt_str, '%Y:%m:%d %H:%M:%S')
                    break
                except ValueError:
                    continue
        
        # Store full EXIF
        result['raw_exif'] = {
            k: str(v) for k, v in tags.items()
            if not k.startswith('MakerNote') and not k.startswith('Thumbnail')
        }
        
        return result
        
    except Exception as e:
        logger.error(f"exifread EXIF extraction failed: {e}")
        return {}


def extract_exif_data(image_file: BinaryIO) -> Dict[str, Any]:
    """
    Extract EXIF data from an image file.
    
    Uses configured EXIF library (PIL or exifread).
    Falls back to PIL if exifread is not available.
    
    Args:
        image_file: File-like object containing image data
        
    Returns:
        Dict containing extracted EXIF data:
        - latitude, longitude: GPS coordinates in decimal degrees
        - altitude: Elevation in meters (negative = below sea level)
        - altitude_ref: 0 = above sea level, 1 = below
        - orientation: EXIF orientation value (1-8)
        - camera_make, camera_model: Device information
        - camera_bearing: Direction camera was facing (0-360 degrees)
        - timestamp: When photo was taken
        - raw_exif: Full EXIF dictionary
    """
    # Reset file pointer
    image_file.seek(0)
    
    # Use configured library
    if EXIF_LIBRARY == 'exifread' and EXIFREAD_AVAILABLE:
        logger.debug("Using exifread for EXIF extraction")
        return _extract_exif_exifread(image_file)
    else:
        logger.debug("Using PIL for EXIF extraction")
        return _extract_exif_pil(image_file)


def get_image_hash(image_file: BinaryIO) -> str:
    """
    Generate SHA-256 hash of image content for deduplication.
    
    Args:
        image_file: File-like object containing image data
        
    Returns:
        Hex string of SHA-256 hash
    """
    image_file.seek(0)
    return hashlib.sha256(image_file.read()).hexdigest()


# Legacy functions for backward compatibility
def extract_altitude(exif_data: Dict[str, Any]) -> Optional[float]:
    """Extract altitude from EXIF data (legacy wrapper)."""
    return exif_data.get('altitude')


def extract_orientation(exif_data: Dict[str, Any]) -> Optional[int]:
    """Extract orientation from EXIF data (legacy wrapper)."""
    return exif_data.get('orientation')


def extract_camera_info(exif_data: Dict[str, Any]) -> Dict[str, Optional[str]]:
    """Extract camera make and model (legacy wrapper)."""
    return {
        'make': exif_data.get('camera_make'),
        'model': exif_data.get('camera_model')
    }


def extract_timestamp(exif_data: Dict[str, Any]) -> Optional[datetime]:
    """Extract timestamp from EXIF data (legacy wrapper)."""
    return exif_data.get('timestamp')
