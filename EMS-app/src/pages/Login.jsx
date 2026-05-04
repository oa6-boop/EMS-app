import { useState } from "react";
import logo from "../assets/logo.png";

export default function Login({ onLogin, onForgotPassword }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotEmail,     setForgotEmail]     = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin(email, password);
  };

  const handleForgotSubmit = (e) => {
    e.preventDefault();
    onForgotPassword(forgotEmail);
    setForgotEmail("");
    setShowForgotModal(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <img src={logo} alt="EMS Logo" className="login-logo" />
        <h1 className="login-title">EMS</h1>
        <p className="login-subtitle">Energy Management System — JESA Group</p>

        <form onSubmit={handleSubmit} className="login-form">
          <input
            type="email"
            placeholder="Email (ex: admin@jesagroup.com)"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <button type="submit" className="login-btn">Sign In</button>
        </form>

        <button
          type="button"
          className="forgot-password-link"
          onClick={() => setShowForgotModal(true)}
        >
          Forgot password?
        </button>
      </div>

      {showForgotModal && (
        <div className="forgot-modal-overlay">
          <div className="forgot-modal">
            <h2>Forgot Password</h2>
            <p>Enter your email — an admin will generate a new password for you.</p>
            <form onSubmit={handleForgotSubmit}>
              <input
                type="email"
                placeholder="your.name@jesagroup.com"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                required
              />
              <div className="forgot-modal-actions">
                <button type="submit" className="login-btn">Send Request</button>
                <button
                  type="button"
                  className="cancel-forgot-btn"
                  onClick={() => setShowForgotModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}