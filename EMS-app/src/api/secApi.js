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
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

export const fetchSEC = (lineName) =>
  apiFetch(`${API_BASE_URL}/api/sec/${encodeURIComponent(lineName)}`);

export const saveSEC = (lineName, data) =>
  apiFetch(`${API_BASE_URL}/api/sec/${encodeURIComponent(lineName)}`, {
    method: "POST",
    body:   JSON.stringify(data),
  });