

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

# Défaut = base PROPRE de l'application EMS (jamais la base TimescaleDB de la
# DataPlatform). En Docker/local, DATABASE_URL est fixé par le compose / .env
# et surcharge ce défaut ; ce fallback évite juste de créer par erreur les
# tables de l'app dans ems_db (TimescaleDB) si l'env n'était pas défini.
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://ems_app_user:ems_app_password@localhost:5434/ems_app_db"
)

# PostgreSQL engine
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,       # Vérifie la connexion avant utilisation
    pool_size=10,             # 10 connexions simultanées
    max_overflow=20,          # 20 connexions supplémentaires si besoin
    echo=False,               # True pour voir les requêtes SQL en debug
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency FastAPI pour obtenir une session DB."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()