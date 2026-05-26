const hostname = window.location.hostname;
const API_BASE = `http://${hostname}:8000/api/chatbot`;

export async function askChatbot(question, context, token) {
  const response = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question, context }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.detail || "Failed");
  return result;
}