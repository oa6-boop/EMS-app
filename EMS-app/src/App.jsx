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
  fetchStructure,
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
};

const DEFAULT_PAGE = {
  admin: "dashboard",
  management: "dashboard",
  maintenance: "realtime",
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
];

const DEFAULT_LINE = { id: "line-1", label: "Production Line 1" };

function getSavedPage() {
  try {
    const saved = localStorage.getItem("ems_active_page");
    if (saved && VALID_PAGES.includes(saved)) return saved;
  } catch {
    // ignore localStorage error
  }
  return "dashboard";
}

function normalizeValue(value) {
  return String(value || "").trim().toLowerCase();
}

function isSameValue(a, b) {
  return normalizeValue(a) === normalizeValue(b);
}

function getUniqueValues(values) {
  return [
    ...new Set(
      values
        .map((v) => String(v || "").trim())
        .filter(Boolean)
    ),
  ];
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

function convertEnergies(lineData = []) {
  return lineData.map((item, index) => {
    const defaults = buildEnergyDefaults(item.energy_name);
    const value = Number(item.value || 0);

    const plant =
      item.plant ||
      item.plant_name ||
      item.rawData?.plant ||
      "";

    const zone =
      item.zone ||
      item.area ||
      item.area_name ||
      item.rawData?.area ||
      "";

    const equipment =
      item.equipment ||
      item.equipment_name ||
      item.rawData?.equipment ||
      "";

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
      zone,
      area: zone,
      equipment,

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

  const avg = (arr, defaultValue) =>
    arr.length ? arr.reduce((sum, value) => sum + Number(value || 0), 0) / arr.length : defaultValue;

  return {
    tension: parseFloat(
      avg(
        electricEnergies
          .map((energy) => energy.rawData?.voltage)
          .filter((value) => value != null),
        230
      ).toFixed(1)
    ),
    frequence: parseFloat(
      avg(
        electricEnergies
          .map((energy) => energy.rawData?.frequency)
          .filter((value) => value != null),
        50
      ).toFixed(2)
    ),
    facteurPuissance: parseFloat(
      avg(
        electricEnergies
          .map((energy) => energy.rawData?.power_factor)
          .filter((value) => value != null),
        0.9
      ).toFixed(3)
    ),
    thd: parseFloat(
      avg(
        electricEnergies
          .map((energy) => energy.rawData?.thd)
          .filter((value) => value != null),
        3.2
      ).toFixed(2)
    ),
  };
}

function App() {
  const [activePage, setActivePageState] = useState(getSavedPage);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toastMessage, setToastMessage] = useState("");

  const [selectedLine, setSelectedLine] = useState("line-1");
  const [selectedZone, setSelectedZone] = useState("all");
  const [selectedPlant, setSelectedPlant] = useState("all");
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

  const [discoveredLines, setDiscoveredLines] = useState([]);
  const [discoveredZones, setDiscoveredZones] = useState([]);
  const [discoveredPlants, setDiscoveredPlants] = useState([]);

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

  const lineOptions = useMemo(() => {
    if (!discoveredLines.length) return [DEFAULT_LINE];

    return discoveredLines.map((label, index) => ({
      id: `line-${index + 1}`,
      label,
    }));
  }, [discoveredLines]);

  const currentLine = useMemo(() => {
    return lineOptions.find((line) => line.id === selectedLine) || lineOptions[0] || DEFAULT_LINE;
  }, [lineOptions, selectedLine]);

  useEffect(() => {
    if (!lineOptions.length) return;

    const exists = lineOptions.some((line) => line.id === selectedLine);

    if (!exists) {
      setSelectedLine(lineOptions[0].id);
      setSelectedPlant("all");
      setSelectedZone("all");
      setSelectedEnergyNames([]);
    }
  }, [lineOptions, selectedLine]);

  const handleLineChange = useCallback((lineId) => {
    setSelectedLine(lineId);
    setSelectedPlant("all");
    setSelectedZone("all");
    setSelectedEnergyNames([]);
  }, []);

  useEffect(() => {
    const discover = async () => {
      try {
        const structure = await fetchStructure();

        if (structure.lines?.length > 0) {
          setDiscoveredLines(structure.lines);
        }

        if (structure.areas?.length > 0) {
          setDiscoveredZones(structure.areas);
        }

        if (structure.plants?.length > 0) {
          setDiscoveredPlants(structure.plants);
        }
      } catch {
        // ignore discovery error
      }
    };

    discover();

    const intervalId = setInterval(discover, 30000);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetchLatestTelemetry();

        setBackendSummary(response || {});
        setBackendError("");

        const lines = Object.keys(response || {});

        if (lines.length && !discoveredLines.length) {
          setDiscoveredLines(lines.sort());
        }
      } catch {
        setBackendError("Backend not reachable — is ems-backend running?");
      } finally {
        setLoadingData(false);
      }
    };

    load();

    const intervalId = setInterval(load, 5000);

    return () => clearInterval(intervalId);
  }, [discoveredLines.length]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetchPowerQualityHistory(currentLine.label, 48);
        setPowerQualityHistory(response || []);
      } catch {
        // ignore history error
      }
    };

    load();

    const intervalId = setInterval(load, 10000);

    return () => clearInterval(intervalId);
  }, [currentLine.label]);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetchCarbonHistory(currentLine.label, 48);
        setCarbonHistory(response || []);
      } catch {
        // ignore carbon history error
      }
    };

    load();

    const intervalId = setInterval(load, 10000);

    return () => clearInterval(intervalId);
  }, [currentLine.label]);

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
        // ignore user loading error
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
        // ignore urgent messages error
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
          setMessageNotifCount((previous) => previous + unseen);
          setToastMessage(toast || "New message received");
        }

        if (!initializedRef.current) {
          initializedRef.current = true;
        }
      } catch {
        // ignore notifications error
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
    if (!toastMessage) return;

    const timeoutId = setTimeout(() => setToastMessage(""), 3500);

    return () => clearTimeout(timeoutId);
  }, [toastMessage]);

  const currentLineRaw = useMemo(() => {
    return backendSummary[currentLine.label]?.energies || [];
  }, [backendSummary, currentLine.label]);

  const lineTotalCost = useMemo(() => {
    return backendSummary[currentLine.label]?.total_cost || 0;
  }, [backendSummary, currentLine.label]);

  const linePeakKw = useMemo(() => {
    return backendSummary[currentLine.label]?.peak_kw || 0;
  }, [backendSummary, currentLine.label]);

  const lineTotalCo2 = useMemo(() => {
    return backendSummary[currentLine.label]?.total_co2_kg || 0;
  }, [backendSummary, currentLine.label]);

  const lineAvgVoltage = useMemo(() => {
    return backendSummary[currentLine.label]?.avg_voltage ?? null;
  }, [backendSummary, currentLine.label]);

  const lineAvgPowerFactor = useMemo(() => {
    return backendSummary[currentLine.label]?.avg_power_factor ?? null;
  }, [backendSummary, currentLine.label]);

  const allEnergies = useMemo(() => {
    return convertEnergies(currentLineRaw);
  }, [currentLineRaw]);

  const plantOptionsForSelectedLine = useMemo(() => {
    const plantsFromData = getUniqueValues(allEnergies.map((energy) => energy.plant));

    if (plantsFromData.length > 0) {
      return plantsFromData;
    }

    return getUniqueValues(discoveredPlants);
  }, [allEnergies, discoveredPlants]);

  const zoneOptionsForSelectedLine = useMemo(() => {
    const zonesFromData = getUniqueValues(
      allEnergies.map((energy) => energy.zone || energy.area || energy.rawData?.area)
    );

    if (zonesFromData.length > 0) {
      return zonesFromData;
    }

    return getUniqueValues(discoveredZones);
  }, [allEnergies, discoveredZones]);

  useEffect(() => {
    if (
      selectedPlant !== "all" &&
      plantOptionsForSelectedLine.length > 0 &&
      !plantOptionsForSelectedLine.some((plant) => isSameValue(plant, selectedPlant))
    ) {
      setSelectedPlant("all");
    }
  }, [selectedPlant, plantOptionsForSelectedLine]);

  useEffect(() => {
    if (
      selectedZone !== "all" &&
      zoneOptionsForSelectedLine.length > 0 &&
      !zoneOptionsForSelectedLine.some((zone) => isSameValue(zone, selectedZone))
    ) {
      setSelectedZone("all");
    }
  }, [selectedZone, zoneOptionsForSelectedLine]);

  const locationFilteredEnergies = useMemo(() => {
    return allEnergies.filter((energy) => {
      const energyPlant = energy.plant || energy.rawData?.plant || "";
      const energyZone = energy.zone || energy.area || energy.rawData?.area || "";

      const matchesPlant =
        selectedPlant === "all" || isSameValue(energyPlant, selectedPlant);

      const matchesZone =
        selectedZone === "all" || isSameValue(energyZone, selectedZone);

      return matchesPlant && matchesZone;
    });
  }, [allEnergies, selectedPlant, selectedZone]);

  const availableNames = useMemo(() => {
    return locationFilteredEnergies.map((energy) => energy.name);
  }, [locationFilteredEnergies]);

  const visibleEnergies = useMemo(() => {
    if (!selectedEnergyNames.length) {
      return locationFilteredEnergies;
    }

    return locationFilteredEnergies.filter((energy) =>
      selectedEnergyNames.includes(energy.name)
    );
  }, [locationFilteredEnergies, selectedEnergyNames]);

  const visibleData = useMemo(() => {
    return buildElectricalData(visibleEnergies);
  }, [visibleEnergies]);

  useEffect(() => {
    setSelectedEnergyNames((previous) =>
      previous.filter((name) => availableNames.includes(name))
    );
  }, [availableNames]);

  const hasSubFilter =
    selectedPlant !== "all" ||
    selectedZone !== "all" ||
    selectedEnergyNames.length > 0;

  const displayedTotalCost = useMemo(() => {
    if (!hasSubFilter) return lineTotalCost;

    const total = visibleEnergies.reduce(
      (sum, energy) => sum + Number(energy.cost || 0),
      0
    );

    return total || 0;
  }, [hasSubFilter, lineTotalCost, visibleEnergies]);

  const displayedTotalCo2 = useMemo(() => {
    if (!hasSubFilter) return lineTotalCo2;

    const total = visibleEnergies.reduce(
      (sum, energy) => sum + Number(energy.co2_kg || 0),
      0
    );

    return total || 0;
  }, [hasSubFilter, lineTotalCo2, visibleEnergies]);

  const displayedPeakKw = useMemo(() => {
    if (!hasSubFilter) return linePeakKw;

    const electricValues = visibleEnergies
      .filter((energy) => {
        const name = energy.name.toLowerCase();
        return (
          energy.unit === "kW" ||
          name.includes("electric") ||
          name.includes("électric")
        );
      })
      .map((energy) => Number(energy.value || 0));

    if (!electricValues.length) return 0;

    return Math.max(...electricValues);
  }, [hasSubFilter, linePeakKw, visibleEnergies]);

  const displayedAvgVoltage = visibleEnergies.length
    ? visibleData.tension
    : lineAvgVoltage;

  const displayedAvgPowerFactor = visibleEnergies.length
    ? visibleData.facteurPuissance
    : lineAvgPowerFactor;

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
    localStorage.removeItem("token");

    setIsLoggedIn(false);
    setUser(null);
    setBackendSummary({});
    setDiscoveredLines([]);
    setDiscoveredZones([]);
    setDiscoveredPlants([]);
    setSelectedLine("line-1");
    setSelectedPlant("all");
    setSelectedZone("all");
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

  const handleUpdateProfile = (updatedUser) => {
    setUser(updatedUser);
  };

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
        previous.map((item) =>
          item.id === id ? { ...item, role } : item
        )
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

  const clearEnergy = useCallback(() => {
    setSelectedEnergyNames([]);
  }, []);

  const shared = {
    energies: visibleEnergies,
    selectedLineLabel: currentLine.label,
    selectedPlant,
    selectedZone,
    totalCost: displayedTotalCost,
    peakKw: displayedPeakKw,
    totalCo2: displayedTotalCo2,
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
            selectedLineLabel={currentLine.label}
            powerQualityHistory={powerQualityHistory}
            {...shared}
          />
        );

      case "equipment":
        return (
          <EquipmentStatus
            energies={visibleEnergies}
            selectedLineLabel={currentLine.label}
            selectedPlant={selectedPlant}
            selectedZone={selectedZone}
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
            totalCo2={displayedTotalCo2}
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
        return <AlarmsEvents {...shared} />;

      case "history":
        return (
          <HistoricalData
            selectedLineLabel={currentLine.label}
            selectedPlant={selectedPlant}
            selectedZone={selectedZone}
          />
        );

      case "weather":
        return <WeatherPage selectedLineLabel={currentLine.label} />;

      case "profile":
        return <Profile user={user} onUpdateProfile={handleUpdateProfile} />;

      case "maintenance":
        return (
          <MaintenancePage
            energies={visibleEnergies}
            currentUser={user}
            selectedLineLabel={currentLine.label}
            selectedPlant={selectedPlant}
            selectedZone={selectedZone}
          />
        );

      case "prices":
        return (
          <EnergyPriceAnalysis
            energies={visibleEnergies}
            selectedLineLabel={currentLine.label}
            peakKw={displayedPeakKw}
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
          lineOptions={lineOptions}
          selectedLine={selectedLine}
          onLineChange={handleLineChange}
          zoneOptions={zoneOptionsForSelectedLine}
          selectedZone={selectedZone}
          onZoneChange={setSelectedZone}
          plantOptions={plantOptionsForSelectedLine}
          selectedPlant={selectedPlant}
          onPlantChange={setSelectedPlant}
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

        {loadingData && (
          <div className="info-box">⏳ Loading from DataPlatform...</div>
        )}

        {backendError && <div className="alarm-item">⚠ {backendError}</div>}

        {!loadingData && renderPage()}
      </div>

      <ChatbotWidget
        energies={visibleEnergies}
        selectedLineLabel={currentLine.label}
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