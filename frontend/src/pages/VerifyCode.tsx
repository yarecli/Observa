import type { JSX } from "react";
import { useState } from "react";

const API_BASE = "http://localhost:8000/api";

// This page is navigated to after a successful login attempt.
// The email should be passed via location state or query param.
// e.g. navigate("/verify", { state: { email } }) using React Router.

export default function VerifyCode(): JSX.Element {
  // In production, get email from React Router location state:
  // const { state } = useLocation(); const email = state?.email ?? "";
  const email = "user@example.com"; // placeholder until routing is wired up

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);

  async function handleVerify() {
    if (code.length !== 6) return;
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data: { access?: string; refresh?: string; role?: string; id?: number; error?: string } =
        await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed.");
      localStorage.setItem("access", data.access!);
      localStorage.setItem("refresh", data.refresh!);
      localStorage.setItem("role", data.role!);
      if (typeof data.id === "number") {
        localStorage.setItem("userId", String(data.id));
      }
      window.location.href = "/dashboard";
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function handleResend() {
    // TODO: call resend endpoint → POST /api/users/resend-code/
    setResent(true);
    setTimeout(() => setResent(false), 5000);
  }

  const box: React.CSSProperties = { width: "100%", padding: "8px", border: "1px solid #ccc", fontSize: 20, textAlign: "center", letterSpacing: 8, boxSizing: "border-box" };
  const primaryBtn: React.CSSProperties = { width: "100%", padding: "10px", background: "#4a7c6f", color: "white", border: "none", fontSize: 14, cursor: "pointer", marginTop: 4 };
  const outlineBtn: React.CSSProperties = { width: "100%", padding: "8px", background: "none", border: "1px solid #ccc", fontSize: 13, cursor: "pointer", marginTop: 8 };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
      <div style={{ background: "white", border: "1px solid #ccc", padding: 32, width: 340 }}>
        <h2 style={{ marginBottom: 4 }}>Check your email</h2>
        <p style={{ color: "#666", fontSize: 14, marginBottom: 8 }}>
          A 6-digit code was sent to <strong>{email}</strong>.
        </p>
        <p style={{ color: "#999", fontSize: 12, marginBottom: 24 }}>
          The code expires in 10 minutes. Do not share it with anyone.
        </p>

        {error && <p style={{ color: "red", fontSize: 13, marginBottom: 12 }}>⚠️ {error}</p>}
        {resent && <p style={{ color: "green", fontSize: 13, marginBottom: 12 }}>✓ A new code has been sent.</p>}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Verification Code</label>
          <input
            type="text"
            maxLength={6}
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
            onKeyDown={e => e.key === "Enter" && handleVerify()}
            style={box}
            placeholder="000000"
            autoFocus
          />
        </div>

        <button onClick={handleVerify} disabled={loading || code.length !== 6}
          style={{ ...primaryBtn, opacity: (loading || code.length !== 6) ? 0.5 : 1, cursor: (loading || code.length !== 6) ? "not-allowed" : "pointer" }}>
          {loading ? "Verifying..." : "Verify"}
        </button>

        <button style={outlineBtn} onClick={handleResend}>
          Resend code
        </button>

        <button style={outlineBtn} onClick={() => window.location.href = "/"}>
          ← Back to sign in
        </button>
      </div>
    </div>
  );
}


