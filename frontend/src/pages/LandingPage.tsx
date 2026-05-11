import type { JSX } from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { hasAccessToken } from "../components/ProtectedRoute";

const API_BASE = "http://localhost:8000/api";
type Step = "login" | "verify";

export default function LandingPage(): JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hasAccessToken()) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  async function handleLogin() {
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data: { access?: string; refresh?: string; role?: string; id?: number; error?: string; first_name?: string; last_name?: string} =
        await res.json();
      if (!res.ok) throw new Error(data.error ?? "Login failed");
      // If backend is configured to bypass MFA, it may return tokens immediately.
      if (data.access && data.refresh && data.role) {
        localStorage.setItem("access", data.access);
        localStorage.setItem("refresh", data.refresh);
        localStorage.setItem("role", data.role);
        localStorage.setItem("username", email.split("@")[0]);
        localStorage.setItem("firstName", data.first_name ?? "");
        localStorage.setItem("lastName", data.last_name ?? "");
        if (typeof data.id === "number") {
          localStorage.setItem("userId", String(data.id));
        }
        window.location.href = "/dashboard";
      } else {
        setStep("verify");
      }
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  async function handleVerify() {
    setError(""); setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/users/verify/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data: { access?: string; refresh?: string; role?: string; id?: number; error?: string; first_name?: string; last_name?: string } =
        await res.json();
      if (!res.ok) throw new Error(data.error ?? "Verification failed");
      localStorage.setItem("access", data.access!);
      localStorage.setItem("refresh", data.refresh!);
      localStorage.setItem("role", data.role!);
      localStorage.setItem("username", email.split("@")[0]);
      localStorage.setItem("firstName", data.first_name ?? "");
      localStorage.setItem("lastName", data.last_name ?? "");
      if (typeof data.id === "number") {
        localStorage.setItem("userId", String(data.id));
      }
      window.location.href = "/dashboard";
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  }

  const box: React.CSSProperties = { width: "100%", padding: "8px", border: "1px solid #ccc", fontSize: 14, boxSizing: "border-box" };
  const primaryBtn: React.CSSProperties = { width: "100%", padding: "10px", background: "#4a7c6f", color: "white", border: "none", fontSize: 14, cursor: "pointer", marginTop: 4 };
  const outlineBtn: React.CSSProperties = { width: "100%", padding: "8px", background: "none", border: "1px solid #ccc", fontSize: 13, cursor: "pointer", marginTop: 8 };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5", fontFamily: "Arial, sans-serif" }}>
      <div style={{ background: "white", border: "1px solid #ccc", padding: 32, width: 340 }}>
        <h2 style={{ marginBottom: 4 }}>Observa</h2>
        <p style={{ color: "#666", marginBottom: 24, fontSize: 14 }}>
          {step === "login" ? "Sign in to your account" : "Enter the code sent to your email"}
        </p>

        {error && <p style={{ color: "red", marginBottom: 12, fontSize: 13 }}>⚠️ {error}</p>}

        {step === "login" ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={box} placeholder="you@example.com" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                style={box} placeholder="Enter your password" />
            </div>
            <button onClick={handleLogin} disabled={loading || !email || !password} style={primaryBtn}>
              {loading ? "Signing in..." : "Sign In"}
            </button>
            <button style={outlineBtn} onClick={() => window.location.href = "/reset-password"}>
              Forgot password?
            </button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13, color: "#555", marginBottom: 12 }}>
              A 6-digit code was sent to <strong>{email}</strong>. It expires in 10 minutes.
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", marginBottom: 4, fontSize: 13 }}>Verification Code</label>
              <input type="text" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={e => e.key === "Enter" && handleVerify()}
                style={{ ...box, fontSize: 20, textAlign: "center", letterSpacing: 8 }} placeholder="000000" />
            </div>
            <button onClick={handleVerify} disabled={loading || code.length !== 6} style={primaryBtn}>
              {loading ? "Verifying..." : "Verify"}
            </button>
            <button style={outlineBtn} onClick={() => { setStep("login"); setError(""); setCode(""); }}>
              ← Back to sign in
            </button>
          </>
        )}
      </div>
    </div>
  );
}

