import os
import boto3

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY")

if MINIO_ENDPOINT and MINIO_ACCESS_KEY and MINIO_SECRET_KEY:
    minio_client = boto3.client(
        "s3",
        endpoint_url=MINIO_ENDPOINT,
        aws_access_key_id=MINIO_ACCESS_KEY,
        aws_secret_access_key=MINIO_SECRET_KEY,
    )
else:
    class _LocalMinioClient:
        def put_object(self, Bucket: str, Key: str, Body: bytes, **kwargs) -> None:
            os.makedirs(f"/app/{Bucket}", exist_ok=True)
            with open(f"/app/{Bucket}/{Key}", "wb") as file_obj:
                file_obj.write(Body)

    minio_client = _LocalMinioClient()
