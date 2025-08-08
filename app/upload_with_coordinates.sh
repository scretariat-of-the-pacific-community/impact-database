cd /workspaces/impact-database/app

# Make scripts executable
chmod +x test_manual_coordinates.sh upload_with_coordinates.sh

# Test manual coordinate input
./test_manual_coordinates.sh

# Interactive upload with coordinates
./upload_with_coordinates.sh ../hazard_test_images/cyclone_1.jpg