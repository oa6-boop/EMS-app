import { useState, useEffect } from "react";
import {
  fetchMaintenanceRecords,
  createMaintenanceRecord,
  updateMaintenanceRecord,
  deleteMaintenanceRecord,
} from "../api/maintenanceApi";
import { fetchEquipmentList } from "../api/emsApi";
import { fetchTechnicians } from "../api/usersApi";

const MAINTENANCE_TYPES = [
  "Predictive",
  "Curative",
  "Corrective",
  "Conditional",
 
];

const STATUS_COLORS = {
  "Planned":     { bg: "#ebf8ff", text: "#2b6cb0", border: "#bee3f8" },
  "In Progress": { bg: "#fffbeb", text: "#b7791f", border: "#fbd38d" },
  "Completed":   { bg: "#f0fff4", text: "#276749", border: "#c6f6d5" },
  "Overdue":     { bg: "#fff5f5", text: "#c53030", border: "#fed7d7" },
  "Cancelled":   { bg: "#f7fafc", text: "#718096", border: "#e2e8f0" },
};

const EMPTY_FORM = {
  equipment:      "",
  type:           "Inspection visuelle",
  scheduled_date: "",
  technician:     "",
  notes:          "",
  status:         "Planned",
  completed_date: "",
  priority:       "Normal",
};

function getDaysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
}

function getCardClass(record) {
  if (record.status === "Completed" || record.status === "Cancelled") return "ok";
  const days = getDaysUntil(record.scheduled_date);
  if (days === null) return "ok";
  if (days < 0)  return "overdue";
  if (days <= 7) return "due-soon";
  return "ok";
}

function getAutoStatus(record) {
  if (record.status === "Completed" || record.status === "Cancelled") return record.status;
  const days = getDaysUntil(record.scheduled_date);
  if (days !== null && days < 0 && record.status !== "In Progress") return "Overdue";
  return record.status;
}

export default function MaintenancePage({ energies = [], currentUser = null }) {
  const [records,  setRecords]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [filter,   setFilter]   = useState("All");
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [platformEquipments, setPlatformEquipments] = useState([]);
  const [technicians, setTechnicians] = useState([]);

  const equipments = [
    ...new Set([
      ...platformEquipments.map((e) => e.equipment).filter(Boolean),
      ...energies.map(e => e.rawData?.equipment || e.equipment).filter(Boolean),
    ]),
  ].sort();

  // Zone (area) de chaque équipement — pour un libellé clair dans le menu
  const equipmentAreas = {};
  platformEquipments.forEach((e) => {
    if (e.equipment && e.area && !equipmentAreas[e.equipment]) {
      equipmentAreas[e.equipment] = e.area;
    }
  });

  const canEdit = (record) => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    return Number(record.created_by) === Number(currentUser.id);
  };

  const loadRecords = async () => {
    try {
      const data = await fetchMaintenanceRecords();
      setRecords(data || []);
      setError("");
    } catch {
      setError("Failed to load maintenance records");
    } finally {
      setLoading(false);
    }
  };

  const loadEquipments = async () => {
    try {
      const data = await fetchEquipmentList();
      setPlatformEquipments(data || []);
    } catch {
      // keep current list from energies props
    }
  };

  // Techniciens (rôle maintenance) — rafraîchis avec le même intervalle :
  // un nouvel utilisateur maintenance apparaît automatiquement dans le menu.
  const loadTechnicians = async () => {
    try {
      const data = await fetchTechnicians();
      setTechnicians(data || []);
    } catch {
      // liste inchangée si le backend est indisponible
    }
  };

  useEffect(() => {
    loadRecords();
    loadEquipments();
    loadTechnicians();
    const iv = setInterval(() => {
      loadRecords();
      loadEquipments();
      loadTechnicians();
    }, 10000);
    return () => clearInterval(iv);
  }, []);

  const handleSubmit = async () => {
    if (!form.equipment || !form.scheduled_date) return;
    try {
      if (editId !== null) {
        await updateMaintenanceRecord(editId, form);
      } else {
        await createMaintenanceRecord(form);
      }
      await loadRecords();
      setShowForm(false);
      setEditId(null);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err.message || "Failed to save");
    }
  };

  const handleEdit = (record) => {
    setForm({
      equipment:      record.equipment,
      type:           record.type,
      scheduled_date: record.scheduled_date,
      technician:     record.technician     || "",
      notes:          record.notes          || "",
      status:         record.status,
      completed_date: record.completed_date || "",
      priority:       record.priority,
    });
    setEditId(record.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this maintenance record?")) return;
    try {
      await deleteMaintenanceRecord(id);
      await loadRecords();
    } catch (err) {
      setError(err.message || "Failed to delete");
    }
  };

  const handleComplete = async (record) => {
    try {
      await updateMaintenanceRecord(record.id, {
        ...record,
        status:         "Completed",
        completed_date: new Date().toISOString().slice(0, 10),
      });
      await loadRecords();
    } catch (err) {
      setError(err.message || "Failed to update");
    }
  };

  const displayRecords = records
    .map(r => ({ ...r, status: getAutoStatus(r) }))
    .filter(r => filter === "All" || r.status === filter);

  const overdueCount   = records.filter(r => getAutoStatus(r) === "Overdue").length;
  const dueSoonCount   = records.filter(r => {
    const d = getDaysUntil(r.scheduled_date);
    return d !== null && d >= 0 && d <= 7 && r.status !== "Completed";
  }).length;
  const completedCount = records.filter(r => r.status === "Completed").length;

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1> Maintenance Page</h1>
          <p className="page-subtitle">
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowForm(true); setEditId(null); setForm({ ...EMPTY_FORM, equipment: equipments[0] || "" }); }}
          style={{
            background: "#2563eb", color: "#fff", border: "none",
            borderRadius: "10px", padding: "0.6rem 1.25rem",
            cursor: "pointer", fontWeight: 700, fontSize: "0.9rem",
          }}
        >
          + New Maintenance
        </button>
      </div>

      {error   && <div className="alarm-item">⚠ {error}</div>}
      {loading && <div className="info-box">⏳ Loading...</div>}

      {/* KPIs */}
      <section className="section-block">
        <div className="carbon-kpis">
          <div className="carbon-card">
            <h4>Total Records</h4>
            <strong>{records.length}</strong>
            <span>All records</span>
          </div>
          <div className="carbon-card">
            <h4>🔴 Overdue</h4>
            <strong style={{ color: overdueCount > 0 ? "#e53e3e" : "#38a169" }}>
              {overdueCount}
            </strong>
            <span>Immediate action</span>
          </div>
          <div className="carbon-card">
            <h4>🟡 Due Soon</h4>
            <strong style={{ color: dueSoonCount > 0 ? "#d69e2e" : "#38a169" }}>
              {dueSoonCount}
            </strong>
            <span>Within 7 days</span>
          </div>
          <div className="carbon-card">
            <h4>✅ Completed</h4>
            <strong style={{ color: "#38a169" }}>{completedCount}</strong>
            <span>Done</span>
          </div>
        </div>
      </section>

      {/* Filtres */}
      <section className="section-block">
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {["All", "Planned", "In Progress", "Overdue", "Completed", "Cancelled"].map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              style={{
                padding: "0.3rem 0.9rem", borderRadius: "20px",
                border: "1px solid var(--border-color)", cursor: "pointer",
                fontSize: "0.82rem",
                fontWeight:  filter === s ? 700      : 400,
                background:  filter === s ? "#2563eb" : "var(--bg-card)",
                color:       filter === s ? "#fff"    : "var(--text-main)",
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* Liste */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>Maintenance Records</h2>
          <p>{displayRecords.length} records</p>
        </div>

        {!loading && displayRecords.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "3rem",
            background: "var(--bg-card)", borderRadius: "12px",
            border: "1px solid var(--border-color)", color: "var(--text-secondary)",
          }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔧</div>
            <h3 style={{ color: "var(--text-secondary)" }}>No maintenance records</h3>
            <p>Click "+ New Maintenance" to add the first record.</p>
          </div>
        ) : (
          <div className="maintenance-grid">
            {displayRecords.map(record => {
              const days   = getDaysUntil(record.scheduled_date);
              const sc     = STATUS_COLORS[record.status] || STATUS_COLORS["Planned"];
              const pColor = {
                "Low": "#38a169", "Normal": "#4299e1",
                "High": "#ed8936", "Critical": "#e53e3e",
              }[record.priority] || "#4299e1";
              const isMine = canEdit(record);

              return (
                <div key={record.id} className={`maintenance-card ${getCardClass(record)}`}>
                  <div style={{
                    display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", marginBottom: "0.75rem",
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text-main)" }}>
                        ⚙️ {record.equipment}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                        {record.type}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                      <span
                        className="maintenance-status-badge"
                        style={{ background: sc.bg, color: sc.text, border: `1px solid ${sc.border}` }}
                      >
                        {record.status}
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

                  <div style={{ fontSize: "0.83rem", color: "var(--text-secondary)", marginBottom: "0.75rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                      <span>📅 Scheduled:</span>
                      <strong style={{ color: days !== null && days < 0 ? "#e53e3e" : "var(--text-main)" }}>
                        {record.scheduled_date || "—"}
                        {days !== null && record.status !== "Completed" && (
                          <span style={{ marginLeft: "0.4rem", fontSize: "0.75rem" }}>
                            ({days < 0 ? `${Math.abs(days)}d overdue` : `in ${days}d`})
                          </span>
                        )}
                      </strong>
                    </div>
                    {record.technician && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.3rem" }}>
                        <span>👷 Technician:</span>
                        <strong style={{ color: "var(--text-main)" }}>{record.technician}</strong>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>⚡ Priority:</span>
                      <strong style={{ color: pColor }}>{record.priority}</strong>
                    </div>
                    {record.completed_date && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.3rem" }}>
                        <span>✅ Completed:</span>
                        <strong style={{ color: "#38a169" }}>{record.completed_date}</strong>
                      </div>
                    )}
                  </div>

                  {record.notes && (
                    <div style={{
                      background: "var(--bg-main)", borderRadius: "8px",
                      padding: "0.5rem 0.75rem", fontSize: "0.78rem",
                      color: "var(--text-secondary)", marginBottom: "0.75rem",
                      border: "1px solid var(--border-color)",
                    }}>
                      📝 {record.notes}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                    {isMine ? (
                      <>
                        {record.status !== "Completed" && record.status !== "Cancelled" && (
                          <button type="button" onClick={() => handleComplete(record)}
                            style={{ background: "#38a169", color: "#fff", border: "none", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "0.75rem", fontWeight: 600 }}>
                            ✓ Complete
                          </button>
                        )}
                        <button type="button" onClick={() => handleEdit(record)}
                          style={{ background: "var(--bg-main)", color: "var(--text-main)", border: "1px solid var(--border-color)", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "0.75rem" }}>
                          ✏️ Edit
                        </button>
                        <button type="button" onClick={() => handleDelete(record.id)}
                          style={{ background: "transparent", color: "#e53e3e", border: "1px solid #fed7d7", borderRadius: "6px", padding: "4px 10px", cursor: "pointer", fontSize: "0.75rem" }}>
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
          <div className="forgot-modal" style={{ maxWidth: "520px", width: "100%" }}>
            <h2>{editId !== null ? "Edit Maintenance" : "New Maintenance Record"}</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginTop: "1rem" }}>
              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Equipment *</label>
                <select value={form.equipment} onChange={e => setForm(p => ({ ...p, equipment: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }} required>
                  <option value="" disabled>{equipments.length ? "Select equipment" : "Waiting for DataPlatform equipment..."}</option>
                  {equipments.map(eq => (
                    <option key={eq} value={eq}>
                      {equipmentAreas[eq] ? `${eq} — ${equipmentAreas[eq]}` : eq}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Type *</label>
                <select value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }}>
                  {MAINTENANCE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Scheduled Date *</label>
                <input type="date" value={form.scheduled_date} onChange={e => setForm(p => ({ ...p, scheduled_date: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }} />
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Technician</label>
                <select value={form.technician} onChange={e => setForm(p => ({ ...p, technician: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }}>
                  <option value="">— Unassigned —</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.name}>🔧 {t.name}</option>
                  ))}
                  {/* Si le record édité a un technicien qui n'existe plus, on le garde sélectionnable */}
                  {form.technician && !technicians.some(t => t.name === form.technician) && (
                    <option value={form.technician}>{form.technician}</option>
                  )}
                </select>
                {technicians.length === 0 && (
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                    No maintenance user yet — create one in Users Management
                  </span>
                )}
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Priority</label>
                <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }}>
                  {["Low", "Normal", "High", "Critical"].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }}>
                  {["Planned", "In Progress", "Completed", "Cancelled"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {form.status === "Completed" && (
              <div style={{ marginTop: "0.75rem" }}>
                <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Completion Date</label>
                <input type="date" value={form.completed_date} onChange={e => setForm(p => ({ ...p, completed_date: e.target.value }))}
                  style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)" }} />
              </div>
            )}

            <div style={{ marginTop: "0.75rem" }}>
              <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.3rem" }}>Notes</label>
              <textarea value={form.notes} rows={3} placeholder="Maintenance notes..."
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                style={{ width: "100%", padding: "0.45rem", borderRadius: "8px", border: "1px solid var(--border-color)", resize: "vertical", background: "var(--bg-main)", color: "var(--text-main)" }} />
            </div>

            <div className="forgot-modal-actions" style={{ marginTop: "1rem" }}>
              <button type="button" className="login-btn" onClick={handleSubmit} disabled={!form.equipment || !form.scheduled_date}>
                {editId !== null ? "Save Changes" : "Create Record"}
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