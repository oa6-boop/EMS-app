const API_BASE_URL = "http://127.0.0.1:8000/api/admin";

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