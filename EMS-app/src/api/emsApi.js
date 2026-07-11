const hostname     = window.location.hostname;
const API_BASE_URL = `http://${hostname}:8000`;

async function apiFetch(url) {
  const token = localStorage.getItem("token") || "";
  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const err = await response.text().catch(() => "Unknown error");
    throw new Error(`API ${response.status}: ${err}`);
  }
  return response.json();
}


// Convertit les filtres du header (Plant/Zone/Equipement/Tag) en query string.
// Toutes les routes de graphes les acceptent : les courbes suivent le filtre.
function filterQuery(filters = {}) {
  const parts = [];
  for (const key of ["plant", "zone", "equipment", "tag"]) {
    const v = filters[key];
    if (v && v !== "all") parts.push(`${key}=${encodeURIComponent(v)}`);
  }
  return parts.length ? "&" + parts.join("&") : "";
}

export async function fetchLatestTelemetry() {
  return apiFetch(`${API_BASE_URL}/api/telemetry/latest`);
}

export async function fetchStructure() {
  return apiFetch(`${API_BASE_URL}/api/telemetry/structure`);
}

export async function fetchPowerQualityHistory(lineName, limit = 48, filters = {}) {
  return apiFetch(
    `${API_BASE_URL}/api/telemetry/power-quality/${encodeURIComponent(lineName)}?limit=${limit}${filterQuery(filters)}`
  );
}

export async function fetchCarbonHistory(lineName, limit = 48, filters = {}) {
  return apiFetch(
    `${API_BASE_URL}/api/telemetry/carbon/${encodeURIComponent(lineName)}?limit=${limit}${filterQuery(filters)}`
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

export async function fetchChartData(lineName, limit = 30, filters = {}) {
  return apiFetch(
    `${API_BASE_URL}/api/charts/realtime/${encodeURIComponent(lineName)}?limit=${limit}${filterQuery(filters)}`
  );
}

export async function fetchPredictions(lineName, horizon = 10) {
  return apiFetch(
    `${API_BASE_URL}/api/charts/predictions/${encodeURIComponent(lineName)}?horizon=${horizon}`
  );
}

export async function fetchAggregatedHistory(lineName, period = "day", energyName = "Electricity", filters = {}) {
  return apiFetch(
    `${API_BASE_URL}/api/history/aggregate/${encodeURIComponent(lineName)}?period=${period}&energy_name=${encodeURIComponent(energyName)}${filterQuery(filters)}`
  );
}

export async function fetchComparison(lineName, energyName = "Electricity", filters = {}) {
  return apiFetch(
    `${API_BASE_URL}/api/history/compare/${encodeURIComponent(lineName)}?energy_name=${encodeURIComponent(energyName)}${filterQuery(filters)}`
  );
}

export async function fetchAllLinesSummary(period = "day") {
  return apiFetch(`${API_BASE_URL}/api/history/summary?period=${period}`);
}

export async function fetchEquipmentList() {
  return apiFetch(`${API_BASE_URL}/api/telemetry/equipment-list`);
}

export async function fetchInvoice(start, end, line) {
  const params = new URLSearchParams();
  if (start) params.set("start", start);
  if (end) params.set("end", end);
  if (line && line !== "All lines") params.set("line", line);
  return apiFetch(`${API_BASE_URL}/api/history/invoice?${params.toString()}`);
}
