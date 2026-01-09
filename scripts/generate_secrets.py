#!/usr/bin/env python3
"""
Generate Strong Cryptographic Secrets for Production
-----------------------------------------------------
This script generates cryptographically secure secrets for production deployment.
All secrets are generated using secrets.token_urlsafe() for URL-safe randomness.
"""

import secrets
import string
from datetime import datetime

def generate_secret_key(length=64):
    """Generate a strong SECRET_KEY for JWT signing."""
    return secrets.token_urlsafe(length)

def generate_password(length=32):
    """Generate a strong password with mixed character types."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_=+[]{}|;:,.<>?"
    return ''.join(secrets.choice(alphabet) for _ in range(length))

def generate_vapid_keys():
    """Generate VAPID keys for web push notifications.

    Note: This requires the py-vapid library.
    If not installed: pip install py-vapid
    """
    try:
        from vapid import Vapid

        vapid = Vapid()
        vapid.generate_keys()

        return {
            'private': vapid.private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ).decode('utf-8'),
            'public': vapid.public_key.public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo
            ).decode('utf-8')
        }
    except ImportError:
        return {
            'private': '<install py-vapid: pip install py-vapid>',
            'public': '<install py-vapid: pip install py-vapid>'
        }

def main():
    print("=" * 70)
    print("Production Secrets Generator")
    print("=" * 70)
    print(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("")
    print("⚠️  CRITICAL: Store these secrets securely!")
    print("   - Use a secrets manager (AWS Secrets Manager, Vault, etc.)")
    print("   - Never commit to git")
    print("   - Rotate regularly (every 90 days)")
    print("")
    print("=" * 70)
    print("")

    # Generate all secrets
    secrets_dict = {
        'SECRET_KEY': generate_secret_key(64),
        'POSTGRES_PASSWORD': generate_password(32),
        'MINIO_ROOT_PASSWORD': generate_password(32),
        'MINIO_ACCESS_KEY': 'minio-' + secrets.token_urlsafe(16),
        'MINIO_SECRET_KEY': generate_password(32),
        'REDIS_PASSWORD': generate_password(32),
        'CSRF_SECRET': generate_secret_key(32),
    }

    # Print in .env format
    print("# Copy these to your production environment variables or secrets manager")
    print("#" * 70)
    print("")

    for key, value in secrets_dict.items():
        print(f"{key}={value}")

    print("")
    print("# VAPID Keys (for web push notifications)")
    print("# Note: These require the py-vapid library (pip install py-vapid)")
    print("")

    vapid = generate_vapid_keys()
    print(f"VAPID_PRIVATE_KEY=\"{vapid['private']}\"")
    print(f"VAPID_PUBLIC_KEY=\"{vapid['public']}\"")

    print("")
    print("#" * 70)
    print("")
    print("✅ Secrets generated successfully!")
    print("")
    print("NEXT STEPS:")
    print("-----------")
    print("1. Copy these values to your production secrets manager")
    print("2. Update your deployment configuration")
    print("3. Restart all services with new secrets")
    print("4. Verify application functionality")
    print("5. Document secret rotation date in your runbook")
    print("")
    print("⚠️  SECURITY REMINDER:")
    print("   - Delete this output after storing secrets")
    print("   - Do not send secrets via email or chat")
    print("   - Use encryption for secret transmission")
    print("")

if __name__ == "__main__":
    main()
