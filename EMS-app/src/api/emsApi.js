const hostname     = window.location.hostname;
const API_BASE_URL = `http://${hostname}:8000`;

async function apiFetch(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.text().catch(() => "Unknown error");
    throw new Error(`API ${response.status}: ${err}`);
  }
  return response.json();
}

export async function fetchLatestTelemetry() {
  return apiFetch(`${API_BASE_URL}/api/telemetry/latest`);
}

export async function fetchStructure() {
  return apiFetch(`${API_BASE_URL}/api/telemetry/structure`);
}

export async function fetchPowerQualityHistory(lineName, limit = 48) {
  return apiFetch(
    `${API_BASE_URL}/api/telemetry/power-quality/${encodeURIComponent(lineName)}?limit=${limit}`
  );
}

export async function fetchCarbonHistory(lineName, limit = 48) {
  return apiFetch(
    `${API_BASE_URL}/api/telemetry/carbon/${encodeURIComponent(lineName)}?limit=${limit}`
  );
}

export async function fetchLineHistory(lineName, limit = 100) {
  return apiFetch(
    `${API_BASE_URL}/api/telemetry/line/${encodeURIComponent(lineName)}?limit=${limit}`
  );
}

export async function fetchLineTelemetry(lineName) {
  return fetchLineHistory(lineName, 100);
}

export async function fetchEnergyTelemetry(energyName) {
  return apiFetch(
    `${API_BASE_URL}/api/telemetry/energy/${encodeURIComponent(energyName)}`
  );
}

export async function fetchChartData(lineName, limit = 30) {
  return apiFetch(
    `${API_BASE_URL}/api/charts/realtime/${encodeURIComponent(lineName)}?limit=${limit}`
  );
}

export async function fetchPredictions(lineName, horizon = 10) {
  return apiFetch(
    `${API_BASE_URL}/api/charts/predictions/${encodeURIComponent(lineName)}?horizon=${horizon}`
  );
}

export async function fetchAggregatedHistory(lineName, period = "day", energyName = "Electricity") {
  return apiFetch(
    `${API_BASE_URL}/api/history/aggregate/${encodeURIComponent(lineName)}?period=${period}&energy_name=${encodeURIComponent(energyName)}`
  );
}

export async function fetchComparison(lineName, energyName = "Electricity") {
  return apiFetch(
    `${API_BASE_URL}/api/history/compare/${encodeURIComponent(lineName)}?energy_name=${encodeURIComponent(energyName)}`
  );
}

export async function fetchAllLinesSummary(period = "day") {
  return apiFetch(`${API_BASE_URL}/api/history/summary?period=${period}`);
}