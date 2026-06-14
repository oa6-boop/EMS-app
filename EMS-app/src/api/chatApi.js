// Fix Docker / réseau : hostname dynamique (comme les autres fichiers API).
// "127.0.0.1" en dur cassait la messagerie dès que l'app était ouverte
// depuis une autre machine ou un conteneur Docker.
const hostname     = window.location.hostname;
const API_BASE_URL = `http://${hostname}:8000/api/chat`;

export async function searchUsers(query, token) {
  const response = await fetch(
    `${API_BASE_URL}/search-users?q=${encodeURIComponent(query)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to search users");
  }

  return result;
}

export async function createPrivateConversation(userId, token) {
  const response = await fetch(`${API_BASE_URL}/conversations/private`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ user_id: userId }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to create conversation");
  }

  return result;
}

export async function createGroupConversation(payload, token) {
  const response = await fetch(`${API_BASE_URL}/conversations/group`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to create group");
  }

  return result;
}

export async function fetchConversations(token) {
  const response = await fetch(`${API_BASE_URL}/conversations`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to fetch conversations");
  }

  return result;
}

export async function fetchMessages(conversationId, token) {
  const response = await fetch(
    `${API_BASE_URL}/conversations/${conversationId}/messages`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to fetch messages");
  }

  return result;
}

export async function sendMessage(conversationId, content, token) {
  const response = await fetch(
    `${API_BASE_URL}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content }),
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to send message");
  }

  return result;
}

export async function uploadChatFile(conversationId, file, token) {
  const formData = new FormData();
  formData.append("uploaded_file", file);

  const response = await fetch(
    `${API_BASE_URL}/conversations/${conversationId}/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to upload file");
  }

  return result;
}

export async function updateMessage(messageId, content, token) {
  const response = await fetch(`${API_BASE_URL}/messages/${messageId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ content }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to update message");
  }

  return result;
}

export async function deleteMessage(messageId, token) {
  const response = await fetch(`${API_BASE_URL}/messages/${messageId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to delete message");
  }

  return result;
}

export async function deleteConversation(conversationId, token) {
  const response = await fetch(
    `${API_BASE_URL}/conversations/${conversationId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to delete conversation");
  }

  return result;
}

export async function shareReportToConversation(payload, token) {
  const response = await fetch(`${API_BASE_URL}/share-report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to share report");
  }

  return result;
}

export async function fetchLatestMessageNotifications(token) {
  const conversations = await fetchConversations(token);

  const fullResults = await Promise.all(
    (conversations || []).slice(0, 20).map(async (conversation) => {
      try {
        const msgs = await fetchMessages(conversation.id, token);
        const last = msgs.length ? msgs[msgs.length - 1] : null;

        return {
          conversation,
          lastMessage: last,
        };
      } catch {
        return {
          conversation,
          lastMessage: null,
        };
      }
    })
  );

  return fullResults;
}