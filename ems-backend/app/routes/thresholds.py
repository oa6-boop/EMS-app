"""
thresholds.py

Ce fichier garde les seuils côté application.
Important : il ne lance pas Flink.
Flink reste dans la DataPlatform.
"""

import json
import os
from fastapi import APIRouter, Depends, HTTPException

from app.core.deps import get_current_active_user
from app.models import User

router = APIRouter(prefix="/api/thresholds", tags=["thresholds"])

THRESHOLDS_FILE = "thresholds.json"

DEFAULT_THRESHOLDS = {
    "voltage_min": 210.0,
    "voltage_max": 250.0,
    "frequency_min": 49.5,
    "frequency_max": 50.5,
    "power_factor_min": 0.80,
    "thd_max": 8.0,
}


def load_thresholds() -> dict:
    try:
        if os.path.exists(THRESHOLDS_FILE):
            with open(THRESHOLDS_FILE, "r", encoding="utf-8") as file:
                data = json.load(file)

            return {
                **DEFAULT_THRESHOLDS,
                **data,
            }
    except Exception as error:
        print(f"Error loading thresholds: {error}")

    return DEFAULT_THRESHOLDS.copy()


def save_thresholds(thresholds: dict) -> bool:
    try:
        with open(THRESHOLDS_FILE, "w", encoding="utf-8") as file:
            json.dump(thresholds, file, indent=2)

        return True
    except Exception as error:
        print(f"Error saving thresholds: {error}")
        return False


def get_current_thresholds() -> dict:
    return load_thresholds()


@router.get("")
def get_thresholds(current_user: User = Depends(get_current_active_user)):
    return load_thresholds()


@router.post("")
def update_thresholds(
    payload: dict,
    current_user: User = Depends(get_current_active_user),
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    thresholds = {}

    for key, default_value in DEFAULT_THRESHOLDS.items():
        try:
            thresholds[key] = float(payload.get(key, default_value))
        except Exception:
            thresholds[key] = default_value

    if thresholds["voltage_min"] >= thresholds["voltage_max"]:
        raise HTTPException(
            status_code=400,
            detail="voltage_min must be less than voltage_max",
        )

    if thresholds["frequency_min"] >= thresholds["frequency_max"]:
        raise HTTPException(
            status_code=400,
            detail="frequency_min must be less than frequency_max",
        )

    if thresholds["power_factor_min"] <= 0 or thresholds["power_factor_min"] > 1:
        raise HTTPException(
            status_code=400,
            detail="power_factor_min must be between 0 and 1",
        )

    if thresholds["thd_max"] <= 0:
        raise HTTPException(
            status_code=400,
            detail="thd_max must be positive",
        )

    if not save_thresholds(thresholds):
        raise HTTPException(status_code=500, detail="Failed to save thresholds")

    return {
        "status": "ok",
        "thresholds": thresholds,
    }