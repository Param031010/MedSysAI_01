"""Live weather + AQI via OpenWeather, feeding the Home environment card with caching & parallel fetching."""

import asyncio

import time

from datetime import datetime, timezone

import httpx

from app.config import settings

OWM_BASE = "https://api.openweathermap.org/data/2.5"

# EPA breakpoints for PM2.5 (ug/m3) -> US AQI (0-500)
_PM25_BREAKPOINTS = [
    (0.0, 12.0, 0, 50),
    (12.1, 35.4, 51, 100),
    (35.5, 55.4, 101, 150),
    (55.5, 150.4, 151, 200),
    (150.5, 250.4, 201, 300),
    (250.5, 350.4, 301, 400),
    (350.5, 500.4, 401, 500),
]

# EPA breakpoints for PM10 (ug/m3) -> US AQI (0-500)
_PM10_BREAKPOINTS = [
    (0, 54, 0, 50),
    (55, 154, 51, 100),
    (155, 254, 101, 150),
    (255, 354, 151, 200),
    (355, 424, 201, 300),
    (425, 504, 301, 400),
    (505, 604, 401, 500),
]


def _calc_sub_aqi(val: float, breakpoints: list[tuple[float, float, int, int]]) -> int:
    for c_lo, c_hi, i_lo, i_hi in breakpoints:
        if c_lo <= val <= c_hi:
            return round((i_hi - i_lo) / (c_hi - c_lo) * (val - c_lo) + i_lo)
    return 500


def _overall_aqi(pm25: float, pm10: float) -> int:
    aqi_pm25 = _calc_sub_aqi(pm25, _PM25_BREAKPOINTS)
    aqi_pm10 = _calc_sub_aqi(pm10, _PM10_BREAKPOINTS)
    return max(aqi_pm25, aqi_pm10)


def _aqi_category(aqi: int) -> str:
    if aqi <= 50:
        return "Good"
    if aqi <= 100:
        return "Moderate"
    if aqi <= 150:
        return "Unhealthy for Sensitive Groups"
    if aqi <= 200:
        return "Unhealthy"
    if aqi <= 300:
        return "Very Unhealthy"
    return "Hazardous"


def tip_for(aqi_category: str, active_symptoms: list[str] | None = None) -> str:
    """Generates a patient-personalized health tip based on AQI and active symptom history."""
    symptoms = [s.lower() for s in (active_symptoms or [])]
    has_respiratory = any(s in symptoms for s in ("cough", "asthma", "bronchitis", "wheezing", "shortness of breath", "allergy"))

    if aqi_category in ("Unhealthy", "Very Unhealthy", "Hazardous"):
        if has_respiratory:
            return f"Air quality is {aqi_category.lower()} today. Given your active respiratory symptoms, stay indoors, keep windows closed, and use an air purifier."
        return f"Air quality is {aqi_category.lower()} today. Limit outdoor workouts and consider wearing an N95 mask if stepping out."

    if aqi_category == "Unhealthy for Sensitive Groups":
        if has_respiratory:
            return "Air quality may trigger your active respiratory symptoms today. Keep outdoor exertion short and carry prescribed inhalers or medication."
        return "Sensitive groups should take it easy outdoors today. Consider shifting strenuous exercise indoors."

    # Good / Moderate
    if has_respiratory:
        return f"{aqi_category} air today — a great day to get fresh air, but monitor for any cough or breathing changes."
    return f"Conditions are {aqi_category.lower()} outside right now — a great excuse for a walk or outdoor activity today."


# IN-MEMORY TTL CACHE (10 MINUTES = 600 SECONDS)
_CACHE_TTL_SECONDS = 600
_cached_snapshot: dict | None = None
_cached_timestamp: float = 0.0


async def get_environment_snapshot() -> dict | None:
    """Fetches weather + AQI concurrently with 10-minute in-memory caching for 0ms page loads."""
    global _cached_snapshot, _cached_timestamp

    if not settings.openweather_api_key:
        return None

    now = time.time()
    if _cached_snapshot is not None and (now - _cached_timestamp) < _CACHE_TTL_SECONDS:
        return _cached_snapshot

    params = {
        "lat": settings.location_lat,
        "lon": settings.location_lng,
        "appid": settings.openweather_api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            # PARALLEL HTTP REQUESTS VIA asyncio.gather
            weather_task = client.get(f"{OWM_BASE}/weather", params={**params, "units": "metric"})
            air_task = client.get(f"{OWM_BASE}/air_pollution", params=params)

            weather_res, air_res = await asyncio.gather(weather_task, air_task)

            weather_res.raise_for_status()
            air_res.raise_for_status()

            weather = weather_res.json()
            components = air_res.json()["list"][0]["components"]
    except Exception:
        # Return stale cache if network error occurs
        if _cached_snapshot:
            return _cached_snapshot
        return None

    pm25 = components.get("pm2_5", 0)
    pm10 = components.get("pm10", 0)
    aqi = _overall_aqi(pm25, pm10)

    snapshot = {
        "locationName": settings.location_name,
        "tempC": round(weather["main"]["temp"]),
        "condition": weather["weather"][0]["description"].capitalize(),
        "humidityPct": weather["main"]["humidity"],
        "aqi": aqi,
        "aqiCategory": _aqi_category(aqi),
        "pollutants": [
            {"label": "PM2.5", "value": round(pm25, 1), "unit": "ug/m3"},
            {"label": "PM10", "value": round(pm10, 1), "unit": "ug/m3"},
            {"label": "CO", "value": round(components.get("co", 0), 1), "unit": "ug/m3"},
            {"label": "NO2", "value": round(components.get("no2", 0), 1), "unit": "ug/m3"},
            {"label": "O3", "value": round(components.get("o3", 0), 1), "unit": "ug/m3"},
            {"label": "SO2", "value": round(components.get("so2", 0), 1), "unit": "ug/m3"},
        ],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }

    _cached_snapshot = snapshot
    _cached_timestamp = now
    return snapshot
