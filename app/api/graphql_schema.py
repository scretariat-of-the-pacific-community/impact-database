import dataclasses
from datetime import datetime, timedelta
from typing import List, Optional

import strawberry
from strawberry.fastapi import GraphQLRouter
from strawberry.file_uploads import Upload
from strawberry.scalars import JSON
from strawberry.types import Info
from strawberry.exceptions import GraphQLError
from fastapi import Depends
from sqlalchemy.orm import Session

from models.database import ImageMetadata
from api.upload import get_db, upload_image as upload_image_route


@strawberry.type
class ImageMetadataType:
    id: str
    datetime: datetime
    latitude: Optional[float]
    longitude: Optional[float]
    hazard_type: str
    event_id: Optional[str]
    status: str
    data_license: str
    source_type: str
    uploader_id: str
    positional_accuracy: Optional[float]
    thumbnail_url: Optional[str]
    filename: Optional[str]

    @classmethod
    def from_dict(cls, data: dict) -> "ImageMetadataType":
        field_names = {f.name for f in dataclasses.fields(cls)}
        filtered = {name: data.get(name) for name in field_names}
        return cls(**filtered)

    @classmethod
    def from_orm(cls, obj: ImageMetadata) -> "ImageMetadataType":
        return cls.from_dict(obj.to_dict())


@strawberry.type
class Query:
    @strawberry.field
    def hazards(
        self,
        info: Info,
        hazard_type: Optional[str] = None,
        date: Optional[str] = None,
        country: Optional[str] = None,
    ) -> List[ImageMetadataType]:
        db: Session = info.context["db"]
        query = db.query(ImageMetadata)

        if hazard_type:
            query = query.filter(ImageMetadata.hazard_type == hazard_type)

        if country:
            query = query.filter(ImageMetadata.country == country)

        if date:
            start_date = datetime.strptime(date, "%Y-%m-%d")
            end_date = start_date + timedelta(days=1)
            query = query.filter(
                ImageMetadata.timestamp >= start_date,
                ImageMetadata.timestamp < end_date,
            )

        hazards = query.all()
        return [ImageMetadataType.from_orm(h) for h in hazards]

    @strawberry.field
    def images(
        self,
        info: Info,
        hazard_type: Optional[str] = None,
        location: Optional[str] = None,
        has_coordinates: Optional[bool] = None,
    ) -> List[ImageMetadataType]:
        db: Session = info.context["db"]
        query = db.query(ImageMetadata)

        if hazard_type:
            query = query.filter(ImageMetadata.hazard_type == hazard_type)

        if location:
            query = query.filter(ImageMetadata.location.ilike(f"%{location}%"))

        if has_coordinates is not None:
            if has_coordinates:
                query = query.filter(ImageMetadata.geometry.isnot(None))
            else:
                query = query.filter(ImageMetadata.geometry.is_(None))

        images = query.all()
        return [ImageMetadataType.from_orm(img) for img in images]

    @strawberry.field
    def image(self, info: Info, filename: str) -> ImageMetadataType:
        db: Session = info.context["db"]
        img = db.query(ImageMetadata).filter(ImageMetadata.filename == filename).first()
        if not img:
            raise GraphQLError("Image not found")
        return ImageMetadataType.from_orm(img)


@strawberry.type
class Mutation:
    @strawberry.mutation
    async def upload_image(
        self,
        info: Info,
        file: Upload,
        hazard_type: str,
        location: str,
        country: Optional[str] = None,
        manual_latitude: Optional[float] = None,
        manual_longitude: Optional[float] = None,
        title: Optional[str] = None,
        title_i18n: Optional[str] = None,
        abstract: Optional[str] = None,
        abstract_i18n: Optional[str] = None,
        purpose: Optional[str] = None,
        purpose_i18n: Optional[str] = None,
        keywords: Optional[str] = None,
        keywords_i18n: Optional[str] = None,
        metadata_language: str = "eng",
    ) -> ImageMetadataType:
        db: Session = info.context["db"]
        result = await upload_image_route(
            file=file,
            hazard_type=hazard_type,
            location=location,
            country=country,
            manual_latitude=manual_latitude,
            manual_longitude=manual_longitude,
            title=title,
            title_i18n=title_i18n,
            abstract=abstract,
            abstract_i18n=abstract_i18n,
            purpose=purpose,
            purpose_i18n=purpose_i18n,
            keywords=keywords,
            keywords_i18n=keywords_i18n,
            metadata_language=metadata_language,
            db=db,
        )
        return ImageMetadataType.from_dict(result)


schema = strawberry.Schema(query=Query, mutation=Mutation)


async def get_context(db: Session = Depends(get_db)):
    return {"db": db}


graphql_router = GraphQLRouter(schema, context_getter=get_context)
