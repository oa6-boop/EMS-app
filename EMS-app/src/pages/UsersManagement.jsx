import { useState } from "react";

export default function UsersManagement({ users, onCreateUser, onDeleteUser }) {
  const [form,     setForm]     = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [showForm, setShowForm] = useState(false);
  const [search,   setSearch]   = useState("");

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = e => {
    e.preventDefault();
    onCreateUser(form);
    setForm({ firstName: "", lastName: "", email: "", password: "" });
    setShowForm(false);
  };

  const normalUsers   = users.filter(u => u.role !== "admin");
  const adminUsers    = users.filter(u => u.role === "admin");
  const filteredUsers = normalUsers.filter(u =>
    `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1>Users Management</h1>
          <p className="page-subtitle">
            Create and manage accounts — {normalUsers.length} users · {adminUsers.length} admin
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(p => !p)}
          style={{
            background:    showForm ? "#64748b" : "#2563eb",
            color:         "#fff",
            border:        "none",
            borderRadius:  "10px",
            padding:       "0.65rem 1.4rem",
            cursor:        "pointer",
            fontWeight:    700,
            fontSize:      "0.9rem",
          }}
        >
          {showForm ? "✕ Cancel" : "+ New User"}
        </button>
      </div>

      {/* STATS — cartes plus grandes */}
      <section className="section-block">
        <div style={{
          display:               "grid",
          gridTemplateColumns:   "repeat(auto-fill, minmax(220px, 1fr))",
          gap:                   "1.25rem",
        }}>
          {[
            { label: "TOTAL USERS",   value: users.length,         sub: "All accounts",     icon: "👥", color: "#2563eb" },
            { label: "ADMINS",        value: adminUsers.length,    sub: "Full access",       icon: "👑", color: "#7c3aed" },
            { label: "REGULAR",       value: normalUsers.length,   sub: "Standard access",   icon: "👤", color: "#16a34a" },
            { label: "DOMAIN",        value: "@jesagroup.com",     sub: "Allowed domain",    icon: "🌐", color: "#0891b2", big: true },
          ].map(card => (
            <div key={card.label} style={{
              background:    "var(--bg-card)",
              border:        "1px solid var(--border-color)",
              borderRadius:  "16px",
              padding:       "1.5rem 1.75rem",
              boxShadow:     "var(--shadow-sm)",
              transition:    "box-shadow 0.2s, transform 0.2s",
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--shadow-md)"; e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = "var(--shadow-sm)"; e.currentTarget.style.transform = "none"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "1.1rem" }}>{card.icon}</span>
                <span style={{ fontSize: "0.72rem", fontWeight: 800, color: card.color, textTransform: "uppercase", letterSpacing: "0.8px" }}>
                  {card.label}
                </span>
              </div>
              <div style={{
                fontSize:   card.big ? "1.1rem" : "2rem",
                fontWeight: 800,
                color:      card.big ? card.color : "var(--text-main)",
                lineHeight: 1,
                marginBottom: "0.5rem",
              }}>
                {card.value}
              </div>
              <div style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>{card.sub}</div>
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
                <p>Only @jesagroup.com accounts are allowed</p>
              </div>
            </div>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
                <input
                  type="text" name="firstName" placeholder="First name"
                  value={form.firstName} onChange={handleChange} required
                  style={{ padding: "0.6rem 0.85rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", fontSize: "0.9rem", outline: "none" }}
                />
                <input
                  type="text" name="lastName" placeholder="Last name"
                  value={form.lastName} onChange={handleChange} required
                  style={{ padding: "0.6rem 0.85rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", fontSize: "0.9rem", outline: "none" }}
                />
                <input
                  type="email" name="email" placeholder="user@jesagroup.com"
                  value={form.email} onChange={handleChange} required
                  style={{ padding: "0.6rem 0.85rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", fontSize: "0.9rem", outline: "none" }}
                />
                <input
                  type="password" name="password" placeholder="Password"
                  value={form.password} onChange={handleChange} required
                  style={{ padding: "0.6rem 0.85rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", fontSize: "0.9rem", outline: "none" }}
                />
              </div>
              <button type="submit" style={{
                background: "#38a169", color: "#fff", border: "none", borderRadius: "8px",
                padding: "0.6rem 1.5rem", cursor: "pointer", fontWeight: 700, fontSize: "0.9rem",
              }}>
                ✓ Create User
              </button>
            </form>
          </div>
        </section>
      )}

      {/* Recherche */}
      <div>
        <input
          type="text"
          placeholder="🔍 Search by name or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width:         "100%",
            maxWidth:      "400px",
            padding:       "0.6rem 0.85rem",
            borderRadius:  "10px",
            border:        "1.5px solid var(--border-color)",
            background:    "var(--bg-card)",
            color:         "var(--text-main)",
            fontSize:      "0.9rem",
            outline:       "none",
          }}
        />
      </div>

      {/* Liste utilisateurs normaux */}
      <section className="section-block">
        <div className="section-title-wrap">
          <h2>User Accounts</h2>
          <p>{filteredUsers.length} regular users</p>
        </div>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>Avatar</th>
                <th>Full Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length > 0 ? (
                filteredUsers.map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%",
                        background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#fff", fontWeight: 700, fontSize: "0.9rem", overflow: "hidden",
                        flexShrink: 0,
                      }}>
                        {u.profileImage
                          ? <img src={u.profileImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : `${(u.firstName?.[0] || "").toUpperCase()}${(u.lastName?.[0] || "").toUpperCase()}`
                        }
                      </div>
                    </td>
                    <td><strong style={{ color: "var(--text-main)" }}>{u.firstName} {u.lastName}</strong></td>
                    <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{u.email}</td>
                    <td>
                      <span style={{
                        background: "#f0fff4", color: "#276749",
                        border: "1px solid #c6f6d5",
                        borderRadius: "8px", padding: "3px 10px",
                        fontSize: "0.75rem", fontWeight: 700,
                      }}>
                        👤 User
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => onDeleteUser(u.id)}
                        style={{
                          background: "transparent", color: "#e53e3e",
                          border: "1px solid #fed7d7", borderRadius: "6px",
                          padding: "5px 12px", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" style={{ textAlign: "center", color: "var(--text-secondary)", padding: "2rem" }}>
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
        <div className="section-title-wrap">
          <h2>Admin Accounts</h2>
          <p>Cannot be deleted</p>
        </div>
        <div className="table-card">
          <table>
            <thead>
              <tr><th>Avatar</th><th>Full Name</th><th>Email</th><th>Role</th></tr>
            </thead>
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
                    <span style={{
                      background: "#ebf8ff", color: "#2b6cb0",
                      border: "1px solid #bee3f8",
                      borderRadius: "8px", padding: "3px 10px",
                      fontSize: "0.75rem", fontWeight: 700,
                    }}>
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