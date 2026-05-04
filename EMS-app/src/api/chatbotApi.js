const API_BASE_URL = "http://127.0.0.1:8000/api/chatbot";

export async function askChatbot(question, context, token) {
  const response = await fetch(`${API_BASE_URL}/ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      question,
      context,
    }),
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.detail || "Failed to get chatbot answer");
  }

  return result;
}