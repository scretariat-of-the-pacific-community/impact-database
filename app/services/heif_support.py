"""HEIC/HEIF image format support.

Adds support for Apple's HEIC (High Efficiency Image Container) format,
which is the default format for iPhone photos since iOS 11.

Requires: pillow-heif
Install: pip install pillow-heif
"""

import logging
from typing import Optional, BinaryIO
from io import BytesIO

from PIL import Image

logger = logging.getLogger(__name__)

# Conditional import
try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
    HEIF_AVAILABLE = True
    logger.info("HEIC/HEIF support enabled")
except ImportError:
    HEIF_AVAILABLE = False
    logger.warning("pillow-heif not available. HEIC/HEIF support disabled.")
    logger.warning("Install: pip install pillow-heif")


def is_heif_format(image_file: BinaryIO) -> bool:
    """
    Check if a file is in HEIF/HEIC format.

    Args:
        image_file: File-like object containing image data

    Returns:
        True if file is HEIF/HEIC format
    """
    if not HEIF_AVAILABLE:
        return False

    try:
        image_file.seek(0)
        header = image_file.read(12)
        image_file.seek(0)

        # HEIF files have 'ftyp' box at bytes 4-8
        # Common brands: heic, heix, hevc, hevx, mif1
        if len(header) >= 12:
            ftyp = header[4:8]
            brand = header[8:12]

            if ftyp == b"ftyp":
                heif_brands = [b"heic", b"heix", b"hevc", b"hevx", b"mif1"]
                return brand in heif_brands

        return False

    except Exception as e:
        logger.error(f"Failed to check HEIF format: {e}")
        return False


def convert_heif_to_jpeg(image_file: BinaryIO, quality: int = 95) -> Optional[BytesIO]:
    """
    Convert HEIF/HEIC image to JPEG format.

    Args:
        image_file: File-like object containing HEIF image
        quality: JPEG quality (1-100)

    Returns:
        BytesIO containing JPEG image, or None if conversion failed
    """
    if not HEIF_AVAILABLE:
        logger.error("Cannot convert HEIF: pillow-heif not available")
        return None

    try:
        image_file.seek(0)

        # Open HEIF image with PIL (pillow-heif registers the opener)
        image = Image.open(image_file)

        # Convert to RGB if needed (HEIF can have alpha channel)
        if image.mode in ("RGBA", "LA", "P"):
            # Create white background
            background = Image.new("RGB", image.size, (255, 255, 255))
            if image.mode == "P":
                image = image.convert("RGBA")
            background.paste(image, mask=image.split()[-1] if image.mode == "RGBA" else None)
            image = background
        elif image.mode != "RGB":
            image = image.convert("RGB")

        # Save as JPEG
        output = BytesIO()
        image.save(output, format="JPEG", quality=quality, optimize=True)
        output.seek(0)

        logger.info(f"Converted HEIF to JPEG (quality={quality})")
        return output

    except Exception as e:
        logger.error(f"HEIF to JPEG conversion failed: {e}")
        return None


def process_heif_image(image_file: BinaryIO, convert_to_jpeg: bool = True) -> Optional[BinaryIO]:
    """
    Process HEIF/HEIC image for storage.

    Args:
        image_file: File-like object containing image
        convert_to_jpeg: If True, convert HEIF to JPEG; if False, keep original

    Returns:
        Processed image file (either original or converted), or None if failed
    """
    if not HEIF_AVAILABLE:
        logger.error("Cannot process HEIF: pillow-heif not available")
        return None

    try:
        # Check if it's actually HEIF
        if not is_heif_format(image_file):
            # Not HEIF, return original
            image_file.seek(0)
            return image_file

        # Convert to JPEG if requested
        if convert_to_jpeg:
            return convert_heif_to_jpeg(image_file)
        else:
            # Keep original HEIF
            image_file.seek(0)
            return image_file

    except Exception as e:
        logger.error(f"HEIF processing failed: {e}")
        return None


def get_heif_metadata(image_file: BinaryIO) -> dict:
    """
    Extract metadata from HEIF/HEIC image.

    HEIF images can contain EXIF data just like JPEG.

    Args:
        image_file: File-like object containing HEIF image

    Returns:
        Dict containing EXIF metadata (same format as JPEG EXIF)
    """
    if not HEIF_AVAILABLE:
        return {}

    try:
        image_file.seek(0)
        image = Image.open(image_file)

        # Get EXIF data (pillow-heif extracts EXIF from HEIF)
        exif_data = image._getexif()

        if not exif_data:
            return {}

        from PIL.ExifTags import TAGS

        # Convert to readable tags
        exif = {}
        for tag_id, value in exif_data.items():
            tag = TAGS.get(tag_id, tag_id)
            exif[tag] = value

        return exif

    except Exception as e:
        logger.error(f"Failed to extract HEIF metadata: {e}")
        return {}


# Auto-detection and processing wrapper
def handle_image_format(
    image_file: BinaryIO, auto_convert_heif: bool = True
) -> tuple[BinaryIO, str]:
    """
    Automatically detect and handle different image formats.

    Args:
        image_file: File-like object containing image
        auto_convert_heif: Convert HEIF to JPEG automatically

    Returns:
        Tuple of (processed_file, format) where format is 'jpeg', 'heif', etc.
    """
    # Check if HEIF
    if is_heif_format(image_file):
        if auto_convert_heif:
            converted = convert_heif_to_jpeg(image_file)
            if converted:
                return converted, "jpeg"
            else:
                # Conversion failed, return original
                image_file.seek(0)
                return image_file, "heif"
        else:
            image_file.seek(0)
            return image_file, "heif"

    # Not HEIF, detect format with PIL
    try:
        image_file.seek(0)
        image = Image.open(image_file)
        format_name = image.format.lower() if image.format else "unknown"
        image_file.seek(0)
        return image_file, format_name
    except:
        image_file.seek(0)
        return image_file, "unknown"
