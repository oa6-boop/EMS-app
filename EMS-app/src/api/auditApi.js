const API_BASE_URL = `http://${window.location.hostname}:8000/api/admin`;

export async function fetchAuditLogs(token) {
  const response = await fetch(`${API_BASE_URL}/audit-logs`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to fetch audit logs");
  }

  return result;
}

export async function logAudit(action, description) {
  try {
    const token = localStorage.getItem("token");
    if (!token) return;

    await fetch(`${API_BASE_URL}/audit-logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action, description }),
    });
  } catch {
    // silencieux : ne jamais bloquer l'app pour un échec d'audit
  }
}