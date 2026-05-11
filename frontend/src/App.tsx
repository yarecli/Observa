import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Component } from "react";
import type { ReactNode } from "react";
import LandingPage from "./pages/LandingPage";
import Dashboard from "./pages/Dashboard";
import DataEntry from "./pages/DataEntry";
import Intervention from "./pages/Intervention";
import ReviewVisualize from "./pages/ReviewVisualize";
import ClientDatasheets from "./pages/ClientDatasheets";
import SetPassword from "./pages/SetPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyCode from "./pages/VerifyCode";
import SessionRefresh from "./components/SessionRefresh";
import ProtectedRoute from "./components/ProtectedRoute";

class ErrorBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: "" };
  componentDidCatch(e: Error) { this.setState({ error: e.message }); }
  render() {
    if (this.state.error) return <pre style={{ color: "red", padding: 20 }}>{this.state.error}</pre>;
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <SessionRefresh />
      <BrowserRouter>
        <Routes>
          <Route path="/"                  element={<LandingPage />} />
          <Route path="/verify"            element={<VerifyCode />} />
          <Route path="/set-password"      element={<SetPassword />} />
          <Route path="/reset-password"    element={<ResetPassword />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/data-entry"
            element={
              <ProtectedRoute>
                <DataEntry />
              </ProtectedRoute>
            }
          />
          <Route
            path="/intervention"
            element={
              <ProtectedRoute>
                <Intervention />
              </ProtectedRoute>
            }
          />
          <Route
            path="/review/:clientId?"
            element={
              <ProtectedRoute>
                <ReviewVisualize />
              </ProtectedRoute>
            }
          />
          <Route
            path="/client-datasheets"
            element={
              <ProtectedRoute>
                <ClientDatasheets />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}