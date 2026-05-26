import { useEffect, useRef, useState, useMemo } from "react";
import { askChatbot } from "../api/chatbotApi";

const QUICK_QUESTIONS = [
  "Statut général de la ligne",
  "Y a-t-il des anomalies?",
  "Recommandations d'optimisation",
  "Quel est le coût total en MAD?",
  "Analyser le facteur de puissance",
  "General status overview",
  "Any anomalies detected?",
  "Optimization recommendations",
  "What is the CO₂ emission?",
  "Explain power quality",
];
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (!line.trim()) return <br key={i} />;

    const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("• ");
    const isCode   = line.trim().startsWith("```");
    if (isCode) return <div key={i} style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "#94a3b8", marginBottom: "0.1rem" }}>{line.replace(/```/g, "")}</div>;

    const content = isBullet ? line.trim().slice(2) : line;

    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    const rendered = parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j} style={{ color: "inherit" }}>{part.slice(2, -2)}</strong>;
      }
      return <span key={j}>{part}</span>;
    });

    if (isBullet) {
      return (
        <div key={i} style={{ display: "flex", gap: "0.4rem", marginBottom: "0.2rem", paddingLeft: "0.5rem" }}>
          <span style={{ flexShrink: 0, color: "var(--accent)" }}>•</span>
          <span>{rendered}</span>
        </div>
      );
    }

    return <div key={i} style={{ marginBottom: "0.15rem", lineHeight: "1.5" }}>{rendered}</div>;
  });
}

export default function ChatbotWidget({
  energies          = [],
  selectedLineLabel = "",
  urgentCount       = 0,
  usersCount        = 0,
  activePage        = "dashboard",
  avgVoltage        = null,
  avgPowerFactor    = null,
  peakKw            = 0,
  totalCo2          = 0,
  totalCost         = 0,
}) {
  const token = localStorage.getItem("token");

  const context = useMemo(() => ({
    energies,
    selectedLineLabel,
    urgentCount,
    usersCount,
    activePage,
    avgVoltage,
    avgPowerFactor,
    peakKw,
    totalCo2,
    totalCost,
  }), [energies, selectedLineLabel, urgentCount, usersCount, activePage,
       avgVoltage, avgPowerFactor, peakKw, totalCo2, totalCost]);

  const [open,      setOpen]      = useState(false);
  const [messages,  setMessages]  = useState([{
    from: "bot",
    text: `👋 **Bonjour / Hello!** Je suis votre assistant EMS JESA.\n\nJe peux répondre à vos questions sur:\n- 📊 Données live (puissance, tension, CO₂, coûts)\n- ⚡ Qualité d'énergie (THD, FP, fréquence)\n- 🔔 Alarmes et recommandations\n- 📖 Concepts EMS (Modbus, MQTT, SEC...)\n\nJe parle **français** et **anglais** 🇫🇷 🇬🇧`,
  }]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [showQuick, setShowQuick] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  useEffect(() => {
    if (open) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");
    setShowQuick(false);
    setMessages(prev => [...prev, { from: "user", text: msg }]);
    setLoading(true);
    try {
      const result = await askChatbot(msg, context, token);
      setMessages(prev => [...prev, {
        from: "bot",
        text: result.answer || "I couldn't generate an answer.",
      }]);
    } catch {
      setMessages(prev => [...prev, {
        from: "bot",
        text: "Assistant temporarily unavailable. / Assistant temporairement indisponible.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([{
      from: "bot",
      text: "Conversation effacée. Comment puis-je vous aider?\nConversation cleared. How can I help?",
    }]);
    setShowQuick(true);
  };

  return (
    <>
      <button
        className="chatbot-fab"
        onClick={() => setOpen(p => !p)}
        title="EMS Assistant"
      >
        {open ? "✕" : "🤖"}
      </button>

      {open && (
        <div className="chatbot-box">
          {/* Header */}
          <div className="chatbot-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.2rem" }}>🤖</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.88rem" }}>EMS Assistant</div>
                <div style={{ fontSize: "0.7rem", opacity: 0.8 }}>{selectedLineLabel || "JESA Group"} · FR/EN</div>
              </div>
            </div>
            <button
              type="button"
              onClick={clearChat}
              title="Effacer / Clear"
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: "0.8rem", opacity: 0.7, padding: "2px 6px" }}
            >
              🗑️
            </button>
          </div>

          {/* Messages */}
          <div className="chatbot-messages">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`chatbot-message ${msg.from === "bot" ? "bot" : "user"}`}
                style={{ fontSize: "0.84rem", lineHeight: "1.5" }}
              >
                {msg.from === "bot" ? renderMarkdown(msg.text) : msg.text}
              </div>
            ))}
            {loading && (
              <div className="chatbot-message bot" style={{ opacity: 0.6, fontStyle: "italic", fontSize: "0.82rem" }}>
                ⏳ Analyse en cours...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Questions rapides */}
          {showQuick && messages.length <= 2 && (
            <div style={{ padding: "0.5rem", borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginBottom: "0.35rem" }}>
                Questions rapides / Quick questions:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", maxHeight: "90px", overflowY: "auto" }}>
                {QUICK_QUESTIONS.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => send(q)}
                    style={{
                      background: "var(--bg-card)", border: "1px solid var(--border)",
                      borderRadius: "12px", padding: "0.22rem 0.55rem",
                      fontSize: "0.71rem", cursor: "pointer", color: "var(--text-muted)",
                      transition: "all 0.15s", whiteSpace: "nowrap",
                    }}
                    onMouseEnter={e => { e.target.style.background = "var(--accent)"; e.target.style.color = "#fff"; }}
                    onMouseLeave={e => { e.target.style.background = "var(--bg-card)"; e.target.style.color = "var(--text-muted)"; }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="chatbot-input-row">
            <input
              ref={inputRef}
              type="text"
              placeholder="Question en français ou en anglais..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              disabled={loading}
              style={{ fontSize: "0.83rem" }}
            />
            <button
              type="button"
              onClick={() => send()}
              disabled={loading || !input.trim()}
              style={{
                opacity: loading || !input.trim() ? 0.5 : 1,
                cursor:  loading || !input.trim() ? "not-allowed" : "pointer",
                fontWeight: 600, fontSize: "0.83rem",
              }}
            >
              {loading ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}