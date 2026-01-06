"""XMP metadata extraction utilities.

Extracts extended metadata from images using XMP (Extensible Metadata Platform).
XMP can contain additional geospatial, camera, and provenance information not
available in standard EXIF tags.

Requires: python-xmp-toolkit (libexempi)
Install: pip install python-xmp-toolkit
System: sudo apt-get install libexempi8 (on Ubuntu/Debian)
"""

import logging
from typing import Dict, Any, Optional, BinaryIO
from datetime import datetime

logger = logging.getLogger(__name__)

# Conditional import
try:
    from libxmp import XMPFiles, consts

    XMP_AVAILABLE = True
except ImportError:
    logger.warning("libxmp not available. XMP extraction disabled.")
    logger.warning("Install: pip install python-xmp-toolkit && sudo apt-get install libexempi8")
    XMP_AVAILABLE = False


# XMP namespaces
NS_EXIF = "http://ns.adobe.com/exif/1.0/"
NS_TIFF = "http://ns.adobe.com/tiff/1.0/"
NS_XMP = "http://ns.adobe.com/xap/1.0/"
NS_DC = "http://purl.org/dc/elements/1.1/"
NS_PHOTOSHOP = "http://ns.adobe.com/photoshop/1.0/"
NS_IPTC = "http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/"
NS_DRONE_DJI = "http://www.dji.com/drone-dji/1.0/"


def extract_xmp_metadata(image_path: str) -> Dict[str, Any]:
    """
    Extract XMP metadata from an image file.

    Args:
        image_path: Path to image file (XMPFiles requires file path, not BytesIO)

    Returns:
        Dict containing extracted XMP data:
        - title, description, keywords: Dublin Core metadata
        - creator, credit, rights: Copyright and attribution
        - location, city, country, gps_latitude, gps_longitude: Location data
        - altitude_ref, relative_altitude: Drone-specific altitude
        - gimbal_roll, gimbal_yaw, gimbal_pitch: Drone camera orientation
        - flight_speed, flight_yaw: Drone flight parameters
        - camera_model, lens_info: Extended camera data
        - software, edit_history: Processing information
        - raw_xmp: Full XMP dictionary
    """
    if not XMP_AVAILABLE:
        logger.debug("XMP extraction skipped (library not available)")
        return {}

    try:
        xmpfile = XMPFiles(file_path=image_path, open_forupdate=False)
        xmp = xmpfile.get_xmp()

        if not xmp:
            return {}

        result = {}

        # Dublin Core (title, description, keywords)
        try:
            result["title"] = xmp.get_property(NS_DC, "title")
        except:
            pass

        try:
            result["description"] = xmp.get_property(NS_DC, "description")
        except:
            pass

        try:
            # Keywords can be array
            keywords = []
            count = xmp.count_array_items(NS_DC, "subject")
            for i in range(1, count + 1):
                keywords.append(xmp.get_array_item(NS_DC, "subject", i))
            if keywords:
                result["keywords"] = ",".join(keywords)
        except:
            pass

        # Creator and rights
        try:
            result["creator"] = xmp.get_property(NS_DC, "creator")
        except:
            pass

        try:
            result["rights"] = xmp.get_property(NS_DC, "rights")
        except:
            pass

        # Photoshop namespace (location)
        try:
            result["credit"] = xmp.get_property(NS_PHOTOSHOP, "Credit")
        except:
            pass

        try:
            result["city"] = xmp.get_property(NS_PHOTOSHOP, "City")
        except:
            pass

        try:
            result["country"] = xmp.get_property(NS_PHOTOSHOP, "Country")
        except:
            pass

        # IPTC location
        try:
            result["location"] = xmp.get_property(NS_IPTC, "Location")
        except:
            pass

        # GPS from EXIF namespace (sometimes more accurate than EXIF tags)
        try:
            gps_lat = xmp.get_property(NS_EXIF, "GPSLatitude")
            if gps_lat:
                result["gps_latitude"] = float(gps_lat)
        except:
            pass

        try:
            gps_lon = xmp.get_property(NS_EXIF, "GPSLongitude")
            if gps_lon:
                result["gps_longitude"] = float(gps_lon)
        except:
            pass

        try:
            gps_alt = xmp.get_property(NS_EXIF, "GPSAltitude")
            if gps_alt:
                result["gps_altitude"] = float(gps_alt)
        except:
            pass

        # DJI Drone-specific metadata
        try:
            result["altitude_ref"] = xmp.get_property(NS_DRONE_DJI, "AbsoluteAltitude")
        except:
            pass

        try:
            result["relative_altitude"] = xmp.get_property(NS_DRONE_DJI, "RelativeAltitude")
        except:
            pass

        try:
            result["gimbal_roll"] = xmp.get_property(NS_DRONE_DJI, "GimbalRollDegree")
        except:
            pass

        try:
            result["gimbal_yaw"] = xmp.get_property(NS_DRONE_DJI, "GimbalYawDegree")
        except:
            pass

        try:
            result["gimbal_pitch"] = xmp.get_property(NS_DRONE_DJI, "GimbalPitchDegree")
        except:
            pass

        try:
            result["flight_speed"] = xmp.get_property(NS_DRONE_DJI, "FlightSpeed")
        except:
            pass

        try:
            result["flight_yaw"] = xmp.get_property(NS_DRONE_DJI, "FlightYawDegree")
        except:
            pass

        # Camera details
        try:
            result["camera_model"] = xmp.get_property(NS_TIFF, "Model")
        except:
            pass

        try:
            result["lens_info"] = xmp.get_property(NS_EXIF, "LensInfo")
        except:
            pass

        # Software and editing
        try:
            result["software"] = xmp.get_property(NS_XMP, "CreatorTool")
        except:
            pass

        try:
            result["edit_date"] = xmp.get_property(NS_XMP, "ModifyDate")
        except:
            pass

        # Store full XMP as JSON
        result["raw_xmp"] = str(xmp)

        xmpfile.close_file()

        logger.info(f"Extracted {len(result)} XMP properties")
        return result

    except Exception as e:
        logger.error(f"XMP extraction failed: {e}")
        return {}


def merge_exif_xmp(exif_data: Dict[str, Any], xmp_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merge EXIF and XMP metadata, preferring XMP when both exist.

    XMP is often more accurate and complete than EXIF tags.

    Args:
        exif_data: EXIF metadata dict
        xmp_data: XMP metadata dict

    Returns:
        Merged metadata dict with XMP taking priority
    """
    merged = exif_data.copy()

    # Override GPS coordinates if XMP has them
    if "gps_latitude" in xmp_data:
        merged["latitude"] = xmp_data["gps_latitude"]
    if "gps_longitude" in xmp_data:
        merged["longitude"] = xmp_data["gps_longitude"]
    if "gps_altitude" in xmp_data:
        merged["altitude"] = xmp_data["gps_altitude"]

    # Add XMP-specific fields
    for key in [
        "title",
        "description",
        "keywords",
        "creator",
        "rights",
        "credit",
        "city",
        "country",
        "location",
        "altitude_ref",
        "relative_altitude",
        "gimbal_roll",
        "gimbal_yaw",
        "gimbal_pitch",
        "flight_speed",
        "flight_yaw",
        "lens_info",
        "software",
        "edit_date",
    ]:
        if key in xmp_data:
            merged[f"xmp_{key}"] = xmp_data[key]

    return merged


def extract_drone_metadata(xmp_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract drone-specific metadata from XMP.

    Useful for drone/UAV imagery with gimbal and flight data.

    Args:
        xmp_data: XMP metadata dict

    Returns:
        Dict with drone-specific fields, or None if not drone imagery
    """
    drone_keys = [
        "altitude_ref",
        "relative_altitude",
        "gimbal_roll",
        "gimbal_yaw",
        "gimbal_pitch",
        "flight_speed",
        "flight_yaw",
    ]

    drone_data = {k: xmp_data[k] for k in drone_keys if k in xmp_data}

    return drone_data if drone_data else None
