"""画像のEXIFからGPS位置情報を抽出するユーティリティ"""
from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS


def _convert_to_degrees(value):
    d, m, s = value
    return float(d) + float(m) / 60.0 + float(s) / 3600.0


def extract_gps(image_path: str):
    """画像ファイルからGPS座標 (lat, lng) を抽出する。見つからない場合は None を返す"""
    try:
        image = Image.open(image_path)
        exif = image.getexif()
        if not exif:
            return None

        gps_ifd = exif.get_ifd(0x8825)
        if not gps_ifd:
            return None

        gps_data = {GPSTAGS.get(key, key): value for key, value in gps_ifd.items()}

        lat = gps_data.get("GPSLatitude")
        lat_ref = gps_data.get("GPSLatitudeRef")
        lng = gps_data.get("GPSLongitude")
        lng_ref = gps_data.get("GPSLongitudeRef")

        if not (lat and lat_ref and lng and lng_ref):
            return None

        latitude = _convert_to_degrees(lat)
        if lat_ref != "N":
            latitude = -latitude

        longitude = _convert_to_degrees(lng)
        if lng_ref != "E":
            longitude = -longitude

        return latitude, longitude
    except Exception:
        return None
