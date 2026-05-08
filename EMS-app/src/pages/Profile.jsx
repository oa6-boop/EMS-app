import { useRef, useState } from "react";
import { updateMyProfile } from "../api/usersApi";

export default function Profile({ user, onUpdateProfile }) {
  const [firstName,    setFirstName]    = useState(user.firstName    || "");
  const [lastName,     setLastName]     = useState(user.lastName     || "");
  const [password,     setPassword]     = useState("");
  const [confirmPwd,   setConfirmPwd]   = useState("");
  const [profileImage, setProfileImage] = useState(user.profileImage || "");
  const [showMenu,     setShowMenu]     = useState(false);
  const [status,       setStatus]       = useState(""); // "saving" | "success" | "error"
  const [errorMsg,     setErrorMsg]     = useState("");
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setProfileImage(reader.result);
      reader.readAsDataURL(file);
      setShowMenu(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    // Validation mot de passe
    if (password && password.length < 6) {
      setErrorMsg("Password must be at least 6 characters.");
      return;
    }
    if (password && password !== confirmPwd) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setStatus("saving");
    try {
      const token = localStorage.getItem("token");
      const result = await updateMyProfile(
        { firstName, lastName, password, profileImage },
        token
      );

      // Mettre à jour le state global dans App.jsx
      onUpdateProfile({
        ...user,
        firstName:    result.firstName    || firstName,
        lastName:     result.lastName     || lastName,
        profileImage: result.profileImage || profileImage,
      });

      setPassword("");
      setConfirmPwd("");
      setStatus("success");
      setTimeout(() => setStatus(""), 4000);
    } catch (err) {
      setErrorMsg(err.message || "Failed to save. Try again.");
      setStatus("error");
      setTimeout(() => setStatus(""), 4000);
    }
  };

  const initials = `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();

  const roleConfig = {
    admin:       { label: "Admin",       icon: "👑", color: "#7c3aed", bg: "#f3e8ff", border: "#ddd6fe" },
    management:  { label: "Management",  icon: "📊", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
    maintenance: { label: "Maintenance", icon: "🔧", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  };
  const rc = roleConfig[user.role] || roleConfig.management;

  return (
    <div className="overview-page">
      <div className="overview-header-row">
        <div>
          <h1>My Profile</h1>
          <p className="page-subtitle">
            Manage your account — {user.email}
          </p>
        </div>

        {/* Statut sauvegarde */}
        {status === "success" && (
          <div style={{
            background: "#f0fff4", border: "1px solid #c6f6d5",
            borderRadius: "10px", padding: "0.6rem 1.25rem",
            color: "#276749", fontWeight: 700, fontSize: "0.88rem",
          }}>
            ✅ Profile updated successfully!
          </div>
        )}
        {status === "error" && (
          <div style={{
            background: "#fff5f5", border: "1px solid #fed7d7",
            borderRadius: "10px", padding: "0.6rem 1.25rem",
            color: "#c53030", fontWeight: 700, fontSize: "0.88rem",
          }}>
            ⚠ {errorMsg}
          </div>
        )}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "300px 1fr",
        gap: "1.5rem",
        alignItems: "flex-start",
      }}>

        {/* ── Colonne gauche — Avatar ── */}
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border-color)",
          borderRadius: "20px", padding: "2rem", boxShadow: "var(--shadow-sm)",
          display: "flex", flexDirection: "column", alignItems: "center",
          gap: "1rem", textAlign: "center",
        }}>
          {/* Avatar cliquable */}
          <div style={{ position: "relative" }}>
            <div
              onClick={() => setShowMenu(p => !p)}
              style={{
                width: 120, height: 120, borderRadius: "50%",
                background: `linear-gradient(135deg, ${rc.color}, ${rc.color}cc)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", overflow: "hidden",
                boxShadow: `0 8px 28px ${rc.color}55`,
                fontSize: "2.5rem", fontWeight: 700, color: "#fff",
                border: "4px solid var(--bg-card)",
                transition: "transform 0.2s",
              }}
              onMouseEnter={e => e.currentTarget.style.transform = "scale(1.04)"}
              onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}
            >
              {profileImage
                ? <img src={profileImage} alt="Profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <span>{initials || "?"}</span>}
            </div>

            {/* Badge rôle */}
            <div style={{
              position: "absolute", bottom: 4, right: 4,
              background: rc.color, color: "#fff", borderRadius: "50%",
              width: 28, height: 28, display: "flex",
              alignItems: "center", justifyContent: "center",
              fontSize: "0.85rem", border: "3px solid var(--bg-card)",
            }}>
              {rc.icon}
            </div>

            {/* Menu photo */}
            {showMenu && (
              <div style={{
                position: "absolute", top: 130, left: "50%", transform: "translateX(-50%)",
                background: "var(--bg-card)", border: "1px solid var(--border-color)",
                borderRadius: "12px", padding: "0.5rem", zIndex: 50,
                minWidth: 160, boxShadow: "var(--shadow-md)",
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
            <input ref={fileInputRef} type="file" accept="image/*"
              onChange={handleImageChange} style={{ display: "none" }} />
          </div>

          {/* Infos */}
          <div>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--text-main)" }}>
              {firstName} {lastName}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: 4 }}>
              {user.email}
            </div>
            <div style={{
              display: "inline-block", marginTop: 10,
              background: rc.bg, color: rc.color,
              border: `1px solid ${rc.border}`,
              borderRadius: "999px", padding: "4px 14px",
              fontSize: "0.82rem", fontWeight: 700,
            }}>
              {rc.icon} {rc.label}
            </div>
          </div>

          {/* Stats */}
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            {[
              { label: "Role",   value: rc.label    },
              { label: "ID",     value: `#${user.id}` },
              { label: "Status", value: "Active ✅"  },
              { label: "System", value: "JESA EMS"   },
            ].map(s => (
              <div key={s.label} style={{
                background: "var(--bg-main)", borderRadius: "10px",
                padding: "0.6rem", textAlign: "center",
              }}>
                <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: 700 }}>{s.label}</div>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--text-main)", marginTop: 2 }}>{s.value}</div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            Click avatar to change photo
          </p>
        </div>

        {/* ── Colonne droite — Formulaire ── */}
        <div style={{
          background: "var(--bg-card)", border: "1px solid var(--border-color)",
          borderRadius: "20px", padding: "2rem 2.25rem", boxShadow: "var(--shadow-sm)",
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
                <input type="text" value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder="First name"
                  style={{ width: "100%", padding: "0.7rem 0.9rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", fontSize: "0.95rem", outline: "none" }}
                  onFocus={e => e.target.style.borderColor = rc.color}
                  onBlur={e  => e.target.style.borderColor = "var(--border-color)"} />
              </div>
              <div>
                <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.4rem", color: "var(--text-secondary)" }}>
                  Last Name
                </label>
                <input type="text" value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder="Last name"
                  style={{ width: "100%", padding: "0.7rem 0.9rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", fontSize: "0.95rem", outline: "none" }}
                  onFocus={e => e.target.style.borderColor = rc.color}
                  onBlur={e  => e.target.style.borderColor = "var(--border-color)"} />
              </div>
            </div>

            {/* Email (readonly) */}
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.4rem", color: "var(--text-secondary)" }}>
                Email address (cannot be changed)
              </label>
              <input type="email" value={user.email} disabled
                style={{ width: "100%", padding: "0.7rem 0.9rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--border-color)", color: "var(--text-secondary)", fontSize: "0.95rem", cursor: "not-allowed" }} />
            </div>

            {/* Séparateur */}
            <div style={{ borderTop: "1px solid var(--border-color)", margin: "1.5rem 0 1.25rem" }} />

            <div style={{
              background: "#fffbeb", border: "1px solid #fde68a",
              borderRadius: "10px", padding: "0.75rem 1rem",
              fontSize: "0.82rem", color: "#92400e", marginBottom: "1.25rem",
            }}>
              🔑 <strong>Change Password</strong> — Leave empty to keep your current password
            </div>

            {/* Nouveau mot de passe */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.4rem", color: "var(--text-secondary)" }}>
                New Password
              </label>
              <input type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter new password (min. 6 characters)"
                style={{ width: "100%", padding: "0.7rem 0.9rem", borderRadius: "10px", border: "1.5px solid var(--border-color)", background: "var(--bg-main)", color: "var(--text-main)", fontSize: "0.95rem", outline: "none" }}
                onFocus={e => e.target.style.borderColor = rc.color}
                onBlur={e  => e.target.style.borderColor = "var(--border-color)"} />
            </div>

            {/* Confirmer mot de passe */}
            <div style={{ marginBottom: "1.75rem" }}>
              <label style={{ fontSize: "0.82rem", fontWeight: 600, display: "block", marginBottom: "0.4rem", color: "var(--text-secondary)" }}>
                Confirm New Password
              </label>
              <input type="password" value={confirmPwd}
                onChange={e => setConfirmPwd(e.target.value)}
                placeholder="Repeat new password"
                style={{
                  width: "100%", padding: "0.7rem 0.9rem", borderRadius: "10px",
                  border: `1.5px solid ${password && confirmPwd && password !== confirmPwd ? "#e53e3e" : "var(--border-color)"}`,
                  background: "var(--bg-main)", color: "var(--text-main)",
                  fontSize: "0.95rem", outline: "none",
                }}
                onFocus={e => e.target.style.borderColor = rc.color}
                onBlur={e  => e.target.style.borderColor = "var(--border-color)"} />
              {password && confirmPwd && password !== confirmPwd && (
                <p style={{ color: "#e53e3e", fontSize: "0.8rem", marginTop: "4px" }}>
                  ⚠ Passwords do not match
                </p>
              )}
              {password && confirmPwd && password === confirmPwd && (
                <p style={{ color: "#38a169", fontSize: "0.8rem", marginTop: "4px" }}>
                  ✅ Passwords match
                </p>
              )}
            </div>

            {/* Erreur */}
            {errorMsg && status !== "saving" && (
              <div style={{
                background: "#fff5f5", border: "1px solid #fed7d7",
                borderRadius: "8px", padding: "0.6rem 0.85rem",
                color: "#c53030", fontSize: "0.85rem", marginBottom: "1rem",
              }}>
                ⚠ {errorMsg}
              </div>
            )}

            {/* Bouton Save */}
            <button type="submit"
              disabled={status === "saving"}
              style={{
                width: "100%",
                background: status === "saving"
                  ? "#94a3b8"
                  : `linear-gradient(135deg, ${rc.color}, ${rc.color}cc)`,
                color: "#fff", border: "none", borderRadius: "12px",
                padding: "0.85rem", cursor: status === "saving" ? "default" : "pointer",
                fontWeight: 800, fontSize: "1rem", transition: "all 0.3s",
              }}
              onMouseEnter={e => { if (status !== "saving") { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = `0 10px 28px ${rc.color}55`; }}}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
            >
              {status === "saving" ? "⏳ Saving..." : "💾 Save Changes"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}