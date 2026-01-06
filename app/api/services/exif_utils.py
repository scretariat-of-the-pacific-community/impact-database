from typing import Optional, Dict, Any
from datetime import datetime
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
from io import BytesIO


def extract_exif_metadata(file_bytes: bytes) -> Dict[str, Optional[str]]:
    result = {
        "datetime": None,
        "gps_latitude": None,
        "gps_longitude": None,
    }

    try:
        with Image.open(BytesIO(file_bytes)) as img:
            exif_data = img._getexif()
            if not exif_data:
                return result

            gps_info = {}
            for tag, value in exif_data.items():
                decoded = TAGS.get(tag, tag)
                if decoded == "DateTimeOriginal":
                    result["datetime"] = value
                elif decoded == "GPSInfo":
                    for t in value:
                        sub_decoded = GPSTAGS.get(t, t)
                        gps_info[sub_decoded] = value[t]

            if "GPSLatitude" in gps_info and "GPSLatitudeRef" in gps_info:
                lat = _convert_to_degrees(gps_info["GPSLatitude"])
                if gps_info["GPSLatitudeRef"] != "N":
                    lat = -lat
                result["gps_latitude"] = lat

            if "GPSLongitude" in gps_info and "GPSLongitudeRef" in gps_info:
                lon = _convert_to_degrees(gps_info["GPSLongitude"])
                if gps_info["GPSLongitudeRef"] != "E":
                    lon = -lon
                result["gps_longitude"] = lon

    except Exception as e:
        print(f"EXIF extraction failed: {e}")

    return result


def _convert_to_degrees(value):
    d, m, s = value
    return float(d[0] / d[1]) + float(m[0] / m[1]) / 60.0 + float(s[0] / s[1]) / 3600.0


def extract_gps_from_exif(path: str) -> Dict[str, Optional[Any]]:
    result: Dict[str, Optional[Any]] = {
        "timestamp": None,
        "latitude": None,
        "longitude": None,
    }

    try:
        with open(path, "rb") as image_file:
            file_bytes = image_file.read()

        metadata = extract_exif_metadata(file_bytes)

        result["latitude"] = metadata.get("gps_latitude")
        result["longitude"] = metadata.get("gps_longitude")

        dt_str = metadata.get("datetime")
        if dt_str:
            try:
                result["timestamp"] = datetime.strptime(dt_str, "%Y:%m:%d %H:%M:%S")
            except Exception:
                pass
    except Exception as e:
        print(f"EXIF extraction failed: {e}")

    return result
