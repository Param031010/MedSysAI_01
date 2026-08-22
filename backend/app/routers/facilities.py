from fastapi import APIRouter

from app.models import Facility
from app.services.mock_data import FACILITIES

router = APIRouter(prefix="/facilities", tags=["facilities"])


@router.get("", response_model=list[Facility])
def list_facilities(specialty: str | None = None, type: str | None = None) -> list[dict]:
    result = FACILITIES
    if specialty:
        result = [f for f in result if f["specialty"] == specialty]
    if type:
        result = [f for f in result if f["type"] == type]
    return result
