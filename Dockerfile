# Use Python 3.12 slim image
FROM python:3.12-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies for PostGIS
RUN apt-get update && apt-get install -y \
    binutils \
    libproj-dev \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    libspatialite-dev \
    libsqlite3-mod-spatialite \
    postgresql-client \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set GDAL environment variables
ENV GDAL_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/libgdal.so
ENV GEOS_LIBRARY_PATH=/usr/lib/x86_64-linux-gnu/libgeos_c.so

# Set work directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . /app/

# Create media directory for uploaded images
RUN mkdir -p /app/media/hazard_images

# Expose port
EXPOSE 8000

# Create a script to wait for the database and run migrations
RUN echo '#!/bin/bash\n\
echo "Waiting for PostgreSQL..."\n\
while ! pg_isready -h $DATABASE_HOST -p $DATABASE_PORT -U $DATABASE_USER; do\n\
  sleep 1\n\
done\n\
echo "PostgreSQL is ready!"\n\
\n\
echo "Running migrations..."\n\
python manage.py makemigrations\n\
python manage.py migrate\n\
\n\
echo "Creating superuser if it does not exist..."\n\
python manage.py shell -c "from django.contrib.auth import get_user_model; User = get_user_model(); User.objects.filter(username=\"admin\").exists() or User.objects.create_superuser(\"admin\", \"admin@example.com\", \"admin123\")" || true\n\
\n\
echo "Starting Django server..."\n\
python manage.py runserver 0.0.0.0:8000\n\
' > /app/entrypoint.sh && chmod +x /app/entrypoint.sh

# Run the entrypoint script
CMD ["/app/entrypoint.sh"]