from fastapi import APIRouter

from app.models import Facility
from app.services import facilities_service

router = APIRouter(prefix="/facilities", tags=["facilities"])


@router.get("", response_model=list[Facility])
async def list_facilities(
    specialty: str | None = None,
    type: str | None = None,
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float = 15.0,
) -> list[dict]:
    return await facilities_service.search_nearby_facilities(
        lat=lat, lng=lng, radius_km=radius_km, specialty=specialty, facility_type=type
    )

