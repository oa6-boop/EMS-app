import { useEffect, useState } from "react";
import { Building2, Filter, CloudSun, X } from "lucide-react";

export default function Header({
  user,
  onLogout,
  onProfileClick,
  onWeatherClick,

  lineOptions = [],
  selectedLine = "line-1",
  onLineChange,

  plantOptions = [],
  selectedPlant = "all",
  onPlantChange,

  zoneOptions = [],
  selectedZone = "all",
  onZoneChange,

  energyOptions = [],
  selectedEnergyNames = [],
  onToggleEnergy,
  onClearEnergySelection,
}) {
  const [time, setTime] = useState(new Date());
  const [panel, setPanel] = useState(null); // "location" | "energy"

  const [isDark, setIsDark] = useState(
    () => localStorage.getItem("ems_dark_mode") === "true"
  );

  useEffect(() => {
    const iv = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dark-mode", isDark);
    localStorage.setItem("ems_dark_mode", String(isDark));
  }, [isDark]);

  const toggle = (name) => {
    setPanel((p) => (p === name ? null : name));
  };

  const close = () => setPanel(null);

  const currentLine =
    lineOptions.find((l) => l.id === selectedLine)?.label || "Line 1";

  const currentPlant = selectedPlant === "all" ? "All Plants" : selectedPlant;
  const currentZone = selectedZone === "all" ? "All Zones" : selectedZone;

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "?";

  const handleLineChange = (lineId) => {
    onLineChange?.(lineId);
    onPlantChange?.("all");
    onZoneChange?.("all");
  };

  const clearLocationFilters = () => {
    onPlantChange?.("all");
    onZoneChange?.("all");
  };

  const DropPanel = ({ children, onClose, title }) => (
    <div className="filter-panel" style={{ minWidth: "260px" }}>
      <div className="filter-panel-head">
        <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{title}</span>

        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-secondary)",
          }}
        >
          <X size={14} />
        </button>
      </div>

      {children}
    </div>
  );

  return (
    <div className="header-bar">
      {/* LEFT */}
      <div className="header-left">
        <div>
          <div
            style={{
              fontWeight: 800,
              fontSize: "1rem",
              color: "var(--text-main)",
            }}
          >
            Energy Management System
          </div>

          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--text-secondary)",
              marginTop: "1px",
            }}
          >
            {currentLine}
            {selectedPlant !== "all" && ` · ${currentPlant}`}
            {selectedZone !== "all" && ` · ${currentZone}`}
          </div>
        </div>
      </div>

      {/* CENTER */}
      <div className="header-center">
        <div className="live-time-box">
          <span className="live-dot" />
          {time.toLocaleTimeString()}
        </div>
      </div>

      {/* RIGHT */}
      <div className="header-right">
        {/* LOCATION FILTER ICON ONLY */}
        <div className="header-filter-wrap">
          <button
            type="button"
            className={`header-icon-btn ${panel === "location" ? "active" : ""}`}
            onClick={() => toggle("location")}
            title="Filter by line, plant and zone"
            style={{
              width: "48px",
              height: "48px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
              borderRadius: "14px",
              background: panel === "location" ? "#2563eb" : "var(--bg-card)",
              color: panel === "location" ? "#fff" : "#2563eb",
              border:
                panel === "location"
                  ? "2px solid #2563eb"
                  : "1px solid #dbe3ef",
              boxShadow:
                panel === "location"
                  ? "0 0 0 3px rgba(37, 99, 235, 0.12)"
                  : "0 2px 8px rgba(15, 23, 42, 0.04)",
            }}
          >
            <Building2 size={22} strokeWidth={2.2} />
          </button>

          {panel === "location" && (
            <DropPanel title="Location Filters" onClose={close}>
              {/* MAIN FILTER: LINE */}
              <div style={{ marginBottom: "0.8rem" }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.8rem",
                    color: "var(--text-main)",
                    marginBottom: "0.4rem",
                  }}
                >
                  1. Production Line
                </div>

                <div className="filter-option-list">
                  {lineOptions.map((line) => (
                    <label
                      key={line.id}
                      className="filter-option-row"
                      style={{
                        cursor: "pointer",
                        padding: "5px 0",
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="radio"
                        name="line"
                        checked={selectedLine === line.id}
                        onChange={() => handleLineChange(line.id)}
                        style={{ accentColor: "#2563eb" }}
                      />

                      <span
                        style={{
                          fontWeight: selectedLine === line.id ? 700 : 400,
                          fontSize: "0.88rem",
                        }}
                      >
                        {line.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* SUB FILTER: PLANT */}
              {plantOptions.length > 0 && (
                <div style={{ marginBottom: "0.8rem" }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      color: "var(--text-main)",
                      marginBottom: "0.4rem",
                    }}
                  >
                    2. Plant
                  </div>

                  <div className="filter-option-list">
                    {["all", ...plantOptions].map((plant) => (
                      <label
                        key={plant}
                        className="filter-option-row"
                        style={{
                          cursor: "pointer",
                          padding: "4px 0",
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="radio"
                          name="plant"
                          checked={selectedPlant === plant}
                          onChange={() => onPlantChange?.(plant)}
                          style={{ accentColor: "#2563eb" }}
                        />

                        <span
                          style={{
                            fontWeight: selectedPlant === plant ? 700 : 400,
                            fontSize: "0.85rem",
                          }}
                        >
                          {plant === "all" ? "All Plants" : plant}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* SUB FILTER: ZONE */}
              {zoneOptions.length > 0 && (
                <div style={{ marginBottom: "0.8rem" }}>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: "0.8rem",
                      color: "var(--text-main)",
                      marginBottom: "0.4rem",
                    }}
                  >
                    3. Zone
                  </div>

                  <div className="filter-option-list">
                    {["all", ...zoneOptions].map((zone) => (
                      <label
                        key={zone}
                        className="filter-option-row"
                        style={{
                          cursor: "pointer",
                          padding: "4px 0",
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="radio"
                          name="zone"
                          checked={selectedZone === zone}
                          onChange={() => onZoneChange?.(zone)}
                          style={{ accentColor: "#2563eb" }}
                        />

                        <span
                          style={{
                            fontWeight: selectedZone === zone ? 700 : 400,
                            fontSize: "0.85rem",
                          }}
                        >
                          {zone === "all" ? "All Zones" : zone}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={clearLocationFilters}
                style={{
                  fontSize: "0.78rem",
                  color: "#ef4444",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  marginTop: "0.2rem",
                }}
              >
                Clear plant and zone
              </button>
            </DropPanel>
          )}
        </div>

        {/* ENERGY FILTER */}
        <div className="header-filter-wrap">
          <button
            type="button"
            className={`header-icon-btn ${panel === "energy" ? "active" : ""}`}
            onClick={() => toggle("energy")}
            title="Filter energy types"
            style={{ position: "relative" }}
          >
            <Filter size={17} />

            {selectedEnergyNames.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -4,
                  right: -4,
                  background: "#ef4444",
                  color: "#fff",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  borderRadius: "50%",
                  width: 16,
                  height: 16,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {selectedEnergyNames.length}
              </span>
            )}
          </button>

          {panel === "energy" && (
            <DropPanel title="Energy Types" onClose={close}>
              <button
                type="button"
                onClick={() => onClearEnergySelection?.()}
                style={{
                  fontSize: "0.78rem",
                  color: "#ef4444",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  marginBottom: "0.5rem",
                }}
              >
                Clear all
              </button>

              {energyOptions.length === 0 ? (
                <p
                  style={{
                    fontSize: "0.82rem",
                    color: "var(--text-secondary)",
                  }}
                >
                  No data yet
                </p>
              ) : (
                <div className="filter-option-list">
                  {energyOptions.map((name) => (
                    <label
                      key={name}
                      className="filter-option-row"
                      style={{
                        cursor: "pointer",
                        padding: "4px 0",
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedEnergyNames.includes(name)}
                        onChange={() => onToggleEnergy?.(name)}
                        style={{ accentColor: "#2563eb" }}
                      />

                      <span
                        style={{
                          fontWeight: selectedEnergyNames.includes(name)
                            ? 700
                            : 400,
                          fontSize: "0.85rem",
                        }}
                      >
                        {name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </DropPanel>
          )}
        </div>

        {/* WEATHER */}
        <button
          type="button"
          className="header-icon-btn"
          onClick={onWeatherClick}
          title="Weather"
        >
          <CloudSun size={17} />
        </button>

        {/* DARK MODE */}
        <button
          type="button"
          className="dark-mode-toggle"
          onClick={() => setIsDark((p) => !p)}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark ? "☀️" : "🌙"}
        </button>

        {/* AVATAR */}
        <button
          type="button"
          className="profile-button"
          onClick={onProfileClick}
          title="My Profile"
        >
          {user?.profileImage ? (
            <img
              src={user.profileImage}
              alt="Profile"
              className="profile-avatar-image"
            />
          ) : (
            <div className="profile-avatar">{initials}</div>
          )}
        </button>

        {/* LOGOUT */}
        <button type="button" className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}