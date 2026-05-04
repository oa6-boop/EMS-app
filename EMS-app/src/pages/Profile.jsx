import { useRef, useState } from "react";

export default function Profile({ user, onUpdateProfile }) {
  const [firstName,    setFirstName]    = useState(user.firstName    || "");
  const [lastName,     setLastName]     = useState(user.lastName     || "");
  const [password,     setPassword]     = useState("");
  const [profileImage, setProfileImage] = useState(user.profileImage || "");
  const [showMenu,     setShowMenu]     = useState(false);
  const [saved,        setSaved]        = useState(false);
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setProfileImage(URL.createObjectURL(file));
      setShowMenu(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onUpdateProfile({ ...user, firstName, lastName, password, profileImage });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();

  return (
    <div className="overview-page">
      {/* Header */}
      <div className="overview-header-row">
        <div>
          <h1>My Profile</h1>
          <p className="page-subtitle">
            Manage your account information — {user.email}
          </p>
        </div>
        {saved && (
          <div style={{
            background:    "#f0fff4",
            border:        "1px solid #c6f6d5",
            borderRadius:  "10px",
            padding:       "0.6rem 1.25rem",
            color:         "#276749",
            fontWeight:    700,
            fontSize:      "0.88rem",
          }}>
            ✅ Profile updated successfully!
          </div>
        )}
      </div>

      {/* Carte principale — pleine largeur */}
      <div style={{
        display:               "grid",
        gridTemplateColumns:   "320px 1fr",
        gap:                   "1.5rem",
        alignItems:            "flex-start",
      }}>

        {/* Colonne gauche — Avatar + Infos */}
        <div style={{
          background:    "var(--bg-card)",
          border:        "1px solid var(--border-color)",
          borderRadius:  "20px",
          padding:       "2rem",
          boxShadow:     "var(--shadow-sm)",
          display:       "flex",
          flexDirection: "column",
          alignItems:    "center",
          gap:           "1rem",
          textAlign:     "center",
        }}>
          {/* Avatar */}
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setShowMenu(p => !p)}
              style={{
                width:           120,
                height:          120,
                borderRadius:    "50%",
                background:      "linear-gradient(135deg, #2563eb, #1d4ed8)",
                display:         "flex",
                alignItems:      "center",
                justifyContent:  "center",
                cursor:          "pointer",
                overflow:        "hidden",
                boxShadow:       "0 8px 28px rgba(37, 99, 235, 0.35)",
                fontSize:        "2.5rem",
                fontWeight:      700,
                color:           "#fff",
                border:          "4px solid #fff",
                transition:      "transform 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "scale(1.04)"}
              onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
            >
              {profileImage
                ? <img src={profileImage} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span>{initials || "?"}</span>
              }
            </div>

            {/* Badge rôle */}
            <div style={{
              position:      "absolute",
              bottom:        4,
              right:         4,
              background:    user.role === "admin" ? "#7c3aed" : "#16a34a",
              color:         "#fff",
              borderRadius:  "50%",
              width:         28,
              height:        28,
              display:       "flex",
              alignItems:    "center",
              justifyContent:"center",
              fontSize:      "0.9rem",
              border:        "3px solid var(--bg-card)",
            }}>
              {user.role === "admin" ? "👑" : "👤"}
            </div>

            {/* Menu avatar */}
            {showMenu && (
              <div style={{
                position:      "absolute",
                top:           130,
                left:          "50%",
                transform:     "translateX(-50%)",
                background:    "var(--bg-card)",
                border:        "1px solid var(--border-color)",
                borderRadius:  "12px",
                padding:       "0.5rem",
                zIndex:        50,
                minWidth:      160,
                boxShadow:     "var(--shadow-md)",
              }}>
                <button type="button"
                  onClick={() => { fileInputRef.current.click(); setShowMenu(false); }}
                  style={{ display: "block", width: "100%", padding: "0.5rem 0.75rem", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontSize: "0.85rem", borderRadius: "6px", color: "var(--text-main)" }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--bg-main)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  📷 Change photo
                </button>
                <button type="button"
                  onClick={() => { setProfileImage(""); setShowMenu(false); }}
                  style={{ display: "block", width: "100%", padding: "0.5rem 0.75rem", textAlign: "left", background: "transparent", border: "none", cursor: "pointer", fontSize: "0.85rem", borderRadius: "6px", color: "#e53e3e" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#fff5f5"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  🗑️ Remove photo
                </button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
          </div>

          {/* Infos user */}
          <div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--text-main)" }}>
              {firstName} {lastName}
            </div>
            <div style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginTop: "4px" }}>
              {user.email}
            </div>
            <div style={{
              display:       "inline-block",
              marginTop:     "10px",
              background:    user.role === "admin" ? "#f3e8ff" : "#f0fff4",
              color:         user.role === "admin" ? "#7c3aed"  : "#276749",
              border:        `1px solid ${user.role === "admin" ? "#ddd6fe" : "#c6f6d5"}`,
              borderRadius:  "999px",
              padding:       "4px 14px",
              fontSize:      "0.82rem",
              fontWeight:    700,
            }}>
              {user.role === "admin" ? "👑 Admin" : "👤 User"}
            </div>
          </div>

          {/* Stats rapides */}
          <div style={{
            width:         "100%",
            display:       "grid",
            gridTemplateColumns: "1fr 1fr",
            gap:           "0.6rem",
            marginTop:     "0.5rem",
          }}>
            {[
              { label: "Role",    value: user.role === "admin" ? "Admin" : "User" },
              { label: "ID",      value: `#${user.id}` },
              { label: "Status",  value: "Active ✅" },
              { label: "System",  value: "JESA EMS" },
            ].map(stat => (
              <div key={stat.label} style={{
                background:    "var(--bg-main)",
                borderRadius:  "10px",
                padding:       "0.65rem",
                textAlign:     "center",
              }}>
                <div style={{ fontSize: "0.68rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>
                  {stat.label}
                </div>
                <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-main)", marginTop: "2px" }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Clic pour changer photo */}
          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Click avatar to change photo
          </p>
        </div>

        {/* Colonne droite — Formulaire */}
        <div style={{
          background:    "var(--bg-card)",
          border:        "1px solid var(--border-color)",
          borderRadius:  "20px",
          padding:       "2rem 2.25rem",
          boxShadow:     "var(--shadow-sm)",
        }}>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1.5rem", color: "var(--text-main)" }}>
            Account Settings
          </h2>

          <form onSubmit={handleSubmit}>
            {/* Prénom + Nom */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.4rem", color: "var(--text-secondary)" }}>
                  First Name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                  style={{
                    width: "100%", padding: "0.7rem 0.9rem",
                    borderRadius: "10px", border: "1.5px solid var(--border-color)",
                    background: "var(--bg-main)", color: "var(--text-main)",
                    fontSize: "0.95rem", outline: "none", transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = "#2563eb"}
                  onBlur={e => e.target.style.borderColor = "var(--border-color)"}
                />
              </div>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.4rem", color: "var(--text-secondary)" }}>
                  Last Name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                  style={{
                    width: "100%", padding: "0.7rem 0.9rem",
                    borderRadius: "10px", border: "1.5px solid var(--border-color)",
                    background: "var(--bg-main)", color: "var(--text-main)",
                    fontSize: "0.95rem", outline: "none", transition: "border-color 0.2s",
                  }}
                  onFocus={e => e.target.style.borderColor = "#2563eb"}
                  onBlur={e => e.target.style.borderColor = "var(--border-color)"}
                />
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.4rem", color: "var(--text-secondary)" }}>
                Email address (cannot be changed)
              </label>
              <input
                type="email"
                value={user.email}
                disabled
                style={{
                  width: "100%", padding: "0.7rem 0.9rem",
                  borderRadius: "10px", border: "1.5px solid var(--border-color)",
                  background: "var(--border-color)", color: "var(--text-secondary)",
                  fontSize: "0.95rem", cursor: "not-allowed",
                }}
              />
            </div>

            {/* Mot de passe */}
            <div style={{ marginBottom: "1.75rem" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.4rem", color: "var(--text-secondary)" }}>
                New Password
                <span style={{ fontWeight: 400, marginLeft: "0.4rem" }}>(leave empty to keep current)</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter new password"
                style={{
                  width: "100%", padding: "0.7rem 0.9rem",
                  borderRadius: "10px", border: "1.5px solid var(--border-color)",
                  background: "var(--bg-main)", color: "var(--text-main)",
                  fontSize: "0.95rem", outline: "none", transition: "border-color 0.2s",
                }}
                onFocus={e => e.target.style.borderColor = "#2563eb"}
                onBlur={e => e.target.style.borderColor = "var(--border-color)"}
              />
            </div>

            {/* Séparateur */}
            <div style={{ borderTop: "1px solid var(--border-color)", marginBottom: "1.5rem" }} />

            {/* Bouton */}
            <button
              type="submit"
              style={{
                width:         "100%",
                background:    "linear-gradient(135deg, #2563eb, #1d4ed8)",
                color:         "#fff",
                border:        "none",
                borderRadius:  "12px",
                padding:       "0.85rem",
                cursor:        "pointer",
                fontWeight:    800,
                fontSize:      "1rem",
                transition:    "all 0.3s",
                letterSpacing: "0.2px",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 10px 28px rgba(37,99,235,0.35)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
            >
              💾 Save Changes
            </button>
          </form>

          {/* Info sécurité */}
          <div style={{
            marginTop:     "1.5rem",
            background:    "#f8fafc",
            border:        "1px solid var(--border-color)",
            borderRadius:  "10px",
            padding:       "1rem",
            fontSize:      "0.82rem",
            color:         "var(--text-secondary)",
          }}>

          </div>
        </div>
      </div>

      {/* Responsive — sur mobile en colonne */}
      <style>{`
        @media (max-width: 900px) {
          .profile-two-col {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}