import os
import asyncio
import threading
import time
from datetime import datetime, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config   import APP_NAME
from app.core.security import get_password_hash
from app.db            import Base, SessionLocal, engine
from app.models        import User, TelemetryRecord, EnergyHistory, EnergyRate
from app.mqtt_client   import start_mqtt, set_main_loop

from app.routes.auth        import router as auth_router
from app.routes.telemetry   import router as telemetry_router
from app.routes.users       import router as users_router
from app.routes.urgent      import router as urgent_router
from app.routes.audit       import router as audit_router
from app.routes.chat        import router as chat_router
from app.routes.chatbot     import router as chatbot_router
from app.routes.industry    import router as industry_router
from app.routes.charts      import router as charts_router
from app.routes.websocket   import router as websocket_router
from app.routes.history     import router as history_router
from app.routes.thresholds  import router as thresholds_router
from app.routes.maintenance import router as maintenance_router
from app.routes.sec         import router as sec_router
from app.routes.energy_rates import router as energy_rates_router
from app.routes.weather import router as weather_router
from app.services.email_report import start_daily_report_scheduler

app = FastAPI(title=APP_NAME)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://ems-app:5173",
        "http://0.0.0.0:5173",
    ],
    # Autorise aussi l'accès via une IP du réseau local (ex: démo jury
    # depuis un autre PC : http://192.168.x.x:5173). Le frontend utilise
    # déjà window.location.hostname, donc l'origin varie avec l'IP.
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("uploads", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
mqtt_client = None


def create_default_admin():
    db: Session = SessionLocal()
    try:
        admin_email = "admin@jesagroup.com"
        existing = db.query(User).filter(
            func.lower(User.email) == admin_email.lower()
        ).first()
        if existing:
            existing.first_name      = "Admin"
            existing.last_name       = "Jesa"
            existing.hashed_password = get_password_hash("admin123")
            existing.role            = "admin"
            existing.is_active       = True
            if existing.profile_image is None: existing.profile_image = ""
            if not existing.created_by:        existing.created_by    = "system"
            db.commit()
        else:
            admin = User(
                first_name="Admin", last_name="Jesa",
                email=admin_email,
                hashed_password=get_password_hash("admin123"),
                role="admin", is_active=True,
                profile_image="", created_by="system",
            )
            db.add(admin)
            db.commit()
        print("✅ Admin ready: admin@jesagroup.com / admin123")
    except Exception as exc:
        db.rollback()
        print(f"Error creating admin: {exc}")
    finally:
        db.close()


def initialize_default_energy_rates():
    """
    Initialise tous les tarifs énergies par défaut au démarrage.
    Si un tarif existe déjà → on ne l'écrase pas (l'admin peut les modifier).
    """
    db: Session = SessionLocal()
    try:
        DEFAULT_RATES = [
            # Électricité ONEE Maroc
            {"energy_name": "Electricity",      "rate_mad": 1.40,  "unit": "kWh",    "description": "ONEE tarif moyen Maroc"},
            {"energy_name": "Electricity-kWh",  "rate_mad": 1.40,  "unit": "kWh",    "description": "ONEE tarif moyen Maroc"},
            {"energy_name": "Electricity-kW",   "rate_mad": 1.40,  "unit": "kWh",    "description": "ONEE tarif moyen Maroc"},

            # Eau ONEE
            {"energy_name": "Water",            "rate_mad": 9.0,   "unit": "m³",     "description": "ONEE eau potable"},
            {"energy_name": "Hot Water",        "rate_mad": 12.0,  "unit": "m³",     "description": "Eau chaude industrielle"},

            # Vapeur
            {"energy_name": "Steam",            "rate_mad": 120.0, "unit": "tonne",  "description": "Vapeur industrielle"},
            {"energy_name": "High Pressure Steam", "rate_mad": 135.0, "unit": "tonne", "description": "Vapeur haute pression"},
            {"energy_name": "Low Pressure Steam",  "rate_mad": 110.0, "unit": "tonne", "description": "Vapeur basse pression"},

            # Carburants
            {"energy_name": "Diesel",           "rate_mad": 13.5,  "unit": "L",      "description": "Diesel industriel"},
            {"energy_name": "Fuel",             "rate_mad": 13.5,  "unit": "L",      "description": "Carburant"},
            {"energy_name": "Gasoline",         "rate_mad": 15.0,  "unit": "L",      "description": "Essence"},
            {"energy_name": "Fuel Oil",         "rate_mad": 14.0,  "unit": "L",      "description": "Fioul industriel"},

            # Gaz
            {"energy_name": "Natural Gas",      "rate_mad": 8.5,   "unit": "m³",     "description": "Gaz naturel"},
            {"energy_name": "LPG",              "rate_mad": 10.0,  "unit": "kg",     "description": "GPL / Butane / Propane"},

            # Énergies renouvelables
            {"energy_name": "Solar",            "rate_mad": 0.50,  "unit": "kWh",    "description": "Énergie solaire PV"},
            {"energy_name": "Wind",             "rate_mad": 0.60,  "unit": "kWh",    "description": "Énergie éolienne"},

            # Autres industrielles
            {"energy_name": "Compressed Air",   "rate_mad": 0.025, "unit": "m³",     "description": "Air comprimé industriel"},
            {"energy_name": "Nitrogen",         "rate_mad": 2.5,   "unit": "m³",     "description": "Azote industriel"},
            {"energy_name": "Hydrogen",         "rate_mad": 25.0,  "unit": "kg",     "description": "Hydrogène"},
            {"energy_name": "Coal",             "rate_mad": 2.5,   "unit": "kg",     "description": "Charbon industriel"},

            # CO₂ — pas de coût
            {"energy_name": "CO2-Emissions",    "rate_mad": 0.0,   "unit": "kg",     "description": "Émissions CO₂ — non facturé"},
        ]

        added = 0
        for r in DEFAULT_RATES:
            exists = db.query(EnergyRate).filter(
                EnergyRate.energy_name.ilike(r["energy_name"])
            ).first()
            if not exists:
                db.add(EnergyRate(**r))
                added += 1

        db.commit()
        if added > 0:
            print(f"✅ Energy rates initialized: {added} rates added")
        else:
            print("✅ Energy rates already initialized")
    except Exception as exc:
        db.rollback()
        print(f"Error initializing energy rates: {exc}")
    finally:
        db.close()


def clean_simulator_data():
    db: Session = SessionLocal()
    try:
        deleted = db.query(TelemetryRecord).filter(
            TelemetryRecord.source == "simulator"
        ).delete()
        db.commit()
        if deleted > 0:
            print(f"🧹 Cleaned {deleted} simulator records")
    except Exception as exc:
        db.rollback()
        print(f"DB cleanup warning: {exc}")
    finally:
        db.close()


def normalize_legacy_hierarchy():
    """
    Fusionne les anciennes écritures NON normalisées accumulées en base
    (LINE-1 / Line 1 / EXTRACTION / STORAGE_HANDLING…) avec le format
    canonique actuel (Production Line 1 / Extraction / Storage Handling).
    Supprime les doublons de zones et de lignes SANS perdre l'historique.
    Idempotent : ne fait rien si tout est déjà propre.
    """
    from app.mqtt_client import _normalize_line_name, _clean_display
    from app.models import Alarm

    db: Session = SessionLocal()
    try:
        merged = 0
        for model in (TelemetryRecord, EnergyHistory, Alarm):
            # Lignes : LINE-1 / Line 1 / line_1 → Production Line 1
            for (old,) in db.query(model.production_line).distinct():
                if not old:
                    continue
                new = _normalize_line_name(old)
                if new != old:
                    merged += db.query(model).filter(
                        model.production_line == old
                    ).update({"production_line": new}, synchronize_session=False)

            # Zones : EXTRACTION → Extraction ; les agrégats legacy
            # (Energy consumption / Total water consumption) → Line Total
            for (old,) in db.query(model.area).distinct():
                if not old:
                    continue
                low = str(old).strip().lower().replace("_", " ")
                if low.startswith(("energy consumption", "total water")):
                    new = "Line Total"
                else:
                    new = _clean_display(old)
                if new != old:
                    merged += db.query(model).filter(
                        model.area == old
                    ).update({"area": new}, synchronize_session=False)

            # Plants et équipements : MAJUSCULES_UNDERSCORE → Title Case
            for column_name in ("plant", "equipment"):
                column = getattr(model, column_name)
                for (old,) in db.query(column).distinct():
                    if not old:
                        continue
                    new = _clean_display(old)
                    if new != old:
                        merged += db.query(model).filter(
                            column == old
                        ).update({column_name: new}, synchronize_session=False)

        db.commit()
        if merged > 0:
            print(f"🧹 Legacy hierarchy normalized: {merged} rows merged (duplicates removed)")
    except Exception as exc:
        db.rollback()
        print(f"Hierarchy normalization warning: {exc}")
    finally:
        db.close()


def normalize_legacy_units():
    """
    Harmonise les unités des enregistrements existants : d'anciennes versions
    de l'ingestion ont écrit les mêmes énergies avec des unités différentes
    (Steam '' vs tonne, Reactive Power kW vs kVAR…), ce qui créait des cartes
    en double. Supprime aussi les séries par phase redondantes (Current L1/2/3
    — déjà moyennées dans les métadonnées Power Quality). Idempotent.
    """
    UNIT_FIXES = [
        # (energy_name, ancienne unité, nouvelle unité)
        ("Steam",             "",     "tonne"),
        ("Fuel",              "",     "L"),
        ("Steam Pressure",    "",     "bar"),
        ("Fuel Pressure",     "",     "bar"),
        ("Air Pressure",      "",     "bar"),
        ("Steam Temperature", "",     "°C"),
        ("Fuel Temperature",  "",     "°C"),
        ("Breaker Status",    "",     "on/off"),
        ("Status",            "",     "on/off"),
        ("Reactive Power",    "kW",   "kVAR"),
        ("Speed",             "unit", ""),
    ]
    DROP_SERIES = ["Current L1", "Current L2", "Current L3", "Alarm Trip"]

    from app.models import Alarm
    db: Session = SessionLocal()
    try:
        fixed = 0
        for model in (TelemetryRecord, EnergyHistory):
            for name, old_unit, new_unit in UNIT_FIXES:
                fixed += db.query(model).filter(
                    model.energy_name == name, model.unit == old_unit
                ).update({"unit": new_unit}, synchronize_session=False)
            for name in DROP_SERIES:
                fixed += db.query(model).filter(
                    model.energy_name == name
                ).delete(synchronize_session=False)
        # Weigh Belt Scales : leurs débits sont de la PRODUCTION (t/h),
        # pas de l'eau — reclassés en "Production Rate" (KPI phosphate + SEC).
        for model in (TelemetryRecord, EnergyHistory):
            fixed += db.query(model).filter(
                model.energy_name == "Flow Rate",
                (model.equipment.ilike("%weigh%")) | (model.equipment.ilike("%scale%")),
            ).update(
                {"energy_name": "Production Rate", "unit": "t/h"},
                synchronize_session=False,
            )

        db.commit()
        if fixed > 0:
            print(f"🧹 Legacy units harmonized: {fixed} rows fixed")
    except Exception as exc:
        db.rollback()
        print(f"Units normalization warning: {exc}")
    finally:
        db.close()


def purge_old_records():
    """
    RÉTENTION : la DataPlatform publie ~10-20 mesures/seconde → sans purge,
    la table telemetry_records dépasse le million de lignes en un jour, la
    RAM explose et toutes les requêtes ralentissent. On garde :
      - 48 h de télémétrie temps réel (largement assez pour les pages live)
      - 7 jours d'historique agrégé (pages Historical Data / Reports)
    """
    db: Session = SessionLocal()
    try:
        cutoff_telemetry = datetime.utcnow() - timedelta(hours=48)
        cutoff_history = datetime.utcnow() - timedelta(days=7)
        removed_t = db.query(TelemetryRecord).filter(
            TelemetryRecord.timestamp < cutoff_telemetry
        ).delete(synchronize_session=False)
        removed_h = db.query(EnergyHistory).filter(
            EnergyHistory.timestamp < cutoff_history
        ).delete(synchronize_session=False)
        db.commit()
        if removed_t or removed_h:
            print(f"🧹 Retention purge: {removed_t} telemetry + {removed_h} history rows removed")
    except Exception as exc:
        db.rollback()
        print(f"Retention purge warning: {exc}")
    finally:
        db.close()


def start_purge_scheduler():
    """Purge de rétention toutes les 30 minutes, en tâche de fond."""
    def loop():
        while True:
            time.sleep(1800)
            purge_old_records()

    threading.Thread(target=loop, daemon=True).start()


@app.on_event("startup")
async def startup_event():
    """
    Startup en ASYNC (obligatoire) : une fonction sync serait exécutée dans
    un threadpool, où asyncio.get_running_loop() échouerait. Ici on capture
    le loop principal d'uvicorn et on le transmet à mqtt_client pour que
    les threads MQTT/Kafka puissent diffuser sur le WebSocket.
    """
    global mqtt_client
    try:
        set_main_loop(asyncio.get_running_loop())

        Base.metadata.create_all(bind=engine)

        # Mini-migration : create_all ne modifie pas les tables existantes,
        # donc on ajoute la colonne "tags" si elle n'existe pas encore.
        try:
            from sqlalchemy import text
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE telemetry_records "
                    "ADD COLUMN IF NOT EXISTS tags VARCHAR"
                ))
            print("✅ Column 'tags' ready on telemetry_records")
        except Exception as exc:
            print(f"Tags column migration warning: {exc}")
        create_default_admin()
        initialize_default_energy_rates()
        clean_simulator_data()
        purge_old_records()
        normalize_legacy_hierarchy()
        normalize_legacy_units()
        start_purge_scheduler()

        try:
            mqtt_client = start_mqtt()
        except Exception as exc:
            mqtt_client = None
            print(f"MQTT startup skipped: {exc}")

        start_daily_report_scheduler()
        print("✅ FastAPI backend started successfully")

    except Exception as exc:
        print(f"Startup error: {exc}")
        raise


@app.on_event("shutdown")
def shutdown_event():
    global mqtt_client
    if mqtt_client:
        try:
            mqtt_client.loop_stop()
            mqtt_client.disconnect()
        except Exception:
            pass


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ─── Tous les routers ─────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(telemetry_router)
app.include_router(users_router)
app.include_router(urgent_router)
app.include_router(audit_router)
app.include_router(chat_router)
app.include_router(chatbot_router)
app.include_router(industry_router)
app.include_router(charts_router)
app.include_router(websocket_router)
app.include_router(history_router)
app.include_router(thresholds_router)
app.include_router(maintenance_router)
app.include_router(sec_router)
app.include_router(energy_rates_router)
app.include_router(weather_router)