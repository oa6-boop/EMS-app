import os
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config   import APP_NAME
from app.core.security import get_password_hash
from app.db            import Base, SessionLocal, engine
from app.models        import User, TelemetryRecord, EnergyHistory, EnergyRate
from app.mqtt_client   import start_mqtt

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


@app.on_event("startup")
def startup_event():
    global mqtt_client
    try:
        Base.metadata.create_all(bind=engine)
        create_default_admin()
        initialize_default_energy_rates()
        clean_simulator_data()

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
app.include_router(energy_rates_router)  # ← Nouveau