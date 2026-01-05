import os
import uuid
from sqlalchemy.orm import Session
from models.database import SessionLocal
from models.collaboration import SharedFolder, FolderItem
from models.database import ImageMetadata
from models.rbac import User  # ensure 'users' table is registered in SQLAlchemy metadata

"""
Seed a demo folder item for development:
- Finds first SharedFolder owned by 'dev_user' (or any folder)
- Finds first ImageMetadata
- Inserts a FolderItem if not already present
Run inside API container or with DATABASE_URL configured.
"""

def main():
    db: Session = SessionLocal()
    try:
        folder = db.query(SharedFolder).order_by(SharedFolder.created_at.asc()).first()
        image = db.query(ImageMetadata).order_by(ImageMetadata.datetime.asc()).first()
        if not folder or not image:
            print("No folder or image available to seed.")
            return
        existing = db.query(FolderItem).filter(
            FolderItem.folder_id == folder.id,
            FolderItem.image_id == image.id
        ).first()
        if existing:
            print("FolderItem already exists. Nothing to do.")
            return
        item = FolderItem(
            id=uuid.uuid4(),
            folder_id=folder.id,
            image_id=image.id,
            added_by=folder.owner_id,
        )
        db.add(item)
        db.commit()
        print(f"Seeded FolderItem: folder={folder.id} image={image.id}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
