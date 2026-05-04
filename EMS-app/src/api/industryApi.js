const API_BASE_URL = "http://127.0.0.1:8000/api/industry";

export async function fetchIndustryKpis() {
  const response = await fetch(`${API_BASE_URL}/kpis`);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to fetch industry KPIs");
  }

  return result;
}

export async function fetchIndustryAlarms() {
  const response = await fetch(`${API_BASE_URL}/alarms`);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to fetch alarms");
  }

  return result;
}

export async function resolveAlarm(alarmId) {
  const response = await fetch(`${API_BASE_URL}/alarms/${alarmId}/resolve`, {
    method: "POST",
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to resolve alarm");
  }

  return result;
}

export async function fetchEnergyHistory() {
  const response = await fetch(`${API_BASE_URL}/history`);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to fetch energy history");
  }

  return result;
}