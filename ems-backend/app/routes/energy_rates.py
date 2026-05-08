from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.deps import require_admin, get_current_active_user, get_db
from app.models import EnergyRate
from app.utils import ENERGY_RATES_MASTER

router = APIRouter(prefix="/api/energy-rates", tags=["energy-rates"])


@router.get("")
def get_all_rates(
    db: Session = Depends(get_db),
    _=Depends(get_current_active_user),
):
    """Retourne tous les tarifs — accessible à tous"""
    rates = db.query(EnergyRate).order_by(EnergyRate.energy_name).all()
    return [
        {
            "id":          r.id,
            "energy_name": r.energy_name,
            "rate_mad":    r.rate_mad,
            "unit":        r.unit,
            "description": r.description or "",
        }
        for r in rates
    ]


@router.post("")
def create_rate(
    payload:      dict,
    db:           Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Ajouter un nouveau tarif — admin seulement"""
    energy_name = (payload.get("energy_name") or "").strip()
    rate_mad    = payload.get("rate_mad")
    unit        = (payload.get("unit")        or "kWh").strip()
    description = (payload.get("description") or "").strip()

    if not energy_name or rate_mad is None:
        raise HTTPException(status_code=400, detail="energy_name and rate_mad are required")

    existing = db.query(EnergyRate).filter(
        EnergyRate.energy_name.ilike(energy_name)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Rate for '{energy_name}' already exists")

    rate = EnergyRate(
        energy_name=energy_name,
        rate_mad=float(rate_mad),
        unit=unit,
        description=description,
    )
    db.add(rate)
    db.commit()
    db.refresh(rate)
    return {"id": rate.id, "energy_name": rate.energy_name, "rate_mad": rate.rate_mad, "unit": rate.unit}


@router.patch("/{rate_id}")
def update_rate(
    rate_id: int,
    payload: dict,
    db:      Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Modifier un tarif — admin seulement"""
    rate = db.query(EnergyRate).filter(EnergyRate.id == rate_id).first()
    if not rate:
        raise HTTPException(status_code=404, detail="Rate not found")

    if payload.get("rate_mad") is not None:
        rate.rate_mad = float(payload["rate_mad"])
    if payload.get("unit"):
        rate.unit = payload["unit"].strip()
    if payload.get("description") is not None:
        rate.description = payload["description"].strip()

    db.commit()
    db.refresh(rate)
    return {"id": rate.id, "energy_name": rate.energy_name, "rate_mad": rate.rate_mad}


@router.delete("/{rate_id}")
def delete_rate(
    rate_id: int,
    db:      Session = Depends(get_db),
    _=Depends(require_admin),
):
    """Supprimer un tarif — admin seulement"""
    rate = db.query(EnergyRate).filter(EnergyRate.id == rate_id).first()
    if not rate:
        raise HTTPException(status_code=404, detail="Rate not found")
    db.delete(rate)
    db.commit()
    return {"status": "deleted", "id": rate_id}