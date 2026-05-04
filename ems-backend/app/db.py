

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://ems_user:ems_password@localhost:5432/ems_db"
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