/**
 * AlarmThresholds.jsx — Page admin pour configurer les seuils d'alarme
 * Les seuils sont sauvegardés dans le backend via /api/thresholds
 * Quand un seuil change → toutes les nouvelles alarmes utilisent la nouvelle valeur
 */

import { useEffect, useState } from "react";

const hostname     = window.location.hostname;
const API_BASE_URL = `http://${hostname}:8000`;

const DEFAULT_THRESHOLDS = {
  high_consumption_kw:   500,
  voltage_min:           380,
  voltage_max:           440,
  frequency_min:         49.0,
  frequency_max:         51.0,
  power_factor_min:      0.85,
  thd_max:               5.0,
  peak_demand_warning:   400,
  peak_demand_critical:  500,
};

const THRESHOLD_CONFIG = [
  {
    key:         "high_consumption_kw",
    label:       "High Consumption",
    description: "Maximum allowed active power per meter",
    unit:        "kW",
    min:         100,
    max:         2000,
    step:        50,
    severity:    "high",
    icon:        "⚡",
  },
  {
    key:         "voltage_min",
    label:       "Voltage Minimum",
    description: "Minimum acceptable voltage (alarm below this)",
    unit:        "V",
    min:         300,
    max:         415,
    step:        5,
    severity:    "high",
    icon:        "🔌",
  },
  {
    key:         "voltage_max",
    label:       "Voltage Maximum",
    description: "Maximum acceptable voltage (alarm above this)",
    unit:        "V",
    min:         415,
    max:         500,
    step:        5,
    severity:    "high",
    icon:        "🔌",
  },
  {
    key:         "frequency_min",
    label:       "Frequency Minimum",
    description: "Minimum acceptable frequency",
    unit:        "Hz",
    min:         45.0,
    max:         50.0,
    step:        0.5,
    severity:    "high",
    icon:        "〰",
  },
  {
    key:         "frequency_max",
    label:       "Frequency Maximum",
    description: "Maximum acceptable frequency",
    unit:        "Hz",
    min:         50.0,
    max:         55.0,
    step:        0.5,
    severity:    "high",
    icon:        "〰",
  },
  {
    key:         "power_factor_min",
    label:       "Power Factor Minimum",
    description: "Minimum acceptable power factor (alarm below this)",
    unit:        "",
    min:         0.5,
    max:         0.95,
    step:        0.01,
    severity:    "medium",
    icon:        "↗",
  },
  {
    key:         "thd_max",
    label:       "THD Maximum",
    description: "Maximum allowed Total Harmonic Distortion (IEC 61000 = 5%)",
    unit:        "%",
    min:         1.0,
    max:         20.0,
    step:        0.5,
    severity:    "medium",
    icon:        "⚠",
  },
  {
    key:         "peak_demand_warning",
    label:       "Peak Demand Warning",
    description: "Warning level for peak demand",
    unit:        "kW",
    min:         100,
    max:         1000,
    step:        50,
    severity:    "medium",
    icon:        "📉",
  },
  {
    key:         "peak_demand_critical",
    label:       "Peak Demand Critical",
    description: "Critical level for peak demand (alarm)",
    unit:        "kW",
    min:         200,
    max:         2000,
    step:        50,
    severity:    "high",
    icon:        "📉",
  },
];

export default function AlarmThresholds() {
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);
  const [saved,      setSaved]      = useState({});
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [success,    setSuccess]    = useState("");
  const [error,      setError]      = useState("");

  // Charger les seuils depuis le backend
  useEffect(() => {
    const load = async () => {
      try {
        const token    = localStorage.getItem("token");
        const response = await fetch(`${API_BASE_URL}/api/thresholds`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          const merged = { ...DEFAULT_THRESHOLDS, ...data };
          setThresholds(merged);
          setSaved(merged);
        }
      } catch {
        // Utiliser les valeurs par défaut si le backend ne répond pas
        setSaved(DEFAULT_THRESHOLDS);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleChange = (key, value) => {
    setThresholds(prev => ({ ...prev, [key]: parseFloat(value) }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      const token    = localStorage.getItem("token");
      const response = await fetch(`${API_BASE_URL}/api/thresholds`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify(thresholds),
      });
      if (response.ok) {
        setSaved({ ...thresholds });
        setSuccess("✅ Thresholds saved successfully! New alarms will use these values.");
        setTimeout(() => setSuccess(""), 4000);
      } else {
        setError("Failed to save thresholds.");
      }
    } catch {
      setError("Backend not reachable.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setThresholds(DEFAULT_THRESHOLDS);
  };

  const hasChanges = JSON.stringify(thresholds) !== JSON.stringify(saved);

  const severityColors = {
    high:   { bg: "#fff5f5", border: "#fed7d7", badge: "#e53e3e", badgeBg: "#fff5f5" },
    medium: { bg: "#fffbeb", border: "#fefcbf", badge: "#d69e2e", badgeBg: "#fffbeb" },
  };

  if (loading) {
    return (
      <div className="overview-page">
        <div className="info-box">⏳ Loading alarm thresholds...</div>
      </div>
    );
  }

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1>Alarm Thresholds</h1>
          <p className="page-subtitle">
            Configure alarm limits — changes apply to all new alarms immediately
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            onClick={handleReset}
            style={{
              background:   "transparent",
              border:       "1px solid var(--border)",
              borderRadius: "8px",
              padding:      "0.5rem 1rem",
              cursor:       "pointer",
              fontSize:     "0.85rem",
              color:        "var(--text-muted)",
            }}
          >
            ↺ Reset Defaults
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{
              background:   hasChanges ? "#4299e1" : "#94a3b8",
              color:        "#fff",
              border:       "none",
              borderRadius: "8px",
              padding:      "0.5rem 1.25rem",
              cursor:       hasChanges && !saving ? "pointer" : "not-allowed",
              fontWeight:   600,
              fontSize:     "0.85rem",
            }}
          >
            {saving ? "Saving..." : "💾 Save Thresholds"}
          </button>
        </div>
      </div>

      {success && <div className="info-box">{success}</div>}
      {error   && <div className="alarm-item">⚠ {error}</div>}
      {hasChanges && !success && (
        <div style={{
          background:   "#fffbeb",
          border:       "1px solid #fbd38d",
          borderRadius: "8px",
          padding:      "0.75rem 1rem",
          fontSize:     "0.85rem",
          color:        "#b7791f",
          marginBottom: "1rem",
        }}>
          ⚠️ You have unsaved changes. Click "Save Thresholds" to apply them.
        </div>
      )}

      {/* Résumé des seuils actuels */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Current Thresholds</h2>
        </div>
        <div className="carbon-kpis">
          {THRESHOLD_CONFIG.map(cfg => {
            const current  = thresholds[cfg.key];
            const isChanged = current !== saved[cfg.key];
            return (
              <div
                className="carbon-card"
                key={cfg.key}
                style={{
                  border: isChanged ? "2px solid #f6ad55" : undefined,
                  background: isChanged ? "#fffbeb" : undefined,
                }}
              >
                <h4>{cfg.icon} {cfg.label}</h4>
                <strong style={{ color: severityColors[cfg.severity].badge }}>
                  {current} {cfg.unit}
                </strong>
                <span style={{
                  fontSize:     "0.7rem",
                  background:   severityColors[cfg.severity].badgeBg,
                  color:        severityColors[cfg.severity].badge,
                  border:       `1px solid ${severityColors[cfg.severity].border}`,
                  borderRadius: "8px",
                  padding:      "1px 6px",
                }}>
                  {cfg.severity.toUpperCase()}
                </span>
                {isChanged && (
                  <span style={{ fontSize: "0.7rem", color: "#d69e2e", display: "block", marginTop: "0.2rem" }}>
                    Was: {saved[cfg.key]} {cfg.unit}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Sliders de configuration */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Configure Thresholds</h2>
          <p>Adjust alarm limits using the sliders or type values directly</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
          {THRESHOLD_CONFIG.map(cfg => {
            const current  = thresholds[cfg.key];
            const isChanged = current !== saved[cfg.key];
            const colors   = severityColors[cfg.severity];

            return (
              <div
                key={cfg.key}
                style={{
                  background:   isChanged ? colors.bg : "var(--bg-card)",
                  border:       `1px solid ${isChanged ? colors.border : "var(--border)"}`,
                  borderRadius: "12px",
                  padding:      "1.25rem",
                }}
              >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>
                      {cfg.icon} {cfg.label}
                    </h3>
                    <p style={{ margin: "0.2rem 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                      {cfg.description}
                    </p>
                  </div>
                  <span style={{
                    fontSize:     "0.7rem",
                    background:   colors.badgeBg,
                    color:        colors.badge,
                    border:       `1px solid ${colors.border}`,
                    borderRadius: "8px",
                    padding:      "2px 8px",
                    fontWeight:   700,
                    textTransform:"uppercase",
                    flexShrink:   0,
                  }}>
                    {cfg.severity}
                  </span>
                </div>

                {/* Valeur actuelle */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
                  <input
                    type="number"
                    value={current}
                    min={cfg.min}
                    max={cfg.max}
                    step={cfg.step}
                    onChange={e => handleChange(cfg.key, e.target.value)}
                    style={{
                      width:        "90px",
                      padding:      "0.4rem 0.6rem",
                      borderRadius: "8px",
                      border:       `1px solid ${isChanged ? colors.border : "var(--border)"}`,
                      background:   "var(--bg)",
                      color:        "var(--text)",
                      fontSize:     "1rem",
                      fontWeight:   700,
                      textAlign:    "center",
                    }}
                  />
                  <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 600 }}>
                    {cfg.unit || "dimensionless"}
                  </span>
                  {isChanged && (
                    <button
                      type="button"
                      onClick={() => handleChange(cfg.key, DEFAULT_THRESHOLDS[cfg.key])}
                      style={{
                        background:   "transparent",
                        border:       "none",
                        cursor:       "pointer",
                        color:        "#94a3b8",
                        fontSize:     "0.75rem",
                        marginLeft:   "auto",
                      }}
                      title="Reset to default"
                    >
                      ↺ {DEFAULT_THRESHOLDS[cfg.key]}{cfg.unit}
                    </button>
                  )}
                </div>

                {/* Slider */}
                <input
                  type="range"
                  min={cfg.min}
                  max={cfg.max}
                  step={cfg.step}
                  value={current}
                  onChange={e => handleChange(cfg.key, e.target.value)}
                  style={{ width: "100%", accentColor: colors.badge, cursor: "pointer" }}
                />

                {/* Min / Max labels */}
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                  <span>Min: {cfg.min}{cfg.unit}</span>
                  <span>Default: {DEFAULT_THRESHOLDS[cfg.key]}{cfg.unit}</span>
                  <span>Max: {cfg.max}{cfg.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

          
    </div>
  );
}