import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

/** True when the user has a JWT from a completed login (stored by LandingPage / verify flows). */
export function hasAccessToken(): boolean {
  return Boolean(localStorage.getItem("access")?.trim());
}

/**
 * Renders children only if the user is authenticated; otherwise redirects to `/`.
 * Prevents opening app URLs directly without logging in.
 */
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  if (!hasAccessToken()) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
