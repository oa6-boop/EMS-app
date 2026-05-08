// Fix Docker : utilise le hostname dynamique au lieu de 127.0.0.1
const hostname     = window.location.hostname;
const API_BASE_URL = `http://${hostname}:8000`;

export async function loginUser(email, password) {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);

  const response = await fetch(`${API_BASE_URL}/api/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    formData,
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || "Login failed");
  return result;
}

export async function getCurrentUser(token) {
  const response = await fetch(`${API_BASE_URL}/api/users/me`, {
    method:  "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || "Failed to fetch current user");
  return result;
}

export async function sendForgotPasswordRequest(email) {
  const response = await fetch(`${API_BASE_URL}/api/forgot-password`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ email }),
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || "Failed to send request");
  return result;
}