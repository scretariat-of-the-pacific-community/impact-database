# This Dockerfile sets up a Python 3.11 application environment using the slim base image.
# It configures the working directory to /app and sets PYTHONPATH for module resolution.
# System dependencies required for building Python packages (including PostgreSQL support) are installed.
# The requirements.txt file is copied and Python dependencies are installed.
# Finally, the application source code is copied into the container.

FROM python:3.11-slim

WORKDIR /app

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

# Install system dependencies for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    postgresql-client \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Make scripts executable
RUN chmod +x /app/entrypoint.sh && \
    chmod +x /app/*.sh

# Create uploads directory
RUN mkdir -p /app/uploads

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
