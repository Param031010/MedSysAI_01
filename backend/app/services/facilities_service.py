import asyncio
import math
import httpx
from app.config import settings
from app.services.mock_data import FACILITIES


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0  # Earth radius in kilometers
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(d_lon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return round(r * c, 1)


async def _search_tomtom_category(
    client: httpx.AsyncClient, query: str, lat: float, lng: float, radius_m: int
) -> list[dict]:
    if not settings.tomtom_api_key:
        return []
    url = f"https://api.tomtom.com/search/2/poiSearch/{query}.json"
    params = {
        "key": settings.tomtom_api_key,
        "lat": lat,
        "lon": lng,
        "radius": radius_m,
        "limit": 10,
    }
    try:
        res = await client.get(url, params=params, timeout=2.0)
        if res.status_code != 200:
            return []
        data = res.json()
        results = []
        for r in data.get("results", []):
            poi = r.get("poi", {})
            addr = r.get("address", {})
            pos = r.get("position", {})
            name = poi.get("name")
            f_lat = pos.get("lat")
            f_lng = pos.get("lon")
            if not name or f_lat is None or f_lng is None:
                continue

            cats = [c.lower() for c in poi.get("categories", [])]
            f_type = "hospital"
            specialty = "General Medicine"

            if "diagnostic" in query or any("diagnostic" in c for c in cats):
                f_type = "diagnostic_center"
                specialty = "Diagnostics"
            elif "clinic" in query or any("clinic" in c for c in cats):
                f_type = "clinic"
                specialty = "General Practice"
            elif "cardiology" in query or any("cardiology" in c for c in cats):
                f_type = "hospital"
                specialty = "Cardiology"
            elif "neurology" in query or any("neurology" in c for c in cats):
                f_type = "hospital"
                specialty = "Neurology"

            phone = poi.get("phone")
            address_str = addr.get("freeformAddress") or f"{name}, Local Area"
            dist = haversine_km(lat, lng, f_lat, f_lng)

            results.append(
                {
                    "id": f"tomtom-{r.get('id', name)}",
                    "name": name,
                    "type": f_type,
                    "specialty": specialty,
                    "address": address_str,
                    "distanceKm": dist,
                    "lat": f_lat,
                    "lng": f_lng,
                    "openNow": True,
                    "phone": phone,
                }
            )
        return results
    except Exception:
        return []


async def search_nearby_facilities(
    lat: float | None = None,
    lng: float | None = None,
    radius_km: float = 15.0,
    specialty: str | None = None,
    facility_type: str | None = None,
) -> list[dict]:
    """Returns facilities combining pre-seeded Bengaluru locations with live TomTom POI search results."""
    seeded_results = [dict(f) for f in FACILITIES]

    if lat is not None and lng is not None:
        for f in seeded_results:
            f["distanceKm"] = haversine_km(lat, lng, f["lat"], f["lng"])

    live_results: list[dict] = []
    if lat is not None and lng is not None and settings.tomtom_api_key:
        radius_meters = int(radius_km * 1000)
        try:
            async with httpx.AsyncClient(timeout=1.0) as client:
                queries = ["hospital", "clinic", "diagnostic center"]
                batch_results = await asyncio.wait_for(
                    asyncio.gather(
                        *(_search_tomtom_category(client, q, lat, lng, radius_meters) for q in queries)
                    ),
                    timeout=1.0
                )
                for items in batch_results:
                    live_results.extend(items)
        except Exception:
            pass

    combined: list[dict] = []
    seen_names: set[str] = set()

    for f in [*live_results, *seeded_results]:
        key = f["name"].strip().lower()
        if key not in seen_names:
            seen_names.add(key)
            combined.append(f)

    if specialty:
        combined = [f for f in combined if f["specialty"].lower() == specialty.lower()]
    if facility_type:
        combined = [f for f in combined if f["type"].lower() == facility_type.lower()]

    combined.sort(key=lambda x: x["distanceKm"])
    return combined
