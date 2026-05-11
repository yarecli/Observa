import { useEffect } from "react";
import { refreshAccessToken, syncUserIdFromServer } from "../api/authFetch";

/** Proactively refresh JWT before expiry while the tab is open (pairs with authFetch on 401). */
export default function SessionRefresh(): null {
  useEffect(() => {
    void syncUserIdFromServer();

    const intervalMs = 20 * 60 * 1000; // 20 minutes (access token is typically 30–60 min)

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      if (!localStorage.getItem("refresh")) return;
      void refreshAccessToken();
    };

    const id = window.setInterval(tick, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
