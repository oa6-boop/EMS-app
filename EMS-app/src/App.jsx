import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import IndustryOverview from "./pages/IndustryOverview";
import RealTimeMonitoring from "./pages/RealTimeMonitoring";
import EquipmentStatus from "./pages/EquipmentStatus";
import PowerQuality from "./pages/PowerQuality";
import CarbonEmissions from "./pages/CarbonEmissions";
import Forecasting from "./pages/Forecasting";
import ReportsAnalytics from "./pages/ReportsAnalytics";
import AlarmsEvents from "./pages/AlarmsEvents";
import Profile from "./pages/Profile";
import UsersManagement from "./pages/UsersManagement";
import WeatherPage from "./pages/WeatherPage";
import UrgentMessages from "./pages/UrgentMessages";
import AuditLogs from "./pages/AuditLogs";
import Messages from "./pages/Messages";
import HistoricalData from "./pages/HistoricalData";
import AlarmThresholds from "./pages/AlarmThresholds";
import MaintenancePage from "./pages/MaintenancePage";
import EnergyObjectives from "./pages/EnergyObjectives";
import ChatbotWidget from "./components/ChatbotWidget";
import { useWebSocket } from "./hooks/useWebSocket";
import EnergyPriceAnalysis from "./pages/EnergyPriceAnalysis";
import {
  fetchLatestTelemetry,
  fetchStructure,
  fetchPowerQualityHistory,
  fetchCarbonHistory,
} from "./api/emsApi";
import {
  createUser, deleteUser, fetchUrgentMessages,
  fetchUrgentMessagesCount, fetchUsers, regenerateUserPassword,
} from "./api/usersApi";
import { loginUser, getCurrentUser, sendForgotPasswordRequest } from "./api/authApi";
import { fetchLatestMessageNotifications } from "./api/chatApi";

const VALID_PAGES = [
  "dashboard", "industry", "realtime", "equipment", "power",
  "carbon", "forecasting", "reports", "alarms", "weather",
  "profile", "users", "urgent", "audit", "messages",
  "history", "thresholds", "maintenance", "objectives", "prices",
];

const DEFAULT_LINE = { id: "line-1", label: "Production Line 1" };

function getSavedPage() {
  try {
    const saved = localStorage.getItem("ems_active_page");
    if (saved && VALID_PAGES.includes(saved)) return saved;
  } catch {}
  return "dashboard";
}

function buildEnergyDefaults(name) {
  const l = name.toLowerCase();
  if (l.includes("electric") || l.includes("électric")) return { min: 0, max: 500, step: 10 };
  if (l.includes("kwh"))    return { min: 0, max: 500,  step: 10 };
  if (l.includes("co2")    || l.includes("carbon"))     return { min: 0, max: 200, step: 1  };
  if (l.includes("eau")    || l.includes("water"))      return { min: 0, max: 200, step: 5  };
  if (l.includes("vapeur") || l.includes("steam"))      return { min: 0, max: 400, step: 10 };
  if (l.includes("solaire")|| l.includes("solar"))      return { min: 0, max: 300, step: 5  };
  if (l.includes("fuel")   || l.includes("carburant"))  return { min: 0, max: 500, step: 10 };
  return { min: 0, max: 1000, step: 10 };
}

function createChart(value, max) {
  const ratio = Math.max(10, Math.min(95, (value / (max || 500)) * 100));
  return Array.from({ length: 10 }, (_, i) =>
    Math.max(5, Math.min(100, ratio + ((i % 3) - 1) * 3))
  );
}

function convertEnergies(lineData = []) {
  return lineData.map((item, index) => {
    const d = buildEnergyDefaults(item.energy_name);
    return {
      id:        item.id || index + 1,
      name:      item.energy_name,
      unit:      item.unit,
      value:     Number(item.value),
      min:       d.min,
      max:       d.max,
      step:      d.step,
      chart:     createChart(Number(item.value), d.max),
      cost:      Number(item.cost   || 0),
      co2_kg:    Number(item.co2_kg || 0),
      timestamp: item.timestamp,
      rawData: {
        voltage:      item.voltage,
        frequency:    item.frequency,
        power_factor: item.power_factor,
        thd:          item.thd,
        equipment:    item.equipment,
        area:         item.area,
        unit_name:    item.unit_name,
        plant:        item.plant,
      },
    };
  });
}

function buildElectricalData(energies) {
  const elec = energies.filter(
    e =>
      e.name.toLowerCase().includes("electric") ||
      e.name.toLowerCase().includes("électric")
  );
  if (!elec.length) return { tension: 415, frequence: 50, facteurPuissance: 0.94, thd: 3.2 };

  const avg = (arr, def) =>
    arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : def;

  return {
    tension:          parseFloat(avg(elec.map(e => e.rawData?.voltage).filter(v => v != null),      415).toFixed(1)),
    frequence:        parseFloat(avg(elec.map(e => e.rawData?.frequency).filter(v => v != null),    50.0).toFixed(2)),
    facteurPuissance: parseFloat(avg(elec.map(e => e.rawData?.power_factor).filter(v => v != null), 0.94).toFixed(3)),
    thd:              parseFloat(avg(elec.map(e => e.rawData?.thd).filter(v => v != null),          3.2).toFixed(2)),
  };
}

function App() {
  const [activePage,          setActivePageState]   = useState(getSavedPage);
  const [sidebarOpen,         setSidebarOpen]       = useState(true);
  const [toastMessage,        setToastMessage]      = useState("");
  const [selectedLine,        setSelectedLine]      = useState("line-1");
  const [selectedEnergyNames, setSelectedEnergyNames] = useState([]);
  const [backendSummary,      setBackendSummary]    = useState({});
  const [loadingData,         setLoadingData]       = useState(true);
  const [backendError,        setBackendError]      = useState("");
  const [users,               setUsers]             = useState([]);
  const [user,                setUser]              = useState(null);
  const [isLoggedIn,          setIsLoggedIn]        = useState(false);
  const [urgentMessages,      setUrgentMessages]    = useState([]);
  const [urgentCount,         setUrgentCount]       = useState(0);
  const [messageNotifCount,   setMessageNotifCount] = useState(0);
  const [powerQualityHistory, setPowerQualityHistory] = useState([]);
  const [carbonHistory,       setCarbonHistory]     = useState([]);
  const [discoveredLines,     setDiscoveredLines]   = useState([]);

  const lastSeenRef    = useRef(new Set());
  const lastUrgentRef  = useRef(0);
  const initializedRef = useRef(false);

  const setActivePage = useCallback((page) => {
    if (VALID_PAGES.includes(page)) {
      localStorage.setItem("ems_active_page", page);
    }
    setActivePageState(page);
  }, []);

  // WebSocket
  const handleWsMessage = useCallback((wsData) => {
    if (wsData.type === "telemetry") {
      fetchLatestTelemetry()
        .then(r => { setBackendSummary(r || {}); setBackendError(""); })
        .catch(() => {});
    }
  }, []);

  const { connected: wsConnected } = useWebSocket(handleWsMessage);

  const LINE_OPTIONS = useMemo(() => {
    if (!discoveredLines.length) return [DEFAULT_LINE];
    return discoveredLines.map((label, i) => ({ id: `line-${i + 1}`, label }));
  }, [discoveredLines]);

  const currentLine = useMemo(
    () => LINE_OPTIONS.find(l => l.id === selectedLine) || LINE_OPTIONS[0],
    [LINE_OPTIONS, selectedLine]
  );

  // Découverte automatique des lignes
  useEffect(() => {
    const discover = async () => {
      try {
        const s = await fetchStructure();
        if (s.lines?.length > 0) setDiscoveredLines(s.lines);
      } catch {}
    };
    discover();
    const iv = setInterval(discover, 30000);
    return () => clearInterval(iv);
  }, []);

  // Polling télémétrie (5s)
  useEffect(() => {
    const load = async () => {
      try {
        const r = await fetchLatestTelemetry();
        setBackendSummary(r || {});
        setBackendError("");
        const lines = Object.keys(r || {});
        if (lines.length && !discoveredLines.length) setDiscoveredLines(lines.sort());
      } catch {
        setBackendError("Backend not reachable — is ems-backend running?");
      } finally {
        setLoadingData(false);
      }
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, []);

  // Power Quality (10s)
  useEffect(() => {
    const load = async () => {
      try {
        setPowerQualityHistory((await fetchPowerQualityHistory(currentLine.label, 48)) || []);
      } catch {}
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [currentLine.label]);

  // CO2 (10s)
  useEffect(() => {
    const load = async () => {
      try {
        setCarbonHistory((await fetchCarbonHistory(currentLine.label, 48)) || []);
      } catch {}
    };
    load();
    const iv = setInterval(load, 10000);
    return () => clearInterval(iv);
  }, [currentLine.label]);

  // Utilisateurs
  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;
        const r = await fetchUsers(token);
        setUsers(r.map(i => ({
          id:           i.id,
          firstName:    i.first_name || i.firstName,
          lastName:     i.last_name  || i.lastName,
          email:        i.email,
          password:     "",
          role:         i.role,
          profileImage: i.profile_image || "",
        })));
      } catch {}
    };
    load();
  }, [isLoggedIn]);

  // Messages urgents — admin seulement
  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token || user?.role !== "admin") return;
        const [msgs, cnt] = await Promise.all([
          fetchUrgentMessages(token),
          fetchUrgentMessagesCount(token),
        ]);
        const n = cnt.pendingCount || 0;
        if (initializedRef.current && n > lastUrgentRef.current) {
          setToastMessage(`New urgent request (${n} pending)`);
        }
        lastUrgentRef.current = n;
        setUrgentMessages(msgs || []);
        setUrgentCount(n);
      } catch {}
    };
    load();
    const iv = setInterval(load, 5000);
    return () => clearInterval(iv);
  }, [isLoggedIn, user?.role]);

  // Restauration session
  useEffect(() => {
    const restore = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const cu = await getCurrentUser(token);
        setUser({
          id:           cu.id,
          firstName:    cu.firstName,
          lastName:     cu.lastName,
          email:        cu.email,
          role:         cu.role,
          profileImage: cu.profileImage || "",
        });
        setIsLoggedIn(true);
      } catch {
        localStorage.removeItem("token");
      }
    };
    restore();
  }, []);

  // ── NOTIFICATIONS MESSAGES — POUR TOUS LES UTILISATEURS ──────────────────
  useEffect(() => {
    if (!isLoggedIn) return;

    // Stopper seulement si pas encore de user chargé
    if (!user) {
      initializedRef.current = true;
      return;
    }

    const poll = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) return;

        const results = await fetchLatestMessageNotifications(token);
        let unseen = 0;
        let toast  = "";

        results.forEach(item => {
          const lm    = item.lastMessage;
          if (!lm) return;
          const mid   = String(lm.id);
          const isOwn = lm.sender_id === user?.id;

          // Premier chargement — mémoriser sans notifier
          if (!initializedRef.current) {
            lastSeenRef.current.add(mid);
            return;
          }

          // Nouveau message, pas envoyé par soi-même
          if (!lastSeenRef.current.has(mid) && !isOwn) {
            unseen++;
            lastSeenRef.current.add(mid);
            const title = item.conversation?.type === "group"
              ? (item.conversation.name || "Group")
              : "New message";
            toast = `${title}: ${lm.sender_name}`;
          }
        });

        if (unseen > 0) {
          setMessageNotifCount(p => p + unseen);
          setToastMessage(toast || "New message received");
        }

        if (!initializedRef.current) initializedRef.current = true;

      } catch {}
    };

    // Réinitialiser et lancer
    initializedRef.current = false;
    poll();
    const iv = setInterval(poll, 4000);
    return () => clearInterval(iv);

  }, [isLoggedIn, user?.id]);

  // Effacer badge quand on ouvre Messages — POUR TOUS
  useEffect(() => {
    if (activePage === "messages") {
      setMessageNotifCount(0);
    }
  }, [activePage]);

  // Toast auto-dismiss
  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(""), 3500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Données dérivées
  const currentLineRaw = useMemo(() => backendSummary[currentLine.label]?.energies       || [], [backendSummary, currentLine.label]);
  const lineTotalCost  = useMemo(() => backendSummary[currentLine.label]?.total_cost      || 0,  [backendSummary, currentLine.label]);
  const linePeakKw     = useMemo(() => backendSummary[currentLine.label]?.peak_kw         || 0,  [backendSummary, currentLine.label]);
  const lineTotalCo2   = useMemo(() => backendSummary[currentLine.label]?.total_co2_kg    || 0,  [backendSummary, currentLine.label]);
  const lineAvgVoltage = useMemo(() => backendSummary[currentLine.label]?.avg_voltage      ?? null, [backendSummary, currentLine.label]);
  const lineAvgPF      = useMemo(() => backendSummary[currentLine.label]?.avg_power_factor ?? null, [backendSummary, currentLine.label]);
  const allEnergies    = useMemo(() => convertEnergies(currentLineRaw), [currentLineRaw]);
  const availableNames = useMemo(() => allEnergies.map(e => e.name), [allEnergies]);

  const visibleEnergies = useMemo(() => {
    if (!selectedEnergyNames.length) return allEnergies;
    return allEnergies.filter(e => selectedEnergyNames.includes(e.name));
  }, [allEnergies, selectedEnergyNames]);

  const visibleData = useMemo(() => buildElectricalData(visibleEnergies), [visibleEnergies]);

  useEffect(() => {
    setSelectedEnergyNames(p => p.filter(n => availableNames.includes(n)));
  }, [availableNames]);

  // Actions
  const handleLogin = async (email, password) => {
    try {
      const tr    = await loginUser(email, password);
      const token = tr.access_token;
      localStorage.setItem("token", token);
      const cu = await getCurrentUser(token);
      setUser({
        id:           cu.id,
        firstName:    cu.firstName,
        lastName:     cu.lastName,
        email:        cu.email,
        role:         cu.role,
        profileImage: cu.profileImage || "",
      });
      setIsLoggedIn(true);
      setToastMessage("Login successful");
      setActivePage(getSavedPage());
      return true;
    } catch (e) {
      localStorage.removeItem("token");
      setToastMessage(e.message || "Invalid credentials");
      return false;
    }
  };

  const handleForgotPassword = async (email) => {
    try {
      const r = await sendForgotPasswordRequest(email);
      setToastMessage(r.message || "Request sent");
    } catch (e) {
      setToastMessage(e.message || "Failed");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("ems_active_page");
    setIsLoggedIn(false);
    setUser(null);
    setActivePageState("dashboard");
    setUrgentMessages([]);
    setUrgentCount(0);
    setMessageNotifCount(0);
    initializedRef.current = false;
    lastSeenRef.current     = new Set();
    lastUrgentRef.current   = 0;
  };

  const handleUpdateProfile = (u) => {
    setUser(u);
    setUsers(p => p.map(x => x.id === u.id ? u : x));
    setToastMessage("Profile updated");
  };

  const handleCreateUser = async (newUser) => {
    try {
      const c = await createUser(newUser, localStorage.getItem("token"));
      setUsers(p => [{
        id:           c.id,
        firstName:    c.first_name || c.firstName,
        lastName:     c.last_name  || c.lastName,
        email:        c.email,
        password:     "",
        role:         c.role,
        profileImage: c.profile_image || "",
      }, ...p]);
      setToastMessage("User created");
    } catch (e) {
      setToastMessage(e.message || "Failed to create user");
    }
  };

  const handleDeleteUser = async (userId) => {
    const sel = users.find(u => u.id === userId);
    if (!sel || !window.confirm(`Delete ${sel.email}?`)) return;
    try {
      await deleteUser(userId, localStorage.getItem("token"));
      setUsers(p => p.filter(u => u.id !== userId));
      setToastMessage("User deleted");
    } catch (e) {
      setToastMessage(e.message || "Failed");
    }
  };

  const handleRegeneratePassword = async (requestId) => {
    try {
      const r = await regenerateUserPassword(requestId, localStorage.getItem("token"));
      setUrgentMessages(p => p.map(i =>
        i.id === requestId
          ? { ...i, status: "resolved", generated_password: r.newPassword, resolved_at: new Date().toISOString() }
          : i
      ));
      setUrgentCount(p => Math.max(0, p - 1));
      setToastMessage(`New password: ${r.newPassword}`);
    } catch (e) {
      setToastMessage(e.message || "Failed");
    }
  };

  const toggleEnergy = (n) =>
    setSelectedEnergyNames(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n]);
  const clearEnergy = () => setSelectedEnergyNames([]);

  const shared = {
    energies:            visibleEnergies,
    selectedLineLabel:   currentLine.label,
    selectedEnergyNames,
    totalCost:           lineTotalCost,
    peakKw:              linePeakKw,
    totalCo2:            lineTotalCo2,
    avgVoltage:          lineAvgVoltage,
    avgPowerFactor:      lineAvgPF,
  };

  // ── Rendu des pages ───────────────────────────────────────────────────────
  const renderPage = () => {
    // Pages réservées aux admins
    const adminOnly = ["users", "urgent", "audit", "thresholds"];
    if (adminOnly.includes(activePage) && user?.role !== "admin") {
      return (
        <Dashboard
          energies={visibleEnergies} selectedLineLabel={currentLine.label}
          totalCost={lineTotalCost} peakKw={linePeakKw} totalCo2={lineTotalCo2}
          avgVoltage={lineAvgVoltage} avgPowerFactor={lineAvgPF}
          backendSummary={backendSummary}
        />
      );
    }

    switch (activePage) {

      case "dashboard":
        return (
          <Dashboard
            energies={visibleEnergies} selectedLineLabel={currentLine.label}
            totalCost={lineTotalCost} peakKw={linePeakKw} totalCo2={lineTotalCo2}
            avgVoltage={lineAvgVoltage} avgPowerFactor={lineAvgPF}
            backendSummary={backendSummary}
          />
        );

      case "industry":
        return <IndustryOverview />;

      case "realtime":
        return (
          <RealTimeMonitoring
            data={visibleData}
            powerQualityHistory={powerQualityHistory}
            {...shared}
          />
        );

      case "equipment":
        return (
          <EquipmentStatus
            energies={visibleEnergies}
            selectedLineLabel={currentLine.label}
          />
        );

      case "power":
        return (
          <PowerQuality
            data={visibleData}
            powerQualityHistory={powerQualityHistory}
            selectedLineLabel={currentLine.label}
          />
        );

      case "carbon":
        return (
          <CarbonEmissions
            energies={visibleEnergies}
            carbonHistory={carbonHistory}
            totalCo2={lineTotalCo2}
            selectedLineLabel={currentLine.label}
          />
        );

      case "forecasting":
        return (
          <Forecasting
            energies={visibleEnergies}
            selectedLineLabel={currentLine.label}
          />
        );

      case "reports":
        return <ReportsAnalytics {...shared} />;

      case "alarms":
        return (
          <AlarmsEvents
            data={visibleData}
            energies={visibleEnergies}
          />
        );

      case "history":
        return (
          <HistoricalData
            selectedLineLabel={currentLine.label}
          />
        );

      case "weather":
        return <WeatherPage selectedLineLabel={currentLine.label} />;

      case "profile":
        return <Profile user={user} onUpdateProfile={handleUpdateProfile} />;

      case "maintenance":
        return <MaintenancePage energies={visibleEnergies} 
              currentUser={user}
/>;

      case "objectives":
        return (
          <EnergyObjectives
            energies={visibleEnergies}
            totalCost={lineTotalCost}
            totalCo2={lineTotalCo2}
            peakKw={linePeakKw}
            avgPowerFactor={lineAvgPF}
            selectedLineLabel={currentLine.label}
                  currentUser={user}

          />
        );

      case "users":
        return (
          <UsersManagement
            users={users}
            onCreateUser={handleCreateUser}
            onDeleteUser={handleDeleteUser}
          />
        );

      case "thresholds":
        return <AlarmThresholds />;

      case "urgent":
        return (
          <UrgentMessages
            requests={urgentMessages}
            onRegeneratePassword={handleRegeneratePassword}
          />
        );
case "prices":
  return (
    <EnergyPriceAnalysis
      energies={visibleEnergies}
      selectedLineLabel={currentLine.label}
      peakKw={linePeakKw}
    />
  );
      case "audit":
        return <AuditLogs />;

      case "messages":
        return <Messages />;

      default:
        return (
          <Dashboard
            energies={visibleEnergies} selectedLineLabel={currentLine.label}
            totalCost={lineTotalCost} peakKw={linePeakKw} totalCo2={lineTotalCo2}
            avgVoltage={lineAvgVoltage} avgPowerFactor={lineAvgPF}
            backendSummary={backendSummary}
          />
        );
    }
  };

  // Page login
  if (!isLoggedIn) {
    return (
      <>
        <Login onLogin={handleLogin} onForgotPassword={handleForgotPassword} />
        {toastMessage && <div className="toast">{toastMessage}</div>}
      </>
    );
  }

  return (
    <div className="layout">
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        currentUser={user}
        urgentCount={urgentCount}
        messageNotifCount={messageNotifCount}
      />

      <div className="main">
        <Header
          user={user}
          onLogout={handleLogout}
          onProfileClick={() => setActivePage("profile")}
          onWeatherClick={() => setActivePage("weather")}
          lineOptions={LINE_OPTIONS}
          selectedLine={selectedLine}
          onLineChange={setSelectedLine}
          energyOptions={availableNames}
          selectedEnergyNames={selectedEnergyNames}
          onToggleEnergy={toggleEnergy}
          onClearEnergySelection={clearEnergy}
        />

        <div className="top-shortcuts">
          <button type="button" onClick={() => setActivePage("messages")}>
            Messages
          </button>
          {user?.role === "admin" && (
            <button type="button" onClick={() => setActivePage("audit")}>
              Audit Logs
            </button>
          )}
          {(wsConnected || Object.keys(backendSummary).length > 0) && (
            <span style={{
              fontSize:      "0.72rem",
              padding:       "4px 12px",
              borderRadius:  "10px",
              background:    "#dcfce7",
              color:         "#16a34a",
              fontWeight:    700,
              border:        "1px solid #bbf7d0",
            }}>
              ● Live
            </span>
          )}
        </div>

        {toastMessage && <div className="toast">{toastMessage}</div>}
        {loadingData  && <div className="info-box">⏳ Loading from DataPlatform...</div>}
        {backendError && <div className="alarm-item">⚠ {backendError}</div>}
        {!loadingData && renderPage()}
      </div>

      <ChatbotWidget
        energies={visibleEnergies}
        selectedLineLabel={currentLine.label}
        urgentCount={urgentCount}
        usersCount={users.length}
        activePage={activePage}
        avgVoltage={lineAvgVoltage}
        avgPowerFactor={lineAvgPF}
        peakKw={linePeakKw}
        totalCo2={lineTotalCo2}
        totalCost={lineTotalCost}
      />
    </div>
  );
}

export default App;