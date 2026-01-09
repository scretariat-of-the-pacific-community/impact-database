#!/usr/bin/env python3
"""
Check images in database without coordinates to see if their EXIF data actually contains GPS info
"""
import sys
import os
from io import BytesIO

# Add app to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

from models.database import engine, SessionLocal, ImageMetadata
from services.exif_utils import extract_exif_data
from services.minio_client import get_minio_storage

def check_images_without_coordinates():
    """Check images without geometry to see if EXIF contains GPS data"""
    db = SessionLocal()
    storage = get_minio_storage()

    try:
        # Get images without geometry
        images = db.query(ImageMetadata).filter(
            ImageMetadata.geometry == None
        ).all()

        print(f"Found {len(images)} images without coordinates\n")

        results = {
            'has_gps': [],
            'no_gps': [],
            'file_not_found': [],
            'error': []
        }

        for img in images:
            print(f"\nChecking: {img.filename}")
            print(f"  ID: {img.id}")
            print(f"  Resource: {img.resource_locator}")

            try:
                # Try to get file from MinIO
                client = storage._get_client()
                response = client.get_object(storage.bucket_name, img.resource_locator)
                file_data = response.read()
                response.close()
                response.release_conn()

                if not file_data:
                    print(f"  ❌ File not found in storage")
                    results['file_not_found'].append({
                        'id': str(img.id),
                        'filename': img.filename,
                        'resource': img.resource_locator
                    })
                    continue

                # Extract EXIF
                file_obj = BytesIO(file_data)
                exif_data = extract_exif_data(file_obj)

                if exif_data and 'gps_data' in exif_data and exif_data['gps_data']:
                    gps = exif_data['gps_data']
                    print(f"  ✅ HAS GPS DATA!")
                    print(f"     Latitude: {gps.get('latitude')}")
                    print(f"     Longitude: {gps.get('longitude')}")
                    print(f"     Location: {exif_data.get('country_code', 'Unknown')}")
                    results['has_gps'].append({
                        'id': str(img.id),
                        'filename': img.filename,
                        'latitude': gps.get('latitude'),
                        'longitude': gps.get('longitude'),
                        'country': exif_data.get('country_code')
                    })
                else:
                    print(f"  ℹ️  No GPS data in EXIF")
                    exif_keys = list(exif_data.keys()) if exif_data else []
                    print(f"     EXIF keys: {exif_keys}")
                    results['no_gps'].append({
                        'id': str(img.id),
                        'filename': img.filename,
                        'exif_keys': exif_keys
                    })

            except Exception as e:
                print(f"  ❌ Error: {str(e)}")
                results['error'].append({
                    'id': str(img.id),
                    'filename': img.filename,
                    'error': str(e)
                })

        # Summary
        print("\n" + "="*80)
        print("SUMMARY")
        print("="*80)
        print(f"Total images checked: {len(images)}")
        print(f"Images WITH GPS data: {len(results['has_gps'])}")
        print(f"Images WITHOUT GPS data: {len(results['no_gps'])}")
        print(f"Files not found: {len(results['file_not_found'])}")
        print(f"Errors: {len(results['error'])}")

        if results['has_gps']:
            print("\n🔍 Images that SHOULD have coordinates but don't:")
            for img in results['has_gps']:
                print(f"  - {img['filename']}")
                print(f"    ID: {img['id']}")
                print(f"    GPS: ({img['latitude']}, {img['longitude']})")

        return results

    finally:
        db.close()

if __name__ == "__main__":
    print("Checking images without coordinates for GPS data in EXIF...\n")
    results = check_images_without_coordinates()
