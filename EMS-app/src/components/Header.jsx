import { useEffect, useMemo, useState } from "react";
import { Building2, Filter, CloudSun, X } from "lucide-react";

export default function Header({
  user,
  onLogout,
  onProfileClick,
  onWeatherClick,

  structure = [],            // arbre Plant → Line → Zone → Equipment
  selection = { plant: "", line: "", zone: "" },
  onSelectionChange,

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

  const { plant, line, zone } = selection;

  // Options en cascade
  const plants = useMemo(() => structure.map((p) => p.plant), [structure]);

  const lines = useMemo(() => {
    if (!plant) return [];
    const p = structure.find((x) => x.plant === plant);
    return p ? p.lines.map((l) => l.line) : [];
  }, [structure, plant]);

  const zones = useMemo(() => {
    if (!plant || !line) return [];
    const p = structure.find((x) => x.plant === plant);
    const l = p?.lines.find((x) => x.line === line);
    return l ? l.zones.map((z) => z.zone) : [];
  }, [structure, plant, line]);

  const equipmentCount = useMemo(() => {
    const set = new Set();
    structure.forEach((p) => {
      if (plant && p.plant !== plant) return;
      p.lines.forEach((l) => {
        if (line && l.line !== line) return;
        l.zones.forEach((z) => {
          if (zone && z.zone !== zone) return;
          z.equipment.forEach((e) => set.add(e));
        });
      });
    });
    return set.size;
  }, [structure, plant, line, zone]);

  const toggle = (name) => setPanel((p) => (p === name ? null : name));
  const close = () => setPanel(null);

  const initials = user
    ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase()
    : "?";

  // Handlers cascadants
  const handlePlant = (p) => onSelectionChange?.({ plant: p, line: "", zone: "" });
  const handleLine = (l) => onSelectionChange?.({ plant, line: l, zone: "" });
  const handleZone = (z) => onSelectionChange?.({ plant, line, zone: z });
  const clearAll = () => onSelectionChange?.({ plant: "", line: "", zone: "" });

  const breadcrumb = [plant || "All Plants", line, zone].filter(Boolean).join(" · ");

  const DropPanel = ({ children, onClose, title }) => (
    <div className="filter-panel" style={{ minWidth: "260px" }}>
      <div className="filter-panel-head">
        <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>{title}</span>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-secondary)" }}
        >
          <X size={14} />
        </button>
      </div>
      {children}
    </div>
  );

  const SectionTitle = ({ children }) => (
    <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--text-main)", marginBottom: "0.4rem" }}>
      {children}
    </div>
  );

  const Row = ({ checked, onChange, label, group }) => (
    <label
      className="filter-option-row"
      style={{ cursor: "pointer", padding: "5px 0", display: "flex", gap: "8px", alignItems: "center" }}
    >
      <input type="radio" name={group} checked={checked} onChange={onChange} style={{ accentColor: "#2563eb" }} />
      <span style={{ fontWeight: checked ? 700 : 400, fontSize: "0.86rem" }}>{label}</span>
    </label>
  );

  return (
    <div className="header-bar">
      {/* LEFT */}
      <div className="header-left">
        <div>
          <div style={{ fontWeight: 800, fontSize: "1rem", color: "var(--text-main)" }}>
            Energy Management System
          </div>
          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "1px" }}>
            {breadcrumb} · {equipmentCount} equipment
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
        {/* LOCATION FILTER : Plant → Line → Zone */}
        <div className="header-filter-wrap">
          <button
            type="button"
            className={`header-icon-btn ${panel === "location" ? "active" : ""}`}
            onClick={() => toggle("location")}
            title="Filter by plant, line and zone"
            style={{
              width: "48px", height: "48px", display: "flex", alignItems: "center",
              justifyContent: "center", padding: 0, borderRadius: "14px",
              background: panel === "location" ? "#2563eb" : "var(--bg-card)",
              color: panel === "location" ? "#fff" : "#2563eb",
              border: panel === "location" ? "2px solid #2563eb" : "1px solid #dbe3ef",
              boxShadow: panel === "location"
                ? "0 0 0 3px rgba(37, 99, 235, 0.12)"
                : "0 2px 8px rgba(15, 23, 42, 0.04)",
            }}
          >
            <Building2 size={22} strokeWidth={2.2} />
          </button>

          {panel === "location" && (
            <DropPanel title="Location Filters" onClose={close}>
              {/* 1. PLANT */}
              <div style={{ marginBottom: "0.8rem" }}>
                <SectionTitle>1. Plant</SectionTitle>
                <div className="filter-option-list">
                  <Row group="plant" checked={plant === ""} onChange={() => handlePlant("")} label="All Plants" />
                  {plants.map((p) => (
                    <Row key={p} group="plant" checked={plant === p} onChange={() => handlePlant(p)} label={p} />
                  ))}
                </div>
              </div>

              {/* 2. LINE */}
              {plant && lines.length > 0 && (
                <div style={{ marginBottom: "0.8rem" }}>
                  <SectionTitle>2. Production Line</SectionTitle>
                  <div className="filter-option-list">
                    <Row group="line" checked={line === ""} onChange={() => handleLine("")} label="All Lines" />
                    {lines.map((l) => (
                      <Row key={l} group="line" checked={line === l} onChange={() => handleLine(l)} label={l} />
                    ))}
                  </div>
                </div>
              )}

              {/* 3. ZONE */}
              {line && zones.length > 0 && (
                <div style={{ marginBottom: "0.8rem" }}>
                  <SectionTitle>3. Zone</SectionTitle>
                  <div className="filter-option-list">
                    <Row group="zone" checked={zone === ""} onChange={() => handleZone("")} label="All Zones" />
                    {zones.map((z) => (
                      <Row key={z} group="zone" checked={zone === z} onChange={() => handleZone(z)} label={z} />
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: "0.78rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>
                ⚙️ {equipmentCount} equipment
                {zone ? " in zone" : line ? " in line" : plant ? " in plant" : " total"}
              </div>

              <button
                type="button"
                onClick={clearAll}
                style={{ fontSize: "0.78rem", color: "#ef4444", background: "none", border: "none", cursor: "pointer" }}
              >
                Clear all filters
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
              <span style={{
                position: "absolute", top: -4, right: -4, background: "#ef4444", color: "#fff",
                fontSize: "0.6rem", fontWeight: 700, borderRadius: "50%", width: 16, height: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {selectedEnergyNames.length}
              </span>
            )}
          </button>

          {panel === "energy" && (
            <DropPanel title="Energy Types" onClose={close}>
              <button
                type="button"
                onClick={() => onClearEnergySelection?.()}
                style={{ fontSize: "0.78rem", color: "#ef4444", background: "none", border: "none", cursor: "pointer", marginBottom: "0.5rem" }}
              >
                Clear all
              </button>

              {energyOptions.length === 0 ? (
                <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>No data yet</p>
              ) : (
                <div className="filter-option-list">
                  {energyOptions.map((name) => (
                    <label
                      key={name}
                      className="filter-option-row"
                      style={{ cursor: "pointer", padding: "4px 0", display: "flex", gap: "8px", alignItems: "center" }}
                    >
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
            </DropPanel>
          )}
        </div>

        {/* WEATHER */}
        <button type="button" className="header-icon-btn" onClick={onWeatherClick} title="Weather">
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
        <button type="button" className="profile-button" onClick={onProfileClick} title="My Profile">
          {user?.profileImage ? (
            <img src={user.profileImage} alt="Profile" className="profile-avatar-image" />
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