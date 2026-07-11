import os
from dotenv import load_dotenv

load_dotenv()

APP_NAME = os.getenv("APP_NAME", "EMS Backend API")
APP_HOST = os.getenv("APP_HOST", "127.0.0.1")
APP_PORT = int(os.getenv("APP_PORT", "8000"))

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))
MQTT_TOPIC = os.getenv("MQTT_TOPIC", "ems/telemetry/+/+")

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://ems_app_user:ems_app_password@localhost:5434/ems_app_db")

SECRET_KEY = os.getenv("SECRET_KEY", "change_this_secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
# 720 min = 12 h : le token ne peut plus expirer pendant une journée de démo
# (évite le 401 en pleine présentation). Surchargé par .env / docker-compose.
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720"))