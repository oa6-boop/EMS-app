const hostname     = window.location.hostname;
const API_BASE_URL = `http://${hostname}:8000`;

async function apiFetch(url, options = {}, token = null) {
  const t = token || localStorage.getItem("token");
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type":  "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...options.headers,
    },
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = typeof result.detail === "string"
      ? result.detail
      : Array.isArray(result.detail)
      ? result.detail.map(i => i.msg).join(" | ")
      : `Error ${response.status}`;
    throw new Error(msg);
  }
  return result;
}

// ─── Utilisateurs ─────────────────────────────────────────────────────────────
export const fetchUsers = (token) =>
  apiFetch(`${API_BASE_URL}/api/users`, {}, token);

// Techniciens de maintenance actifs — accessible à tous les rôles connectés
// (sert au menu "Technician" de la page Maintenance).
export const fetchTechnicians = (token) =>
  apiFetch(`${API_BASE_URL}/api/users/technicians`, {}, token);

export const createUser = (data, token) =>
  apiFetch(
    `${API_BASE_URL}/api/users`,
    {
      method: "POST",
      body: JSON.stringify({
        first_name: data.firstName,
        last_name:  data.lastName,
        email:      data.email,
        password:   data.password,
        role:       data.role || "management",
      }),
    },
    token
  );

export const deleteUser = (userId, token) =>
  apiFetch(`${API_BASE_URL}/api/users/${userId}`, { method: "DELETE" }, token);

export const updateUserRole = (userId, role, token) =>
  apiFetch(
    `${API_BASE_URL}/api/users/${userId}/role`,
    { method: "PATCH", body: JSON.stringify({ role }) },
    token
  );

// ─── Mise à jour profil + mot de passe ───────────────────────────────────────
// Envoie au backend et met à jour la base de données
export const updateMyProfile = (data, token) =>
  apiFetch(
    `${API_BASE_URL}/api/users/me/profile`,
    {
      method: "PATCH",
      body: JSON.stringify({
        firstName:    data.firstName,
        lastName:     data.lastName,
        password:     data.password || "",
        profileImage: data.profileImage || "",
      }),
    },
    token
  );

// ─── Urgent Messages ─────────────────────────────────────────────────────────
export const fetchUrgentMessages = (token) =>
  apiFetch(`${API_BASE_URL}/api/admin/urgent-messages`, {}, token);

export const fetchUrgentMessagesCount = (token) =>
  apiFetch(`${API_BASE_URL}/api/admin/urgent-messages/count`, {}, token);

export const regenerateUserPassword = (requestId, token) =>
  apiFetch(
    `${API_BASE_URL}/api/admin/urgent-messages/${requestId}/regenerate`,
    { method: "POST", body: JSON.stringify({}) },
    token
  );