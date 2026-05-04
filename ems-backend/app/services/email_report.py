"""
email_report.py — Rapport automatique quotidien par email
Envoyé à admin@jesagroup.com tous les jours à 08h00
Contient: résumé de toutes les lignes, alarmes, coûts, CO₂
"""

import os
import smtplib
import threading
import time
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

SMTP_HOST     = os.getenv("SMTP_HOST",     "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER",     "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
ALERT_EMAIL   = os.getenv("ALERT_EMAIL",   "admin@jesagroup.com")

REPORT_HOUR   = int(os.getenv("REPORT_HOUR", "8"))   # 08h00 par défaut


def build_daily_report_html(summary: dict, alarms_count: int) -> str:
    """Construit le rapport HTML journalier."""
    now       = datetime.now()
    date_str  = now.strftime("%A, %d %B %Y")
    lines_html = ""

    total_cost_all  = 0.0
    total_co2_all   = 0.0
    total_kw_all    = 0.0

    for line_name, line_data in summary.items():
        total_cost = line_data.get("total_cost", 0)
        total_co2  = line_data.get("total_co2_kg", 0)
        peak_kw    = line_data.get("peak_kw", 0)
        avg_pf     = line_data.get("avg_power_factor")
        avg_v      = line_data.get("avg_voltage")
        energies   = line_data.get("energies", [])

        total_cost_all += total_cost
        total_co2_all  += total_co2
        total_kw_all   += peak_kw

        pf_color  = "#38a169" if avg_pf and float(avg_pf) >= 0.90 else "#e53e3e"
        v_color   = "#38a169" if avg_v  and 380 <= float(avg_v) <= 440 else "#e53e3e"

        energies_rows = ""
        for e in energies[:5]:
            energies_rows += f"""
            <tr>
              <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">{e.get('equipment','—')}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">{e.get('energy_name','—')}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;font-weight:700">{float(e.get('value',0)):.2f} {e.get('unit','')}</td>
              <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">{float(e.get('cost',0)):.4f} $</td>
              <td style="padding:6px 10px;border-bottom:1px solid #e2e8f0">{float(e.get('co2_kg',0)):.3f} kg</td>
            </tr>"""

        lines_html += f"""
        <div style="background:white;border:1px solid #e2e8f0;border-radius:10px;padding:20px;margin-bottom:16px">
          <h3 style="margin:0 0 12px;color:#2d3748;font-size:1rem">{line_name}</h3>
          <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">
            <div style="background:#ebf8ff;border-radius:8px;padding:10px 16px;min-width:120px;text-align:center">
              <div style="font-size:0.75rem;color:#4299e1;font-weight:600">PEAK DEMAND</div>
              <div style="font-size:1.3rem;font-weight:700;color:#2b6cb0">{peak_kw:.1f} kW</div>
            </div>
            <div style="background:#f0fff4;border-radius:8px;padding:10px 16px;min-width:120px;text-align:center">
              <div style="font-size:0.75rem;color:#38a169;font-weight:600">TOTAL COST</div>
              <div style="font-size:1.3rem;font-weight:700;color:#276749">{total_cost:.4f} $</div>
            </div>
            <div style="background:#f0fff4;border-radius:8px;padding:10px 16px;min-width:120px;text-align:center">
              <div style="font-size:0.75rem;color:#38a169;font-weight:600">CO₂ EMITTED</div>
              <div style="font-size:1.3rem;font-weight:700;color:#276749">{total_co2:.3f} kg</div>
            </div>
            <div style="background:{'#f0fff4' if avg_pf and float(avg_pf)>=0.9 else '#fff5f5'};border-radius:8px;padding:10px 16px;min-width:120px;text-align:center">
              <div style="font-size:0.75rem;color:{pf_color};font-weight:600">POWER FACTOR</div>
              <div style="font-size:1.3rem;font-weight:700;color:{pf_color}">{avg_pf if avg_pf else '—'}</div>
            </div>
            <div style="background:{'#f0fff4' if avg_v and 380<=float(avg_v)<=440 else '#fff5f5'};border-radius:8px;padding:10px 16px;min-width:120px;text-align:center">
              <div style="font-size:0.75rem;color:{v_color};font-weight:600">VOLTAGE</div>
              <div style="font-size:1.3rem;font-weight:700;color:{v_color}">{avg_v if avg_v else '—'} V</div>
            </div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
            <thead>
              <tr style="background:#f7fafc">
                <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e2e8f0">Equipment</th>
                <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e2e8f0">Energy</th>
                <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e2e8f0">Value</th>
                <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e2e8f0">Cost</th>
                <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #e2e8f0">CO₂</th>
              </tr>
            </thead>
            <tbody>{energies_rows}</tbody>
          </table>
        </div>"""

    html = f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;background:#f7fafc;margin:0;padding:20px">
  <div style="max-width:700px;margin:0 auto">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a365d,#2b6cb0);color:white;padding:28px 32px;border-radius:12px 12px 0 0">
      <h1 style="margin:0;font-size:1.4rem">📊 EMS Daily Report</h1>
      <p style="margin:6px 0 0;opacity:0.85;font-size:0.9rem">JESA Group — Energy Management System</p>
      <p style="margin:4px 0 0;opacity:0.75;font-size:0.85rem">{date_str}</p>
    </div>

    <!-- KPIs globaux -->
    <div style="background:white;padding:24px 32px;border-left:1px solid #e2e8f0;border-right:1px solid #e2e8f0">
      <h2 style="margin:0 0 16px;color:#2d3748;font-size:1rem">Overall Summary — All Production Lines</h2>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:130px;background:#ebf8ff;border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:0.75rem;color:#4299e1;font-weight:600;text-transform:uppercase">Total Peak Demand</div>
          <div style="font-size:1.6rem;font-weight:700;color:#2b6cb0;margin-top:4px">{total_kw_all:.1f} kW</div>
        </div>
        <div style="flex:1;min-width:130px;background:#f0fff4;border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:0.75rem;color:#38a169;font-weight:600;text-transform:uppercase">Total Cost</div>
          <div style="font-size:1.6rem;font-weight:700;color:#276749;margin-top:4px">{total_cost_all:.4f} $</div>
        </div>
        <div style="flex:1;min-width:130px;background:#f0fff4;border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:0.75rem;color:#38a169;font-weight:600;text-transform:uppercase">Total CO₂</div>
          <div style="font-size:1.6rem;font-weight:700;color:#276749;margin-top:4px">{total_co2_all:.3f} kg</div>
        </div>
        <div style="flex:1;min-width:130px;background:{'#fff5f5' if alarms_count > 0 else '#f0fff4'};border-radius:8px;padding:14px;text-align:center">
          <div style="font-size:0.75rem;color:{'#e53e3e' if alarms_count > 0 else '#38a169'};font-weight:600;text-transform:uppercase">Alarms (24h)</div>
          <div style="font-size:1.6rem;font-weight:700;color:{'#e53e3e' if alarms_count > 0 else '#38a169'};margin-top:4px">{alarms_count}</div>
        </div>
      </div>
    </div>

    <!-- Détail par ligne -->
    <div style="background:#f7fafc;padding:20px 32px;border:1px solid #e2e8f0">
      <h2 style="margin:0 0 16px;color:#2d3748;font-size:1rem">Production Lines Detail</h2>
      {lines_html if lines_html else '<p style="color:#94a3b8">No data available.</p>'}
    </div>

    <!-- Footer -->
    <div style="background:#2d3748;color:#a0aec0;padding:16px 32px;border-radius:0 0 12px 12px;font-size:0.78rem;text-align:center">
      JESA Group — Energy Management System<br>
      CO₂ factor: 0.718 kgCO₂/kWh (ONEE Morocco) · Electricity: 0.14 $/kWh<br>
      This is an automated daily report. <a href="http://localhost:5173" style="color:#63b3ed">Open EMS Dashboard →</a>
    </div>
  </div>
</body>
</html>"""
    return html


def send_daily_report():
    """Envoie le rapport quotidien par email."""
    if not SMTP_USER or not SMTP_PASSWORD:
        print("📧 Email not configured — skipping daily report")
        return

    try:
        # Importer ici pour éviter les imports circulaires
        from app.db import SessionLocal
        from app.models import TelemetryRecord, Alarm
        from app.utils import build_dashboard_summary
        from datetime import datetime, timedelta

        db  = SessionLocal()
        now = datetime.utcnow()

        records = db.query(TelemetryRecord).filter(
            TelemetryRecord.timestamp >= now - timedelta(hours=24),
            TelemetryRecord.source    != "simulator",
        ).all()

        alarms_count = db.query(Alarm).filter(
            Alarm.created_at >= now - timedelta(hours=24)
            if hasattr(Alarm, "created_at") else True
        ).count() if hasattr(Alarm, "created_at") else 0

        db.close()

        summary = build_dashboard_summary(records)
        html    = build_daily_report_html(dict(summary), alarms_count)

        msg             = MIMEMultipart("alternative")
        msg["From"]     = SMTP_USER
        msg["To"]       = ALERT_EMAIL
        msg["Subject"]  = f"📊 EMS Daily Report — {datetime.now().strftime('%d/%m/%Y')} — JESA Group"
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        print(f"📧 Daily report sent to {ALERT_EMAIL}")

    except Exception as e:
        print(f"📧 Daily report error: {e}")


def start_daily_report_scheduler():
    """Lance le planificateur de rapport quotidien dans un thread séparé."""
    if not SMTP_USER or not SMTP_PASSWORD:
        print("📧 Email not configured — daily report scheduler disabled")
        return

    def scheduler():
        print(f"📅 Daily report scheduler started — sends at {REPORT_HOUR:02d}:00 every day")
        while True:
            now          = datetime.now()
            target       = now.replace(hour=REPORT_HOUR, minute=0, second=0, microsecond=0)
            if target <= now:
                target  += timedelta(days=1)
            wait_seconds = (target - now).total_seconds()
            print(f"📅 Next daily report in {wait_seconds/3600:.1f}h (at {target.strftime('%H:%M')})")
            time.sleep(wait_seconds)
            send_daily_report()

    thread        = threading.Thread(target=scheduler, daemon=True)
    thread.start()