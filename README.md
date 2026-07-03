```markdown
# EMS — Energy Management System
Application de gestion de l'énergie industrielle

---

## Comment lancer le projet

### Ce qu'il faut installer d'abord

1. **Docker Desktop** → https://www.docker.com/products/docker-desktop
2. **Node.js** → https://nodejs.org
3. **Python 3.11** → https://www.python.org/downloads

---

## MÉTHODE 1 — Tout en Docker (la plus simple)

```bash
cd EMS/EMS_Dataplatform-main
docker compose down -v
docker compose up --build -d
```

Attendre 3-4 minutes (Kafka + Flink + Node-RED démarrent) puis ouvrir : **http://localhost:5173**

Vérifier que les données circulent :
```bash
docker logs bridge --tail 20        # messages MQTT → Kafka
docker logs ems-backend --tail 20   # ingestion des mesures
```

**Compte admin :**
- Email : admin@jesagroup.com
- Mot de passe : admin123

---

## MÉTHODE 2 — Local (3 terminaux)

### Terminal 1 — Lancer l'infrastructure

```bash
cd EMS/EMS_Dataplatform-main
docker compose up -d mqtt-broker nodered postgres pgadmin
# (optionnel, chaîne data complète : kafka kafka-init bridge timescaledb)
```

### Terminal 2 — Lancer le backend

```bash
cd EMS/ems-backend

# Windows :
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Mac/Linux :
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Terminal 3 — Lancer le frontend

```bash
cd EMS/EMS-app
npm install
npm run dev
```

---

## URLs

| Service | Lien | Identifiants |
|---|---|---|
| Application | http://localhost:5173 | admin@jesagroup.com / admin123 |
| API Swagger | http://localhost:8000/docs | — |
| Base de données | http://localhost:5050 | admin@jesagroup.com / admin123 |
| Node-RED | http://localhost:1880 | — |

---

## Pages disponibles (20 pages)

| Page | Description | Accès |
|---|---|---|
| Dashboard | KPIs temps réel + SEC + Multi-lignes + Recommandations | Tous |
| Industry Overview | Vue globale toutes lignes + alarmes + hiérarchie | Tous |
| Real-Time Monitoring | Graphes SVG en direct + prédictions Python | Tous |
| Power Quality | Tension, PF, THD, fréquence | Tous |
| Carbon Emissions | CO₂ calculé ONEE Morocco | Tous |
| Equipment Status | Compteurs Modbus Meter-1 à 8 | Tous |
| Forecasting | Prédictions régression linéaire CI 95% | Tous |
| Reports | Export CSV + PDF imprimable | Tous |
| Alarms | 5 types alarmes automatiques | Tous |
| Historical Data | Historique + comparaison hier/aujourd'hui | Tous |
| Maintenance | Planning équipements — visible tous, modifiable par créateur | Tous |
| Energy Objectives | Objectifs énergétiques — visible tous, modifiable par créateur | Tous |
| Energy Prices | Tarifs ONEE HP/HC/Pointe + recommandations | Tous |
| Weather | Météo live impact HVAC | Tous |
| Messages | Chat interne + groupes + notifications | Tous |
| Profile | Mon compte | Tous |
| Users Management | Gestion utilisateurs CRUD | Admin |
| Alarm Thresholds | Seuils alarmes configurables sliders | Admin |
| Urgent Messages | Reset passwords utilisateurs | Admin |
| Audit Logs | Traçabilité toutes actions | Admin |

---

## Fonctionnalités importantes

### SEC — Specific Energy Consumption
- Valeur partagée entre **tous les utilisateurs** en temps réel
- Sauvegardée en base de données PostgreSQL
- Auto-sauvegarde après chaque modification
- Formule : SEC = kWh / production (tonne, unité, m³, kg)

### Maintenance & Objectifs énergétiques
- **Visible par tous** les utilisateurs connectés
- **Modifiable uniquement** par la personne qui l'a créé
- Les admins peuvent modifier et supprimer tout
- Badge "Your record" / "View only" pour différencier

### Notifications messages
- **Tous les utilisateurs** reçoivent des notifications
- Badge dans le sidebar quand un nouveau message arrive
- Badge disparaît quand on ouvre la page Messages

### Alarmes automatiques
- `HIGH_CONSUMPTION` — kW dépasse le seuil configuré
- `VOLTAGE_ANOMALY` — Tension hors [380–440V]
- `FREQUENCY_ANOMALY` — Fréquence hors [49–51Hz]
- `LOW_POWER_FACTOR` — PF sous le seuil configuré
- `HIGH_THD` — THD dépasse le seuil configuré

### Email automatique
- Alerte email pour chaque alarme critique
- Rapport journalier complet envoyé à 08h00

---

## Architecture technique (DataPlatform Al Youssoufia)

```
Node-RED (simulation OPC UA — Al Youssoufia Plant, toutes les 2-10s)
        ↓ topics : Al_Youssoufia_Plant/Line-1/<Zone>/<Equipement>/<PMx|Process_Variables>
MQTT Broker Mosquitto (port 1883)
        ├──→ Bridge (Node.js) → Kafka (ems.L1.*) → Flink → TimescaleDB   [chaîne DataPlatform]
        └──→ ems-backend (FastAPI, s'abonne à «#»)
                    ↓
             PostgreSQL app (ems_app_db) + WebSocket broadcast
                    ↓
             React Frontend (polling 5s + WebSocket < 1s)
```

Hiérarchie : **Plant → Line → Zone → Equipment** (extraite automatiquement du topic MQTT).
Zones : Extraction, Washing, Flotation, Utilities, Storage & Handling.

### Mesures reçues de la DataPlatform

| Famille | Mesures |
|---|---|
| Électrique (PM1-7) | tension L1N/L2N/L3N (moyennées), courants L1/L2/L3, fréquence, PF, THD tension & courant, **kW actif, kVAR réactif, kVA apparent, kWh**, breaker status, alarm trip |
| Procédé | vitesses (convoyeur/pompe/agitateur), débits & volumes d'eau (m³), température, pression & débit d'air comprimé |
| Vapeur / Fuel | débit + totalisateur + pression + température (steam & fuel) |
| Production | débit du Weigh Belt Scale → **Production Rate (t/h)** |
| Agrégats ligne | consommation d'eau totale |

### Alarmes automatiques (générées par le backend selon les seuils configurés)
`UNDERVOLTAGE / OVERVOLTAGE · UNDER/OVERFREQUENCY · LOW_POWER_FACTOR · HIGH_THD · HIGH_CONSUMPTION · EQUIPMENT_TRIP` (trip envoyé par la DataPlatform)

---

## Base de données PostgreSQL

Tables créées automatiquement au démarrage :

| Table | Description |
|---|---|
| users | Comptes utilisateurs |
| telemetry_records | Mesures Modbus temps réel |
| energy_history | Historique agrégé |
| alarms | Alarmes générées automatiquement |
| conversations | Conversations messagerie |
| messages | Messages internes |
| maintenance_records | Planning maintenance |
| energy_objectives | Objectifs énergétiques |
| sec_records | SEC partagé entre utilisateurs |
| urgent_password_requests | Demandes reset password |
| audit_logs | Traçabilité toutes actions |

---

## Configuration .env

Copier `.env.example` vers `.env` dans `ems-backend/` :

```env
# Base de données (app) — postgres du docker-compose, port 5432
DATABASE_URL=postgresql://ems_app_user:ems_app_password@localhost:5432/ems_app_db

# MQTT — Local
MQTT_BROKER=localhost
MQTT_TOPIC=#

# MQTT — Docker (changer si docker compose)
# MQTT_BROKER=mqtt-broker

# Email alertes (optionnel)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre.email@gmail.com
SMTP_PASSWORD=votre_app_password
ALERT_EMAIL=admin@jesagroup.com

# Heure rapport quotidien
REPORT_HOUR=8
```

---

## Problèmes courants

**Rien ne s'affiche sur le Dashboard ?**
→ Attendre 30 secondes que le DataPlatform démarre
→ Vérifier que modbus-publisher est bien lancé : `docker ps`

**Erreur de connexion backend ?**
→ Vérifier que le fichier `.env` existe dans `ems-backend/`
→ Copier `.env.example` et renommer en `.env`

**WebSocket affiche Connecting ?**
→ Normal en Docker — l'application fonctionne avec le polling HTTP

**Pas de données dans Maintenance ou Objectifs après redémarrage ?**
→ Les données sont en PostgreSQL, elles persistent automatiquement

**Erreur "port already in use" ?**
→ `docker compose down -v` puis relancer

**Le backend ne démarre pas ?**
→ Vérifier que PostgreSQL est actif : `docker ps | grep postgres`
→ Réinstaller : `pip install -r requirements.txt --force-reinstall`
```