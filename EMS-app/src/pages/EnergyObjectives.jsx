import { useState, useEffect } from "react";
import {
  fetchObjectives,
  createObjective,
  updateObjective,
  deleteObjective,
} from "../api/objectivesApi";

const OBJECTIVE_TYPES = [
  { key: "reduce_kwh",   label: "Reduce Electricity (kWh)", unit: "kWh",    icon: "⚡" },
  { key: "reduce_co2",   label: "Reduce CO₂ Emissions",     unit: "kg CO₂", icon: "🌱" },
  { key: "reduce_cost",  label: "Reduce Energy Cost",       unit: "$",      icon: "💰" },
  { key: "improve_pf",   label: "Improve Power Factor",     unit: "",       icon: "↗"  },
  { key: "reduce_peak",  label: "Reduce Peak Demand",       unit: "kW",     icon: "📉" },
  { key: "reduce_thd",   label: "Reduce THD",               unit: "%",      icon: "〰" },
];

const PERIODS = ["Weekly", "Monthly", "Quarterly", "Yearly"];

export default function EnergyObjectives({
  energies          = [],
  totalCost         = 0,
  totalCo2          = 0,
  peakKw            = 0,
  avgPowerFactor    = null,
  selectedLineLabel = "Production Line 1",
  currentUser       = null,
}) {
  const [objectives, setObjectives] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [showForm,   setShowForm]   = useState(false);
  const [editId,     setEditId]     = useState(null);

  const [form, setForm] = useState({
    type:             "reduce_kwh",
    title:            "",
    target_value:     "",
    current_baseline: "",
    period:           "Monthly",
    start_date:       new Date().toISOString().slice(0, 10),
    end_date:         "",
    description:      "",
    line:             selectedLineLabel,
  });

  const canEdit = (obj) => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    return Number(obj.created_by) === Number(currentUser.id);
  };

  const loadObjectives = async () => {
    try {
      const data = await fetchObjectives();
      setObjectives(data || []);
      setError("");
    } catch {
      setError("Failed to load objectives");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadObjectives();
    const iv = setInterval(loadObjectives, 10000);
    return () => clearInterval(iv);
  }, []);

  const getLiveValue = (type) => {
    const kwhE = energies.find(e => e.unit === "kWh");
    switch (type) {
      case "reduce_kwh":  return kwhE ? kwhE.value : 0;
      case "reduce_co2":  return totalCo2 || (kwhE ? kwhE.value * 0.718 : 0);
      case "reduce_cost": return totalCost || 0;
      case "improve_pf":  return avgPowerFactor ? parseFloat(avgPowerFactor) : 0;
      case "reduce_peak": return peakKw || 0;
      case "reduce_thd":  return 3.2;
      default:            return 0;
    }
  };

  const getProgress = (obj) => {
    const current  = getLiveValue(obj.type);
    const baseline = parseFloat(obj.current_baseline) || 1;
    const target   = parseFloat(obj.target_value) || 1;
    if (obj.type === "improve_pf") {
      if (baseline >= target) return 100;
      return Math.max(0, Math.min(100, ((current - baseline) / (target - baseline)) * 100));
    } else {
      if (current <= target) return 100;
      return Math.max(0, Math.min(100, ((baseline - current) / (baseline - target)) * 100));
    }
  };

  const getStatus = (progress) => {
    if (progress >= 100) return { label: "✅ Achieved",    color: "#38a169" };
    if (progress >= 75)  return { label: "🟢 On Track",    color: "#38a169" };
    if (progress >= 40)  return { label: "🟡 In Progress", color: "#d69e2e" };
    return                      { label: "🔴 Behind",      color: "#e53e3e" };
  };

  const handleSubmit = async () => {
    if (!form.target_value || !form.current_baseline) return;
    const typeInfo = OBJECTIVE_TYPES.find(t => t.key === form.type);
    const payload  = {
      ...form,
      unit: typeInfo?.unit || "",
      icon: typeInfo?.icon || "📊",
    };
    try {
      if (editId !== null) {
        await updateObjective(editId, payload);
      } else {
        await createObjective(payload);
      }
      await loadObjectives();
      setShowForm(false);
      setEditId(null);
      setForm({
        type: "reduce_kwh", title: "", target_value: "", current_baseline: "",
        period: "Monthly", start_date: new Date().toISOString().slice(0, 10),
        end_date: "", description: "", line: selectedLineLabel,
      });
    } catch (err) {
      setError(err.message || "Failed to save");
    }
  };

  const handleEdit = (obj) => {
    setForm({
      type:             obj.type,
      title:            obj.title            || "",
      target_value:     String(obj.target_value),
      current_baseline: String(obj.current_baseline),
      period:           obj.period,
      start_date:       obj.start_date       || "",
      end_date:         obj.end_date         || "",
      description:      obj.description      || "",
      line:             obj.line             || selectedLineLabel,
    });
    setEditId(obj.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this objective?")) return;
    try {
      await deleteObjective(id);
      await loadObjectives();
    } catch (err) {
      setError(err.message || "Failed to delete");
    }
  };

  const achieved = objectives.filter(o => getProgress(o) >= 100).length;
  const onTrack  = objectives.filter(o => { const p = getProgress(o); return p >= 75 && p < 100; }).length;
  const behind   = objectives.filter(o => getProgress(o) < 40).length;

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1>Energy Objectives</h1>
          <p className="page-subtitle">
            Set and track energy targets
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(true); setEditId(null); }}
          style={{
            background: "#2563eb", color: "#fff", border: "none",
            borderRadius: "10px", padding: "0.6rem 1.25rem",
            cursor: "pointer", fontWeight: 700, fontSize: "0.9rem",
          }}
        >
          + New Objective
        </button>
      </div>

      {error   && <div className="alarm-item">⚠ {error}</div>}
      {loading && <div className="info-box">⏳ Loading...</div>}

      {/* KPIs */}
      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>Total</h4>
            <strong>{objectives.length}</strong>
            <span>All objectives</span>
          </div>
          <div className="carbon-card">
            <h4>✅ Achieved</h4>
            <strong style={{ color: "#38a169" }}>{achieved}</strong>
            <span>Progress ≥ 100%</span>
          </div>
          <div className="carbon-card">
            <h4>🟢 On Track</h4>
            <strong style={{ color: "#38a169" }}>{onTrack}</strong>
            <span>Progress ≥ 75%</span>
          </div>
          <div className="carbon-card">
            <h4>🔴 Behind</h4>
            <strong style={{ color: behind > 0 ? "#e53e3e" : "#38a169" }}>{behind}</strong>
            <span>Progress &lt; 40%</span>
          </div>
        </div>
      </section>

      {/* Objectifs */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Active Objectives</h2>
          <p>{objectives.length} objectives</p>
        </div>

        {!loading && objectives.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "3rem",
            background: "var(--bg-card)", borderRadius: "12px",
            border: "1px solid var(--border-color)", color: "var(--text-secondary)",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🎯</div>
            <h3 style={{ color: "var(--text-secondary)" }}>No objectives defined</h3>
            <p>Click "+ New Objective" to define your first energy target.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "1rem" }}>
            {objectives.map(obj => {
              const progress = getProgress(obj);
              const status   = getStatus(progress);
              const current  = getLiveValue(obj.type);
              const barColor = progress >= 100 ? "#38a169" : progress >= 75 ? "#38a169" : progress >= 40 ? "#ed8936" : "#e53e3e";
              const isMine   = canEdit(obj);

              return (
                <div key={obj.id} className="objective-card">
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", marginBottom: "0.75rem",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: "1.4rem" }}>{obj.icon || "📊"}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-main)" }}>
                          {obj.title || OBJECTIVE_TYPES.find(t => t.key === obj.type)?.label || obj.type}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {obj.period} · {obj.line || selectedLineLabel}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                      <span style={{ color: status.color, fontSize: "0.78rem", fontWeight: 700 }}>
                        {status.label}
                      </span>
                      <span style={{
                        fontSize: "0.68rem", fontWeight: 600,
                        color:      isMine ? "#2b6cb0" : "#718096",
                        background: isMine ? "#ebf8ff" : "#f7fafc",
                        border:     `1px solid ${isMine ? "#bee3f8" : "#e2e8f0"}`,
                        borderRadius: "6px", padding: "1px 6px",
                      }}>
                        {isMine ? "✏️ Yours" : "👁️ View only"}
                      </span>
                    </div>
                  </div>

                  <div style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
                    gap: "0.5rem", marginBottom: "0.75rem",
                  }}>
                    {[
                      { label: "BASELINE", value: `${obj.current_baseline} ${obj.unit}`, color: "var(--text-main)" },
                      { label: "CURRENT",  value: `${current.toFixed(2)} ${obj.unit}`,   color: barColor },
                      { label: "TARGET",   value: `${obj.target_value} ${obj.unit}`,     color: "#2563eb" },
                    ].map(item => (
                      <div key={item.label} style={{
                        textAlign: "center", background: "var(--bg-main)",
                        borderRadius: "8px", padding: "0.5rem", fontSize: "0.82rem",
                      }}>
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.68rem" }}>{item.label}</div>
                        <div style={{ fontWeight: 700, color: item.color }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", marginBottom: "0.3rem" }}>
                      <span style={{ color: "var(--text-secondary)" }}>Progress</span>
                      <strong style={{ color: barColor }}>{progress.toFixed(1)}%</strong>
                    </div>
                    <div className="objective-progress-bar">
                      <div
                        className="objective-progress-fill"
                        style={{ width: `${Math.min(100, progress)}%`, background: barColor }}
                      />
                    </div>
                  </div>

                  {(obj.start_date || obj.end_date) && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.5rem", display: "flex", gap: "1rem" }}>
                      {obj.start_date && <span>📅 {obj.start_date}</span>}
                      {obj.end_date   && <span>🏁 {obj.end_date}</span>}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.75rem" }}>
                    {isMine ? (
                      <>
                        <button type="button" onClick={() => handleEdit(obj)}
                          style={{ background: "var(--bg-main)", color: "var(--text-main)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "3px 10px", cursor: "pointer", fontSize: "0.75rem" }}>
                          ✏️ Edit
                        </button>
                        <button type="button" onClick={() => handleDelete(obj.id)}
                          style={{ background: "transparent", color: "#e53e3e", border: "1px solid #fed7d7", borderRadius: "6px", padding: "3px 10px", cursor: "pointer", fontSize: "0.75rem" }}>
                          🗑️ Delete
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontStyle: "italic" }}>
                        Created by another user
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal */}
      {showForm && (
        <div className="forgot-modal-overlay">
          <div className="forgot-modal" style={{ maxWidth: "500px", width: "100%" }}>
            <h2>{editId !== null ? "Edit Objective" : "New Energy Objective"}</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "1rem" }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Objective Type *</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }}>
                  {OBJECTIVE_TYPES.map(t => <option key={t.key} value={t.key}>{t.icon} {t.label}</option>)}
                </select>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Title (optional)</label>
                <input type="text" placeholder="e.g. Reduce Q1 consumption by 10%"
                  value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }} />
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Baseline *</label>
                <input type="number" placeholder="Current value"
                  value={form.current_baseline} onChange={e => setForm(p => ({ ...p, current_baseline: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }} />
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Target Value *</label>
                <input type="number" placeholder="Target to achieve"
                  value={form.target_value} onChange={e => setForm(p => ({ ...p, target_value: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }} />
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Period</label>
                <select value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }}>
                  {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Start Date</label>
                <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }} />
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>End Date</label>
                <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }} />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Description</label>
                <textarea rows={2} placeholder="Describe the objective..." value={form.description}
                  onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", resize: "vertical", background: "var(--bg-main)", color: "var(--text-main)" }} />
              </div>
            </div>

            <div className="forgot-modal-actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="login-btn" onClick={handleSubmit} disabled={!form.target_value || !form.current_baseline}>
                {editId !== null ? "Save Changes" : "Create Objective"}
              </button>
              <button type="button" className="cancel-forgot-btn" onClick={() => { setShowForm(false); setEditId(null); }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}