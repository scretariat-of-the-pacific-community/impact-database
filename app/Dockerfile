# This Dockerfile sets up a Python 3.11 application environment using the slim base image.
# It configures the working directory to /app and sets PYTHONPATH for module resolution.
# System dependencies required for building Python packages (including PostgreSQL support) are installed.
# The requirements.txt file is copied and Python dependencies are installed.
# Finally, the application source code is copied into the container.

FROM python:3.11-slim

WORKDIR /app

ENV PYTHONPATH=/app  

# Install system dependencies for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x /app/entrypoint.sh
ENTRYPOINT ["/app/entrypoint.sh"]
