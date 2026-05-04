"""
chatbot.py — Assistant EMS intelligent 100% local (sans API externe)
Moteur de règles avancé avec NLP simple, contexte live DataPlatform,
réponses riches en FR/EN, recommandations automatiques.
"""

from fastapi import APIRouter, Depends
from app.core.deps import get_current_active_user
from app.models import User

router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])


# ─── Helpers données EMS ─────────────────────────────────────────────────────

def normalize(text: str) -> str:
    return (text or "").strip().lower()

def get_max_energy(energies):
    if not energies: return None
    return max(energies, key=lambda e: float(e.get("value", 0)))

def get_min_energy(energies):
    if not energies: return None
    return min(energies, key=lambda e: float(e.get("value", 0)))

def get_total_cost(energies):
    return round(sum(float(e.get("cost", 0)) for e in energies), 4)

def get_total_co2(energies):
    return round(sum(float(e.get("co2_kg", 0)) for e in energies), 3)

def get_total_kw(energies):
    return round(sum(float(e.get("value", 0)) for e in energies if e.get("unit") == "kW"), 2)

def list_names(energies):
    return ", ".join(e.get("name", "?") for e in energies) if energies else "None"

def get_raw(energy, field):
    """Extrait un champ depuis rawData de l'énergie."""
    raw = energy.get("rawData") or {}
    if isinstance(raw, dict):
        return raw.get(field)
    return None

def contains(q, *keywords):
    """Vérifie si la question contient au moins un des mots-clés."""
    return any(kw in q for kw in keywords)

def is_french(q):
    french_words = ["quoi", "quel", "quelle", "comment", "combien", "pourquoi",
                    "qu'est", "ligne", "énergie", "tension", "coût", "cout",
                    "facteur", "puissance", "aide", "merci", "bonjour", "salut"]
    return any(w in q for w in french_words)


# ─── Base de connaissances EMS complète ──────────────────────────────────────

EMS_KNOWLEDGE = {

    # ── Concepts fondamentaux ────────────────────────────────────────────────
    "ems": {
        "fr": (
            "Un **Système de Gestion de l'Énergie (EMS)** est une plateforme numérique "
            "qui surveille, analyse et optimise la consommation d'énergie industrielle.\n\n"
            "Fonctionnalités principales:\n"
            "- 📊 Acquisition de données en temps réel (Modbus, MQTT)\n"
            "- ⚡ Surveillance de la qualité d'énergie\n"
            "- 🌱 Calcul des émissions CO₂\n"
            "- 🔔 Gestion des alarmes automatiques\n"
            "- 📈 Prédictions et forecasting\n"
            "- 📑 Rapports et exports\n\n"
            "Protocoles utilisés: **Modbus TCP** → **MQTT** → **FastAPI** → **React**"
        ),
        "en": (
            "An **Energy Management System (EMS)** is a digital platform that monitors, "
            "analyzes, and optimizes energy consumption in industrial environments.\n\n"
            "Main features:\n"
            "- 📊 Real-time data acquisition (Modbus, MQTT)\n"
            "- ⚡ Power quality monitoring\n"
            "- 🌱 CO₂ emission tracking\n"
            "- 🔔 Automatic alarm management\n"
            "- 📈 Predictions and forecasting\n"
            "- 📑 Reports and exports\n\n"
            "Protocols used: **Modbus TCP** → **MQTT** → **FastAPI** → **React**"
        ),
    },

    "power_factor": {
        "fr": (
            "Le **Facteur de Puissance (FP)** mesure l'efficacité d'utilisation de l'énergie électrique.\n\n"
            "**Formule:** cos(φ) = kW / √(kW² + kVAR²)\n\n"
            "Interprétation:\n"
            "- FP = 1.0 → 100% efficace (idéal)\n"
            "- FP ≥ 0.90 → ✅ Bon\n"
            "- FP 0.85–0.90 → ⚠️ Acceptable\n"
            "- FP < 0.85 → 🔴 Mauvais → alarme déclenchée\n\n"
            "**Amélioration:** Installer des condensateurs de compensation.\n"
            "Un FP bas augmente les pertes réactives et peut entraîner des pénalités tarifaires."
        ),
        "en": (
            "**Power Factor (PF)** measures how efficiently electrical power is being used.\n\n"
            "**Formula:** cos(φ) = kW / √(kW² + kVAR²)\n\n"
            "Interpretation:\n"
            "- PF = 1.0 → 100% efficient (ideal)\n"
            "- PF ≥ 0.90 → ✅ Good\n"
            "- PF 0.85–0.90 → ⚠️ Acceptable\n"
            "- PF < 0.85 → 🔴 Bad → alarm triggered\n\n"
            "**Improvement:** Install power factor correction capacitors.\n"
            "Low PF increases reactive losses and may cause utility penalty charges."
        ),
    },

    "thd": {
        "fr": (
            "Le **THD (Taux de Distorsion Harmonique)** mesure la déformation d'une onde électrique.\n\n"
            "**Limite IEC 61000:** 5% maximum\n\n"
            "Causes d'un THD élevé:\n"
            "- Variateurs de vitesse (VSD)\n"
            "- Onduleurs et convertisseurs\n"
            "- Éclairage LED mal filtré\n\n"
            "Conséquences:\n"
            "- 🌡️ Surchauffe des équipements\n"
            "- ⚡ Pertes d'énergie supplémentaires\n"
            "- 🔧 Dégradation prématurée\n\n"
            "**Solution:** Filtres actifs ou passifs harmoniques"
        ),
        "en": (
            "**THD (Total Harmonic Distortion)** measures electrical waveform distortion.\n\n"
            "**IEC 61000 limit:** 5% maximum\n\n"
            "Causes of high THD:\n"
            "- Variable speed drives (VSD)\n"
            "- Inverters and converters\n"
            "- Poorly filtered LED lighting\n\n"
            "Consequences:\n"
            "- 🌡️ Equipment overheating\n"
            "- ⚡ Additional energy losses\n"
            "- 🔧 Premature degradation\n\n"
            "**Solution:** Active or passive harmonic filters"
        ),
    },

    "voltage": {
        "fr": (
            "La **Tension électrique** est la différence de potentiel entre deux points.\n\n"
            "Valeurs de référence:\n"
            "- **Nominale:** 415V (triphasé)\n"
            "- **Plage acceptable:** 380–440V (±6%)\n"
            "- **Alarme:** < 380V ou > 440V\n\n"
            "Source: Registre Modbus [2] (valeur × 10)\n\n"
            "Anomalies possibles:\n"
            "- Sous-tension: surchauffe moteurs\n"
            "- Sur-tension: dégradation isolants\n"
            "- Déséquilibre: vibrations et pertes"
        ),
        "en": (
            "**Voltage** is the electrical potential difference between two points.\n\n"
            "Reference values:\n"
            "- **Nominal:** 415V (three-phase)\n"
            "- **Acceptable range:** 380–440V (±6%)\n"
            "- **Alarm:** < 380V or > 440V\n\n"
            "Source: Modbus Register [2] (value × 10)\n\n"
            "Possible anomalies:\n"
            "- Under-voltage: motor overheating\n"
            "- Over-voltage: insulation degradation\n"
            "- Imbalance: vibrations and losses"
        ),
    },

    "frequency": {
        "fr": (
            "La **Fréquence** est le nombre de cycles par seconde du courant alternatif.\n\n"
            "Valeurs de référence:\n"
            "- **Nominale:** 50 Hz (Maroc/Europe)\n"
            "- **Plage acceptable:** 49–51 Hz\n"
            "- **Alarme:** < 49 Hz ou > 51 Hz\n\n"
            "Une fréquence instable indique:\n"
            "- Problèmes sur le réseau ONEE\n"
            "- Surcharge locale\n"
            "- Défaillance du groupe électrogène"
        ),
        "en": (
            "**Frequency** is the number of AC cycles per second.\n\n"
            "Reference values:\n"
            "- **Nominal:** 50 Hz (Morocco/Europe)\n"
            "- **Acceptable range:** 49–51 Hz\n"
            "- **Alarm:** < 49 Hz or > 51 Hz\n\n"
            "Unstable frequency indicates:\n"
            "- ONEE grid issues\n"
            "- Local overload\n"
            "- Generator failure"
        ),
    },

    "co2": {
        "fr": (
            "Les **Émissions CO₂** sont calculées depuis la consommation électrique.\n\n"
            "**Formule:** CO₂ (kg) = kWh × 0.718\n\n"
            "Le facteur **0.718 kgCO₂/kWh** est le facteur d'émission du réseau électrique "
            "marocain (ONEE — Office National de l'Électricité).\n\n"
            "Équivalences:\n"
            "- 1 tonne CO₂ = 1000 kg CO₂\n"
            "- 1 tCO₂e = environ 1393 kWh\n\n"
            "**Réduction:** Chaque kWh économisé = 0.718 kg CO₂ évité.\n"
            "Installation solaire = réduction jusqu'à 30%."
        ),
        "en": (
            "**CO₂ Emissions** are calculated from electricity consumption.\n\n"
            "**Formula:** CO₂ (kg) = kWh × 0.718\n\n"
            "The factor **0.718 kgCO₂/kWh** is the Moroccan electricity grid "
            "emission factor (ONEE — National Electricity Office).\n\n"
            "Equivalencies:\n"
            "- 1 tonne CO₂ = 1000 kg CO₂\n"
            "- 1 tCO₂e ≈ 1393 kWh\n\n"
            "**Reduction:** Every kWh saved = 0.718 kg CO₂ avoided.\n"
            "Solar installation = up to 30% reduction."
        ),
    },

    "modbus": {
        "fr": (
            "**Modbus TCP** est le protocole industriel utilisé pour lire les compteurs électriques.\n\n"
            "Dans cette application:\n"
            "- **Simulateur:** 8 compteurs virtuels sur port 1502\n"
            "- **Registres par compteur:**\n"
            "  - [0] Puissance active (kW × 10)\n"
            "  - [1] Puissance réactive (kVAR × 10)\n"
            "  - [2] Tension (V × 10)\n"
            "  - [3] Courant (A × 10)\n"
            "  - [4] Énergie cumulée (kWh × 10)\n\n"
            "Le **modbus-publisher** lit ces registres toutes les 5s et publie sur MQTT."
        ),
        "en": (
            "**Modbus TCP** is the industrial protocol used to read electrical meters.\n\n"
            "In this application:\n"
            "- **Simulator:** 8 virtual meters on port 1502\n"
            "- **Registers per meter:**\n"
            "  - [0] Active power (kW × 10)\n"
            "  - [1] Reactive power (kVAR × 10)\n"
            "  - [2] Voltage (V × 10)\n"
            "  - [3] Current (A × 10)\n"
            "  - [4] Cumulative energy (kWh × 10)\n\n"
            "The **modbus-publisher** reads these registers every 5s and publishes to MQTT."
        ),
    },

    "mqtt": {
        "fr": (
            "**MQTT** (Message Queuing Telemetry Transport) est le protocole de messagerie "
            "utilisé pour transporter les données entre la DataPlatform et le backend.\n\n"
            "Architecture:\n"
            "- **Broker:** Mosquitto (port 1883)\n"
            "- **Publisher:** modbus-publisher publie sur ems/telemetry/{ligne}/{type}\n"
            "- **Subscriber:** backend FastAPI souscrit à ems/telemetry/+/+\n\n"
            "Avantages:\n"
            "- Léger et efficace\n"
            "- Temps réel (< 1 seconde)\n"
            "- Résistant aux déconnexions"
        ),
        "en": (
            "**MQTT** (Message Queuing Telemetry Transport) is the messaging protocol "
            "used to transport data between the DataPlatform and the backend.\n\n"
            "Architecture:\n"
            "- **Broker:** Mosquitto (port 1883)\n"
            "- **Publisher:** modbus-publisher publishes to ems/telemetry/{line}/{type}\n"
            "- **Subscriber:** FastAPI backend subscribes to ems/telemetry/+/+\n\n"
            "Advantages:\n"
            "- Lightweight and efficient\n"
            "- Real-time (< 1 second)\n"
            "- Resilient to disconnections"
        ),
    },

    "alarm": {
        "fr": (
            "Les **alarmes** sont générées automatiquement par le backend lors de la réception "
            "des données MQTT.\n\n"
            "Types d'alarmes:\n"
            "- 🔴 **HIGH_CONSUMPTION:** > 500 kW par compteur\n"
            "- 🔴 **VOLTAGE_ANOMALY:** tension hors [380–440V]\n"
            "- 🔴 **FREQUENCY_ANOMALY:** fréquence hors [49–51Hz]\n"
            "- 🟡 **LOW_POWER_FACTOR:** FP < 0.85\n"
            "- 🟡 **HIGH_THD:** THD > 5%\n\n"
            "Chaque alarme contient:\n"
            "- Horodatage, équipement, zone, ligne\n"
            "- Valeur mesurée vs limite\n"
            "- Niveau de sévérité (high/medium)"
        ),
        "en": (
            "**Alarms** are automatically generated by the backend when MQTT data is received.\n\n"
            "Alarm types:\n"
            "- 🔴 **HIGH_CONSUMPTION:** > 500 kW per meter\n"
            "- 🔴 **VOLTAGE_ANOMALY:** voltage outside [380–440V]\n"
            "- 🔴 **FREQUENCY_ANOMALY:** frequency outside [49–51Hz]\n"
            "- 🟡 **LOW_POWER_FACTOR:** PF < 0.85\n"
            "- 🟡 **HIGH_THD:** THD > 5%\n\n"
            "Each alarm contains:\n"
            "- Timestamp, equipment, area, line\n"
            "- Measured value vs limit\n"
            "- Severity level (high/medium)"
        ),
    },

    "hierarchy": {
        "fr": (
            "L'EMS suit la **hiérarchie JESA/OCP**:\n\n"
            "**Plant 1** (usine entière)\n"
            "  └── **Unit-1 / Unit-2** (unités de production)\n"
            "        └── **Production Line 1–4** (lignes de production)\n"
            "              └── **Zone A/B/C/D** (zones fonctionnelles)\n"
            "                    └── **Meter-1 à Meter-8** (compteurs Modbus)\n\n"
            "Chaque niveau permet une analyse énergétique indépendante."
        ),
        "en": (
            "The EMS follows the **JESA/OCP hierarchy**:\n\n"
            "**Plant 1** (entire facility)\n"
            "  └── **Unit-1 / Unit-2** (production units)\n"
            "        └── **Production Line 1–4** (production lines)\n"
            "              └── **Zone A/B/C/D** (functional zones)\n"
            "                    └── **Meter-1 to Meter-8** (Modbus meters)\n\n"
            "Each level allows independent energy analysis."
        ),
    },

    "sec": {
        "fr": (
            "La **Consommation Énergétique Spécifique (SEC)** mesure l'énergie consommée "
            "par unité produite.\n\n"
            "**Formule:** SEC = kWh / unités produites\n\n"
            "Unités courantes: kWh/tonne, kWh/unité, kWh/m³\n\n"
            "Un SEC bas = meilleure efficacité énergétique.\n"
            "C'est un KPI clé pour comparer les performances entre lignes."
        ),
        "en": (
            "**Specific Energy Consumption (SEC)** measures energy consumed per unit produced.\n\n"
            "**Formula:** SEC = kWh / units produced\n\n"
            "Common units: kWh/tonne, kWh/unit, kWh/m³\n\n"
            "Lower SEC = better energy efficiency.\n"
            "It's a key KPI to compare performance between production lines."
        ),
    },

    # ── Pages de l'application ───────────────────────────────────────────────
    "dashboard": {
        "fr": (
            "Le **Dashboard** est la page principale de l'EMS.\n\n"
            "Il affiche:\n"
            "- 📊 KPIs critiques: puissance, pic, FP, tension, CO₂, coût\n"
            "- ⚙️ Équipements: noms réels Modbus (Meter-1 à Meter-8) avec statut\n"
            "- 🔧 Recommandations d'optimisation automatiques\n"
            "- 📈 Graphes de performance énergétique\n"
            "- 📋 Tableau détaillé avec toutes les mesures\n\n"
            "Toutes les données viennent de la **DataPlatform** en temps réel (5s)."
        ),
        "en": (
            "The **Dashboard** is the main EMS page.\n\n"
            "It displays:\n"
            "- 📊 Critical KPIs: power, peak, PF, voltage, CO₂, cost\n"
            "- ⚙️ Equipment: real Modbus names (Meter-1 to Meter-8) with status\n"
            "- 🔧 Automatic optimization recommendations\n"
            "- 📈 Energy performance charts\n"
            "- 📋 Detailed table with all measurements\n\n"
            "All data comes from the **DataPlatform** in real-time (5s)."
        ),
    },

    "realtime": {
        "fr": (
            "La page **Monitoring Temps Réel** affiche:\n\n"
            "- ⚡ Tension, fréquence, FP, THD en direct\n"
            "- 📊 Graphes SVG avec courbes historiques + prédictions\n"
            "- 🔮 Prédictions Python (régression linéaire)\n"
            "- 📋 Tableau des mesures actuelles par équipement\n\n"
            "Les graphes sont générés par le backend Python et incluent "
            "un **intervalle de confiance 95%** sur les prédictions."
        ),
        "en": (
            "The **Real-Time Monitoring** page displays:\n\n"
            "- ⚡ Voltage, frequency, PF, THD live\n"
            "- 📊 SVG charts with historical curves + predictions\n"
            "- 🔮 Python predictions (linear regression)\n"
            "- 📋 Current measurements table per equipment\n\n"
            "Charts are generated by the Python backend and include "
            "a **95% confidence interval** on predictions."
        ),
    },

    "history": {
        "fr": (
            "La page **Données Historiques** permet d'analyser les tendances.\n\n"
            "Fonctionnalités:\n"
            "- 📅 Filtres: Dernière heure, 24h, semaine, mois, année\n"
            "- ⚡ Types d'énergie: Electricity, kWh, CO₂\n"
            "- 📊 Graphe SVG avec courbe historique\n"
            "- 📈 **Comparaison Aujourd'hui vs Hier** avec variation %\n"
            "- 📋 Tableau détaillé des enregistrements\n"
            "- 📉 Statistiques: min, max, moyenne, coût total, CO₂ total"
        ),
        "en": (
            "The **Historical Data** page allows trend analysis.\n\n"
            "Features:\n"
            "- 📅 Filters: Last hour, 24h, week, month, year\n"
            "- ⚡ Energy types: Electricity, kWh, CO₂\n"
            "- 📊 SVG chart with historical curve\n"
            "- 📈 **Today vs Yesterday comparison** with % variation\n"
            "- 📋 Detailed records table\n"
            "- 📉 Statistics: min, max, average, total cost, total CO₂"
        ),
    },

    "reports": {
        "fr": (
            "La page **Rapports & Analytics** permet d'exporter les données.\n\n"
            "Fonctionnalités:\n"
            "- 📥 **Export CSV** avec toutes les mesures\n"
            "- 🖨️ **Export PDF** via impression navigateur\n"
            "- 📤 **Partage** vers les conversations internes\n"
            "- 📊 Résumé exécutif avec score d'efficacité\n"
            "- 💰 Analyse des coûts par type d'énergie\n"
            "- 🌱 Colonnes CO₂ dans le tableau détaillé"
        ),
        "en": (
            "The **Reports & Analytics** page allows data export.\n\n"
            "Features:\n"
            "- 📥 **CSV Export** with all measurements\n"
            "- 🖨️ **PDF Export** via browser print\n"
            "- 📤 **Share** to internal conversations\n"
            "- 📊 Executive summary with efficiency score\n"
            "- 💰 Cost analysis by energy type\n"
            "- 🌱 CO₂ columns in the detailed table"
        ),
    },

    "forecasting": {
        "fr": (
            "La page **Forecasting** prédit la consommation future.\n\n"
            "Méthode:\n"
            "- 🐍 **Régression linéaire Python** (côté backend)\n"
            "- 📊 Intervalle de confiance 95% affiché\n"
            "- 📅 Vues: journalière, hebdomadaire, mensuelle\n\n"
            "Indicateurs prédits:\n"
            "- Puissance active (kW) avec tendance\n"
            "- Tension (V) avec trend\n"
            "- Facteur de puissance\n"
            "- CO₂ prédit (kW × 0.718)\n"
            "- Coût prédit (kW × 0.14)"
        ),
        "en": (
            "The **Forecasting** page predicts future consumption.\n\n"
            "Method:\n"
            "- 🐍 **Python linear regression** (backend-side)\n"
            "- 📊 95% confidence interval displayed\n"
            "- 📅 Views: daily, weekly, monthly\n\n"
            "Predicted indicators:\n"
            "- Active power (kW) with trend\n"
            "- Voltage (V) with trend\n"
            "- Power factor\n"
            "- Predicted CO₂ (kW × 0.718)\n"
            "- Predicted cost (kW × 0.14)"
        ),
    },

    "architecture": {
        "fr": (
            "**Architecture technique de l'EMS:**\n\n"
            "```\n"
            "DataPlatform (Docker):\n"
            "  Modbus Simulator → modbus-publisher → MQTT Broker\n"
            "                                              ↓\n"
            "Backend (FastAPI Python):\n"
            "  MQTT Client → PostgreSQL + WebSocket\n"
            "                    ↓\n"
            "Frontend (React/Vite):\n"
            "  polling 5s + WebSocket temps réel\n"
            "```\n\n"
            "Services Docker: mqtt-broker, modbus-sim, modbus-publisher, "
            "postgres, pgadmin, nodered, kafka, ems-backend, ems-app"
        ),
        "en": (
            "**EMS Technical Architecture:**\n\n"
            "```\n"
            "DataPlatform (Docker):\n"
            "  Modbus Simulator → modbus-publisher → MQTT Broker\n"
            "                                              ↓\n"
            "Backend (FastAPI Python):\n"
            "  MQTT Client → PostgreSQL + WebSocket\n"
            "                    ↓\n"
            "Frontend (React/Vite):\n"
            "  5s polling + real-time WebSocket\n"
            "```\n\n"
            "Docker services: mqtt-broker, modbus-sim, modbus-publisher, "
            "postgres, pgadmin, nodered, kafka, ems-backend, ems-app"
        ),
    },
}


# ─── Moteur de réponse principal ──────────────────────────────────────────────

def generate_response(question: str, context: dict) -> str:
    q = normalize(question)
    fr = is_french(q)
    lang = "fr" if fr else "en"

    energies        = context.get("energies", []) or []
    selected_line   = context.get("selectedLineLabel", "Unknown")
    urgent_count    = int(context.get("urgentCount", 0) or 0)
    users_count     = int(context.get("usersCount", 0) or 0)
    active_page     = context.get("activePage", "dashboard") or "dashboard"
    avg_voltage     = context.get("avgVoltage")
    avg_pf          = context.get("avgPowerFactor")
    peak_kw         = float(context.get("peakKw", 0) or 0)
    total_co2_ctx   = float(context.get("totalCo2", 0) or 0)
    total_cost_ctx  = float(context.get("totalCost", 0) or 0)

    max_e    = get_max_energy(energies)
    min_e    = get_min_energy(energies)
    total_kw = get_total_kw(energies)
    total_co2_calc = get_total_co2(energies)
    total_cost_calc = get_total_cost(energies)
    co2   = total_co2_ctx or total_co2_calc
    cost  = total_cost_ctx or total_cost_calc
    names = list_names(energies)

    # ── Salutations ──────────────────────────────────────────────────────────
    if contains(q, "hello", "bonjour", "hi", "salut", "hey", "bonsoir", "good morning"):
        if fr:
            return (
                f"👋 **Bonjour!** Je suis votre assistant EMS JESA.\n\n"
                f"📍 Ligne sélectionnée: **{selected_line}**\n"
                f"⚡ Puissance totale: **{total_kw} kW**\n"
                f"💰 Coût total: **{cost:.4f} $**\n"
                f"🌱 CO₂: **{co2:.3f} kg**\n\n"
                f"Posez-moi n'importe quelle question sur l'EMS!"
            )
        return (
            f"👋 **Hello!** I'm your JESA EMS assistant.\n\n"
            f"📍 Selected line: **{selected_line}**\n"
            f"⚡ Total power: **{total_kw} kW**\n"
            f"💰 Total cost: **{cost:.4f} $**\n"
            f"🌱 CO₂: **{co2:.3f} kg**\n\n"
            f"Ask me anything about the EMS!"
        )

    # ── Aide ─────────────────────────────────────────────────────────────────
    if contains(q, "help", "aide", "what can", "que peux", "how to", "comment utiliser", "capabilities"):
        if fr:
            return (
                "Je peux vous aider avec:\n\n"
                "**Données en temps réel:**\n"
                "- Puissance, tension, FP, THD, CO₂, coûts\n"
                "- Équipements et leurs mesures\n\n"
                "**Concepts EMS:**\n"
                "- Facteur de puissance, THD, Modbus, MQTT\n"
                "- CO₂, émissions, SEC\n\n"
                "**Application:**\n"
                "- Dashboard, Temps réel, Historique\n"
                "- Forecasting, Rapports, Alarmes\n\n"
                "**Recommandations:**\n"
                "- Optimisation basée sur vos données réelles\n\n"
                "Exemples: *'Quel est le coût total?'*, *'Explique le facteur de puissance'*, *'Y a-t-il des alarmes?'*"
            )
        return (
            "I can help you with:\n\n"
            "**Live data:**\n"
            "- Power, voltage, PF, THD, CO₂, costs\n"
            "- Equipment and their measurements\n\n"
            "**EMS concepts:**\n"
            "- Power factor, THD, Modbus, MQTT\n"
            "- CO₂, emissions, SEC\n\n"
            "**Application pages:**\n"
            "- Dashboard, Real-time, History\n"
            "- Forecasting, Reports, Alarms\n\n"
            "**Recommendations:**\n"
            "- Optimization based on your real data\n\n"
            "Examples: *'What is the total cost?'*, *'Explain power factor'*, *'Any alarms?'*"
        )

    # ── Données live — Consommation max ──────────────────────────────────────
    if contains(q, "highest", "maximum", "max energy", "most consumed", "plus élevé",
                "plus consommé", "biggest", "largest", "dominant", "principal"):
        if not max_e:
            return "No energy data available on this line yet. / Aucune donnée disponible pour cette ligne."
        eq   = get_raw(max_e, "equipment") or "—"
        area = get_raw(max_e, "area")      or "—"
        if fr:
            return (
                f"**Énergie la plus élevée** sur {selected_line}:\n\n"
                f"- Type: **{max_e.get('name')}**\n"
                f"- Valeur: **{float(max_e.get('value', 0)):.2f} {max_e.get('unit', '')}**\n"
                f"- Équipement: **{eq}** ({area})\n"
                f"- Coût: **{float(max_e.get('cost', 0)):.4f} $**\n"
                f"- CO₂: **{float(max_e.get('co2_kg', 0)):.3f} kg**"
            )
        return (
            f"**Highest energy** on {selected_line}:\n\n"
            f"- Type: **{max_e.get('name')}**\n"
            f"- Value: **{float(max_e.get('value', 0)):.2f} {max_e.get('unit', '')}**\n"
            f"- Equipment: **{eq}** ({area})\n"
            f"- Cost: **{float(max_e.get('cost', 0)):.4f} $**\n"
            f"- CO₂: **{float(max_e.get('co2_kg', 0)):.3f} kg**"
        )

    # ── Consommation min ─────────────────────────────────────────────────────
    if contains(q, "lowest", "minimum", "min energy", "least", "plus bas", "moins consommé", "smallest"):
        if not min_e:
            return "No energy data available. / Aucune donnée disponible."
        if fr:
            return (
                f"**Énergie la plus basse** sur {selected_line}:\n\n"
                f"- Type: **{min_e.get('name')}**\n"
                f"- Valeur: **{float(min_e.get('value', 0)):.2f} {min_e.get('unit', '')}**\n"
                f"- Coût: **{float(min_e.get('cost', 0)):.4f} $**"
            )
        return (
            f"**Lowest energy** on {selected_line}:\n\n"
            f"- Type: **{min_e.get('name')}**\n"
            f"- Value: **{float(min_e.get('value', 0)):.2f} {min_e.get('unit', '')}**\n"
            f"- Cost: **{float(min_e.get('cost', 0)):.4f} $**"
        )

    # ── Coût total ───────────────────────────────────────────────────────────
    if contains(q, "total cost", "cout total", "coût total", "how much cost",
                "combien", "price", "prix", "tarif", "money", "argent", "dépense"):
        if fr:
            lines = [f"**Coût total** sur {selected_line}: **{cost:.4f} $**\n"]
            lines.append("Détail par énergie:")
            for e in energies:
                lines.append(f"- {e.get('name')}: **{float(e.get('cost', 0)):.4f} $** ({e.get('value', 0):.2f} {e.get('unit', '')})")
            if not energies:
                lines.append("- Aucune donnée disponible")
            lines.append(f"\nTarif électricité: **0.14 $/kWh**")
            return "\n".join(lines)
        lines = [f"**Total cost** on {selected_line}: **{cost:.4f} $**\n"]
        lines.append("Breakdown by energy:")
        for e in energies:
            lines.append(f"- {e.get('name')}: **{float(e.get('cost', 0)):.4f} $** ({e.get('value', 0):.2f} {e.get('unit', '')})")
        if not energies:
            lines.append("- No data available")
        lines.append(f"\nElectricity rate: **0.14 $/kWh**")
        return "\n".join(lines)

    # ── CO2 ──────────────────────────────────────────────────────────────────
    if contains(q, "co2", "co₂", "carbon", "emission", "carbone", "greenhouse",
                "gaz", "footprint", "empreinte"):
        kwhE = next((e for e in energies if e.get("unit", "").lower() == "kwh"), None)
        co2_from_kwh = (float(kwhE.get("value", 0)) * 0.718) if kwhE else 0
        co2_display = co2 or co2_from_kwh
        if fr:
            return (
                f"**Émissions CO₂** sur {selected_line}: **{co2_display:.3f} kg**\n\n"
                f"**Formule:** CO₂ (kg) = kWh × 0.718\n"
                f"**Facteur ONEE Maroc:** 0.718 kgCO₂/kWh\n\n"
                f"Équivalent: **{co2_display/1000:.5f} tonnes CO₂e**\n\n"
                f"*Réduire 1 kWh = éviter 0.718 kg CO₂*"
            )
        return (
            f"**CO₂ Emissions** on {selected_line}: **{co2_display:.3f} kg**\n\n"
            f"**Formula:** CO₂ (kg) = kWh × 0.718\n"
            f"**ONEE Morocco factor:** 0.718 kgCO₂/kWh\n\n"
            f"Equivalent: **{co2_display/1000:.5f} tonnes CO₂e**\n\n"
            f"*Reducing 1 kWh = avoiding 0.718 kg CO₂*"
        )

    # ── Tension ──────────────────────────────────────────────────────────────
    if contains(q, "voltage", "tension", "volt", "v rms", "under voltage", "over voltage",
                "sous-tension", "sur-tension", "quelle tension"):
        if avg_voltage:
            v      = float(avg_voltage)
            ok     = 380 <= v <= 440
            status = "✅ Normal" if ok else "⚠️ Hors plage!" if fr else "⚠️ Out of range!"
            advice = "" if ok else (
                "\n\n💡 Vérifier le réglage du transformateur." if fr else
                "\n\n💡 Check transformer tap changer settings."
            )
            if fr:
                return (
                    f"**Tension** sur {selected_line}: **{avg_voltage} V** ({status})\n\n"
                    f"- Nominale: 415V\n"
                    f"- Plage acceptable: 380–440V (±6%)\n"
                    f"- Écart: **{abs(v - 415):.1f} V** depuis la nominale"
                    f"{advice}"
                )
            return (
                f"**Voltage** on {selected_line}: **{avg_voltage} V** ({status})\n\n"
                f"- Nominal: 415V\n"
                f"- Acceptable range: 380–440V (±6%)\n"
                f"- Deviation: **{abs(v - 415):.1f} V** from nominal"
                f"{advice}"
            )
        return EMS_KNOWLEDGE["voltage"][lang]

    # ── Facteur de puissance ──────────────────────────────────────────────────
    if contains(q, "power factor", "facteur de puissance", "facteur puissance",
                "pf", "cos phi", "cos φ", "reactive", "réactif", "kvar"):
        if avg_pf:
            pf     = float(avg_pf)
            if pf >= 0.90:
                status = "✅ Bon / Good"
                advice = "✓ Facteur de puissance optimal." if fr else "✓ Power factor is optimal."
            elif pf >= 0.85:
                status = "⚠️ Acceptable"
                savings = round((0.90 - pf) * peak_kw * 0.14, 2) if peak_kw else 0
                advice = f"💡 Installer des condensateurs. Économies potentielles: ~{savings}$/h" if fr else f"💡 Install capacitors. Potential savings: ~{savings}$/h"
            else:
                status = "🔴 Bas / Low — Action requise"
                savings = round((0.90 - pf) * peak_kw * 0.14, 2) if peak_kw else 0
                advice = f"🚨 Action urgente! Installer des condensateurs. Économies: ~{savings}$/h" if fr else f"🚨 Urgent action! Install capacitors. Savings: ~{savings}$/h"
            if fr:
                return (
                    f"**Facteur de Puissance** sur {selected_line}: **{avg_pf}** ({status})\n\n"
                    f"**Formule:** cos(φ) = kW / √(kW²+kVAR²)\n"
                    f"- Cible: ≥ 0.90 | Minimum: 0.85\n"
                    f"- Score: **{pf*100:.1f}%**\n\n"
                    f"{advice}"
                )
            return (
                f"**Power Factor** on {selected_line}: **{avg_pf}** ({status})\n\n"
                f"**Formula:** cos(φ) = kW / √(kW²+kVAR²)\n"
                f"- Target: ≥ 0.90 | Minimum: 0.85\n"
                f"- Score: **{pf*100:.1f}%**\n\n"
                f"{advice}"
            )
        return EMS_KNOWLEDGE["power_factor"][lang]

    # ── Puissance / Consommation ──────────────────────────────────────────────
    if contains(q, "power", "puissance", "kw", "consumption", "consommation",
                "demand", "demande", "active", "actif", "how much power",
                "quelle puissance", "total power"):
        kw_energies = [e for e in energies if e.get("unit") == "kW"]
        if fr:
            result = (
                f"**Puissance active** sur {selected_line}: **{total_kw} kW**\n\n"
                f"- Pic de demande: **{peak_kw} kW**\n"
            )
            if kw_energies:
                result += "Détail:\n"
                for e in kw_energies:
                    eq = get_raw(e, "equipment") or "—"
                    result += f"- {eq}: **{float(e.get('value', 0)):.2f} kW**\n"
            if peak_kw > 400:
                result += f"\n⚠️ Pic > 400kW — Planifier les charges en heures creuses (22h–06h)"
        else:
            result = (
                f"**Active power** on {selected_line}: **{total_kw} kW**\n\n"
                f"- Peak demand: **{peak_kw} kW**\n"
            )
            if kw_energies:
                result += "Breakdown:\n"
                for e in kw_energies:
                    eq = get_raw(e, "equipment") or "—"
                    result += f"- {eq}: **{float(e.get('value', 0)):.2f} kW**\n"
            if peak_kw > 400:
                result += f"\n⚠️ Peak > 400kW — Schedule loads to off-peak hours (22h–06h)"
        return result

    # ── Alarmes ──────────────────────────────────────────────────────────────
    if contains(q, "alarm", "alerte", "alert", "warning", "anomal", "problem",
                "issue", "problème", "danger", "risk", "risque"):
        issues = []
        if avg_pf and float(avg_pf) < 0.85:
            issues.append(f"🔴 **LOW_POWER_FACTOR**: {avg_pf} < 0.85")
        if avg_pf and float(avg_pf) < 0.90 and float(avg_pf) >= 0.85:
            issues.append(f"🟡 **POWER_FACTOR_WARNING**: {avg_pf} < 0.90 (target)")
        if avg_voltage and (float(avg_voltage) < 380 or float(avg_voltage) > 440):
            issues.append(f"🔴 **VOLTAGE_ANOMALY**: {avg_voltage}V hors [380–440V]" if fr else f"🔴 **VOLTAGE_ANOMALY**: {avg_voltage}V outside [380–440V]")
        if peak_kw > 500:
            issues.append(f"🔴 **HIGH_CONSUMPTION**: {peak_kw:.1f} kW > 500 kW")
        elif peak_kw > 400:
            issues.append(f"🟡 **HIGH_DEMAND_WARNING**: {peak_kw:.1f} kW > 400 kW")

        if not issues:
            return (
                "✅ **Aucune alarme active** — Tous les paramètres sont dans les plages normales." if fr else
                "✅ **No active alarms** — All parameters are within normal ranges."
            )
        header = "**Conditions d'alarme détectées:**" if fr else "**Detected alarm conditions:**"
        return header + "\n" + "\n".join(issues)

    # ── Recommandations ──────────────────────────────────────────────────────
    if contains(q, "recommend", "recommand", "improve", "améliorer", "optimize",
                "optimiser", "suggestion", "advice", "conseil", "what should",
                "que faire", "comment réduire", "how to reduce", "save", "économiser"):
        recs = []
        if avg_pf and float(avg_pf) < 0.90:
            pf = float(avg_pf)
            savings = round((0.90 - pf) * (peak_kw or 100) * 0.14, 2)
            if fr:
                recs.append(f"⚡ **Améliorer le FP** ({pf} → 0.90+)\n   Installer des condensateurs de compensation\n   Économies estimées: **~{savings}$/h**")
            else:
                recs.append(f"⚡ **Improve Power Factor** ({pf} → 0.90+)\n   Install power factor correction capacitors\n   Estimated savings: **~{savings}$/h**")
        if avg_voltage and (float(avg_voltage) < 400 or float(avg_voltage) > 430):
            if fr:
                recs.append(f"🔌 **Corriger la tension** ({avg_voltage}V)\n   Ajuster le réglage du transformateur\n   Contacter l'équipe maintenance électrique")
            else:
                recs.append(f"🔌 **Correct voltage** ({avg_voltage}V)\n   Adjust transformer tap changer\n   Contact electrical maintenance team")
        if peak_kw > 400:
            if fr:
                recs.append(f"📉 **Réduire le pic de demande** ({peak_kw:.1f}kW)\n   Étaler les démarrages de machines\n   Utiliser les heures creuses (22h–06h)\n   Économies potentielles: **~{round((peak_kw-400)*0.14*24*30, 0):.0f}$/mois**")
            else:
                recs.append(f"📉 **Reduce peak demand** ({peak_kw:.1f}kW)\n   Stagger machine startups\n   Use off-peak hours (22h–06h)\n   Potential savings: **~{round((peak_kw-400)*0.14*24*30, 0):.0f}$/month**")
        if co2 > 50:
            if fr:
                recs.append(f"🌱 **Réduire l'empreinte carbone** ({co2:.2f}kg CO₂)\n   Envisager l'installation de panneaux solaires\n   Réduction potentielle: 30% des émissions\n   Éclairage LED pour réduire la consommation")
            else:
                recs.append(f"🌱 **Reduce carbon footprint** ({co2:.2f}kg CO₂)\n   Consider solar panel installation\n   Potential CO₂ reduction: 30%\n   LED lighting to reduce consumption")
        if not recs:
            return (
                "✅ **Système optimal!** Tous les indicateurs sont dans les plages cibles.\n"
                "Continuez la surveillance préventive." if fr else
                "✅ **System optimal!** All indicators are within target ranges.\n"
                "Continue preventive monitoring."
            )
        header = "**Recommandations d'optimisation:**" if fr else "**Optimization Recommendations:**"
        return header + "\n\n" + "\n\n".join(recs)

    # ── Ligne sélectionnée ───────────────────────────────────────────────────
    if contains(q, "line", "ligne", "selected", "sélectionné", "which line",
                "quelle ligne", "current line", "change line"):
        if fr:
            return (
                f"Ligne de production sélectionnée: **{selected_line}**\n\n"
                f"Énergies visibles: **{names}**\n\n"
                f"Puissance: **{total_kw} kW** | Coût: **{cost:.4f}$** | CO₂: **{co2:.3f}kg**\n\n"
                f"*Changez la ligne via le sélecteur dans l'en-tête.*"
            )
        return (
            f"Selected production line: **{selected_line}**\n\n"
            f"Visible energies: **{names}**\n\n"
            f"Power: **{total_kw} kW** | Cost: **{cost:.4f}$** | CO₂: **{co2:.3f}kg**\n\n"
            f"*Change the line using the selector in the header.*"
        )

    # ── Page active ──────────────────────────────────────────────────────────
    if contains(q, "page", "where am i", "où suis", "current page", "active page", "quelle page"):
        pages_fr = {
            "dashboard":   "Tableau de bord — KPIs et équipements",
            "realtime":    "Monitoring Temps Réel — graphes et prédictions",
            "power":       "Qualité d'Énergie — tension, FP, THD",
            "carbon":      "Émissions Carbone — suivi CO₂",
            "equipment":   "Statut Équipements — compteurs Modbus",
            "forecasting": "Forecasting — prévisions",
            "reports":     "Rapports — export CSV/PDF",
            "alarms":      "Alarmes — alertes automatiques",
            "history":     "Données Historiques — tendances",
            "messages":    "Messages — communication interne",
        }
        pages_en = {
            "dashboard":   "Dashboard — KPIs and equipment overview",
            "realtime":    "Real-Time Monitoring — charts and predictions",
            "power":       "Power Quality — voltage, PF, THD",
            "carbon":      "Carbon Emissions — CO₂ tracking",
            "equipment":   "Equipment Status — Modbus meters",
            "forecasting": "Forecasting — energy predictions",
            "reports":     "Reports — CSV/PDF export",
            "alarms":      "Alarms — automatic alerts",
            "history":     "Historical Data — trends",
            "messages":    "Messages — internal communication",
        }
        desc = (pages_fr if fr else pages_en).get(active_page, active_page)
        if fr:
            return f"Vous êtes sur la page: **{desc}**"
        return f"You are on the page: **{desc}**"

    # ── Statut système complet ────────────────────────────────────────────────
    if contains(q, "status", "statut", "overview", "vue d'ensemble", "summary",
                "résumé", "bilan", "all data", "toutes les données", "tout"):
        status_lines = []
        if avg_pf:
            pf = float(avg_pf)
            status_lines.append(f"- FP: **{avg_pf}** {'✅' if pf >= 0.90 else '⚠️' if pf >= 0.85 else '🔴'}")
        if avg_voltage:
            v = float(avg_voltage)
            status_lines.append(f"- Tension: **{avg_voltage}V** {'✅' if 380 <= v <= 440 else '🔴'}")
        status_lines.append(f"- Puissance: **{total_kw} kW** (pic: {peak_kw} kW)")
        status_lines.append(f"- CO₂: **{co2:.3f} kg**")
        status_lines.append(f"- Coût: **{cost:.4f} $**")
        status_lines.append(f"- Équipements: **{len(energies)}** types surveillés")

        if fr:
            return (
                f"**Bilan {selected_line}:**\n\n"
                + "\n".join(status_lines) +
                f"\n\nPage active: **{active_page}** | Requêtes urgentes: **{urgent_count}**"
            )
        return (
            f"**{selected_line} Status:**\n\n"
            + "\n".join(status_lines) +
            f"\n\nActive page: **{active_page}** | Urgent requests: **{urgent_count}**"
        )

    # ── Requêtes urgentes ────────────────────────────────────────────────────
    if contains(q, "urgent", "pending", "reset", "password", "mot de passe", "oublié"):
        if fr:
            return f"Il y a actuellement **{urgent_count}** requête(s) urgente(s) en attente. Gérez-les sur la page **Requêtes Urgentes** (admin uniquement)."
        return f"There are currently **{urgent_count}** pending urgent request(s). Manage them on the **Urgent Requests** page (admin only)."

    # ── Utilisateurs ─────────────────────────────────────────────────────────
    if contains(q, "users", "utilisateurs", "how many users", "combien"):
        if fr:
            return f"Il y a actuellement **{users_count}** utilisateur(s) dans l'application. Gérez-les sur la page **Gestion des Utilisateurs** (admin uniquement)."
        return f"There are currently **{users_count}** user(s) in the application. Manage them on the **Users Management** page (admin only)."

    # ── Merci ────────────────────────────────────────────────────────────────
    if contains(q, "merci", "thanks", "thank you", "parfait", "great", "super", "excellent"):
        if fr:
            return "😊 Avec plaisir! N'hésitez pas si vous avez d'autres questions sur l'EMS."
        return "😊 You're welcome! Feel free to ask if you have more questions about the EMS."

    # ── Recherche dans la base de connaissances ───────────────────────────────
    knowledge_map = {
        ("ems", "energy management", "système de gestion", "what is"):         "ems",
        ("power factor", "facteur de puissance", "cos phi", "cos φ", "kvar"):  "power_factor",
        ("thd", "harmonic", "harmonique", "distortion", "distorsion"):         "thd",
        ("voltage", "tension", "volt"):                                         "voltage",
        ("frequency", "fréquence", "hz", "hertz"):                             "frequency",
        ("co2", "co₂", "carbon", "carbone", "emission", "émission"):           "co2",
        ("modbus", "register", "registre", "meter", "compteur"):               "modbus",
        ("mqtt", "broker", "mosquitto", "publish", "subscribe"):               "mqtt",
        ("alarm", "alerte", "threshold", "seuil"):                             "alarm",
        ("hierarchy", "hiérarchie", "plant", "usine", "unit", "unité"):        "hierarchy",
        ("sec", "specific energy", "consommation spécifique"):                 "sec",
        ("dashboard", "tableau de bord", "kpi"):                               "dashboard",
        ("realtime", "real time", "temps réel", "monitoring"):                 "realtime",
        ("history", "historique", "historical", "trend", "tendance"):          "history",
        ("report", "rapport", "export", "csv", "pdf"):                         "reports",
        ("forecast", "prévision", "prediction", "prédiction"):                 "forecasting",
        ("architecture", "docker", "backend", "frontend", "stack"):            "architecture",
    }

    for keywords, topic in knowledge_map.items():
        if any(kw in q for kw in keywords):
            if topic in EMS_KNOWLEDGE:
                return EMS_KNOWLEDGE[topic][lang]

    # ── Fallback ─────────────────────────────────────────────────────────────
    if fr:
        return (
            f"Je n'ai pas trouvé de réponse précise à votre question.\n\n"
            f"Sur **{selected_line}**: {total_kw} kW | {cost:.4f}$ | {co2:.3f}kg CO₂\n\n"
            f"Essayez: *'Coût total'*, *'Facteur de puissance'*, *'Y a-t-il des alarmes?'*, "
            f"*'Recommandations'*, *'Explique le THD'*, *'Statut général'*"
        )
    return (
        f"I couldn't find a specific answer to your question.\n\n"
        f"On **{selected_line}**: {total_kw} kW | {cost:.4f}$ | {co2:.3f}kg CO₂\n\n"
        f"Try: *'Total cost'*, *'Power factor'*, *'Any alarms?'*, "
        f"*'Recommendations'*, *'Explain THD'*, *'General status'*"
    )


# ─── Endpoint ─────────────────────────────────────────────────────────────────

@router.post("/ask")
def ask_chatbot(
    payload: dict,
    current_user: User = Depends(get_current_active_user),
):
    question = (payload.get("question", "") or "").strip()
    context  = payload.get("context",  {}) or {}

    if not question:
        lang = "fr"
        return {
            "answer": (
                "👋 **Bonjour!** Je suis votre assistant EMS JESA.\n\n"
                "Je peux vous aider avec les données live, les concepts EMS, "
                "les alarmes, les recommandations et les pages de l'application.\n\n"
                "Je parle **français** et **anglais** 🇫🇷 🇬🇧\n\n"
                "Posez-moi une question!"
            )
        }

    answer = generate_response(question, context)
    return {"answer": answer}