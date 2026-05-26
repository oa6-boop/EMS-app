"""
chatbot.py — Assistant EMS intelligent 100% local
Spécialisé énergie industrielle, qualité électrique, coûts MAD, CO₂.
Aucune référence au développement ou à l'implémentation technique.
"""

from fastapi import APIRouter, Depends
from app.core.deps import get_current_active_user
from app.models import User
import math

router = APIRouter(prefix="/api/chatbot", tags=["chatbot"])


# ─── Helpers ─────────────────────────────────────────────────────────────────

def norm(text: str) -> str:
    t = (text or "").strip().lower()
    for a, b in [("é","e"),("è","e"),("ê","e"),("à","a"),("â","a"),
                 ("î","i"),("ï","i"),("ô","o"),("ù","u"),("û","u"),("ç","c")]:
        t = t.replace(a, b)
    return t

def has(q, *kws):
    return any(k in q for k in kws)

def is_fr(q):
    return has(q,
        "quoi","quel","quelle","quels","quelles","comment","combien",
        "pourquoi","ligne","energie","tension","cout","coet","facteur",
        "puissance","aide","merci","bonjour","salut","bonsoir","affiche",
        "montre","donne","explique","analyse","verifie","consommation",
        "alarme","recommandation","statut","bilan","optimis","amelior",
        "reduis","reduit","economie","economies")

def safe_float(v, d=0.0):
    try: return float(v)
    except: return d

def get_raw(e, field):
    raw = e.get("rawData") or {}
    return raw.get(field) if isinstance(raw, dict) else None

def get_kw_energies(energies):
    return [e for e in energies if e.get("unit") == "kW"]

def get_kwh_energy(energies):
    return next((e for e in energies
                 if e.get("unit") == "kWh"
                 or "kwh" in norm(e.get("energy_name","") or e.get("name",""))), None)

def get_co2_energy(energies):
    return next((e for e in energies
                 if "co2" in norm(e.get("energy_name","") or e.get("name",""))), None)

def total_kw(energies):
    return round(sum(safe_float(e.get("value")) for e in get_kw_energies(energies)), 2)

def total_cost_fn(energies):
    return round(sum(safe_float(e.get("cost")) for e in energies
                     if "co2" not in norm(e.get("energy_name","") or e.get("name",""))), 2)

def total_co2_fn(energies, co2_ctx=0):
    co2e = get_co2_energy(energies)
    if co2e: return safe_float(co2e.get("value"))
    kwhe = get_kwh_energy(energies)
    if kwhe: return round(safe_float(kwhe.get("value")) * 0.718, 3)
    kw = total_kw(energies)
    return round(kw * 0.718, 3) if kw else safe_float(co2_ctx)

def pf_status(pf):
    if pf >= 0.95: return "🟢 Excellent"
    if pf >= 0.90: return "✅ Bon"
    if pf >= 0.85: return "🟡 Acceptable"
    if pf >= 0.80: return "🟠 Bas"
    return "🔴 Critique"

def v_status(v):
    if 215 <= v <= 245: return "✅ Normal"
    if 207 <= v <= 253: return "🟡 Acceptable"
    return "🔴 Anomalie"

def thd_status(thd):
    if thd <= 2: return "🟢 Excellent"
    if thd <= 5: return "✅ Normal"
    if thd <= 8: return "🟡 Élevé"
    return "🔴 Critique"

def freq_status(f):
    if 49.8 <= f <= 50.2: return "✅ Stable"
    if 49.5 <= f <= 50.5: return "🟡 Acceptable"
    return "🔴 Anomalie"

def efficiency_score(pf, v, peak, thd=None):
    score = 100
    if pf:
        p = safe_float(pf)
        if p < 0.90: score -= 20
        if p < 0.85: score -= 15
    if v:
        vv = safe_float(v)
        if vv < 215 or vv > 245: score -= 10
        if vv < 207 or vv > 253: score -= 15
    if peak and safe_float(peak) > 450: score -= 10
    if thd and safe_float(thd) > 5:    score -= 10
    return max(0, min(100, score))

def co2_equivalents(kg):
    return round(kg / 0.21, 1), round(kg / 21.77, 2), int(kg / 0.0089)

def savings_from_pf(current_pf, target_pf, peak_kw, rate=1.40):
    cp, tp, pk = safe_float(current_pf), safe_float(target_pf), safe_float(peak_kw)
    if cp <= 0 or cp >= 1 or pk <= 0: return 0
    try:
        delta = pk * (math.sqrt(1-cp**2)/cp - math.sqrt(1-tp**2)/tp)
        return round(delta * rate * 0.3, 2) if delta > 0 else 0
    except: return 0


# ─── Base de connaissances EMS ────────────────────────────────────────────────

KNOWLEDGE = {

    "power_factor": {
        "fr": (
            "**Facteur de Puissance (FP / cos φ)**\n\n"
            "Mesure l'efficacité d'utilisation de l'énergie électrique dans une installation industrielle.\n\n"
            "**Formule:** cos(φ) = Puissance active (kW) / Puissance apparente (kVA)\n\n"
            "**Échelle de qualité:**\n"
            "- 🟢 FP ≥ 0.95 → Excellent — aucune perte réactive\n"
            "- ✅ FP ≥ 0.90 → Bon — cible industrielle ONEE Maroc\n"
            "- 🟡 FP 0.85–0.90 → Acceptable — amélioration recommandée\n"
            "- 🟠 FP 0.80–0.85 → Bas — pertes significatives\n"
            "- 🔴 FP < 0.80 → Critique — alarme + pénalités tarifaires ONEE\n\n"
            "**Causes d'un FP bas:**\n"
            "- Moteurs électriques fonctionnant à charge partielle\n"
            "- Transformateurs en sous-charge\n"
            "- Éclairage fluorescent non compensé\n\n"
            "**Solutions:**\n"
            "- Installation d'une batterie de condensateurs (compensation automatique)\n"
            "- Variateurs de vitesse sur les moteurs\n"
            "- Remplacement des équipements vieillissants\n\n"
            "**Impact financier:** Un FP de 0.80 augmente la consommation "
            "apparente de 19% et peut générer des pénalités sur la facture ONEE."
        ),
        "en": (
            "**Power Factor (PF / cos φ)**\n\n"
            "Measures how efficiently electrical power is used in an industrial installation.\n\n"
            "**Formula:** cos(φ) = Active power (kW) / Apparent power (kVA)\n\n"
            "**Quality scale:**\n"
            "- 🟢 PF ≥ 0.95 → Excellent — no reactive losses\n"
            "- ✅ PF ≥ 0.90 → Good — ONEE Morocco industrial target\n"
            "- 🟡 PF 0.85–0.90 → Acceptable — improvement recommended\n"
            "- 🟠 PF 0.80–0.85 → Low — significant losses\n"
            "- 🔴 PF < 0.80 → Critical — alarm + ONEE tariff penalties\n\n"
            "**Causes of low PF:**\n"
            "- Electric motors running at partial load\n"
            "- Underloaded transformers\n"
            "- Uncompensated fluorescent lighting\n\n"
            "**Solutions:**\n"
            "- Capacitor bank installation (automatic compensation)\n"
            "- Variable speed drives on motors\n"
            "- Replacement of aging equipment\n\n"
            "**Financial impact:** A PF of 0.80 increases apparent consumption "
            "by 19% and may generate ONEE billing penalties."
        ),
    },

    "thd": {
        "fr": (
            "**THD — Taux de Distorsion Harmonique**\n\n"
            "Mesure la déformation de l'onde électrique par rapport à une sinusoïde idéale.\n\n"
            "**Normes industrielles:**\n"
            "- IEC 61000-3-2 : THD tension ≤ 5%\n"
            "- IEC 61000-3-4 : THD courant ≤ 8%\n\n"
            "**Échelle:**\n"
            "- 🟢 THD ≤ 2% → Excellent\n"
            "- ✅ THD ≤ 5% → Normal — conforme aux normes\n"
            "- 🟡 THD 5–8% → Élevé — surveillance renforcée\n"
            "- 🔴 THD > 8% → Critique — filtrage obligatoire\n\n"
            "**Principales causes:**\n"
            "- Variateurs de vitesse (VSD/VFD)\n"
            "- Convertisseurs de fréquence\n"
            "- Alimentations à découpage\n"
            "- Éclairage LED mal filtré\n\n"
            "**Effets d'un THD élevé:**\n"
            "- 🌡️ Échauffement excessif des transformateurs et câbles\n"
            "- ⚡ Pertes d'énergie supplémentaires (2 à 5%)\n"
            "- 🔧 Déclenchement intempestif des protections\n"
            "- 📡 Interférences avec les équipements de mesure\n"
            "- 🔋 Dégradation prématurée des condensateurs\n\n"
            "**Solutions:**\n"
            "- Filtres actifs harmoniques (efficacité > 97%)\n"
            "- Filtres passifs accordés sur les harmoniques dominants\n"
            "- Réactances de ligne sur les variateurs\n"
            "- Transformateurs à isolation renforcée"
        ),
        "en": (
            "**THD — Total Harmonic Distortion**\n\n"
            "Measures electrical waveform distortion from an ideal sine wave.\n\n"
            "**Industrial standards:**\n"
            "- IEC 61000-3-2: Voltage THD ≤ 5%\n"
            "- IEC 61000-3-4: Current THD ≤ 8%\n\n"
            "**Scale:**\n"
            "- 🟢 THD ≤ 2% → Excellent\n"
            "- ✅ THD ≤ 5% → Normal — compliant with standards\n"
            "- 🟡 THD 5–8% → High — enhanced monitoring needed\n"
            "- 🔴 THD > 8% → Critical — filtering required\n\n"
            "**Main causes:**\n"
            "- Variable speed drives (VSD/VFD)\n"
            "- Frequency converters\n"
            "- Switched-mode power supplies\n"
            "- Poorly filtered LED lighting\n\n"
            "**Effects of high THD:**\n"
            "- 🌡️ Excessive transformer and cable heating\n"
            "- ⚡ Additional energy losses (2 to 5%)\n"
            "- 🔧 Nuisance tripping of protective devices\n"
            "- 📡 Interference with measurement equipment\n"
            "- 🔋 Premature capacitor degradation\n\n"
            "**Solutions:**\n"
            "- Active harmonic filters (efficiency > 97%)\n"
            "- Passive filters tuned to dominant harmonics\n"
            "- Line reactors on drives\n"
            "- Reinforced isolation transformers"
        ),
    },

    "voltage": {
        "fr": (
            "**Tension électrique**\n\n"
            "Différence de potentiel entre les conducteurs du réseau industriel.\n\n"
            "**Référence réseau ONEE Maroc:**\n"
            "- Nominale: **230V** (monophasé) / **400V** (triphasé)\n"
            "- Plage normale EN 50160: **207–253V** (±10%)\n"
            "- Seuil d'alarme EMS: < 210V ou > 250V\n\n"
            "**Anomalies et impacts:**\n"
            "- 📉 **Sous-tension** (< 207V):\n"
            "  Surchauffe des moteurs, réduction du couple, "
            "démarrages difficiles, risque de calage\n"
            "- 📈 **Sur-tension** (> 253V):\n"
            "  Dégradation des isolants, claquage des condensateurs, "
            "durée de vie réduite de 30%\n"
            "- ↕️ **Déséquilibre** (> 2% entre phases):\n"
            "  Vibrations mécaniques, surcharge du neutre, "
            "pertes supplémentaires jusqu'à 10%\n\n"
            "**Causes fréquentes:**\n"
            "- Déséquilibre de charge entre les phases\n"
            "- Câblage sous-dimensionné\n"
            "- Éloignement du poste de transformation\n"
            "- Variation de charge sur le réseau ONEE\n\n"
            "**Actions correctives:**\n"
            "- Réglage du changeur de prises du transformateur\n"
            "- Rééquilibrage des charges entre phases\n"
            "- Régulateur de tension automatique (AVR)"
        ),
        "en": (
            "**Voltage**\n\n"
            "Potential difference between industrial network conductors.\n\n"
            "**ONEE Morocco grid reference:**\n"
            "- Nominal: **230V** (single-phase) / **400V** (three-phase)\n"
            "- Normal range EN 50160: **207–253V** (±10%)\n"
            "- EMS alarm threshold: < 210V or > 250V\n\n"
            "**Anomalies and impacts:**\n"
            "- 📉 **Under-voltage** (< 207V):\n"
            "  Motor overheating, reduced torque, difficult starts, stalling risk\n"
            "- 📈 **Over-voltage** (> 253V):\n"
            "  Insulation degradation, capacitor failure, "
            "30% reduced equipment lifespan\n"
            "- ↕️ **Imbalance** (> 2% between phases):\n"
            "  Mechanical vibrations, neutral overload, "
            "up to 10% additional losses\n\n"
            "**Common causes:**\n"
            "- Unbalanced load distribution between phases\n"
            "- Undersized cabling\n"
            "- Distance from transformer substation\n"
            "- Load variation on ONEE grid\n\n"
            "**Corrective actions:**\n"
            "- Transformer tap changer adjustment\n"
            "- Phase load rebalancing\n"
            "- Automatic voltage regulator (AVR)"
        ),
    },

    "frequency": {
        "fr": (
            "**Fréquence du réseau électrique**\n\n"
            "Nombre de cycles par seconde du courant alternatif.\n\n"
            "**Référence ONEE Maroc:**\n"
            "- Nominale: **50 Hz**\n"
            "- Plage normale: **49.5–50.5 Hz** (±1%)\n"
            "- Seuil d'alarme EMS: < 49.5 Hz ou > 50.5 Hz\n\n"
            "**Impact des variations:**\n"
            "- 🔽 **Sous-fréquence** (< 49.5 Hz):\n"
            "  Surcharge du réseau national, risque de délestage, "
            "moteurs asynchrones tournent plus lentement (-2% par Hz perdu)\n"
            "- 🔼 **Sur-fréquence** (> 50.5 Hz):\n"
            "  Génération excédentaire, moteurs accélèrent, "
            "usure prématurée des équipements rotatifs\n\n"
            "**Équipements sensibles:**\n"
            "- Moteurs asynchrones: vitesse proportionnelle à la fréquence\n"
            "- Horloges électroniques: dérivent si fréquence instable\n"
            "- Variateurs de fréquence: peuvent déclencher en protection\n\n"
            "**Causes:**\n"
            "- Perturbations sur le réseau ONEE national\n"
            "- Déséquilibre production/consommation\n"
            "- Défaillance du groupe électrogène de secours"
        ),
        "en": (
            "**Grid Frequency**\n\n"
            "Number of AC cycles per second.\n\n"
            "**ONEE Morocco reference:**\n"
            "- Nominal: **50 Hz**\n"
            "- Normal range: **49.5–50.5 Hz** (±1%)\n"
            "- EMS alarm threshold: < 49.5 Hz or > 50.5 Hz\n\n"
            "**Impact of variations:**\n"
            "- 🔽 **Under-frequency** (< 49.5 Hz):\n"
            "  National grid overload, load shedding risk, "
            "async motors run slower (-2% per Hz lost)\n"
            "- 🔼 **Over-frequency** (> 50.5 Hz):\n"
            "  Excess generation, motors speed up, "
            "premature wear of rotating equipment\n\n"
            "**Sensitive equipment:**\n"
            "- Async motors: speed proportional to frequency\n"
            "- Electronic clocks: drift with unstable frequency\n"
            "- Variable speed drives: may trip on protection\n\n"
            "**Causes:**\n"
            "- Disturbances on the national ONEE grid\n"
            "- Generation/consumption imbalance\n"
            "- Backup generator failure"
        ),
    },

    "co2": {
        "fr": (
            "**Émissions CO₂ — Bilan carbone industriel**\n\n"
            "**Formule de calcul EMS:**\n"
            "CO₂ (kg) = kWh consommés × 0.718\n\n"
            "**Facteur d'émission ONEE Maroc:** 0.718 kgCO₂/kWh\n"
            "(Réseau électrique national — mix énergétique marocain)\n\n"
            "**Équivalences pratiques:**\n"
            "- 1 kg CO₂ = 4.76 km parcourus en voiture thermique\n"
            "- 1 tonne CO₂ = 1 arbre absorbant pendant 21 ans\n"
            "- 1 MWh électrique = 718 kg CO₂ émis\n\n"
            "**Stratégies de réduction:**\n"
            "- ☀️ **Énergie solaire photovoltaïque:** -30 à 50% d'émissions\n"
            "- 💡 **Éclairage LED industriel:** -60 à 70% vs halogène\n"
            "- ⚙️ **Moteurs à haut rendement (IE3/IE4):** -5 à 10%\n"
            "- 📊 **Gestion de la demande:** -10 à 20% sur la pointe\n"
            "- 🌬️ **Ventilation naturelle:** réduction de la climatisation\n\n"
            "**Réglementation:**\n"
            "Le Maroc vise 52% d'énergies renouvelables d'ici 2030.\n"
            "Les industries sont encouragées à réduire leur empreinte carbone\n"
            "dans le cadre de la stratégie nationale énergie-climat."
        ),
        "en": (
            "**CO₂ Emissions — Industrial Carbon Balance**\n\n"
            "**EMS calculation formula:**\n"
            "CO₂ (kg) = kWh consumed × 0.718\n\n"
            "**ONEE Morocco emission factor:** 0.718 kgCO₂/kWh\n"
            "(National electricity grid — Moroccan energy mix)\n\n"
            "**Practical equivalents:**\n"
            "- 1 kg CO₂ = 4.76 km by car\n"
            "- 1 tonne CO₂ = 1 tree absorbing for 21 years\n"
            "- 1 MWh electricity = 718 kg CO₂ emitted\n\n"
            "**Reduction strategies:**\n"
            "- ☀️ **Solar photovoltaic energy:** -30 to 50% emissions\n"
            "- 💡 **Industrial LED lighting:** -60 to 70% vs halogen\n"
            "- ⚙️ **High-efficiency motors (IE3/IE4):** -5 to 10%\n"
            "- 📊 **Demand management:** -10 to 20% on peak\n"
            "- 🌬️ **Natural ventilation:** reduced air conditioning\n\n"
            "**Regulation:**\n"
            "Morocco targets 52% renewable energy by 2030.\n"
            "Industries are encouraged to reduce their carbon footprint\n"
            "as part of the national energy-climate strategy."
        ),
    },

    "sec": {
        "fr": (
            "**SEC — Consommation Énergétique Spécifique**\n\n"
            "Indicateur clé de performance (KPI) mesurant l'efficacité énergétique "
            "de la production industrielle.\n\n"
            "**Formule:** SEC = kWh consommés ÷ unités produites\n\n"
            "**Unités courantes:** kWh/tonne · kWh/unité · kWh/m³ · kWh/tCO₂\n\n"
            "**Interprétation (kWh/tCO₂):**\n"
            "- ✅ < 500 kWh/tCO₂ → Excellent\n"
            "- ⚠️ 500–1000 kWh/tCO₂ → Acceptable\n"
            "- 🔴 > 1000 kWh/tCO₂ → Amélioration nécessaire\n\n"
            "**Utilité du SEC:**\n"
            "- Comparer l'efficacité entre lignes de production\n"
            "- Identifier les équipements énergivores\n"
            "- Mesurer l'impact des actions d'amélioration\n"
            "- Fixer des objectifs de performance énergétique\n"
            "- Benchmarker par rapport au secteur industriel\n\n"
            "**Améliorer le SEC:**\n"
            "- Optimiser les temps de marche (éviter le ralenti)\n"
            "- Améliorer le facteur de puissance\n"
            "- Récupération de chaleur sur les procédés\n"
            "- Automatisation et régulation des équipements"
        ),
        "en": (
            "**SEC — Specific Energy Consumption**\n\n"
            "Key performance indicator (KPI) measuring the energy efficiency "
            "of industrial production.\n\n"
            "**Formula:** SEC = kWh consumed ÷ units produced\n\n"
            "**Common units:** kWh/tonne · kWh/unit · kWh/m³ · kWh/tCO₂\n\n"
            "**Interpretation (kWh/tCO₂):**\n"
            "- ✅ < 500 kWh/tCO₂ → Excellent\n"
            "- ⚠️ 500–1000 kWh/tCO₂ → Acceptable\n"
            "- 🔴 > 1000 kWh/tCO₂ → Improvement needed\n\n"
            "**SEC usefulness:**\n"
            "- Compare efficiency between production lines\n"
            "- Identify energy-intensive equipment\n"
            "- Measure impact of improvement actions\n"
            "- Set energy performance targets\n"
            "- Benchmark against industry sector\n\n"
            "**Improving SEC:**\n"
            "- Optimize running times (avoid idle running)\n"
            "- Improve power factor\n"
            "- Heat recovery from processes\n"
            "- Automation and equipment regulation"
        ),
    },

    "onee": {
        "fr": (
            "**ONEE — Office National de l'Électricité et de l'Eau Potable**\n\n"
            "Fournisseur national d'électricité au Maroc — gestionnaire du réseau.\n\n"
            "**Tarifs industriels ONEE (indicatifs 2024):**\n"
            "- 🔴 Heures de pointe (7h–9h · 12h–15h · 18h–22h): **~1.628 MAD/kWh**\n"
            "- 🟡 Heures pleines (reste de la journée): **~1.214 MAD/kWh**\n"
            "- 🟢 Heures creuses (22h–6h + weekend): **~0.836 MAD/kWh**\n"
            "- Tarif moyen appliqué dans l'EMS: **1.40 MAD/kWh**\n\n"
            "**Pénalités sur le facteur de puissance:**\n"
            "- FP < 0.85 → majoration de 2 à 5% sur la facture mensuelle\n"
            "- FP < 0.80 → majoration pouvant atteindre 10%\n\n"
            "**Paramètres réseau ONEE:**\n"
            "- Tension nominale: 230V (mono) / 400V (tri)\n"
            "- Fréquence: 50 Hz\n"
            "- Facteur CO₂: 0.718 kgCO₂/kWh\n\n"
            "**Conseil:** Maximiser la consommation en heures creuses "
            "pour réduire la facture jusqu'à 40%."
        ),
        "en": (
            "**ONEE — National Electricity and Water Office (Morocco)**\n\n"
            "Morocco's national electricity provider — grid operator.\n\n"
            "**ONEE industrial tariffs (indicative 2024):**\n"
            "- 🔴 Peak hours (7am–9am · 12pm–3pm · 6pm–10pm): **~1.628 MAD/kWh**\n"
            "- 🟡 Full hours (rest of the day): **~1.214 MAD/kWh**\n"
            "- 🟢 Off-peak (10pm–6am + weekends): **~0.836 MAD/kWh**\n"
            "- EMS average rate applied: **1.40 MAD/kWh**\n\n"
            "**Power factor penalties:**\n"
            "- PF < 0.85 → 2 to 5% surcharge on monthly bill\n"
            "- PF < 0.80 → surcharge up to 10%\n\n"
            "**ONEE grid parameters:**\n"
            "- Nominal voltage: 230V (single) / 400V (three-phase)\n"
            "- Frequency: 50 Hz\n"
            "- CO₂ factor: 0.718 kgCO₂/kWh\n\n"
            "**Tip:** Maximize consumption during off-peak hours "
            "to reduce electricity bill by up to 40%."
        ),
    },

    "energy_audit": {
        "fr": (
            "**Audit Énergétique Industriel**\n\n"
            "Démarche systématique d'identification des gisements d'économies d'énergie.\n\n"
            "**Étapes d'un audit:**\n"
            "1. 📊 Collecte des données de consommation (historique 12 mois)\n"
            "2. 🔍 Analyse des postes consommateurs (moteurs, HVAC, éclairage)\n"
            "3. 📐 Mesures sur site (puissance, FP, tension, THD)\n"
            "4. 💡 Identification des actions d'amélioration\n"
            "5. 💰 Calcul du retour sur investissement (ROI)\n"
            "6. 📋 Plan d'action priorisé\n\n"
            "**Principaux postes énergivores en industrie:**\n"
            "- Moteurs électriques: 60–70% de la consommation totale\n"
            "- Système de compression d'air: 10–20%\n"
            "- Éclairage: 5–15%\n"
            "- HVAC (chauffage/climatisation): 5–10%\n"
            "- Procédés thermiques: variable\n\n"
            "**Potentiel d'économies typique:**\n"
            "- Court terme (< 1 an): 5–15% sans investissement\n"
            "- Moyen terme (1–3 ans): 15–25% avec investissement modéré\n"
            "- Long terme (> 3 ans): 25–40% avec investissement lourd"
        ),
        "en": (
            "**Industrial Energy Audit**\n\n"
            "Systematic approach to identifying energy savings opportunities.\n\n"
            "**Audit steps:**\n"
            "1. 📊 Consumption data collection (12-month history)\n"
            "2. 🔍 Consumer analysis (motors, HVAC, lighting)\n"
            "3. 📐 On-site measurements (power, PF, voltage, THD)\n"
            "4. 💡 Improvement action identification\n"
            "5. 💰 Return on investment (ROI) calculation\n"
            "6. 📋 Prioritized action plan\n\n"
            "**Main energy consumers in industry:**\n"
            "- Electric motors: 60–70% of total consumption\n"
            "- Compressed air system: 10–20%\n"
            "- Lighting: 5–15%\n"
            "- HVAC: 5–10%\n"
            "- Thermal processes: variable\n\n"
            "**Typical savings potential:**\n"
            "- Short term (< 1 year): 5–15% without investment\n"
            "- Medium term (1–3 years): 15–25% with moderate investment\n"
            "- Long term (> 3 years): 25–40% with major investment"
        ),
    },

    "power_quality": {
        "fr": (
            "**Qualité de l'Énergie Électrique**\n\n"
            "Ensemble des paramètres électriques définissant la fiabilité "
            "et l'efficacité de l'alimentation industrielle.\n\n"
            "**Paramètres surveillés:**\n"
            "- **Tension (V):** doit être stable autour du nominal\n"
            "- **Fréquence (Hz):** doit rester à 50 Hz ±1%\n"
            "- **Facteur de puissance:** doit être ≥ 0.90\n"
            "- **THD (%):** doit rester < 5% (tension)\n"
            "- **Déséquilibre de tension:** doit être < 2%\n"
            "- **Creux de tension:** durée et profondeur\n"
            "- **Surtensions transitoires:** pics et impulsions\n\n"
            "**Impacts d'une mauvaise qualité:**\n"
            "- Défaillances prématurées des équipements\n"
            "- Pertes de production non planifiées\n"
            "- Surchauffe des transformateurs\n"
            "- Erreurs dans les systèmes de contrôle\n"
            "- Augmentation des coûts de maintenance\n\n"
            "**Normes de référence:**\n"
            "- EN 50160: Caractéristiques tension réseaux\n"
            "- IEC 61000: Compatibilité électromagnétique\n"
            "- IEEE 519: Niveaux harmoniques recommandés"
        ),
        "en": (
            "**Power Quality**\n\n"
            "Set of electrical parameters defining the reliability "
            "and efficiency of industrial power supply.\n\n"
            "**Monitored parameters:**\n"
            "- **Voltage (V):** must be stable around nominal\n"
            "- **Frequency (Hz):** must stay at 50 Hz ±1%\n"
            "- **Power factor:** must be ≥ 0.90\n"
            "- **THD (%):** must stay < 5% (voltage)\n"
            "- **Voltage imbalance:** must be < 2%\n"
            "- **Voltage dips:** duration and depth\n"
            "- **Transient overvoltages:** peaks and pulses\n\n"
            "**Impacts of poor quality:**\n"
            "- Premature equipment failures\n"
            "- Unplanned production losses\n"
            "- Transformer overheating\n"
            "- Errors in control systems\n"
            "- Increased maintenance costs\n\n"
            "**Reference standards:**\n"
            "- EN 50160: Voltage characteristics of networks\n"
            "- IEC 61000: Electromagnetic compatibility\n"
            "- IEEE 519: Recommended harmonic levels"
        ),
    },

    "maintenance": {
        "fr": (
            "**Maintenance Préventive Énergétique**\n\n"
            "Programme de maintenance visant à maintenir l'efficacité "
            "énergétique des équipements industriels.\n\n"
            "**Actions préventives recommandées:**\n\n"
            "**Moteurs électriques (tous les 6 mois):**\n"
            "- Vérification des isolements (mégohmmétrie)\n"
            "- Contrôle des roulements (vibrations, température)\n"
            "- Nettoyage des grilles de ventilation\n"
            "- Mesure du courant et vérification de la charge\n\n"
            "**Transformateurs (annuellement):**\n"
            "- Analyse de l'huile diélectrique\n"
            "- Contrôle des connexions et des bornes\n"
            "- Vérification des protections\n"
            "- Mesure des résistances d'enroulements\n\n"
            "**Tableaux électriques (tous les 6 mois):**\n"
            "- Thermographie infrarouge des connexions\n"
            "- Vérification du serrage des borniers\n"
            "- Test des disjoncteurs et relais\n\n"
            "**Batteries de condensateurs (annuellement):**\n"
            "- Mesure de la capacité réelle\n"
            "- Vérification des fusibles\n"
            "- Contrôle du régulateur automatique"
        ),
        "en": (
            "**Energy Preventive Maintenance**\n\n"
            "Maintenance program aimed at maintaining the energy "
            "efficiency of industrial equipment.\n\n"
            "**Recommended preventive actions:**\n\n"
            "**Electric motors (every 6 months):**\n"
            "- Insulation check (megohmmeter)\n"
            "- Bearing control (vibrations, temperature)\n"
            "- Ventilation grille cleaning\n"
            "- Current measurement and load verification\n\n"
            "**Transformers (annually):**\n"
            "- Dielectric oil analysis\n"
            "- Connection and terminal control\n"
            "- Protection verification\n"
            "- Winding resistance measurement\n\n"
            "**Electrical panels (every 6 months):**\n"
            "- Infrared thermography of connections\n"
            "- Terminal block tightening check\n"
            "- Circuit breaker and relay testing\n\n"
            "**Capacitor banks (annually):**\n"
            "- Actual capacitance measurement\n"
            "- Fuse verification\n"
            "- Automatic controller check"
        ),
    },
}


# ─── Moteur de réponse ────────────────────────────────────────────────────────

def respond(question: str, context: dict) -> str:
    q   = norm(question)
    fr  = is_fr(q)
    lng = "fr" if fr else "en"

    energies = context.get("energies", []) or []
    line     = context.get("selectedLineLabel", "Production Line 1")
    pf_ctx   = context.get("avgPowerFactor")
    v_ctx    = context.get("avgVoltage")
    peak     = safe_float(context.get("peakKw", 0))
    co2_ctx  = safe_float(context.get("totalCo2", 0))
    cost_ctx = safe_float(context.get("totalCost", 0))
    page     = context.get("activePage", "dashboard")
    urgent   = int(context.get("urgentCount", 0) or 0)

    kw    = total_kw(energies)
    cost  = cost_ctx or total_cost_fn(energies)
    co2   = total_co2_fn(energies, co2_ctx)
    kwhe  = get_kwh_energy(energies)
    kwh   = safe_float(kwhe.get("value") if kwhe else 0)
    pf    = safe_float(pf_ctx) if pf_ctx else None
    volt  = safe_float(v_ctx)  if v_ctx  else None

    thd_val = next(
        (safe_float(get_raw(e,"thd") or e.get("thd"))
         for e in energies if (get_raw(e,"thd") or e.get("thd")) is not None),
        None
    )
    freq_val = next(
        (safe_float(get_raw(e,"frequency") or e.get("frequency"))
         for e in energies if (get_raw(e,"frequency") or e.get("frequency")) is not None),
        None
    )

    score = efficiency_score(pf, volt, peak, thd_val)

    # ── Salutations ──────────────────────────────────────────────────────────
    if has(q,"hello","bonjour","salut","hi","hey","bonsoir","good morning","salam"):
        anomalies = []
        if pf and pf < 0.85:
            anomalies.append(f"⚠️ FP bas ({pf:.3f})" if fr else f"⚠️ Low PF ({pf:.3f})")
        if volt and (volt < 210 or volt > 250):
            anomalies.append(f"⚠️ Tension anormale ({volt:.1f}V)" if fr
                             else f"⚠️ Abnormal voltage ({volt:.1f}V)")
        if thd_val and thd_val > 5:
            anomalies.append(f"⚠️ THD élevé ({thd_val:.1f}%)" if fr
                             else f"⚠️ High THD ({thd_val:.1f}%)")
        alert = (f"\n🚨 **Alertes actives:** {', '.join(anomalies)}" if anomalies
                 else "\n✅ Tous les paramètres dans les plages normales" if fr
                 else "\n✅ All parameters within normal ranges")
        if fr:
            return (
                f"👋 **Bonjour!** Assistant Énergie JESA — {line}\n\n"
                f"📊 **Résumé temps réel:**\n"
                f"- ⚡ Puissance: **{kw} kW** (pic: {peak} kW)\n"
                f"- 💰 Coût: **{cost:.2f} MAD**\n"
                f"- 🌱 CO₂: **{co2:.2f} kg**\n"
                f"- 🏆 Efficacité: **{score}%**"
                f"{alert}\n\n"
                f"Posez-moi n'importe quelle question sur l'énergie!"
            )
        return (
            f"👋 **Hello!** Energy Assistant JESA — {line}\n\n"
            f"📊 **Real-time summary:**\n"
            f"- ⚡ Power: **{kw} kW** (peak: {peak} kW)\n"
            f"- 💰 Cost: **{cost:.2f} MAD**\n"
            f"- 🌱 CO₂: **{co2:.2f} kg**\n"
            f"- 🏆 Efficiency: **{score}%**"
            f"{alert}\n\n"
            f"Ask me anything about energy!"
        )

    # ── Statut général ───────────────────────────────────────────────────────
    if has(q,"status","statut","overview","vue ensemble","summary","resume",
           "bilan","tout","all","general","analyse","complet","full"):
        items = [f"⚡ Puissance: **{kw} kW** | Pic: **{peak} kW**" if fr
                 else f"⚡ Power: **{kw} kW** | Peak: **{peak} kW**"]
        if volt:
            items.append(f"🔌 Tension: **{volt:.1f} V** {v_status(volt)}")
        if pf:
            items.append(f"📐 Facteur puissance: **{pf:.3f}** {pf_status(pf)}" if fr
                         else f"📐 Power factor: **{pf:.3f}** {pf_status(pf)}")
        if freq_val:
            items.append(f"〰️ Fréquence: **{freq_val:.2f} Hz** {freq_status(freq_val)}" if fr
                         else f"〰️ Frequency: **{freq_val:.2f} Hz** {freq_status(freq_val)}")
        if thd_val is not None:
            items.append(f"📡 THD tension: **{thd_val:.1f}%** {thd_status(thd_val)}" if fr
                         else f"📡 Voltage THD: **{thd_val:.1f}%** {thd_status(thd_val)}")
        items.append(f"💰 Coût: **{cost:.2f} MAD** (1.40 MAD/kWh ONEE)" if fr
                     else f"💰 Cost: **{cost:.2f} MAD** (1.40 MAD/kWh ONEE)")
        items.append(f"🌱 CO₂: **{co2:.2f} kg** (0.718 kgCO₂/kWh)")
        if kwh:
            km, trees, phones = co2_equivalents(co2)
            items.append(f"🚗 Équivalent: {km} km voiture | {trees} arbres/an" if fr
                         else f"🚗 Equivalent: {km} km by car | {trees} trees/year")
        items.append(f"🏆 Score efficacité: **{score}%**" if fr
                     else f"🏆 Efficiency score: **{score}%**")
        header = f"**Bilan complet — {line}**\n\n" if fr else f"**Full status — {line}**\n\n"
        return header + "\n".join(f"- {i}" for i in items)

    # ── Coût ─────────────────────────────────────────────────────────────────
    if has(q,"cost","cout","coet","prix","price","tarif","mad","dirham",
           "money","argent","depense","facture","bill","combien","how much"):
        monthly = round(cost * 24 * 30, 0)
        annual  = round(cost * 24 * 365, 0)
        if fr:
            out = [f"**Coût énergétique — {line}**\n"]
            out.append(f"- Valeur actuelle: **{cost:.2f} MAD**")
            out.append(f"- Tarif ONEE moyen: **1.40 MAD/kWh**")
            out.append(f"- Projection mensuelle: **~{monthly:,.0f} MAD/mois**")
            out.append(f"- Projection annuelle: **~{annual:,.0f} MAD/an**")
            if energies:
                out.append("\n**Détail par énergie:**")
                for e in energies:
                    n2 = e.get("energy_name") or e.get("name","?")
                    if "co2" in norm(n2): continue
                    c2 = safe_float(e.get("cost"))
                    v2 = safe_float(e.get("value"))
                    u2 = e.get("unit","")
                    out.append(f"- {n2}: **{c2:.2f} MAD** ({v2:.2f} {u2})")
            out.append(f"\n💡 Économisez jusqu'à 40% en décalant les charges en heures creuses (22h–6h).")
        else:
            out = [f"**Energy cost — {line}**\n"]
            out.append(f"- Current value: **{cost:.2f} MAD**")
            out.append(f"- ONEE average rate: **1.40 MAD/kWh**")
            out.append(f"- Monthly projection: **~{monthly:,.0f} MAD/month**")
            out.append(f"- Annual projection: **~{annual:,.0f} MAD/year**")
            if energies:
                out.append("\n**Breakdown by energy:**")
                for e in energies:
                    n2 = e.get("energy_name") or e.get("name","?")
                    if "co2" in norm(n2): continue
                    c2 = safe_float(e.get("cost"))
                    v2 = safe_float(e.get("value"))
                    u2 = e.get("unit","")
                    out.append(f"- {n2}: **{c2:.2f} MAD** ({v2:.2f} {u2})")
            out.append(f"\n💡 Save up to 40% by shifting loads to off-peak hours (10pm–6am).")
        return "\n".join(out)

    # ── CO₂ ──────────────────────────────────────────────────────────────────
    if has(q,"co2","carbone","carbon","emission","co₂","greenhouse","serre",
           "empreinte","footprint","vert","green","climat","climate"):
        km, trees, phones = co2_equivalents(co2)
        reduction_solar = round(co2 * 0.35, 2)
        if fr:
            return (
                f"**Émissions CO₂ — {line}**\n\n"
                f"- CO₂ actuel: **{co2:.2f} kg**\n"
                f"- kWh consommés: **{kwh:.2f} kWh**\n"
                f"- Facteur ONEE Maroc: **0.718 kgCO₂/kWh**\n\n"
                f"**Équivalences:**\n"
                f"- 🚗 {km} km parcourus en voiture thermique\n"
                f"- 🌳 {trees} arbres nécessaires pour absorber ce CO₂\n"
                f"- 📱 {phones:,} charges complètes de smartphone\n\n"
                f"**Réduction potentielle:**\n"
                f"- ☀️ Installation solaire PV → éviter **{reduction_solar:.2f} kg CO₂** (-35%)\n"
                f"- 💡 Passage LED industriel → -60 à 70% sur éclairage\n"
                f"- ⚙️ Moteurs IE3/IE4 → -5 à 10% sur consommation moteurs"
            )
        return (
            f"**CO₂ Emissions — {line}**\n\n"
            f"- Current CO₂: **{co2:.2f} kg**\n"
            f"- kWh consumed: **{kwh:.2f} kWh**\n"
            f"- ONEE Morocco factor: **0.718 kgCO₂/kWh**\n\n"
            f"**Equivalents:**\n"
            f"- 🚗 {km} km driven by car\n"
            f"- 🌳 {trees} trees needed to absorb this CO₂\n"
            f"- 📱 {phones:,} complete smartphone charges\n\n"
            f"**Potential reduction:**\n"
            f"- ☀️ Solar PV installation → avoid **{reduction_solar:.2f} kg CO₂** (-35%)\n"
            f"- 💡 Industrial LED switch → -60 to 70% on lighting\n"
            f"- ⚙️ IE3/IE4 motors → -5 to 10% on motor consumption"
        )

    # ── Facteur de puissance ──────────────────────────────────────────────────
    if has(q,"power factor","facteur puissance","facteur de puissance",
           "cos phi","cos φ","pf","reactive","reactif","kvar",
           "condensateur","capacitor","compensation"):
        if pf:
            status = pf_status(pf)
            sav    = savings_from_pf(pf, 0.95, peak)
            advice = ""
            if pf < 0.95 and peak > 0:
                try:
                    kvar = round(peak*(math.sqrt(1-pf**2)/pf - math.sqrt(1-0.95**2)/0.95),1)
                except: kvar = 0
                sav_y = round(sav*24*365, 0)
                if fr:
                    advice = (
                        f"\n\n**Action recommandée:**\n"
                        f"- Installer une batterie de condensateurs de **{kvar} kVAR**\n"
                        f"- Économies: **{sav:.2f} MAD/h** → **~{sav_y:,.0f} MAD/an**\n"
                        f"- Évite les pénalités ONEE sur la facture mensuelle"
                    )
                else:
                    advice = (
                        f"\n\n**Recommended action:**\n"
                        f"- Install **{kvar} kVAR** capacitor bank\n"
                        f"- Savings: **{sav:.2f} MAD/h** → **~{sav_y:,.0f} MAD/year**\n"
                        f"- Avoids ONEE penalties on monthly bill"
                    )
            if fr:
                return (
                    f"**Facteur de Puissance — {line}**\n\n"
                    f"- Valeur actuelle: **{pf:.3f}** ({status})\n"
                    f"- Cible industrielle ONEE: ≥ 0.90\n"
                    f"- Alarme déclenchée: < 0.85\n"
                    f"- Score: **{pf*100:.1f}%**"
                    f"{advice}"
                )
            return (
                f"**Power Factor — {line}**\n\n"
                f"- Current value: **{pf:.3f}** ({status})\n"
                f"- ONEE industrial target: ≥ 0.90\n"
                f"- Alarm triggered: < 0.85\n"
                f"- Score: **{pf*100:.1f}%**"
                f"{advice}"
            )
        return KNOWLEDGE["power_factor"][lng]

    # ── Tension ──────────────────────────────────────────────────────────────
    if has(q,"voltage","tension","volt","under voltage","over voltage",
           "sous tension","sur tension","surtension"):
        if volt:
            status = v_status(volt)
            dev    = abs(volt - 230)
            advice = ""
            if volt < 210 or volt > 250:
                if fr: advice = "\n\n⚠️ **Action requise:** Contacter l'équipe électrique — régler le transformateur."
                else:  advice = "\n\n⚠️ **Action required:** Contact electrical team — adjust transformer."
            if fr:
                return (
                    f"**Tension — {line}**\n\n"
                    f"- Valeur actuelle: **{volt:.1f} V** ({status})\n"
                    f"- Nominale ONEE: 230V | Plage normale: 207–253V\n"
                    f"- Écart depuis nominale: **{dev:.1f} V**"
                    f"{advice}"
                )
            return (
                f"**Voltage — {line}**\n\n"
                f"- Current value: **{volt:.1f} V** ({status})\n"
                f"- ONEE nominal: 230V | Normal range: 207–253V\n"
                f"- Deviation from nominal: **{dev:.1f} V**"
                f"{advice}"
            )
        return KNOWLEDGE["voltage"][lng]

    # ── THD ──────────────────────────────────────────────────────────────────
    if has(q,"thd","harmonic","harmonique","distortion","distorsion",
           "filtre","filter","harmonics"):
        if thd_val is not None:
            status = thd_status(thd_val)
            if fr:
                return (
                    f"**THD Tension — {line}**\n\n"
                    f"- Valeur actuelle: **{thd_val:.1f}%** ({status})\n"
                    f"- Limite IEC 61000: 5% (tension)\n"
                    + (f"\n⚠️ **THD élevé!** Prévoir l'installation de filtres actifs harmoniques." if thd_val > 5 else "")
                )
            return (
                f"**Voltage THD — {line}**\n\n"
                f"- Current value: **{thd_val:.1f}%** ({status})\n"
                f"- IEC 61000 limit: 5% (voltage)\n"
                + (f"\n⚠️ **High THD!** Plan installation of active harmonic filters." if thd_val > 5 else "")
            )
        return KNOWLEDGE["thd"][lng]

    # ── Fréquence ─────────────────────────────────────────────────────────────
    if has(q,"frequency","frequence","hz","hertz","50hz","50 hz"):
        if freq_val:
            status = freq_status(freq_val)
            if fr:
                return (
                    f"**Fréquence — {line}**\n\n"
                    f"- Valeur actuelle: **{freq_val:.2f} Hz** ({status})\n"
                    f"- Nominale ONEE: 50 Hz | Plage normale: 49.5–50.5 Hz"
                    + (f"\n\n⚠️ **Fréquence anormale!** Vérifier l'alimentation réseau ONEE." if freq_val < 49.5 or freq_val > 50.5 else "")
                )
            return (
                f"**Frequency — {line}**\n\n"
                f"- Current value: **{freq_val:.2f} Hz** ({status})\n"
                f"- ONEE nominal: 50 Hz | Normal range: 49.5–50.5 Hz"
                + (f"\n\n⚠️ **Abnormal frequency!** Check ONEE grid supply." if freq_val < 49.5 or freq_val > 50.5 else "")
            )
        return KNOWLEDGE["frequency"][lng]

    # ── Puissance ────────────────────────────────────────────────────────────
    if has(q,"power","puissance","kw","consumption","consommation",
           "demand","demande","watt","kilowatt","active"):
        kw_list = get_kw_energies(energies)
        if fr:
            out = [f"**Puissance active — {line}**\n"]
            out.append(f"- Total: **{kw} kW**")
            out.append(f"- Pic enregistré: **{peak} kW**")
            if kw_list:
                out.append("\n**Par équipement:**")
                for e in kw_list:
                    eq = get_raw(e,"equipment") or e.get("equipment","—")
                    out.append(f"- {eq}: **{safe_float(e.get('value')):.2f} kW**")
            if peak > 400:
                out.append(f"\n⚠️ Pic > 400 kW — Décaler les démarrages en heures creuses pour réduire la facture.")
        else:
            out = [f"**Active power — {line}**\n"]
            out.append(f"- Total: **{kw} kW**")
            out.append(f"- Recorded peak: **{peak} kW**")
            if kw_list:
                out.append("\n**Per equipment:**")
                for e in kw_list:
                    eq = get_raw(e,"equipment") or e.get("equipment","—")
                    out.append(f"- {eq}: **{safe_float(e.get('value')):.2f} kW**")
            if peak > 400:
                out.append(f"\n⚠️ Peak > 400 kW — Shift startups to off-peak hours to reduce billing.")
        return "\n".join(out)

    # ── kWh ──────────────────────────────────────────────────────────────────
    if has(q,"kwh","energy consumed","energie consommee","cumulative",
           "cumul","total energy","energie totale","energie active"):
        if kwh:
            co2_kwh  = round(kwh * 0.718, 2)
            cost_kwh = round(kwh * 1.40, 2)
            monthly  = round(kwh * 24 * 30, 0)
            if fr:
                return (
                    f"**Énergie cumulée — {line}**\n\n"
                    f"- kWh consommés: **{kwh:.2f} kWh**\n"
                    f"- CO₂ généré: **{co2_kwh:.2f} kg** (× 0.718 ONEE)\n"
                    f"- Coût correspondant: **{cost_kwh:.2f} MAD** (× 1.40 MAD/kWh)\n\n"
                    f"Projection mensuelle: **~{monthly:,.0f} kWh/mois**"
                )
            return (
                f"**Cumulative energy — {line}**\n\n"
                f"- kWh consumed: **{kwh:.2f} kWh**\n"
                f"- CO₂ generated: **{co2_kwh:.2f} kg** (× 0.718 ONEE)\n"
                f"- Corresponding cost: **{cost_kwh:.2f} MAD** (× 1.40 MAD/kWh)\n\n"
                f"Monthly projection: **~{monthly:,.0f} kWh/month**"
            )

    # ── Alarmes ──────────────────────────────────────────────────────────────
    if has(q,"alarm","alerte","alert","warning","anomal","problem",
           "issue","danger","risk","risque","defaut","fault","anomalie"):
        issues, ok = [], []
        if pf:
            if pf < 0.85:
                issues.append(f"🔴 **FP CRITIQUE:** {pf:.3f} < 0.85 — Risque pénalités ONEE" if fr
                              else f"🔴 **CRITICAL PF:** {pf:.3f} < 0.85 — ONEE penalty risk")
            elif pf < 0.90:
                issues.append(f"🟡 **FP BAS:** {pf:.3f} < 0.90 — Amélioration recommandée" if fr
                              else f"🟡 **LOW PF:** {pf:.3f} < 0.90 — Improvement recommended")
            else:
                ok.append(f"✅ Facteur puissance: {pf:.3f}" if fr else f"✅ Power factor: {pf:.3f}")
        if volt:
            if volt < 210 or volt > 250:
                issues.append(f"🔴 **TENSION ANORMALE:** {volt:.1f}V hors [210–250V]" if fr
                              else f"🔴 **ABNORMAL VOLTAGE:** {volt:.1f}V outside [210–250V]")
            else:
                ok.append(f"✅ Tension: {volt:.1f}V" if fr else f"✅ Voltage: {volt:.1f}V")
        if freq_val:
            if freq_val < 49.5 or freq_val > 50.5:
                issues.append(f"🔴 **FRÉQUENCE ANORMALE:** {freq_val:.2f}Hz hors [49.5–50.5Hz]" if fr
                              else f"🔴 **ABNORMAL FREQUENCY:** {freq_val:.2f}Hz outside [49.5–50.5Hz]")
            else:
                ok.append(f"✅ Fréquence: {freq_val:.2f}Hz" if fr else f"✅ Frequency: {freq_val:.2f}Hz")
        if thd_val is not None:
            if thd_val > 8:
                issues.append(f"🔴 **THD CRITIQUE:** {thd_val:.1f}% > 8% — Filtrage requis" if fr
                              else f"🔴 **CRITICAL THD:** {thd_val:.1f}% > 8% — Filtering required")
            elif thd_val > 5:
                issues.append(f"🟡 **THD ÉLEVÉ:** {thd_val:.1f}% > 5% — Surveillance renforcée" if fr
                              else f"🟡 **HIGH THD:** {thd_val:.1f}% > 5% — Enhanced monitoring")
            else:
                ok.append(f"✅ THD: {thd_val:.1f}%")
        if peak > 500:
            issues.append(f"🔴 **SURCONSOMMATION:** {peak:.1f}kW > 500kW" if fr
                          else f"🔴 **OVERCONSUMPTION:** {peak:.1f}kW > 500kW")
        elif peak > 400:
            issues.append(f"🟡 **PIC ÉLEVÉ:** {peak:.1f}kW > 400kW" if fr
                          else f"🟡 **HIGH PEAK:** {peak:.1f}kW > 400kW")
        else:
            ok.append(f"✅ Puissance: {peak:.1f}kW" if fr else f"✅ Power: {peak:.1f}kW")

        if not issues:
            return (
                f"✅ **Aucune alarme — {line}**\n\n"
                + "\n".join(f"- {o}" for o in ok) +
                "\n\nTous les paramètres énergétiques sont normaux." if fr
                else
                f"✅ **No alarms — {line}**\n\n"
                + "\n".join(f"- {o}" for o in ok) +
                "\n\nAll energy parameters are normal."
            )
        header = f"**⚠️ {len(issues)} anomalie(s) — {line}**\n\n" if fr else f"**⚠️ {len(issues)} anomaly(ies) — {line}**\n\n"
        result = header + "\n".join(issues)
        if ok:
            result += ("\n\n**Paramètres normaux:**\n" if fr else "\n\n**Normal parameters:**\n") + "\n".join(f"- {o}" for o in ok)
        return result

    # ── Recommandations ──────────────────────────────────────────────────────
    if has(q,"recommend","recommand","improve","ameliorer","optimis",
           "suggestion","advice","conseil","save","economiser","reduce",
           "reduire","what should","que faire","how to reduce","comment"):
        recs   = []
        totals = []
        if pf and pf < 0.95:
            sav   = savings_from_pf(pf, 0.95, peak)
            sav_y = round(sav * 24 * 365, 0)
            try:
                kvar = round(peak*(math.sqrt(1-pf**2)/pf - math.sqrt(1-0.95**2)/0.95),1) if peak else 0
            except: kvar = 0
            if fr:
                recs.append(
                    f"⚡ **Améliorer le facteur de puissance** ({pf:.3f} → 0.95)\n"
                    f"   • Installer une batterie de condensateurs: **{kvar} kVAR**\n"
                    f"   • Économies: **{sav:.2f} MAD/h** → **{sav_y:,.0f} MAD/an**\n"
                    f"   • Élimination des pénalités ONEE sur la facture"
                )
            else:
                recs.append(
                    f"⚡ **Improve power factor** ({pf:.3f} → 0.95)\n"
                    f"   • Install capacitor bank: **{kvar} kVAR**\n"
                    f"   • Savings: **{sav:.2f} MAD/h** → **{sav_y:,.0f} MAD/year**\n"
                    f"   • Elimination of ONEE billing penalties"
                )
            totals.append(sav_y)

        if volt and (volt < 215 or volt > 245):
            if fr:
                recs.append(
                    f"🔌 **Corriger la tension** ({volt:.1f}V → 225–235V)\n"
                    f"   • Régler le changeur de prises du transformateur\n"
                    f"   • Rééquilibrer les charges entre phases\n"
                    f"   • Prolonge la durée de vie des équipements de +20%"
                )
            else:
                recs.append(
                    f"🔌 **Correct voltage** ({volt:.1f}V → 225–235V)\n"
                    f"   • Adjust transformer tap changer\n"
                    f"   • Rebalance loads between phases\n"
                    f"   • Extends equipment lifespan by +20%"
                )

        if thd_val and thd_val > 5:
            saving_thd = round(kw * 0.03 * 1.40 * 24 * 30, 0)
            if fr:
                recs.append(
                    f"📡 **Réduire le THD** ({thd_val:.1f}% → < 5%)\n"
                    f"   • Installer des filtres actifs harmoniques\n"
                    f"   • Réduction des pertes: ~3% de la consommation\n"
                    f"   • Économies estimées: **~{saving_thd:,.0f} MAD/mois**"
                )
            else:
                recs.append(
                    f"📡 **Reduce THD** ({thd_val:.1f}% → < 5%)\n"
                    f"   • Install active harmonic filters\n"
                    f"   • Loss reduction: ~3% of consumption\n"
                    f"   • Estimated savings: **~{saving_thd:,.0f} MAD/month**"
                )

        if peak > 400:
            off_peak = round((peak-400)*1.40*0.4*24*30, 0)
            if fr:
                recs.append(
                    f"📉 **Gérer le pic de demande** ({peak:.1f} kW)\n"
                    f"   • Échelonner les démarrages de moteurs en heures creuses (22h–6h)\n"
                    f"   • Économies tarifaires ONEE: **~{off_peak:,.0f} MAD/mois**\n"
                    f"   • Réduire la puissance souscrite au contrat"
                )
            else:
                recs.append(
                    f"📉 **Manage peak demand** ({peak:.1f} kW)\n"
                    f"   • Stagger motor startups during off-peak hours (10pm–6am)\n"
                    f"   • ONEE tariff savings: **~{off_peak:,.0f} MAD/month**\n"
                    f"   • Reduce subscribed power in contract"
                )

        if co2 > 10:
            if fr:
                recs.append(
                    f"🌱 **Réduire l'empreinte carbone** ({co2:.1f} kg CO₂)\n"
                    f"   • Énergie solaire PV: éviter {co2*0.35:.1f} kg CO₂ (-35%)\n"
                    f"   • Éclairage LED industriel: -60 à 70% sur poste éclairage\n"
                    f"   • Moteurs IE3/IE4: -5 à 10% sur consommation moteurs"
                )
            else:
                recs.append(
                    f"🌱 **Reduce carbon footprint** ({co2:.1f} kg CO₂)\n"
                    f"   • Solar PV: avoid {co2*0.35:.1f} kg CO₂ (-35%)\n"
                    f"   • Industrial LED lighting: -60 to 70% on lighting\n"
                    f"   • IE3/IE4 motors: -5 to 10% on motor consumption"
                )

        if not recs:
            return (
                f"✅ **Système optimal — {line}!**\n\n"
                f"Score d'efficacité: **{score}%**\n\n"
                f"Tous les paramètres sont dans les plages cibles.\n"
                f"Continuer la maintenance préventive régulière." if fr
                else
                f"✅ **Optimal system — {line}!**\n\n"
                f"Efficiency score: **{score}%**\n\n"
                f"All parameters within target ranges.\n"
                f"Continue regular preventive maintenance."
            )

        header = f"**Recommandations — {line}**\n\n" if fr else f"**Recommendations — {line}**\n\n"
        result = header + "\n\n".join(f"{i+1}. {r}" for i,r in enumerate(recs))
        if totals:
            t = sum(totals)
            result += (f"\n\n💰 **Économies totales estimées: ~{t:,.0f} MAD/an**" if fr
                       else f"\n\n💰 **Total estimated savings: ~{t:,.0f} MAD/year**")
        return result

    # ── Qualité énergie ───────────────────────────────────────────────────────
    if has(q,"quality","qualite","power quality","qualite energie",
           "qualite electrique","electrical quality"):
        return KNOWLEDGE["power_quality"][lng]

    # ── Maintenance ──────────────────────────────────────────────────────────
    if has(q,"maintenance","preventive","preventif","entretien",
           "inspection","verification","check"):
        return KNOWLEDGE["maintenance"][lng]

    # ── Audit ────────────────────────────────────────────────────────────────
    if has(q,"audit","energie audit","energy audit","diagnostic"):
        return KNOWLEDGE["energy_audit"][lng]

    # ── SEC ──────────────────────────────────────────────────────────────────
    if has(q,"sec","specific energy","consommation specifique","specifique",
           "kpi","performance","indicateur"):
        return KNOWLEDGE["sec"][lng]

    # ── ONEE / Tarif ─────────────────────────────────────────────────────────
    if has(q,"onee","tarif","tariff","maroc","morocco","electricite maroc",
           "heures creuses","heures pleines","heure pointe","off peak","peak hour"):
        return KNOWLEDGE["onee"][lng]

    # ── Base de connaissances ─────────────────────────────────────────────────
    kmap = {
        ("power factor","facteur puissance","cos phi","kvar","reactive","reactif"): "power_factor",
        ("thd","harmonic","harmonique","distortion","distorsion"):                  "thd",
        ("voltage","tension","volt"):                                                "voltage",
        ("frequency","frequence","hz","hertz"):                                     "frequency",
        ("co2","carbon","carbone","emission"):                                       "co2",
        ("sec","specific energy","consommation specifique"):                         "sec",
        ("onee","tarif","tariff","maroc","morocco"):                                 "onee",
        ("maintenance","preventive","entretien"):                                    "maintenance",
        ("audit","diagnostic"):                                                      "energy_audit",
        ("quality","qualite","power quality"):                                       "power_quality",
    }
    for kws, topic in kmap.items():
        if any(k in q for k in kws):
            return KNOWLEDGE[topic][lng]

    # ── Aide ────────────────────────────────────────────────────────────────
    if has(q,"help","aide","what can","que peux","capabilities","fonctions"):
        if fr:
            return (
                "**Je peux vous aider sur:**\n\n"
                "**Analyse des données en temps réel:**\n"
                "- Puissance (kW), énergie (kWh), tension, fréquence\n"
                "- Facteur de puissance, THD, coûts MAD, CO₂\n\n"
                "**Diagnostics intelligents:**\n"
                "- Détection d'anomalies sur vos mesures réelles\n"
                "- Recommandations avec économies chiffrées en MAD/an\n"
                "- Score d'efficacité énergétique\n\n"
                "**Connaissances industrielles:**\n"
                "- Facteur de puissance, THD, qualité énergie\n"
                "- Tarifs ONEE Maroc, calcul CO₂\n"
                "- Audit énergétique, maintenance préventive\n\n"
                "**Exemples:**\n"
                "- *'Statut général de la ligne'*\n"
                "- *'Quelles sont les recommandations?'*\n"
                "- *'Y a-t-il des anomalies?'*\n"
                "- *'Quel est le coût mensuel estimé?'*\n"
                "- *'Explique le facteur de puissance'*"
            )
        return (
            "**I can help you with:**\n\n"
            "**Real-time data analysis:**\n"
            "- Power (kW), energy (kWh), voltage, frequency\n"
            "- Power factor, THD, MAD costs, CO₂\n\n"
            "**Smart diagnostics:**\n"
            "- Anomaly detection on your real measurements\n"
            "- Recommendations with savings in MAD/year\n"
            "- Energy efficiency score\n\n"
            "**Industrial knowledge:**\n"
            "- Power factor, THD, power quality\n"
            "- ONEE Morocco tariffs, CO₂ calculation\n"
            "- Energy audit, preventive maintenance\n\n"
            "**Examples:**\n"
            "- *'General line status'*\n"
            "- *'What are the recommendations?'*\n"
            "- *'Are there any anomalies?'*\n"
            "- *'What is the estimated monthly cost?'*\n"
            "- *'Explain power factor'*"
        )

    # ── Requêtes urgentes ────────────────────────────────────────────────────
    if has(q,"urgent","pending","password","mot de passe","oublie","forgot"):
        if fr: return f"**Requêtes urgentes:** {urgent} en attente — Accès via la page Requêtes Urgentes (admin)."
        return f"**Urgent requests:** {urgent} pending — Access via the Urgent Requests page (admin)."

    # ── Remerciements ────────────────────────────────────────────────────────
    if has(q,"merci","thanks","thank","parfait","great","super","excellent","bravo"):
        return ("😊 Avec plaisir! N'hésitez pas pour toute question sur l'énergie." if fr
                else "😊 You're welcome! Feel free to ask any energy-related question.")

    # ── Fallback ─────────────────────────────────────────────────────────────
    anomalies = []
    if pf and pf < 0.85:              anomalies.append(f"FP: {pf:.3f}" if fr else f"PF: {pf:.3f}")
    if volt and (volt < 210 or volt > 250): anomalies.append(f"Tension: {volt:.1f}V" if fr else f"Voltage: {volt:.1f}V")
    if thd_val and thd_val > 5:       anomalies.append(f"THD: {thd_val:.1f}%")

    alert_msg = (f"\n\n⚠️ **Alertes:** {', '.join(anomalies)}" if anomalies
                 else "\n\n✅ Aucune anomalie détectée" if fr
                 else "\n\n✅ No anomalies detected")

    if fr:
        return (
            f"**{line} — Résumé actuel:**\n"
            f"- ⚡ {kw} kW | 💰 {cost:.2f} MAD | 🌱 {co2:.2f} kg CO₂\n"
            f"- 🏆 Score efficacité: {score}%"
            f"{alert_msg}\n\n"
            f"Suggestions: *statut* · *recommandations* · *alarmes* · "
            f"*coût* · *CO₂* · *facteur de puissance* · *THD* · *tension* · *audit*"
        )
    return (
        f"**{line} — Current summary:**\n"
        f"- ⚡ {kw} kW | 💰 {cost:.2f} MAD | 🌱 {co2:.2f} kg CO₂\n"
        f"- 🏆 Efficiency score: {score}%"
        f"{alert_msg}\n\n"
        f"Suggestions: *status* · *recommendations* · *alarms* · "
        f"*cost* · *CO₂* · *power factor* · *THD* · *voltage* · *audit*"
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
        return {
            "answer": (
                "👋 **Bonjour!** Assistant Énergie JESA\n\n"
                "Je suis spécialisé en gestion de l'énergie industrielle.\n"
                "Je parle **français** et **anglais** 🇫🇷 🇬🇧\n\n"
                "Je peux analyser vos données en temps réel, détecter "
                "les anomalies et calculer des économies précises en MAD.\n\n"
                "Posez votre question!"
            )
        }

    return {"answer": respond(question, context)}