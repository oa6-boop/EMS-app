import { useState } from "react";
import logo from "../assets/logo.png";

export default function Login({ onLogin, onForgotPassword }) {
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [loginError,      setLoginError]      = useState("");
  const [loginLoading,    setLoginLoading]    = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail,     setForgotEmail]     = useState("");
  const [forgotStatus,    setForgotStatus]    = useState(""); // "success" | "error" | ""
  const [forgotMsg,       setForgotMsg]       = useState("");
  const [forgotLoading,   setForgotLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      await onLogin(email, password);
    } catch (err) {
      setLoginError(err.message || "Invalid credentials");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotStatus("");
    setForgotMsg("");
    try {
      const res = await onForgotPassword(forgotEmail);
      setForgotStatus("success");
      setForgotMsg(
        res?.message ||
        "Your request has been sent to the admin. You will receive a new password shortly."
      );
      setForgotEmail("");
    } catch (err) {
      setForgotStatus("error");
      setForgotMsg(err.message || "Failed to send request. Check your email.");
    } finally {
      setForgotLoading(false);
    }
  };

  const closeForgot = () => {
    setShowForgotModal(false);
    setForgotEmail("");
    setForgotStatus("");
    setForgotMsg("");
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={logo} alt="EMS Logo" className="login-logo" />
        <h1 className="login-title">EMS</h1>
        <p className="login-subtitle">Energy Management System  JESA Group</p>

        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="email"
            placeholder="Email (ex: admin@jesagroup.com)"
            value={email}
            onChange={e => { setEmail(e.target.value); setLoginError(""); }}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => { setPassword(e.target.value); setLoginError(""); }}
            required
          />

          {loginError && (
            <div style={{
              background: "#fff5f5", color: "#c53030",
              border: "1px solid #fed7d7", borderRadius: "8px",
              padding: "0.6rem 0.85rem", fontSize: "0.85rem",
              textAlign: "center",
            }}>
              ⚠ {loginError}
            </div>
          )}

          <button
            type="submit"
            className="login-btn"
            disabled={loginLoading}
            style={{ opacity: loginLoading ? 0.7 : 1 }}
          >
            {loginLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <button
          type="button"
          className="forgot-password-link"
          onClick={() => setShowForgotModal(true)}
        >
          Forgot password?
        </button>
      </div>

      {/* Modal Forgot Password */}
      {showForgotModal && (
        <div className="forgot-modal-overlay">
          <div className="forgot-modal">
            <h2>🔑 Forgot Password</h2>

            {forgotStatus === "success" ? (
              // Message de succès après envoi
              <div>
                <div style={{
                  background: "#f0fff4", color: "#276749",
                  border: "1px solid #c6f6d5", borderRadius: "10px",
                  padding: "1rem", marginBottom: "1rem",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>✅</div>
                  <strong>Request sent successfully!</strong>
                  <p style={{ fontSize: "0.85rem", margin: "0.5rem 0 0" }}>
                    {forgotMsg}
                  </p>
                </div>
                <div style={{
                  background: "#fffbeb", color: "#b7791f",
                  border: "1px solid #fbd38d", borderRadius: "8px",
                  padding: "0.75rem", fontSize: "0.82rem", marginBottom: "1rem",
                }}>
                  📋 The admin will see your request in <strong>Urgent Messages</strong> and generate a new password for you.
                </div>
                <button
                  type="button"
                  className="login-btn"
                  onClick={closeForgot}
                  style={{ width: "100%" }}
                >
                  Close
                </button>
              </div>
            ) : (
              // Formulaire
              <form onSubmit={handleForgotSubmit}>
                <p style={{ fontSize: "0.88rem", color: "var(--text-secondary)", marginBottom: "1rem" }}>
                  Enter your email — the admin will generate a new password for you.
                </p>

                <input
                  type="email"
                  placeholder="your.name@jesagroup.com"
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  required
                  style={{ marginBottom: "0.75rem" }}
                />

                {forgotStatus === "error" && (
                  <div style={{
                    background: "#fff5f5", color: "#c53030",
                    border: "1px solid #fed7d7", borderRadius: "8px",
                    padding: "0.6rem", fontSize: "0.83rem",
                    marginBottom: "0.75rem", textAlign: "center",
                  }}>
                    ⚠ {forgotMsg}
                  </div>
                )}

                <div className="forgot-modal-actions">
                  <button
                    type="submit"
                    className="login-btn"
                    disabled={forgotLoading}
                    style={{ opacity: forgotLoading ? 0.7 : 1 }}
                  >
                    {forgotLoading ? "Sending..." : "Send Request"}
                  </button>
                  <button
                    type="button"
                    className="cancel-forgot-btn"
                    onClick={closeForgot}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}