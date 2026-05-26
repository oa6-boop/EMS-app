import json
import re
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/api/weather", tags=["weather"])


COUNTRY_NAME_BY_CODE = {
    "ma": "Morocco",
    "fr": "France",
    "es": "Spain",
    "us": "United States",
    "gb": "United Kingdom",
    "de": "Germany",
    "it": "Italy",
    "pt": "Portugal",
    "dz": "Algeria",
    "tn": "Tunisia",
}


def http_get_json(url: str, headers: dict | None = None, timeout: int = 8) -> dict:
    try:
        request = urllib.request.Request(
            url,
            headers=headers or {
                "User-Agent": "EMS-Weather-Module/1.0",
                "Accept": "application/json",
                "Accept-Language": "en",
            },
        )

        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw)

    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail=f"External weather service unavailable: {str(error)}",
        )


def keep_latin_only(value: str | None) -> str:
    """
    Keeps only Latin/English/French readable text.
    Removes Arabic, Amazigh/Tifinagh and other non-Latin scripts.
    """
    if not value:
        return ""

    cleaned_chars = []

    for char in str(value):
        if char.isspace():
            cleaned_chars.append(" ")
            continue

        if char.isascii():
            cleaned_chars.append(char)
            continue

        try:
            unicode_name = unicodedata.name(char)
            if "LATIN" in unicode_name:
                cleaned_chars.append(char)
        except ValueError:
            continue

    cleaned = "".join(cleaned_chars)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # Remove messy separators left by multilingual names
    cleaned = cleaned.replace("+", " ").replace("|", " ").strip()
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    return cleaned


def weather_code_to_text(code: int | None) -> str:
    codes = {
        0: "Clear sky",
        1: "Mainly clear",
        2: "Partly cloudy",
        3: "Overcast",
        45: "Fog",
        48: "Icy fog",
        51: "Light drizzle",
        53: "Moderate drizzle",
        55: "Dense drizzle",
        61: "Slight rain",
        63: "Rain",
        65: "Heavy rain",
        71: "Slight snow",
        73: "Snow",
        75: "Heavy snow",
        80: "Rain showers",
        81: "Moderate rain showers",
        82: "Heavy rain showers",
        95: "Thunderstorm",
        96: "Thunderstorm with hail",
        99: "Thunderstorm with heavy hail",
    }

    return codes.get(code, "Unknown")


def reverse_geocode(latitude: float, longitude: float) -> dict:
    params = urllib.parse.urlencode(
        {
            "format": "jsonv2",
            "lat": latitude,
            "lon": longitude,
            "zoom": 12,
            "addressdetails": 1,
            "accept-language": "en",
        }
    )

    url = f"https://nominatim.openstreetmap.org/reverse?{params}"

    try:
        data = http_get_json(
            url,
            headers={
                "User-Agent": "EMS-Weather-Module/1.0 contact: local-project",
                "Accept": "application/json",
                "Accept-Language": "en",
            },
            timeout=8,
        )

        address = data.get("address", {})

        raw_city = (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("municipality")
            or address.get("county")
            or "Unknown location"
        )

        raw_country = address.get("country") or ""
        country_code = str(address.get("country_code") or "").lower()

        city = keep_latin_only(raw_city)
        country = COUNTRY_NAME_BY_CODE.get(country_code) or keep_latin_only(raw_country)

        if not city:
            city = "Unknown location"

        if not country:
            country = "Unknown country"

        return {
            "city": city,
            "country": country,
        }

    except Exception:
        return {
            "city": "Unknown location",
            "country": "Unknown country",
        }


@router.get("")
def get_weather(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
):
    location = reverse_geocode(lat, lon)

    params = urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lon,
            "current": ",".join(
                [
                    "temperature_2m",
                    "relative_humidity_2m",
                    "apparent_temperature",
                    "precipitation",
                    "weather_code",
                    "wind_speed_10m",
                ]
            ),
            "daily": ",".join(
                [
                    "temperature_2m_max",
                    "temperature_2m_min",
                    "weather_code",
                ]
            ),
            "timezone": "auto",
            "forecast_days": 3,
        }
    )

    url = f"https://api.open-meteo.com/v1/forecast?{params}"

    data = http_get_json(
        url,
        headers={
            "User-Agent": "EMS-Weather-Module/1.0",
            "Accept": "application/json",
            "Accept-Language": "en",
        },
        timeout=10,
    )

    current = data.get("current", {})
    daily = data.get("daily", {})

    weather_code = current.get("weather_code")

    daily_forecast = []

    daily_times = daily.get("time", [])
    daily_max = daily.get("temperature_2m_max", [])
    daily_min = daily.get("temperature_2m_min", [])
    daily_codes = daily.get("weather_code", [])

    for index in range(min(3, len(daily_times))):
        daily_forecast.append(
            {
                "date": daily_times[index],
                "temp_max": daily_max[index] if index < len(daily_max) else None,
                "temp_min": daily_min[index] if index < len(daily_min) else None,
                "condition": weather_code_to_text(
                    daily_codes[index] if index < len(daily_codes) else None
                ),
            }
        )

    return {
        "status": "ok",
        "source": "Open-Meteo",
        "latitude": lat,
        "longitude": lon,
        "timezone": data.get("timezone"),
        "location": location,
        "current": {
            "time": current.get("time"),
            "temperature": current.get("temperature_2m"),
            "humidity": current.get("relative_humidity_2m"),
            "apparent_temperature": current.get("apparent_temperature"),
            "precipitation": current.get("precipitation"),
            "wind_speed": current.get("wind_speed_10m"),
            "weather_code": weather_code,
            "condition": weather_code_to_text(weather_code),
        },
        "daily_forecast": daily_forecast,
        "updated_at": datetime.utcnow().isoformat() + "Z",
    }