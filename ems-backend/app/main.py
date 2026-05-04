import os
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import APP_NAME
from app.core.security import get_password_hash
from app.db import Base, SessionLocal, engine
from app.models import User, TelemetryRecord, EnergyHistory
from app.mqtt_client import start_mqtt
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
from app.routes.maintenance import router as maintenance_router   # NOUVEAU
from app.routes.objectives  import router as objectives_router    # NOUVEAU
from app.services.email_report import start_daily_report_scheduler
from app.routes.sec import router as sec_router

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


# Routers
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
app.include_router(maintenance_router)   # NOUVEAU
app.include_router(objectives_router)   
app.include_router(sec_router)