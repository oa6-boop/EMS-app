import { useEffect, useState } from "react";
import { Factory, Filter, CloudSun, X } from "lucide-react";

export default function Header({
  user,
  onLogout,
  onProfileClick,
  onWeatherClick,
  lineOptions          = [],
  selectedLine         = "line-1",
  onLineChange,
  energyOptions        = [],
  selectedEnergyNames  = [],
  onToggleEnergy,
  onClearEnergySelection,
}) {
  const [time,           setTime]           = useState(new Date());
  const [showLinePanel,  setShowLinePanel]  = useState(false);
  const [showEnergy,     setShowEnergy]     = useState(false);
  const [isDark,         setIsDark]         = useState(() => localStorage.getItem("ems_dark_mode") === "true");

  /* Clock */
  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  /* Dark mode */
  useEffect(() => {
    document.body.classList.toggle("dark-mode", isDark);
    localStorage.setItem("ems_dark_mode", isDark);
  }, [isDark]);

  const currentLineLabel = lineOptions.find(l => l.id === selectedLine)?.label || "Line 1";

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "?";

  return (
    <div className="header-bar">
      {/* LEFT — Logo + Titre */}
      <div className="header-left">
        <div>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-main)", letterSpacing: "-0.2px" }}>
            Energy Management System
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "1px" }}>
          </div>
        </div>
      </div>

      {/* CENTER — Horloge */}
      <div className="header-center">
        <div className="live-time-box">
          <span className="live-dot" />
          {time.toLocaleTimeString()}
        </div>
      </div>

      {/* RIGHT — Actions */}
      <div className="header-right">

        {/* Sélecteur de ligne */}
        <div className="header-filter-wrap">
          <button
            type="button"
            className={`header-icon-btn ${showLinePanel ? "active" : ""}`}
            onClick={() => { setShowLinePanel(p => !p); setShowEnergy(false); }}
            title="Select production line"
          >
            <Factory size={17} />
          </button>
          {showLinePanel && (
            <div className="filter-panel" style={{ minWidth: "230px" }}>
              <div className="filter-panel-head">
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Production Line</span>
                <button type="button" onClick={() => setShowLinePanel(false)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}>
                  <X size={14} />
                </button>
              </div>
              <div className="filter-option-list">
                {lineOptions.map(line => (
                  <label key={line.id} className="filter-option-row" style={{ cursor: "pointer", padding: "4px 0" }}>
                    <input
                      type="radio"
                      name="line"
                      checked={selectedLine === line.id}
                      onChange={() => { onLineChange?.(line.id); setShowLinePanel(false); }}
                      style={{ accentColor: "#2563eb" }}
                    />
                    <span style={{ fontWeight: selectedLine === line.id ? 700 : 400 }}>{line.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Filtre énergies */}
        <div className="header-filter-wrap">
          <button
            type="button"
            className={`header-icon-btn ${showEnergy ? "active" : ""}`}
            onClick={() => { setShowEnergy(p => !p); setShowLinePanel(false); }}
            title="Filter energy types"
            style={{ position: "relative" }}
          >
            <Filter size={17} />
            {selectedEnergyNames.length > 0 && (
              <span style={{
                position: "absolute", top: -4, right: -4,
                background: "#ef4444", color: "#fff",
                fontSize: "0.6rem", fontWeight: 700,
                borderRadius: "50%", width: 16, height: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {selectedEnergyNames.length}
              </span>
            )}
          </button>
          {showEnergy && (
            <div className="filter-panel energy-filter-panel">
              <div className="filter-panel-head">
                <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>Energy Types</span>
                <button type="button" className="clear-filter-btn"
                  onClick={() => { onClearEnergySelection?.(); }}>
                  Clear all
                </button>
              </div>
              {energyOptions.length === 0 ? (
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>No data yet</p>
              ) : (
                <div className="filter-option-list">
                  {energyOptions.map(name => (
                    <label key={name} className="filter-option-row" style={{ cursor: "pointer", padding: "4px 0" }}>
                      <input
                        type="checkbox"
                        checked={selectedEnergyNames.includes(name)}
                        onChange={() => onToggleEnergy?.(name)}
                        style={{ accentColor: "#2563eb" }}
                      />
                      <span style={{ fontWeight: selectedEnergyNames.includes(name) ? 700 : 400, fontSize: "0.85rem" }}>
                        {name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Météo */}
        <button
          type="button"
          className="header-icon-btn"
          onClick={onWeatherClick}
          title="Weather"
        >
          <CloudSun size={17} />
        </button>

        {/* Dark mode */}
        <button
          type="button"
          className="dark-mode-toggle"
          onClick={() => setIsDark(p => !p)}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark ? "☀️" : "🌙"}
        </button>

        {/* Avatar */}
        <button
          type="button"
          className="profile-button"
          onClick={onProfileClick}
          title="My Profile"
        >
          {user?.profileImage ? (
            <img src={user.profileImage} alt="Profile" className="profile-avatar-image" />
          ) : (
            <div className="profile-avatar">{initials}</div>
          )}
        </button>

        {/* Logout */}
        <button type="button" className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}