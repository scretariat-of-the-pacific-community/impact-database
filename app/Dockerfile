# Multi-stage build for Python FastAPI backend
# Stage 1: Builder
FROM python:3.11-slim AS builder

WORKDIR /app

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --user --no-cache-dir --upgrade pip && \
    pip install --user --no-cache-dir -r requirements.txt

# Stage 2: Runner (production)
FROM python:3.11-slim AS runner

WORKDIR /app

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

ARG FFMPEG_VERSION=7:5.1.4-0+deb12u1

# Install runtime dependencies only
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        libpq5 \
        postgresql-client \
        curl \
        libmagic1; \
    if [ -n "${FFMPEG_VERSION}" ]; then \
        apt-get install -y --no-install-recommends "ffmpeg=${FFMPEG_VERSION}" \
        || apt-get install -y --no-install-recommends ffmpeg; \
    else \
        apt-get install -y --no-install-recommends ffmpeg; \
    fi; \
    apt-get install -y --no-install-recommends \
        libavcodec-extra \
        libx264-dev \
        libvpx-dev \
        libopus-dev; \
    rm -rf /var/lib/apt/lists/*

RUN ffmpeg -version && ffprobe -version

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy Python dependencies from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy application code
COPY . .

# Make scripts executable
RUN chmod +x /app/entrypoint.sh && \
    chmod +x /app/*.sh || true

# Create uploads directory with proper permissions
RUN mkdir -p /app/uploads && \
    chown -R appuser:appuser /app/uploads && \
    chown -R appuser:appuser /app

# Switch to non-root user for runtime
USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]

# Stage 3: Development
FROM python:3.11-slim AS development

WORKDIR /app

ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

ARG FFMPEG_VERSION=7:5.1.4-0+deb12u1

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
        build-essential \
        gcc \
        libpq-dev \
        postgresql-client \
        curl \
        git \
        libmagic1; \
    if [ -n "${FFMPEG_VERSION}" ]; then \
        apt-get install -y --no-install-recommends "ffmpeg=${FFMPEG_VERSION}" \
        || apt-get install -y --no-install-recommends ffmpeg; \
    else \
        apt-get install -y --no-install-recommends ffmpeg; \
    fi; \
    apt-get install -y --no-install-recommends \
        libavcodec-extra \
        libx264-dev \
        libvpx-dev \
        libopus-dev; \
    rm -rf /var/lib/apt/lists/*

RUN ffmpeg -version && ffprobe -version

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chmod +x /app/entrypoint.sh && \
    chmod +x /app/*.sh || true

RUN mkdir -p /app/uploads

HEALTHCHECK --interval=30s --timeout=30s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
