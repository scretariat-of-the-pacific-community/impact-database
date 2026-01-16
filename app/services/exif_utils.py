"""EXIF data extraction utilities."""

from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
from PIL.TiffImagePlugin import IFDRational
import hashlib
import logging
from typing import Dict, Any, Optional, Tuple, Union, BinaryIO
import os
import httpx
from functools import lru_cache

logger = logging.getLogger(__name__)


def make_json_serializable(value: Any) -> Any:
    """
    Convert EXIF values to JSON-serializable types.

    Handles:
    - IFDRational (PIL rational numbers) -> float
    - bytes -> base64 string (for binary data)
    - tuples -> lists
    - nested dicts/lists recursively
    """
    if isinstance(value, IFDRational):
        # Convert IFDRational to float
        return float(value)
    elif isinstance(value, bytes):
        # Convert bytes to base64 for JSON serialization
        import base64

        return base64.b64encode(value).decode("ascii")
    elif isinstance(value, tuple):
        # Convert tuples to lists (JSON doesn't have tuples)
        return [make_json_serializable(item) for item in value]
    elif isinstance(value, list):
        # Recursively process list items
        return [make_json_serializable(item) for item in value]
    elif isinstance(value, dict):
        # Recursively process dict values
        return {k: make_json_serializable(v) for k, v in value.items()}
    elif isinstance(value, str):
        # Strip null bytes from strings (PostgreSQL JSON doesn't support \u0000)
        return value.replace("\x00", "").strip()
    elif isinstance(value, (int, float, bool, type(None))):
        # Already JSON-serializable
        return value
    else:
        # For any other type, convert to string as fallback and strip null bytes
        return str(value).replace("\x00", "").strip()


@lru_cache(maxsize=100)
def reverse_geocode(latitude: float, longitude: float) -> Optional[str]:
    """
    Reverse geocode coordinates to get country code using Nominatim.
    Cached to avoid repeated API calls for same coordinates.
    """
    try:
        url = f"https://nominatim.openstreetmap.org/reverse?lat={latitude}&lon={longitude}&format=json&addressdetails=1"
        headers = {"User-Agent": "PacificImpactAtlas/1.0"}

        with httpx.Client(timeout=5.0) as client:
            response = client.get(url, headers=headers)
            if response.status_code == 200:
                data = response.json()
                country_code = data.get("address", {}).get("country_code", "").upper()
                if country_code:
                    logger.info(
                        f"Extracted country {country_code} from coordinates ({latitude}, {longitude})"
                    )
                    return country_code
    except Exception as e:
        logger.warning(f"Failed to reverse geocode ({latitude}, {longitude}): {e}")

    return None


def extract_exif_data(image_path: Union[str, BinaryIO]) -> Dict[str, Any]:
    """Extract EXIF data from an image file path or file-like object (BytesIO)."""
    exif_data = {}

    try:
        with Image.open(image_path) as image:
            # Get basic image info
            exif_data["width"] = image.width
            exif_data["height"] = image.height
            exif_data["format"] = image.format

            # Get EXIF data
            exif = image.getexif()

            if exif:
                logger.info(f"Found EXIF data with {len(exif)} tags")
                for tag_id, value in exif.items():
                    tag = TAGS.get(tag_id, tag_id)
                    exif_data[tag] = value

                # Handle GPS data specifically
                try:
                    gps_data = exif.get_ifd(0x8825)  # GPS IFD
                except Exception as gps_error:
                    logger.warning(f"Error accessing GPS IFD: {gps_error}")
                    gps_data = None
                if gps_data:
                    logger.info(f"Found GPS IFD with {len(gps_data)} tags")
                    gps_info = {}
                    for tag_id, value in gps_data.items():
                        tag = GPSTAGS.get(tag_id, tag_id)
                        gps_info[tag] = value

                    logger.info(f"GPS tags found: {list(gps_info.keys())}")

                    # Convert GPS coordinates to decimal degrees
                    lat, lat_ref = gps_info.get("GPSLatitude"), gps_info.get("GPSLatitudeRef")
                    lon, lon_ref = gps_info.get("GPSLongitude"), gps_info.get("GPSLongitudeRef")

                    logger.info(
                        f"GPS values - lat: {lat}, lat_ref: {lat_ref}, lon: {lon}, lon_ref: {lon_ref}"
                    )

                    if lat and lon:
                        decimal_lat = convert_to_degrees(lat)
                        decimal_lon = convert_to_degrees(lon)

                        if lat_ref == "S":
                            decimal_lat = -decimal_lat
                        if lon_ref == "W":
                            decimal_lon = -decimal_lon

                        logger.info(
                            f"Converted GPS coordinates: lat={decimal_lat}, lon={decimal_lon}"
                        )

                        exif_data["latitude"] = decimal_lat
                        exif_data["longitude"] = decimal_lon

                        # Try to extract country from coordinates
                        country_code = reverse_geocode(decimal_lat, decimal_lon)
                        if country_code:
                            exif_data["country_code"] = country_code
                    else:
                        logger.warning(f"GPS data incomplete - lat: {lat}, lon: {lon}")

                    # Extract altitude from GPS data
                    altitude, altitude_ref = extract_altitude(gps_info)
                    if altitude is not None:
                        exif_data["altitude"] = altitude
                        exif_data["altitude_ref"] = altitude_ref

                    # Extract camera bearing/direction
                    bearing = extract_camera_bearing(gps_info)
                    if bearing is not None:
                        exif_data["camera_bearing"] = bearing

                    exif_data["gps_data"] = gps_info

                # Extract image orientation
                orientation = extract_orientation(exif_data)
                if orientation:
                    exif_data["orientation"] = orientation
                    exif_data["rotation_degrees"] = get_rotation_from_orientation(orientation)

                # Extract camera make and model
                camera_make, camera_model = extract_camera_info(exif_data)
                if camera_make:
                    exif_data["camera_make"] = camera_make
                if camera_model:
                    exif_data["camera_model"] = camera_model

                # Extract timestamp with fallback hierarchy
                timestamp = extract_timestamp(exif_data)
                if timestamp:
                    exif_data["timestamp_exif"] = timestamp
                else:
                    logger.info("No GPS IFD found in EXIF data")
            else:
                logger.info("No EXIF data found in image")

    except Exception as e:
        logger.error(f"Error extracting EXIF data from {image_path}: {e}")

    # Serialize all EXIF values to JSON-safe types before returning
    # This ensures IFDRational and other PIL types can be stored in JSON column
    exif_data = make_json_serializable(exif_data)

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


def convert_rational_to_float(value) -> float:
    """Convert rational number to float."""
    try:
        if isinstance(value, tuple) and len(value) >= 1:
            # Handle tuple of rational values
            return float(value[0])
        return float(value)
    except (TypeError, ValueError, IndexError):
        return 0.0


def extract_altitude(gps_info: Dict[str, Any]) -> Tuple[Optional[float], Optional[int]]:
    """Extract altitude and altitude reference from GPS EXIF data.

    Returns:
        Tuple of (altitude in meters, altitude_ref) where altitude_ref is:
        0 = above sea level (default)
        1 = below sea level
    """
    altitude = gps_info.get("GPSAltitude")
    altitude_ref = gps_info.get("GPSAltitudeRef", 0)

    if altitude is None:
        return None, None

    try:
        # Convert altitude to float
        altitude_meters = convert_rational_to_float(altitude)

        # Get altitude reference (0=above sea level, 1=below)
        # Handle bytes, int, or string values
        if isinstance(altitude_ref, bytes):
            # Skip null bytes or invalid byte sequences
            if altitude_ref == b'\x00' or not altitude_ref.strip(b'\x00'):
                ref_value = 0
            else:
                try:
                    ref_value = int(altitude_ref.decode('utf-8').strip())
                except (ValueError, UnicodeDecodeError):
                    ref_value = 0
        elif altitude_ref:
            ref_value = int(altitude_ref)
        else:
            ref_value = 0

        # Apply sign based on reference
        if ref_value == 1:
            altitude_meters = -altitude_meters

        logger.info(f"Extracted altitude: {altitude_meters}m (ref: {ref_value})")
        return altitude_meters, ref_value

    except Exception as e:
        logger.warning(f"Error extracting altitude: {e}")
        return None, None


def extract_orientation(exif_data: Dict[str, Any]) -> Optional[int]:
    """Extract EXIF orientation value (1-8)."""
    orientation = exif_data.get("Orientation")
    if orientation:
        try:
            return int(orientation)
        except (TypeError, ValueError):
            pass
    return None


def get_rotation_from_orientation(orientation: Optional[int]) -> int:
    """Convert EXIF orientation to rotation degrees.

    EXIF Orientation values:
    1, 2 = 0°   (Normal)
    3, 4 = 180° (Upside down)
    5, 6 = 90°  (Rotated 90° CW)
    7, 8 = 270° (Rotated 90° CCW)
    """
    if not orientation:
        return 0
    orientation_map = {1: 0, 2: 0, 3: 180, 4: 180, 5: 90, 6: 90, 7: 270, 8: 270}
    return orientation_map.get(orientation, 0)


def extract_camera_info(exif_data: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """Extract camera make and model from EXIF data."""
    make = exif_data.get("Make")
    model = exif_data.get("Model")

    # Clean up strings (remove null bytes, trim whitespace)
    if make:
        make = str(make).strip("\x00").strip()
    if model:
        model = str(model).strip("\x00").strip()

    return make, model


def extract_camera_bearing(gps_info: Dict[str, Any]) -> Optional[float]:
    """Extract GPS image direction (camera bearing) from EXIF.

    Returns bearing in degrees (0-360) where direction was taken.
    """
    img_direction = gps_info.get("GPSImgDirection")
    if img_direction:
        try:
            bearing = convert_rational_to_float(img_direction)
            logger.info(f"Extracted camera bearing: {bearing}°")
            return bearing
        except Exception as e:
            logger.warning(f"Error extracting camera bearing: {e}")
    return None


def extract_timestamp(exif_data: Dict[str, Any]) -> Optional[str]:
    """Extract timestamp from EXIF with fallback hierarchy.

    Priority order (QGIS-inspired):
    1. DateTimeOriginal - when photo was actually taken
    2. DateTimeDigitized - when photo was scanned/digitized
    3. DateTime - generic datetime

    Returns ISO format datetime string or None.
    """
    from datetime import datetime

    # Try each field in priority order
    for field in ["DateTimeOriginal", "DateTimeDigitized", "DateTime"]:
        dt_string = exif_data.get(field)
        if dt_string:
            try:
                # EXIF datetime format: "YYYY:MM:DD HH:MM:SS"
                dt = datetime.strptime(str(dt_string), "%Y:%m:%d %H:%M:%S")
                logger.info(f"Extracted timestamp from {field}: {dt}")
                return dt.isoformat()
            except Exception as e:
                logger.debug(f"Could not parse {field}: {e}")
                continue

    logger.debug("No timestamp found in EXIF data")
    return None


def get_image_hash(image_path: Union[str, BinaryIO]) -> str:
    """Generate a hash for the image file path or file-like object (BytesIO)."""
    try:
        file_hash = hashlib.sha256()

        # Handle file-like objects (BytesIO)
        if hasattr(image_path, "read"):
            # Save current position
            original_position = image_path.tell() if hasattr(image_path, "tell") else 0
            if hasattr(image_path, "seek"):
                image_path.seek(0)

            for chunk in iter(lambda: image_path.read(4096), b""):
                file_hash.update(chunk)

            # Restore original position
            if hasattr(image_path, "seek"):
                image_path.seek(original_position)
        else:
            # Handle file path string
            with open(image_path, "rb") as f:
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
