const hostname = window.location.hostname;
const API_BASE = `http://${hostname}:8000/api/industry`;
const getToken = () => localStorage.getItem("token") || "";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getToken()}`,
});

export async function fetchIndustryKpis() {
  const r = await fetch(`${API_BASE}/kpis`, { headers: authHeaders() });
  if (!r.ok) throw new Error("Failed to fetch industry KPIs");
  return r.json();
}

export async function fetchIndustryAlarms() {
  const r = await fetch(`${API_BASE}/alarms`, { headers: authHeaders() });
  if (!r.ok) throw new Error("Failed to fetch alarms");
  return r.json();
}

export async function resolveAlarm(alarmId) {
  const r = await fetch(`${API_BASE}/alarms/${alarmId}/resolve`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error("Failed to resolve alarm");
  return r.json();
}

export async function fetchEnergyHistory() {
  const r = await fetch(`${API_BASE}/history`, { headers: authHeaders() });
  if (!r.ok) throw new Error("Failed to fetch energy history");
  return r.json();
}