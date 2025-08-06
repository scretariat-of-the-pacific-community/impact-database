from django.core.management.base import BaseCommand
from hazard_images.models import SpatialTestModel, GIS_AVAILABLE


class Command(BaseCommand):
    help = 'Test spatial functionality and PostGIS connection'

    def handle(self, *args, **options):
        self.stdout.write(
            self.style.SUCCESS('Testing Impact Database Spatial Functionality')
        )
        
        # Check if PostGIS is available
        if GIS_AVAILABLE:
            self.stdout.write(
                self.style.SUCCESS('✓ PostGIS support is available')
            )
            
            try:
                # Try to import spatial libraries
                from django.contrib.gis.geos import Point, Polygon
                self.stdout.write(
                    self.style.SUCCESS('✓ GEOS library is available')
                )
                
                # Test creating spatial objects
                test_point = Point(179.0, -17.0)  # Pacific coordinates
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Created test point: {test_point}')
                )
                
                # Test polygon
                test_polygon = Polygon.from_bbox((178.0, -18.0, 180.0, -16.0))
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Created test polygon: {test_polygon}')
                )
                
                # Test database operations
                try:
                    test_obj = SpatialTestModel.objects.create(
                        name="Test Location",
                        point=test_point
                    )
                    self.stdout.write(
                        self.style.SUCCESS(f'✓ Created spatial test object: {test_obj}')
                    )
                    
                    # Test spatial query
                    nearby = SpatialTestModel.objects.filter(
                        point__dwithin=(test_point, 0.1)
                    )
                    self.stdout.write(
                        self.style.SUCCESS(f'✓ Spatial query successful, found {nearby.count()} objects')
                    )
                    
                    # Clean up
                    test_obj.delete()
                    self.stdout.write(
                        self.style.SUCCESS('✓ Test cleanup completed')
                    )
                    
                except Exception as e:
                    self.stdout.write(
                        self.style.ERROR(f'✗ Database spatial operations failed: {e}')
                    )
                    
            except ImportError as e:
                self.stdout.write(
                    self.style.ERROR(f'✗ Spatial libraries not available: {e}')
                )
        else:
            self.stdout.write(
                self.style.WARNING('⚠ PostGIS support is not available')
            )
            self.stdout.write(
                self.style.WARNING('Using fallback lat/lng fields instead')
            )
            
            # Test with fallback fields
            try:
                test_obj = SpatialTestModel.objects.create(
                    name="Test Location (Fallback)",
                    latitude=-17.0,
                    longitude=179.0
                )
                self.stdout.write(
                    self.style.SUCCESS(f'✓ Created fallback test object: {test_obj}')
                )
                
                # Clean up
                test_obj.delete()
                self.stdout.write(
                    self.style.SUCCESS('✓ Test cleanup completed')
                )
                
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f'✗ Database operations failed: {e}')
                )
        
        # Check database connection
        from django.db import connection
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                self.stdout.write(
                    self.style.SUCCESS('✓ Database connection is working')
                )
                
                if GIS_AVAILABLE:
                    # Try to check PostGIS version
                    try:
                        cursor.execute("SELECT PostGIS_Version()")
                        version = cursor.fetchone()
                        if version:
                            self.stdout.write(
                                self.style.SUCCESS(f'✓ PostGIS version: {version[0]}')
                            )
                    except Exception:
                        self.stdout.write(
                            self.style.WARNING('⚠ PostGIS not installed in database')
                        )
                        
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'✗ Database connection failed: {e}')
            )
        
        self.stdout.write(
            self.style.SUCCESS('\nSpatial functionality test completed!')
        )