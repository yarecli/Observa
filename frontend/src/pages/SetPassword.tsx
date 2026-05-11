import type { JSX } from "react";
import { useState } from "react";

const API_BASE = "http://localhost:8000/api";

// This page is reached via a link emailed to the user, e.g.:
// https://yourapp.com/set-password?token=abc123
// The backend validates the token and activates the account on submit.

export default function SetPassword(): JSX.Element {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  function validate(): string {
    if (password.length < 12) return "Password must be at least 12 characters.";
    if (password !== confirm) return "Passwords do not match.";
    return "";
  }

  async function handleSubmit() {
    const err = validate();
    if (err) { setError(err); return; }
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/set-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, token_type: "invitation"}),
      });
      const data: { error?: string } = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setDone(true);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const box: React.CSSProperties = { width: "100%", padding: "8px", border: "1px solid #ccc", fontSize: 14, boxSizing: "border-box" };
  const primaryBtn: React.CSSProperties = { width: "100%", padding: "10px", background: "#4a7c6f", color: "white", border: "none", fontSize: 14, cursor: "pointer", marginTop: 4 };

  if (done) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
        <div style={{ background: "white", border: "1px solid #ccc", padding: 32, width: 340, textAlign: "center" }}>
          <p style={{ fontSize: 36, marginBottom: 12 }}>✅</p>
          <h3 style={{ marginBottom: 8 }}>Account Activated</h3>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 20 }}>Your password has been set. You can now sign in.</p>
          <button style={primaryBtn} onClick={() => window.location.href = "/"}>Go to Sign In</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
      <div style={{ background: "white", border: "1px solid #ccc", padding: 32, width: 340 }}>
        <h2 style={{ marginBottom: 4 }}>Set Your Password</h2>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 24 }}>
          Create a password to activate your account. Must be at least 12 characters.
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
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            style={{ ...box, borderColor: confirm.length > 0 && confirm !== password ? "red" : "#ccc" }}
            placeholder="Re-enter your password" />
        </div>

        <button onClick={handleSubmit} disabled={loading || password.length < 12 || password !== confirm} style={{ ...primaryBtn, opacity: (loading || password.length < 12 || password !== confirm) ? 0.5 : 1, cursor: (loading || password.length < 12 || password !== confirm) ? "not-allowed" : "pointer" }}>
          {loading ? "Saving..." : "Set Password & Activate Account"}
        </button>
      </div>
    </div>
  );
}


