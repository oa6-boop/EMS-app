const hostname     = window.location.hostname;
const API_BASE_URL = `http://${hostname}:8000`;

async function apiFetch(url, options = {}) {
  const token    = localStorage.getItem("token");
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (!response.ok) {
    const err = await response.text().catch(() => "Unknown error");
    throw new Error(`API ${response.status}: ${err}`);
  }
  return response.json();
}

export const fetchMaintenanceRecords = () =>
  apiFetch(`${API_BASE_URL}/api/maintenance`);

export const createMaintenanceRecord = (data) =>
  apiFetch(`${API_BASE_URL}/api/maintenance`, {
    method: "POST",
    body:   JSON.stringify(data),
  });

export const updateMaintenanceRecord = (id, data) =>
  apiFetch(`${API_BASE_URL}/api/maintenance/${id}`, {
    method: "PUT",
    body:   JSON.stringify(data),
  });

export const deleteMaintenanceRecord = (id) =>
  apiFetch(`${API_BASE_URL}/api/maintenance/${id}`, {
    method: "DELETE",
  });