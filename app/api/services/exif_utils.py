from typing import Optional, Dict
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
from io import BytesIO

def extract_exif_metadata(file_bytes: bytes) -> Dict[str, Optional[str]]:
    result = {
        "datetime": None,
        "gps_latitude": None,
        "gps_longitude": None
    }

    try:
        img = Image.open(BytesIO(file_bytes))
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
    return float(d[0]/d[1]) + float(m[0]/m[1]) / 60.0 + float(s[0]/s[1]) / 3600.0