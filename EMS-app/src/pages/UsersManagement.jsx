import { useState } from "react";

const ROLE_CONFIG = {
  admin:       { label: "Admin",       icon: "👑", color: "#7c3aed", bg: "#f3e8ff", border: "#ddd6fe", desc: "Full access — all pages" },
  management:  { label: "Management",  icon: "📊", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", desc: "Dashboard, Reports, Forecasting, Prices" },
  maintenance: { label: "Maintenance", icon: "🔧", color: "#d97706", bg: "#fffbeb", border: "#fde68a", desc: "Equipment, Alarms, Thresholds, History" },
  operator:    { label: "Operator",    icon: "👁️", color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc", desc: "View only — Dashboard, Equipment, LCD" },
};

export default function UsersManagement({ users, onCreateUser, onDeleteUser, onUpdateRole }) {
  const [form,       setForm]       = useState({ firstName: "", lastName: "", email: "", password: "", role: "management" });
  const [showForm,   setShowForm]   = useState(false);
  const [search,     setSearch]     = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [updatingId, setUpdatingId] = useState(null);

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = e => {
    e.preventDefault();
    onCreateUser(form);
    setForm({ firstName: "", lastName: "", email: "", password: "", role: "management" });
    setShowForm(false);
  };

  const handleRoleChange = async (userId, newRole) => {
    setUpdatingId(userId);
    await onUpdateRole(userId, newRole);
    setUpdatingId(null);
  };

  const adminUsers = users.filter(u => u.role === "admin");
  const nonAdmins  = users.filter(u => u.role !== "admin");

  const filteredUsers = nonAdmins.filter(u => {
    const matchSearch = `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase());
    const matchRole   = filterRole === "all" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1>Users Management</h1>
          <p className="page-subtitle">
            Manage accounts & roles — {users.length} total · {adminUsers.length} admin
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(p => !p)}
          style={{
            background: showForm ? "#64748b" : "#2563eb",
            color: "#fff", border: "none", borderRadius: "10px",
            padding: "0.65rem 1.4rem", cursor: "pointer", fontWeight: 700, fontSize: "0.9rem",
          }}
        >
          {showForm ? "✕ Cancel" : "+ New User"}
        </button>
      </div>

      {/* Stats */}
      <section className="section-block">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
          {[
            { label: "TOTAL",       value: users.length,                                   icon: "👥", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
            { label: "ADMIN",       value: users.filter(u => u.role === "admin").length,       icon: "👑", color: "#7c3aed", bg: "#f3e8ff", border: "#ddd6fe" },
            { label: "MANAGEMENT",  value: users.filter(u => u.role === "management").length,  icon: "📊", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
            { label: "MAINTENANCE", value: users.filter(u => u.role === "maintenance").length, icon: "🔧", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
            { label: "OPERATOR",    value: users.filter(u => u.role === "operator").length,    icon: "👁️", color: "#0891b2", bg: "#ecfeff", border: "#a5f3fc" },
          ].map(card => (
            <div key={card.label} style={{
              background: card.bg, border: `1px solid ${card.border}`,
              borderRadius: "16px", padding: "1.25rem 1.5rem",
              transition: "box-shadow 0.2s, transform 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--shadow-md)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.6rem" }}>
                <span style={{ fontSize: "1rem" }}>{card.icon}</span>
                <span style={{ fontSize: "0.7rem", fontWeight: 800, color: card.color, textTransform: "uppercase", letterSpacing: "0.8px" }}>{card.label}</span>
              </div>
              <div style={{ fontSize: "2rem", fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Formulaire création */}
      {showForm && (
        <section className="section-block">
          <div className="panel-card">
            <div className="panel-head">
              <div>
                <h2>Create New User</h2>
<p>Only @jesagroup.com — assign role: Management, Maintenance or Operator</p>
              </div>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <input type="text" name="firstName" placeholder="First name"
                  value={form.firstName} onChange={handleChange} required
                  style={{ padding: "0.6rem 0.85rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", outline: "none" }} />
                <input type="text" name="lastName" placeholder="Last name"
                  value={form.lastName} onChange={handleChange} required
                  style={{ padding: "0.6rem 0.85rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", outline: "none" }} />
                <input type="email" name="email" placeholder="user@jesagroup.com"
                  value={form.email} onChange={handleChange} required
                  style={{ padding: "0.6rem 0.85rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", outline: "none" }} />
                <input type="password" name="password" placeholder="Password"
                  value={form.password} onChange={handleChange} required
                  style={{ padding: "0.6rem 0.85rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", outline: "none" }} />
              </div>

              {/* Sélecteur de rôle */}
              <div style={{ marginBottom: "0.75rem" }}>
                <p style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                  Assign Role
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
{["management", "maintenance", "operator"].map(role => {
                      const cfg = ROLE_CONFIG[role];
                    return (
                      <label key={role} style={{
                        display: "flex", alignItems: "center", gap: "0.75rem",
                        padding: "0.75rem 1rem", borderRadius: "10px", cursor: "pointer",
                        border: `2px solid ${form.role === role ? cfg.color : "var(--border-color)"}`,
                        background: form.role === role ? cfg.bg : "var(--bg-main)",
                        transition: "all 0.15s",
                      }}>
                        <input type="radio" name="role" value={role}
                          checked={form.role === role}
                          onChange={handleChange}
                          style={{ accentColor: cfg.color }} />
                        <span style={{ fontSize: "1.1rem" }}>{cfg.icon}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: "0.85rem", color: cfg.color }}>{cfg.label}</div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>{cfg.desc}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <button type="submit" style={{
                background: "#38a169", color: "#fff", border: "none",
                borderRadius: "8px", padding: "0.6rem 1.5rem",
                cursor: "pointer", fontWeight: 700, fontSize: "0.9rem",
              }}>
                ✓ Create User
              </button>
            </form>
          </div>
        </section>
      )}

      {/* Recherche + filtre rôle */}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.5rem" }}>
        <input
          type="text"
          placeholder="🔍 Search by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: "1", minWidth: "200px", maxWidth: "400px",
            padding: "0.6rem 0.85rem", borderRadius: "10px",
            border: "1.5px solid var(--border-color)",
            background: "var(--bg-card)", color: "var(--text-main)",
            fontSize: "0.9rem", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: "0.4rem" }}>
{["all", "management", "maintenance", "operator"].map(r => {
              const cfg = r === "all"
              ? { label: "All", color: "#4299e1", bg: "#ebf8ff" }
              : ROLE_CONFIG[r];
            return (
              <button key={r} type="button"
                onClick={() => setFilterRole(r)}
                style={{
                  padding: "0.35rem 0.9rem", borderRadius: "20px", cursor: "pointer",
                  fontSize: "0.8rem", fontWeight: filterRole === r ? 700 : 400,
                  border: "1px solid var(--border-color)",
                  background: filterRole === r ? cfg.bg  : "var(--bg-card)",
                  color:      filterRole === r ? cfg.color : "var(--text-main)",
                }}>
                {r === "all" ? "All" : `${ROLE_CONFIG[r].icon} ${ROLE_CONFIG[r].label}`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tableau utilisateurs */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>User Accounts</h2>
          <p>{filteredUsers.length} user(s) — click role to change</p>
        </div>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Avatar</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Current Role</th>
                <th>Change Role</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length > 0 ? (
                filteredUsers.map(u => {
                  const cfg        = ROLE_CONFIG[u.role] || ROLE_CONFIG.management;
                  const isUpdating = updatingId === u.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{
                          width: 40, height: 40, borderRadius: "50%",
                          background: `linear-gradient(135deg, ${cfg.color}, ${cfg.color}cc)`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          color: "#fff", fontWeight: 700, fontSize: "0.9rem", overflow: "hidden",
                        }}>
                          {u.profileImage
                            ? <img src={u.profileImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : `${(u.firstName?.[0] || "").toUpperCase()}${(u.lastName?.[0] || "").toUpperCase()}`}
                        </div>
                      </td>
                      <td><strong style={{ color: "var(--text-main)" }}>{u.firstName} {u.lastName}</strong></td>
                      <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{u.email}</td>
                      <td>
                        <span style={{
                          background: cfg.bg, color: cfg.color,
                          border: `1px solid ${cfg.border}`,
                          borderRadius: "8px", padding: "3px 10px",
                          fontSize: "0.75rem", fontWeight: 700,
                        }}>
                          {cfg.icon} {cfg.label}
                        </span>
                      </td>
                      <td>
                        {/* Boutons pour changer le rôle */}
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          {["management", "maintenance", "operator"].map(role => {
                            const rc     = ROLE_CONFIG[role];
                            const active = u.role === role;
                            return (
                              <button key={role} type="button"
                                disabled={active || isUpdating}
                                onClick={() => handleRoleChange(u.id, role)}
                                style={{
                                  padding: "3px 10px", borderRadius: "8px", cursor: active || isUpdating ? "default" : "pointer",
                                  fontSize: "0.75rem", fontWeight: 600,
                                  border: `1px solid ${active ? rc.color : "var(--border-color)"}`,
                                  background: active ? rc.bg : "var(--bg-main)",
                                  color: active ? rc.color : "var(--text-secondary)",
                                  opacity: isUpdating ? 0.6 : 1,
                                  transition: "all 0.15s",
                                }}>
                                {isUpdating && !active ? "..." : `${rc.icon} ${rc.label}`}
                              </button>
                            );
                          })}
                        </div>
                      </td>
                      <td>
                        <button type="button" onClick={() => onDeleteUser(u.id)}
                          style={{
                            background: "transparent", color: "#e53e3e",
                            border: "1px solid #fed7d7", borderRadius: "6px",
                            padding: "5px 12px", cursor: "pointer",
                            fontSize: "0.78rem", fontWeight: 600,
                          }}>
                          🗑️ Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem" }}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

     

      {/* Admins */}
      <section className="section-block">
        <div className="section-title-wrap"><h2>Admin Accounts</h2><p>Cannot be deleted or changed</p></div>
        <div className="table-card">
          <table>
            <thead><tr><th>Avatar</th><th>Full Name</th><th>Email</th><th>Role</th></tr></thead>
            <tbody>
              {adminUsers.map(u => (
                <tr key={u.id}>
                  <td>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#fff", fontWeight: 700, fontSize: "0.9rem",
                    }}>
                      {`${(u.firstName?.[0] || "").toUpperCase()}${(u.lastName?.[0] || "").toUpperCase()}`}
                    </div>
                  </td>
                  <td><strong style={{ color: "var(--text-main)" }}>{u.firstName} {u.lastName}</strong></td>
                  <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{u.email}</td>
                  <td>
                    <span style={{ background: "#f3e8ff", color: "#7c3aed", border: "1px solid #ddd6fe", borderRadius: "8px", padding: "3px 10px", fontSize: "0.75rem", fontWeight: 700 }}>
                      👑 Admin
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}