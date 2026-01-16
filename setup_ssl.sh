#!/bin/bash
# SSL/TLS Setup Script for Production Deployment
# This script helps generate self-signed certificates for development/testing
# For production, use proper CA-signed certificates

set -e

CERTS_DIR="./certs"
MINIO_CERTS_DIR="${CERTS_DIR}/minio"
REDIS_CERTS_DIR="${CERTS_DIR}/redis"
POSTGRES_CERTS_DIR="${CERTS_DIR}/postgres"

echo "================================================"
echo "SSL/TLS Certificate Setup for Impact Database"
echo "================================================"
echo ""
echo "⚠️  WARNING: This script generates self-signed certificates"
echo "   For production use, obtain certificates from a trusted CA"
echo ""

# Create directories
mkdir -p "${MINIO_CERTS_DIR}"
mkdir -p "${REDIS_CERTS_DIR}"
mkdir -p "${POSTGRES_CERTS_DIR}"

# Function to generate self-signed certificate
generate_cert() {
    local service=$1
    local cert_dir=$2
    local common_name=${3:-localhost}
    
    echo "Generating certificate for ${service}..."
    
    # Generate private key
    openssl genrsa -out "${cert_dir}/private.key" 4096 2>/dev/null
    
    # Generate certificate
    openssl req -new -x509 -days 365 -key "${cert_dir}/private.key" \
        -out "${cert_dir}/public.crt" \
        -subj "/C=FJ/ST=Central/L=Suva/O=SPC/OU=IT/CN=${common_name}" \
        2>/dev/null
    
    # Set permissions
    chmod 600 "${cert_dir}/private.key"
    chmod 644 "${cert_dir}/public.crt"
    
    echo "✓ ${service} certificates generated"
}

# MinIO
echo ""
echo "1. MinIO SSL Configuration"
echo "----------------------------"
if [ -f "${MINIO_CERTS_DIR}/private.key" ]; then
    read -p "MinIO certificates already exist. Regenerate? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        generate_cert "MinIO" "${MINIO_CERTS_DIR}" "minio.local"
    else
        echo "⊘ Skipping MinIO certificate generation"
    fi
else
    generate_cert "MinIO" "${MINIO_CERTS_DIR}" "minio.local"
fi

# Redis
echo ""
echo "2. Redis SSL Configuration"
echo "----------------------------"
if [ -f "${REDIS_CERTS_DIR}/redis.key" ]; then
    read -p "Redis certificates already exist. Regenerate? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        openssl genrsa -out "${REDIS_CERTS_DIR}/redis.key" 4096 2>/dev/null
        openssl req -new -x509 -days 365 -key "${REDIS_CERTS_DIR}/redis.key" \
            -out "${REDIS_CERTS_DIR}/redis.crt" \
            -subj "/C=FJ/ST=Central/L=Suva/O=SPC/OU=IT/CN=redis.local" \
            2>/dev/null
        cp "${REDIS_CERTS_DIR}/redis.crt" "${REDIS_CERTS_DIR}/ca.crt"
        chmod 600 "${REDIS_CERTS_DIR}/redis.key"
        chmod 644 "${REDIS_CERTS_DIR}/redis.crt"
        echo "✓ Redis certificates generated"
    else
        echo "⊘ Skipping Redis certificate generation"
    fi
else
    openssl genrsa -out "${REDIS_CERTS_DIR}/redis.key" 4096 2>/dev/null
    openssl req -new -x509 -days 365 -key "${REDIS_CERTS_DIR}/redis.key" \
        -out "${REDIS_CERTS_DIR}/redis.crt" \
        -subj "/C=FJ/ST=Central/L=Suva/O=SPC/OU=IT/CN=redis.local" \
        2>/dev/null
    cp "${REDIS_CERTS_DIR}/redis.crt" "${REDIS_CERTS_DIR}/ca.crt"
    chmod 600 "${REDIS_CERTS_DIR}/redis.key"
    chmod 644 "${REDIS_CERTS_DIR}/redis.crt"
    echo "✓ Redis certificates generated"
fi

# PostgreSQL
echo ""
echo "3. PostgreSQL SSL Configuration"
echo "--------------------------------"
if [ -f "${POSTGRES_CERTS_DIR}/server.key" ]; then
    read -p "PostgreSQL certificates already exist. Regenerate? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        openssl genrsa -out "${POSTGRES_CERTS_DIR}/server.key" 4096 2>/dev/null
        openssl req -new -x509 -days 365 -key "${POSTGRES_CERTS_DIR}/server.key" \
            -out "${POSTGRES_CERTS_DIR}/server.crt" \
            -subj "/C=FJ/ST=Central/L=Suva/O=SPC/OU=IT/CN=postgres.local" \
            2>/dev/null
        chmod 600 "${POSTGRES_CERTS_DIR}/server.key"
        chmod 644 "${POSTGRES_CERTS_DIR}/server.crt"
        echo "✓ PostgreSQL certificates generated"
    else
        echo "⊘ Skipping PostgreSQL certificate generation"
    fi
else
    openssl genrsa -out "${POSTGRES_CERTS_DIR}/server.key" 4096 2>/dev/null
    openssl req -new -x509 -days 365 -key "${POSTGRES_CERTS_DIR}/server.key" \
        -out "${POSTGRES_CERTS_DIR}/server.crt" \
        -subj "/C=FJ/ST=Central/L=Suva/O=SPC/OU=IT/CN=postgres.local" \
        2>/dev/null
    chmod 600 "${POSTGRES_CERTS_DIR}/server.key"
    chmod 644 "${POSTGRES_CERTS_DIR}/server.crt"
    echo "✓ PostgreSQL certificates generated"
fi

echo ""
echo "================================================"
echo "Certificate Generation Complete!"
echo "================================================"
echo ""
echo "Certificates have been generated in: ${CERTS_DIR}/"
echo ""
echo "📋 Next Steps:"
echo ""
echo "1. Update your .env file with SSL settings:"
echo "   -------------------------------------------"
echo "   MINIO_SECURE=true"
echo "   REDIS_SSL=true"
echo "   REDIS_URL=rediss://redis:6379/0"
echo "   DATABASE_SSL_MODE=require"
echo ""
echo "2. Update docker-compose.yml to mount certificates"
echo "   (See SECURITY_IMPROVEMENTS.md for examples)"
echo ""
echo "3. Rebuild and restart containers:"
echo "   docker-compose down"
echo "   docker-compose build --no-cache"
echo "   docker-compose up -d"
echo ""
echo "⚠️  IMPORTANT NOTES:"
echo "   - These are self-signed certificates for development/testing"
echo "   - For production, obtain certificates from a trusted CA (Let's Encrypt, etc.)"
echo "   - Add ca.crt to trusted certificates on client systems if needed"
echo "   - Keep private keys secure and never commit them to version control"
echo ""
echo "📖 See SECURITY_IMPROVEMENTS.md for detailed configuration instructions"
echo ""
