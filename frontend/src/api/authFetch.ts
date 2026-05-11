/**
 * Authenticated fetch with automatic access-token refresh on 401.
 * Keeps long data-entry sessions from breaking when the JWT expires (~30–60 min).
 */

export const API_BASE = "http://localhost:8000/api";

let refreshInFlight: Promise<boolean> | null = null;

/** POST /api/token/refresh/ and store new access token. Returns false if refresh fails (re-login required). */
export async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const refresh = localStorage.getItem("refresh");
      if (!refresh) return false;

      const res = await fetch(`${API_BASE}/token/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });

      if (!res.ok) return false;

      const data = (await res.json()) as { access?: string };
      if (data.access) {
        localStorage.setItem("access", data.access);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

/**
 * Loads the real Django user id from GET /users/me/ and stores it in localStorage as `userId`.
 * Fixes sessions saved with a stale placeholder id (e.g. after login started returning `id`).
 */
export async function syncUserIdFromServer(): Promise<void> {
  const token = localStorage.getItem("access");
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/users/me/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = (await res.json()) as { id?: number };
    if (typeof data.id === "number" && Number.isFinite(data.id)) {
      localStorage.setItem("userId", String(data.id));
    }
  } catch {
    /* ignore */
  }
}

/**
 * fetch() with Bearer access token; on 401, refreshes once and retries.
 */
export async function authFetch(input: string, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem("access");
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    const ok = await refreshAccessToken();
    if (ok) {
      const next = localStorage.getItem("access");
      if (next) headers.set("Authorization", `Bearer ${next}`);
      res = await fetch(input, { ...init, headers });
    }
  }

  return res;
}
