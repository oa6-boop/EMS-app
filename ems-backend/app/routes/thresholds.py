"""
thresholds.py — Seuils d'alarme configurables par l'admin
GET  /api/thresholds        → lire les seuils actuels
POST /api/thresholds        → sauvegarder les nouveaux seuils
"""

import json
import os
from fastapi import APIRouter, Depends, HTTPException
from app.core.deps import get_current_active_user
from app.models import User

router = APIRouter(prefix="/api/thresholds", tags=["thresholds"])

# Fichier de stockage des seuils (simple JSON)
THRESHOLDS_FILE = "thresholds.json"

DEFAULT_THRESHOLDS = {
    "high_consumption_kw":  500.0,
    "voltage_min":          380.0,
    "voltage_max":          440.0,
    "frequency_min":        49.0,
    "frequency_max":        51.0,
    "power_factor_min":     0.85,
    "thd_max":              5.0,
    "peak_demand_warning":  400.0,
    "peak_demand_critical": 500.0,
}


def load_thresholds() -> dict:
    """Charge les seuils depuis le fichier JSON ou retourne les valeurs par défaut."""
    try:
        if os.path.exists(THRESHOLDS_FILE):
            with open(THRESHOLDS_FILE, "r") as f:
                data = json.load(f)
                # Fusionner avec les défauts pour les nouvelles clés
                return {**DEFAULT_THRESHOLDS, **data}
    except Exception as e:
        print(f"Error loading thresholds: {e}")
    return DEFAULT_THRESHOLDS.copy()


def save_thresholds(thresholds: dict) -> bool:
    """Sauvegarde les seuils dans le fichier JSON."""
    try:
        with open(THRESHOLDS_FILE, "w") as f:
            json.dump(thresholds, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving thresholds: {e}")
        return False


def get_current_thresholds() -> dict:
    """Fonction publique pour utiliser les seuils dans mqtt_client.py."""
    return load_thresholds()


@router.get("")
def get_thresholds(
    current_user: User = Depends(get_current_active_user),
):
    """Retourne les seuils d'alarme actuels."""
    return load_thresholds()


@router.post("")
def update_thresholds(
    payload: dict,
    current_user: User = Depends(get_current_active_user),
):
    """
    Sauvegarde les nouveaux seuils d'alarme.
    Admin seulement.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    # Valider les valeurs
    validated = {}
    for key, default in DEFAULT_THRESHOLDS.items():
        if key in payload:
            try:
                val = float(payload[key])
                validated[key] = val
            except (ValueError, TypeError):
                validated[key] = default
        else:
            validated[key] = default

    # Validations métier
    if validated["voltage_min"] >= validated["voltage_max"]:
        raise HTTPException(400, "voltage_min must be less than voltage_max")
    if validated["frequency_min"] >= validated["frequency_max"]:
        raise HTTPException(400, "frequency_min must be less than frequency_max")
    if validated["peak_demand_warning"] >= validated["peak_demand_critical"]:
        raise HTTPException(400, "peak_demand_warning must be less than peak_demand_critical")

    if save_thresholds(validated):
        print(f"✅ Thresholds updated by admin {current_user.email}")
        return {"status": "ok", "thresholds": validated}
    else:
        raise HTTPException(500, "Failed to save thresholds")