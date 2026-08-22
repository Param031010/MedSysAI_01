"""Live weather + AQI via OpenWeather, feeding the Home environment card."""

import random
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


def _pm25_to_aqi(pm25: float) -> int:
    for c_lo, c_hi, i_lo, i_hi in _PM25_BREAKPOINTS:
        if c_lo <= pm25 <= c_hi:
            return round((i_hi - i_lo) / (c_hi - c_lo) * (pm25 - c_lo) + i_lo)
    return 500


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


_TIP_TEMPLATES = {
    "unhealthy": [
        "Outdoor air quality is {category_lower} today. Keep windows closed "
        "through the afternoon and favor indoor activity if you're prone to "
        "respiratory symptoms.",
        "{category} air outside today — a mask helps if you need to step "
        "out, and it's worth keeping strenuous activity indoors.",
        "Air quality has dropped to {category} today. An indoor air "
        "purifier and limiting time outside are worth it if you have "
        "asthma or allergies.",
        "With {category} air today, watch for symptoms like coughing or "
        "shortness of breath, and stay indoors where you can.",
    ],
    "sensitive": [
        "Air quality may affect sensitive groups today. Consider limiting "
        "prolonged outdoor exertion.",
        "Today's air could bother people with asthma or heart conditions — "
        "keep outdoor workouts shorter than usual.",
        "Sensitive groups should take it easier outdoors today; everyone "
        "else is generally fine for normal activity.",
    ],
    "good": [
        "Air quality is {category_lower} today — a good day for outdoor "
        "activity.",
        "{category} air today — a great excuse for a walk or run outside.",
        "Conditions are {category_lower} outside right now, so outdoor "
        "plans are a safe bet today.",
    ],
}


def tip_for(aqi_category: str) -> str:
    if aqi_category in ("Unhealthy", "Very Unhealthy", "Hazardous"):
        bucket = "unhealthy"
    elif aqi_category == "Unhealthy for Sensitive Groups":
        bucket = "sensitive"
    else:
        bucket = "good"

    template = random.choice(_TIP_TEMPLATES[bucket])
    return template.format(category=aqi_category, category_lower=aqi_category.lower())


async def get_environment_snapshot() -> dict | None:
    if not settings.openweather_api_key:
        return None

    params = {
        "lat": settings.location_lat,
        "lon": settings.location_lng,
        "appid": settings.openweather_api_key,
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            weather_res = await client.get(
                f"{OWM_BASE}/weather", params={**params, "units": "metric"}
            )
            weather_res.raise_for_status()
            weather = weather_res.json()

            air_res = await client.get(f"{OWM_BASE}/air_pollution", params=params)
            air_res.raise_for_status()
            components = air_res.json()["list"][0]["components"]
    except (httpx.HTTPError, KeyError, IndexError):
        return None

    aqi = _pm25_to_aqi(components.get("pm2_5", 0))
    return {
        "locationName": settings.location_name,
        "tempC": round(weather["main"]["temp"]),
        "condition": weather["weather"][0]["description"].capitalize(),
        "humidityPct": weather["main"]["humidity"],
        "aqi": aqi,
        "aqiCategory": _aqi_category(aqi),
        "pollutants": [
            {"label": "PM2.5", "value": round(components.get("pm2_5", 0), 1), "unit": "ug/m3"},
            {"label": "PM10", "value": round(components.get("pm10", 0), 1), "unit": "ug/m3"},
            {"label": "CO", "value": round(components.get("co", 0), 1), "unit": "ug/m3"},
            {"label": "NO2", "value": round(components.get("no2", 0), 1), "unit": "ug/m3"},
            {"label": "O3", "value": round(components.get("o3", 0), 1), "unit": "ug/m3"},
            {"label": "SO2", "value": round(components.get("so2", 0), 1), "unit": "ug/m3"},
        ],
        "updatedAt": datetime.now(timezone.utc).isoformat(),
    }
