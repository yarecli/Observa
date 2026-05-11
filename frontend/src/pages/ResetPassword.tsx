import type { JSX } from "react";
import { useState } from "react";

const API_BASE = "http://localhost:8000/api";

// This page is reached via a link emailed to the user, e.g.:
// https://yourapp.com/reset-password?token=abc123
// If no token is present, show the "request reset" form (enter email).
// If token is present, show the "set new password" form.

export default function ResetPassword(): JSX.Element {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const box: React.CSSProperties = { width: "100%", padding: "8px", border: "1px solid #ccc", fontSize: 14, boxSizing: "border-box" };
  const primaryBtn: React.CSSProperties = { width: "100%", padding: "10px", background: "#4a7c6f", color: "white", border: "none", fontSize: 14, cursor: "pointer", marginTop: 4 };
  const outlineBtn: React.CSSProperties = { width: "100%", padding: "8px", background: "none", border: "1px solid #ccc", fontSize: 13, cursor: "pointer", marginTop: 8 };

  // Step 1 — no token, user enters their email to request a reset link
  async function handleRequestReset() {
    if (!email) { setError("Please enter your email."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/request-reset/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setDone(true);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  // Step 2 — token present, user sets new password
  async function handleSetNewPassword() {
    if (password.length < 12) { setError("Password must be at least 12 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/reset-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, token_type: "reset" }),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setDone(true);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  if (done && !token) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
        <div style={{ background: "white", border: "1px solid #ccc", padding: 32, width: 340, textAlign: "center" }}>
          <p style={{ fontSize: 36, marginBottom: 12 }}>📬</p>
          <h3 style={{ marginBottom: 8 }}>Check your email</h3>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>
            If an account exists for <strong>{email}</strong>, a reset link has been sent.
          </p>
          <button style={primaryBtn} onClick={() => window.location.href = "/"}>Back to Sign In</button>
        </div>
      </div>
    );
  }

  if (done && token) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
        <div style={{ background: "white", border: "1px solid #ccc", padding: 32, width: 340, textAlign: "center" }}>
          <p style={{ fontSize: 36, marginBottom: 12 }}>✅</p>
          <h3 style={{ marginBottom: 8 }}>Password Reset</h3>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>Your password has been updated. You can now sign in.</p>
          <button style={primaryBtn} onClick={() => window.location.href = "/"}>Go to Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
      <div style={{ background: "white", border: "1px solid #ccc", padding: 32, width: 340 }}>

        {!token ? (
          <>
            <h2 style={{ marginBottom: 4 }}>Reset Password</h2>
            <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
              Enter your email and we'll send you a link to reset your password.
            </p>
            {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>⚠️ {error}</p>}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleRequestReset()}
                style={box} placeholder="you@example.com" />
            </div>
            <button onClick={handleRequestReset} disabled={loading || !email}
              style={{ ...primaryBtn, opacity: (loading || !email) ? 0.5 : 1, cursor: (loading || !email) ? "not-allowed" : "pointer" }}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
            <button style={outlineBtn} onClick={() => window.location.href = "/"}>← Back to Sign In</button>
          </>
        ) : (
          <>
            <h2 style={{ marginBottom: 4 }}>Set New Password</h2>
            <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
              Enter a new password for your account. Must be at least 12 characters.
            </p>
            {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>⚠️ {error}</p>}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>New Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                style={box} placeholder="At least 12 characters" />
              <p style={{ fontSize: 11, color: password.length > 0 && password.length < 12 ? "red" : "#999", marginTop: 4 }}>
                {password.length}/12 characters minimum
              </p>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Confirm Password</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSetNewPassword()}
                style={{ ...box, borderColor: confirm.length > 0 && confirm !== password ? "red" : "#ccc" }}
                placeholder="Re-enter your password" />
            </div>
            <button onClick={handleSetNewPassword}
              disabled={loading || password.length < 12 || password !== confirm}
              style={{ ...primaryBtn, opacity: (loading || password.length < 12 || password !== confirm) ? 0.5 : 1, cursor: (loading || password.length < 12 || password !== confirm) ? "not-allowed" : "pointer" }}>
              {loading ? "Saving..." : "Reset Password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}


