const API_BASE_URL = "http://127.0.0.1:8000/api";

export async function fetchUsers(token) {
  const response = await fetch(`${API_BASE_URL}/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to fetch users");
  }

  return result;
}

export async function createUser(userData, token) {
  const payload = {
    first_name: userData.firstName,
    last_name: userData.lastName,
    email: userData.email,
    password: userData.password,
    role: "user",
  };

  const response = await fetch(`${API_BASE_URL}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok) {
    const errorMessage =
      typeof result.detail === "string"
        ? result.detail
        : Array.isArray(result.detail)
        ? result.detail.map((item) => item.msg).join(" | ")
        : "Failed to create user";

    throw new Error(errorMessage);
  }

  return result;
}

export async function deleteUser(userId, token) {
  const response = await fetch(`${API_BASE_URL}/users/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to delete user");
  }

  return result;
}

export async function fetchUrgentMessages(token) {
  const response = await fetch(`${API_BASE_URL}/admin/urgent-messages`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to fetch urgent messages");
  }

  return result;
}

export async function fetchUrgentMessagesCount(token) {
  const response = await fetch(`${API_BASE_URL}/admin/urgent-messages/count`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to fetch urgent count");
  }

  return result;
}

export async function regenerateUserPassword(requestId, token) {
  const response = await fetch(
    `${API_BASE_URL}/admin/urgent-messages/${requestId}/regenerate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to regenerate password");
  }

  return result;
}