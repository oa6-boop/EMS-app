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
import ChatbotWidget from "./components/ChatbotWidget";
import { useWebSocket } from "./hooks/useWebSocket";
import EnergyPriceAnalysis from "./pages/EnergyPriceAnalysis";
import {
  fetchLatestTelemetry,
  fetchPowerQualityHistory,
  fetchCarbonHistory,
} from "./api/emsApi";

import {
  createUser,
  deleteUser,
  updateUserRole,
  fetchUrgentMessages,
  fetchUrgentMessagesCount,
  fetchUsers,
  regenerateUserPassword,
} from "./api/usersApi";

import {
  loginUser,
  getCurrentUser,
  sendForgotPasswordRequest,
} from "./api/authApi";

import { fetchLatestMessageNotifications } from "./api/chatApi";
import { logAudit } from "./api/auditApi";

const PAGES_BY_ROLE = {
  admin: [
    "dashboard",
    "industry",
    "realtime",
    "equipment",
    "power",
    "carbon",
    "forecasting",
    "reports",
    "alarms",
    "history",
    "maintenance",
    "prices",
    "weather",
    "messages",
    "profile",
    "users",
    "thresholds",
    "urgent",
    "audit",
    "sld",
  ],
  management: [
    "dashboard",
    "industry",
    "carbon",
    "forecasting",
    "reports",
    "prices",
    "weather",
    "messages",
    "profile",
  ],
  maintenance: [
    "realtime",
    "equipment",
    "power",
    "alarms",
    "history",
    "thresholds",
    "maintenance",
    "weather",
    "messages",
    "profile",
  ],
  operator: [
    "dashboard",
    "equipment",
    "alarms",
    "sld",
    "weather",
    "messages",
    "profile",
  ],
};

const DEFAULT_PAGE = {
  admin: "dashboard",
  management: "dashboard",
  maintenance: "realtime",
  operator: "dashboard",
};

const VALID_PAGES = [
  "dashboard",
  "industry",
  "realtime",
  "equipment",
  "power",
  "carbon",
  "forecasting",
  "reports",
  "alarms",
  "weather",
  "profile",
  "users",
  "urgent",
  "audit",
  "messages",
  "history",
  "thresholds",
  "maintenance",
  "prices",
  "sld",
];

function getSavedPage() {
  try {
    const saved = localStorage.getItem("ems_active_page");
    if (saved && VALID_PAGES.includes(saved)) return saved;
  } catch {
    // ignore
  }

  return "dashboard";
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function isSameValue(a, b) {
  return normalizeValue(a) === normalizeValue(b);
}

function buildEnergyDefaults(name = "") {
  const l = name.toLowerCase();

  if (l.includes("electric") || l.includes("électric")) {
    return { min: 0, max: 500, step: 10 };
  }

  if (l.includes("kwh")) {
    return { min: 0, max: 500, step: 10 };
  }

  if (l.includes("co2") || l.includes("carbon")) {
    return { min: 0, max: 200, step: 1 };
  }

  if (l.includes("eau") || l.includes("water")) {
    return { min: 0, max: 200, step: 5 };
  }

  if (l.includes("vapeur") || l.includes("steam")) {
    return { min: 0, max: 400, step: 10 };
  }

  if (l.includes("solaire") || l.includes("solar")) {
    return { min: 0, max: 300, step: 5 };
  }

  if (l.includes("fuel") || l.includes("carburant")) {
    return { min: 0, max: 500, step: 10 };
  }

  return { min: 0, max: 1000, step: 10 };
}

function createChart(value, max) {
  const ratio = Math.max(10, Math.min(95, (value / (max || 500)) * 100));

  return Array.from({ length: 10 }, (_, i) =>
    Math.max(5, Math.min(100, ratio + ((i % 3) - 1) * 3))
  );
}

function convertEnergies(lineData = [], lineLabel = "") {
  return lineData.map((item, index) => {
    const defaults = buildEnergyDefaults(item.energy_name);
    const value = Number(item.value || 0);

    const plant = item.plant || item.plant_name || item.rawData?.plant || "Plant 1";
    const zone = item.zone || item.area || item.area_name || item.rawData?.area || "Zone A";
    const equipment =
      item.equipment || item.equipment_name || item.rawData?.equipment || "Equipment";
    const line = item.production_line || item.line || lineLabel || "Production Line 1";

    // Tags equipement : chaine "a,b,c" (backend) ou liste -> tableau normalise
    const rawTags = item.tags ?? item.labels ?? item.rawData?.tags ?? "";
    const tags = Array.isArray(rawTags)
      ? rawTags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
      : String(rawTags || "")
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean);

    return {
      id: item.id || index + 1,
      name: item.energy_name || item.name || `Energy ${index + 1}`,
      unit: item.unit || "",
      value,
      min: defaults.min,
      max: defaults.max,
      step: defaults.step,
      chart: createChart(value, defaults.max),
      cost: Number(item.cost || 0),
      co2_kg: Number(item.co2_kg || 0),
      timestamp: item.timestamp,
      plant,
      line,
      zone,
      area: zone,
      equipment,
      tags,
      rawData: {
        voltage: item.voltage,
        frequency: item.frequency,
        power_factor: item.power_factor,
        thd: item.thd,
        equipment,
        area: zone,
        zone,
        unit_name: item.unit_name,
        plant,
      },
    };
  });
}

function buildElectricalData(energies) {
  const electricEnergies = energies.filter((energy) => {
    const name = energy.name.toLowerCase();
    return name.includes("electric") || name.includes("électric");
  });

  if (!electricEnergies.length) {
    return {
      tension: 230,
      frequence: 50,
      facteurPuissance: 0.9,
      thd: 3.2,
    };
  }

  const avg = (arr, def) =>
    arr.length ? arr.reduce((s, v) => s + Number(v || 0), 0) / arr.length : def;

  return {
    tension: parseFloat(
      avg(
        electricEnergies.map((e) => e.rawData?.voltage).filter((v) => v != null),
        230
      ).toFixed(1)
    ),
    frequence: parseFloat(
      avg(
        electricEnergies.map((e) => e.rawData?.frequency).filter((v) => v != null),
        50
      ).toFixed(2)
    ),
    facteurPuissance: parseFloat(
      avg(
        electricEnergies.map((e) => e.rawData?.power_factor).filter((v) => v != null),
        0.9
      ).toFixed(3)
    ),
    thd: parseFloat(
      avg(
        electricEnergies.map((e) => e.rawData?.thd).filter((v) => v != null),
        3.2
      ).toFixed(2)
    ),
  };
}

function buildStructure(energies) {
  const tree = {};

  energies.forEach((e) => {
    const plant = e.plant || "Plant 1";
    const line = e.line || "Production Line 1";
    const zone = e.zone || e.area || "Zone A";
    const equipment = e.equipment || "Equipment";

    tree[plant] = tree[plant] || {};
    tree[plant][line] = tree[plant][line] || {};
    tree[plant][line][zone] = tree[plant][line][zone] || new Set();
    tree[plant][line][zone].add(equipment);
  });

  return Object.keys(tree)
    .sort()
    .map((plant) => ({
      plant,
      lines: Object.keys(tree[plant])
        .sort()
        .map((line) => ({
          line,
          zones: Object.keys(tree[plant][line])
            .sort()
            .map((zone) => ({
              zone,
              equipment: [...tree[plant][line][zone]].sort(),
            })),
        })),
    }));
}

function isCumulativeEnergy(e) {
  const n = (e.name || "").toLowerCase();
  return n.includes("kwh") || e.unit === "kWh";
}

function App() {
  const [activePage, setActivePageState] = useState(getSavedPage);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toastMessage, setToastMessage] = useState("");

  const [selection, setSelection] = useState({
    plant: "",
    line: "",
    zone: "",
    equipment: "",
    tag: "",
  });

  const [selectedEnergyNames, setSelectedEnergyNames] = useState([]);

  const [backendSummary, setBackendSummary] = useState({});
  const [loadingData, setLoadingData] = useState(true);
  const [backendError, setBackendError] = useState("");

  const [users, setUsers] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [urgentMessages, setUrgentMessages] = useState([]);
  const [urgentCount, setUrgentCount] = useState(0);
  const [messageNotifCount, setMessageNotifCount] = useState(0);

  const [powerQualityHistory, setPowerQualityHistory] = useState([]);
  const [carbonHistory, setCarbonHistory] = useState([]);

  const lastSeenRef = useRef(new Set());
  const lastUrgentRef = useRef(0);
  const initializedRef = useRef(false);

  const setActivePage = useCallback((page) => {
    if (VALID_PAGES.includes(page)) {
      localStorage.setItem("ems_active_page", page);
    }

    setActivePageState(page);
  }, []);

  const handleWsMessage = useCallback((wsData) => {
    if (wsData.type === "telemetry") {
      fetchLatestTelemetry()
        .then((response) => {
          setBackendSummary(response || {});
          setBackendError("");
        })
        .catch(() => {});
    }
  }, []);

  const { connected: wsConnected } = useWebSocket(handleWsMessage);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetchLatestTelemetry();
        setBackendSummary(response || {});
        setBackendError("");
      } catch {
        setBackendError("Backend not reachable — is ems-backend running?");
      } finally {
        setLoadingData(false);
      }
    };

    load();

    const intervalId = setInterval(load, 5000);

    return () => clearInterval(intervalId);
  }, []);

  const allEnergies = useMemo(() => {
    const out = [];

    Object.entries(backendSummary).forEach(([lineLabel, lineData]) => {
      convertEnergies(lineData?.energies || [], lineLabel).forEach((e) => out.push(e));
    });

    return out;
  }, [backendSummary]);

  const structure = useMemo(() => buildStructure(allEnergies), [allEnergies]);

  useEffect(() => {
    if (
      selection.plant &&
      !structure.some((p) => isSameValue(p.plant, selection.plant))
    ) {
      setSelection({
        plant: "",
        line: "",
        zone: "",
        equipment: "",
        tag: "",
      });
    }
  }, [structure, selection.plant]);

  const activeLineLabel = useMemo(() => {
    if (selection.line) return selection.line;

    const firstPlant = selection.plant
      ? structure.find((p) => isSameValue(p.plant, selection.plant))
      : structure[0];

    return firstPlant?.lines?.[0]?.line || "Production Line 1";
  }, [selection, structure]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetchPowerQualityHistory(activeLineLabel, 48);
        setPowerQualityHistory(response || []);
      } catch {
        // ignore
      }
    };

    load();

    const intervalId = setInterval(load, 10000);

    return () => clearInterval(intervalId);
  }, [activeLineLabel]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetchCarbonHistory(activeLineLabel, 48);
        setCarbonHistory(response || []);
      } catch {
        // ignore
      }
    };

    load();

    const intervalId = setInterval(load, 10000);

    return () => clearInterval(intervalId);
  }, [activeLineLabel]);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token || user?.role !== "admin") return;

        const response = await fetchUsers(token);

        setUsers(
          response.map((item) => ({
            id: item.id,
            firstName: item.first_name || item.firstName,
            lastName: item.last_name || item.lastName,
            email: item.email,
            password: "",
            role: item.role,
            profileImage: item.profile_image || "",
          }))
        );
      } catch {
        // ignore
      }
    };

    load();
  }, [isLoggedIn, user?.role]);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token || user?.role !== "admin") return;

        const [messages, countResponse] = await Promise.all([
          fetchUrgentMessages(token),
          fetchUrgentMessagesCount(token),
        ]);

        const pendingCount = countResponse.pendingCount || 0;

        if (initializedRef.current && pendingCount > lastUrgentRef.current) {
          setToastMessage(`New urgent request (${pendingCount} pending)`);
        }

        lastUrgentRef.current = pendingCount;
        setUrgentMessages(messages || []);
        setUrgentCount(pendingCount);
      } catch {
        // ignore
      }
    };

    load();

    const intervalId = setInterval(load, 5000);

    return () => clearInterval(intervalId);
  }, [isLoggedIn, user?.role]);

  useEffect(() => {
    const restore = async () => {
      const token = localStorage.getItem("token");

      if (!token) return;

      try {
        const currentUser = await getCurrentUser(token);

        setUser({
          id: currentUser.id,
          firstName: currentUser.firstName,
          lastName: currentUser.lastName,
          email: currentUser.email,
          role: currentUser.role,
          profileImage: currentUser.profileImage || "",
        });

        setIsLoggedIn(true);
      } catch {
        localStorage.removeItem("token");
      }
    };

    restore();
  }, []);

  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const poll = async () => {
      try {
        const token = localStorage.getItem("token");

        if (!token) return;

        const results = await fetchLatestMessageNotifications(token);

        let unseen = 0;
        let toast = "";

        results.forEach((item) => {
          const lastMessage = item.lastMessage;

          if (!lastMessage) return;

          const messageId = String(lastMessage.id);
          const isOwnMessage = lastMessage.sender_id === user?.id;

          if (!initializedRef.current) {
            lastSeenRef.current.add(messageId);
            return;
          }

          if (!lastSeenRef.current.has(messageId) && !isOwnMessage) {
            unseen += 1;
            lastSeenRef.current.add(messageId);
            toast = `New message: ${lastMessage.sender_name}`;
          }
        });

        if (unseen > 0) {
          setMessageNotifCount((p) => p + unseen);
          setToastMessage(toast || "New message received");
        }

        if (!initializedRef.current) initializedRef.current = true;
      } catch {
        // ignore
      }
    };

    initializedRef.current = false;
    poll();

    const intervalId = setInterval(poll, 4000);

    return () => clearInterval(intervalId);
  }, [isLoggedIn, user?.id, user]);

  useEffect(() => {
    if (activePage === "messages") {
      setMessageNotifCount(0);
    }
  }, [activePage]);

  useEffect(() => {
    if (!isLoggedIn || !user) return;

    logAudit(
      "PAGE_VIEW",
      `${user.firstName} ${user.lastName} a consulté la page "${activePage}"`
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage, isLoggedIn]);

  useEffect(() => {
    if (!toastMessage) return;

    const timeoutId = setTimeout(() => setToastMessage(""), 3500);

    return () => clearTimeout(timeoutId);
  }, [toastMessage]);

  const scopedEnergies = useMemo(() => {
    return allEnergies.filter((e) => {
      if (selection.plant && !isSameValue(e.plant, selection.plant)) return false;
      if (selection.line && !isSameValue(e.line, selection.line)) return false;
      if (selection.zone && !isSameValue(e.zone, selection.zone)) return false;

      // Niveau 4 de la hierarchie : un equipement precis
      if (selection.equipment && !isSameValue(e.equipment, selection.equipment))
        return false;

      // Filtre par tag : ne garder que les equipements portant ce tag
      if (selection.tag && !(e.tags || []).includes(selection.tag)) return false;

      return true;
    });
  }, [allEnergies, selection]);

  // Tags disponibles dans le perimetre Plant/Line/Zone courant
  // (avant filtre tag/equipment, pour que les chips restent visibles)
  const availableTags = useMemo(() => {
    const set = new Set();

    allEnergies.forEach((e) => {
      if (selection.plant && !isSameValue(e.plant, selection.plant)) return;
      if (selection.line && !isSameValue(e.line, selection.line)) return;
      if (selection.zone && !isSameValue(e.zone, selection.zone)) return;

      (e.tags || []).forEach((t) => set.add(t));
    });

    return [...set].sort();
  }, [allEnergies, selection.plant, selection.line, selection.zone]);

  const handleTagSelect = useCallback((tag) => {
    setSelection((prev) => ({ ...prev, tag: tag || "" }));
  }, []);

  // Si le tag actif disparait des donnees, on le retire
  useEffect(() => {
    if (selection.tag && !availableTags.includes(selection.tag)) {
      setSelection((prev) => ({ ...prev, tag: "" }));
    }
  }, [availableTags, selection.tag]);

  const cumulativeKwh = useMemo(() => {
    return scopedEnergies
      .filter(isCumulativeEnergy)
      .reduce((s, e) => s + Number(e.value || 0), 0);
  }, [scopedEnergies]);

  const consumptionEnergies = useMemo(() => {
    return scopedEnergies.filter((e) => !isCumulativeEnergy(e));
  }, [scopedEnergies]);

  const availableNames = useMemo(() => {
    return [...new Set(consumptionEnergies.map((e) => e.name))];
  }, [consumptionEnergies]);

  const visibleEnergies = useMemo(() => {
    if (!selectedEnergyNames.length) return consumptionEnergies;

    return consumptionEnergies.filter((e) => selectedEnergyNames.includes(e.name));
  }, [consumptionEnergies, selectedEnergyNames]);

  const visibleData = useMemo(() => buildElectricalData(visibleEnergies), [visibleEnergies]);

  useEffect(() => {
    setSelectedEnergyNames((previous) =>
      previous.filter((name) => availableNames.includes(name))
    );
  }, [availableNames]);

  const displayedTotalCost = useMemo(() => {
    return visibleEnergies.reduce((s, e) => s + Number(e.cost || 0), 0);
  }, [visibleEnergies]);

  const displayedTotalCo2 = useMemo(() => {
    return visibleEnergies.reduce((s, e) => s + Number(e.co2_kg || 0), 0);
  }, [visibleEnergies]);

  const displayedPeakKw = useMemo(() => {
    const electricValues = visibleEnergies
      .filter((e) => {
        const name = e.name.toLowerCase();
        return e.unit === "kW" || name.includes("electric") || name.includes("électric");
      })
      .map((e) => Number(e.value || 0));

    if (!electricValues.length) return 0;

    return Math.max(...electricValues);
  }, [visibleEnergies]);

  const displayedAvgVoltage = visibleEnergies.length ? visibleData.tension : null;
  const displayedAvgPowerFactor = visibleEnergies.length
    ? visibleData.facteurPuissance
    : null;

  const handleLogin = async (email, password) => {
    try {
      const tokenResponse = await loginUser(email, password);
      const token = tokenResponse.access_token;

      localStorage.setItem("token", token);

      const currentUser = await getCurrentUser(token);
      const role = currentUser.role || "maintenance";

      setUser({
        id: currentUser.id,
        firstName: currentUser.firstName,
        lastName: currentUser.lastName,
        email: currentUser.email,
        role,
        profileImage: currentUser.profileImage || "",
      });

      setIsLoggedIn(true);
      setActivePage(DEFAULT_PAGE[role] || "dashboard");
    } catch (error) {
      throw new Error(error.message || "Login failed");
    }
  };

  const handleLogout = () => {
    if (user) {
      logAudit("LOGOUT", `${user.firstName} ${user.lastName} s'est déconnecté`);
    }

    localStorage.removeItem("token");
    setIsLoggedIn(false);
    setUser(null);
    setBackendSummary({});
    setSelection({
      plant: "",
      line: "",
      zone: "",
      equipment: "",
      tag: "",
    });
    setSelectedEnergyNames([]);
    setActivePage("dashboard");
  };

  const handleForgotPassword = async (email) => {
    try {
      await sendForgotPasswordRequest(email);
    } catch (error) {
      throw new Error(error.message || "Failed");
    }
  };

  const handleUpdateProfile = (updatedUser) => setUser(updatedUser);

  const handleCreateUser = async (userData) => {
    try {
      const token = localStorage.getItem("token");

      await createUser(userData, token);

      const response = await fetchUsers(token);

      setUsers(
        response.map((item) => ({
          id: item.id,
          firstName: item.first_name || item.firstName,
          lastName: item.last_name || item.lastName,
          email: item.email,
          password: "",
          role: item.role,
          profileImage: item.profile_image || "",
        }))
      );

      setToastMessage("User created successfully");
    } catch (error) {
      throw new Error(error.message || "Failed to create user");
    }
  };

  const handleDeleteUser = async (id) => {
    try {
      const token = localStorage.getItem("token");

      await deleteUser(id, token);

      setUsers((previous) => previous.filter((item) => item.id !== id));
      setToastMessage("User deleted");
    } catch (error) {
      throw new Error(error.message || "Failed to delete user");
    }
  };

  const handleUpdateRole = async (id, role) => {
    try {
      const token = localStorage.getItem("token");

      await updateUserRole(id, role, token);

      setUsers((previous) =>
        previous.map((item) => (item.id === id ? { ...item, role } : item))
      );

      setToastMessage("Role updated");
    } catch (error) {
      throw new Error(error.message || "Failed to update role");
    }
  };

  const handleRegeneratePassword = async (requestId) => {
    try {
      const token = localStorage.getItem("token");

      await regenerateUserPassword(requestId, token);
      setToastMessage("Password regenerated");
    } catch (error) {
      throw new Error(error.message || "Failed");
    }
  };

  const toggleEnergy = useCallback((name) => {
    setSelectedEnergyNames((previous) =>
      previous.includes(name)
        ? previous.filter((item) => item !== name)
        : [...previous, name]
    );
  }, []);

  const clearEnergy = useCallback(() => setSelectedEnergyNames([]), []);

  const shared = {
    energies: visibleEnergies,
    selectedLineLabel: activeLineLabel,
    selectedPlant: selection.plant || "all",
    selectedZone: selection.zone || "all",
    selectedEquipment: selection.equipment || "all",
    availableTags,
    selectedTag: selection.tag || "",
    onTagSelect: handleTagSelect,
    totalCost: displayedTotalCost,
    peakKw: displayedPeakKw,
    totalCo2: displayedTotalCo2,
    cumulativeKwh,
    avgVoltage: displayedAvgVoltage,
    avgPowerFactor: displayedAvgPowerFactor,
    backendSummary,
  };

  const renderPage = () => {
    const role = user?.role;

    if (role && !PAGES_BY_ROLE[role]?.includes(activePage)) {
      return <Dashboard {...shared} />;
    }

    switch (activePage) {
      case "dashboard":
        return <Dashboard {...shared} />;

      case "industry":
        return <IndustryOverview {...shared} />;

      case "realtime":
        return (
          <RealTimeMonitoring
            data={visibleData}
            energies={visibleEnergies}
            selectedLineLabel={activeLineLabel}
            powerQualityHistory={powerQualityHistory}
            {...shared}
          />
        );

      case "equipment":
        return (
          <EquipmentStatus
            energies={scopedEnergies}
            selectedLineLabel={activeLineLabel}
            selectedPlant={selection.plant || "all"}
            selectedZone={selection.zone || "all"}
            selectedEquipment={selection.equipment || "all"}
            availableTags={availableTags}
            selectedTag={selection.tag || ""}
            onTagSelect={handleTagSelect}
          />
        );

      case "power":
        return (
          <PowerQuality
            data={visibleData}
            powerQualityHistory={powerQualityHistory}
            selectedLineLabel={activeLineLabel}
          />
        );

      case "carbon":
        return (
          <CarbonEmissions
            energies={visibleEnergies}
            carbonHistory={carbonHistory}
            totalCo2={displayedTotalCo2}
            selectedLineLabel={activeLineLabel}
          />
        );

      case "forecasting":
        return (
          <Forecasting
            energies={visibleEnergies}
            selectedLineLabel={activeLineLabel}
          />
        );

      case "reports":
        return <ReportsAnalytics {...shared} />;

      case "alarms":
        return <AlarmsEvents {...shared} />;

      case "history":
        return (
          <HistoricalData
            selectedLineLabel={activeLineLabel}
            selectedPlant={selection.plant || "all"}
            selectedZone={selection.zone || "all"}
          />
        );

      case "weather":
        return <WeatherPage selectedLineLabel={activeLineLabel} />;

      case "profile":
        return <Profile user={user} onUpdateProfile={handleUpdateProfile} />;

      case "maintenance":
        return (
          <MaintenancePage
            energies={visibleEnergies}
            currentUser={user}
            selectedLineLabel={activeLineLabel}
            selectedPlant={selection.plant || "all"}
            selectedZone={selection.zone || "all"}
          />
        );

      case "prices":
        return (
          <EnergyPriceAnalysis
            energies={visibleEnergies}
            selectedLineLabel={activeLineLabel}
            peakKw={displayedPeakKw}
            cumulativeKwh={cumulativeKwh}
          />
        );

      case "users":
        return (
          <UsersManagement
            users={users}
            onCreateUser={handleCreateUser}
            onDeleteUser={handleDeleteUser}
            onUpdateRole={handleUpdateRole}
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

      case "audit":
        return <AuditLogs />;

      case "sld":
        return (
          <div style={{ padding: "20px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <div>
                <h1 style={{ margin: 0, fontSize: "1.4rem" }}>SLD Display</h1>
                <p
                  style={{
                    margin: "4px 0 0",
                    color: "#64748b",
                    fontSize: "0.9rem",
                  }}
                >
                  Single Line Diagram — view only
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  const frame = document.getElementById("sld-frame");

                  if (frame?.requestFullscreen) frame.requestFullscreen();
                }}
                style={{
                  background: "#2563eb",
                  color: "#fff",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "0.85rem",
                }}
              >
                ⛶ Fullscreen
              </button>
            </div>

            <iframe
              id="sld-frame"
              src="/sld.html"
              title="SLD Monitoring"
              style={{
                width: "100%",
                height: "calc(100vh - 180px)",
                border: "1px solid var(--border-color, #e2e8f0)",
                borderRadius: "12px",
                background: "#fff",
              }}
            />
          </div>
        );

      case "messages":
        return <Messages />;

      default:
        return <Dashboard {...shared} />;
    }
  };

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
          structure={structure}
          selection={selection}
          onSelectionChange={setSelection}
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
            <span
              style={{
                fontSize: "0.72rem",
                padding: "4px 12px",
                borderRadius: "10px",
                background: "#dcfce7",
                color: "#16a34a",
                fontWeight: 700,
                border: "1px solid #bbf7d0",
              }}
            >
              ● Live
            </span>
          )}
        </div>

        {toastMessage && <div className="toast">{toastMessage}</div>}

        {loadingData && <div className="info-box">⏳ Loading from DataPlatform...</div>}

        {backendError && <div className="alarm-item">⚠ {backendError}</div>}

        {!loadingData && renderPage()}
      </div>

      <ChatbotWidget
        energies={visibleEnergies}
        selectedLineLabel={activeLineLabel}
        urgentCount={urgentCount}
        usersCount={users.length}
        activePage={activePage}
        avgVoltage={displayedAvgVoltage}
        avgPowerFactor={displayedAvgPowerFactor}
        peakKw={displayedPeakKw}
        totalCo2={displayedTotalCo2}
        totalCost={displayedTotalCost}
      />
    </div>
  );
}

export default App;