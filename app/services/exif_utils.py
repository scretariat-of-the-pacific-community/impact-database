"""EXIF data extraction utilities."""

from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
import hashlib
import logging
from typing import Dict, Any, Optional, Tuple
import os

logger = logging.getLogger(__name__)

def extract_exif_data(image_path: str) -> Dict[str, Any]:
    """Extract EXIF data from an image file."""
    exif_data = {}
    
    try:
        with Image.open(image_path) as image:
            # Get basic image info
            exif_data['width'] = image.width
            exif_data['height'] = image.height
            exif_data['format'] = image.format
            
            # Get EXIF data
            exif = image.getexif()
            
            if exif:
                for tag_id, value in exif.items():
                    tag = TAGS.get(tag_id, tag_id)
                    exif_data[tag] = value
                
                # Handle GPS data specifically
                gps_data = exif.get_ifd(0x8825)  # GPS IFD
                if gps_data:
                    gps_info = {}
                    for tag_id, value in gps_data.items():
                        tag = GPSTAGS.get(tag_id, tag_id)
                        gps_info[tag] = value
                    
                    # Convert GPS coordinates to decimal degrees
                    lat, lat_ref = gps_info.get('GPSLatitude'), gps_info.get('GPSLatitudeRef')
                    lon, lon_ref = gps_info.get('GPSLongitude'), gps_info.get('GPSLongitudeRef')
                    
                    if lat and lon:
                        decimal_lat = convert_to_degrees(lat)
                        decimal_lon = convert_to_degrees(lon)
                        
                        if lat_ref == 'S':
                            decimal_lat = -decimal_lat
                        if lon_ref == 'W':
                            decimal_lon = -decimal_lon
                        
                        exif_data['latitude'] = decimal_lat
                        exif_data['longitude'] = decimal_lon
                    
                    exif_data['gps_data'] = gps_info
    
    except Exception as e:
        logger.error(f"Error extracting EXIF data from {image_path}: {e}")
    
    return exif_data

def convert_to_degrees(value) -> float:
    """Convert GPS coordinates to decimal degrees."""
    try:
        degrees = float(value[0])
        minutes = float(value[1])
        seconds = float(value[2])
        return degrees + (minutes / 60.0) + (seconds / 3600.0)
    except (IndexError, TypeError, ValueError):
        return 0.0

def get_image_hash(image_path: str) -> str:
    """Generate a hash for the image file."""
    try:
        with open(image_path, 'rb') as f:
            file_hash = hashlib.sha256()
            for chunk in iter(lambda: f.read(4096), b""):
                file_hash.update(chunk)
            return file_hash.hexdigest()
    except Exception as e:
        logger.error(f"Error generating hash for {image_path}: {e}")
        return ""

def get_image_dimensions(image_path: str) -> Tuple[int, int]:
    """Get image dimensions."""
    try:
        with Image.open(image_path) as image:
            return image.size
    except Exception as e:
        logger.error(f"Error getting dimensions for {image_path}: {e}")
        return (0, 0)

def validate_image_file(image_path: str) -> bool:
    """Validate that the file is a valid image."""
    try:
        with Image.open(image_path) as image:
            image.verify()
        return True
    except Exception as e:
        logger.error(f"Invalid image file {image_path}: {e}")
        return False
