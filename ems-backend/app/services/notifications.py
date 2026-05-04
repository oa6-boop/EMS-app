

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

SMTP_HOST     = os.getenv("SMTP_HOST",     "smtp.gmail.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER",     "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
ALERT_EMAIL   = os.getenv("ALERT_EMAIL",   "admin@jesagroup.com")


def send_alarm_email(alarm: dict) -> bool:
    """
    Envoie un email pour une alarme critique.
    Retourne True si envoyé, False sinon.
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        print("📧 Email not configured — skipping notification")
        return False

    # Envoyer uniquement pour les alarmes HIGH
    if alarm.get("severity") not in ("high", "critical"):
        return False

    severity_emoji = {
        "high":     "🔴",
        "critical": "🚨",
        "medium":   "🟡",
    }.get(alarm.get("severity", "medium"), "⚠️")

    alarm_type = alarm.get("alarm_type", "UNKNOWN")
    line       = alarm.get("production_line", "Unknown Line")
    equipment  = alarm.get("equipment",       "Unknown Equipment")
    message    = alarm.get("message",         "No details")
    value      = alarm.get("measured_value",  "—")
    limit      = alarm.get("limit_value",     "—")
    now_str    = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        msg             = MIMEMultipart("alternative")
        msg["From"]     = SMTP_USER
        msg["To"]       = ALERT_EMAIL
        msg["Subject"]  = f"{severity_emoji} EMS ALARM: {alarm_type} — {line} — {equipment}"

        # Version texte simple
        text_body = f"""
EMS ENERGY MANAGEMENT SYSTEM — CRITICAL ALARM

{severity_emoji} ALARM TYPE  : {alarm_type}
   SEVERITY     : {alarm.get("severity", "").upper()}
   LINE         : {line}
   EQUIPMENT    : {equipment}
   AREA         : {alarm.get("area", "—")}
   PLANT        : {alarm.get("plant", "Plant 1")}

MESSAGE      : {message}
MEASURED     : {value}
LIMIT        : {limit}
TIME         : {now_str}

─────────────────────────────────────
Please check the EMS Dashboard immediately:
http://localhost:5173

JESA Group — Energy Management System
        """

        # Version HTML
        html_body = f"""
<!DOCTYPE html>
<html>
<head>
  <style>
    body {{ font-family: Arial, sans-serif; background: #f7fafc; margin: 0; padding: 20px; }}
    .container {{ max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
    .header {{ background: #c53030; color: white; padding: 24px 32px; }}
    .header h1 {{ margin: 0; font-size: 1.4rem; }}
    .header p {{ margin: 4px 0 0; opacity: 0.85; font-size: 0.9rem; }}
    .body {{ padding: 32px; }}
    .row {{ display: flex; border-bottom: 1px solid #e2e8f0; padding: 10px 0; }}
    .label {{ width: 140px; color: #718096; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; }}
    .value {{ color: #1a202c; font-size: 0.95rem; flex: 1; }}
    .value.red {{ color: #c53030; font-weight: 700; }}
    .message-box {{ background: #fff5f5; border: 1px solid #fed7d7; border-radius: 8px; padding: 16px; margin: 20px 0; }}
    .message-box p {{ margin: 0; color: #c53030; font-size: 0.95rem; }}
    .btn {{ display: inline-block; background: #2b6cb0; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }}
    .footer {{ background: #f7fafc; padding: 20px 32px; font-size: 0.8rem; color: #a0aec0; text-align: center; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>{severity_emoji} EMS Critical Alarm</h1>
      <p>{now_str} — JESA Group Energy Management System</p>
    </div>
    <div class="body">
      <div class="row"><div class="label">Alarm Type</div><div class="value red">{alarm_type}</div></div>
      <div class="row"><div class="label">Severity</div><div class="value red">{alarm.get("severity","").upper()}</div></div>
      <div class="row"><div class="label">Line</div><div class="value">{line}</div></div>
      <div class="row"><div class="label">Equipment</div><div class="value">{equipment}</div></div>
      <div class="row"><div class="label">Area</div><div class="value">{alarm.get("area","—")}</div></div>
      <div class="row"><div class="label">Plant</div><div class="value">{alarm.get("plant","Plant 1")}</div></div>
      <div class="row"><div class="label">Measured</div><div class="value red">{value}</div></div>
      <div class="row"><div class="label">Limit</div><div class="value">{limit}</div></div>

      <div class="message-box">
        <p>⚠️ {message}</p>
      </div>

      <a href="http://localhost:5173" class="btn">Open EMS Dashboard →</a>
    </div>
    <div class="footer">
      JESA Group — Energy Management System<br>
      This is an automated alert. Do not reply to this email.
    </div>
  </div>
</body>
</html>
        """

        msg.attach(MIMEText(text_body, "plain"))
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        print(f"📧 Alarm email sent → {ALERT_EMAIL} [{alarm_type}]")
        return True

    except Exception as e:
        print(f"📧 Email send error: {e}")
        return False