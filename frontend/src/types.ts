// ─────────────────────────────────────────────────────────────────────────────
// types.ts — Shared TypeScript types for ABA Suite
// Import from this file in any component, e.g.:
//   import type { User, Client, Role } from "@/types";
// ─────────────────────────────────────────────────────────────────────────────

// ─── USERS & AUTH ─────────────────────────────────────────────────────────────

export type Role = "bcba" | "rbt" | "dsp";

export interface User {
    id: number;
    username: string;
    role: Role;
    email?: string;
    firstName?: string;
    lastName?: string;
}

/** Shape of the JWT response from POST /api/users/verify/ */
export interface AuthTokens {
    access: string;
    refresh: string;
    role: Role;
}

// ─── RBAC ─────────────────────────────────────────────────────────────────────

export interface Permissions {
    canAddClient: boolean;
    canRemoveClient: boolean;
    canManageTemplates: boolean;
    canManageEmployees: boolean;
    canViewAllClientData: boolean;
    canAccessGraphs: boolean;
}

/** Role → permission map. Single source of truth for RBAC across the app. */
export const PERMISSIONS: Record<Role, Permissions> = {
    bcba: {
        canAddClient: true,
        canRemoveClient: true,
        canManageTemplates: true,
        canManageEmployees: true,
        canViewAllClientData: true,
        canAccessGraphs: true,
    },
    rbt: {
        canAddClient: false,
        canRemoveClient: false,
        canManageTemplates: false,
        canManageEmployees: false,
        canViewAllClientData: false,
        canAccessGraphs: true,
    },
    dsp: {
        canAddClient: false,
        canRemoveClient: false,
        canManageTemplates: false,
        canManageEmployees: false,
        canViewAllClientData: false,
        canAccessGraphs: false,
    },
};

export interface RoleColor {
    bg: string;
    text: string;
    label: string;
}

/** Role → badge color map for UI display. */
export const ROLE_COLORS: Record<Role, RoleColor> = {
    bcba: { bg: "#E8F5F0", text: "#3D8A6E", label: "BCBA" },
    rbt: { bg: "#EEF3FF", text: "#4A6BC9", label: "RBT" },
    dsp: { bg: "#FFF4E8", text: "#C07A2A", label: "DSP" },
};

// ─── RBAC HELPERS ─────────────────────────────────────────────────────────────

/** Returns true if the user can access a client's data. */
export function canAccessClientData(client: Client, user: User): boolean {
    if (PERMISSIONS[user.role].canViewAllClientData) return true;
    return client.assignedTo.includes(user.id);
}

/** Returns true if the user's role allows editing session data. */
export function canEditSheets(role: Role): boolean {
    return role === "bcba" || role === "rbt";
}

/** Filters the client list down to those assigned to a non-BCBA user. */
export function getAssignedClients(clients: Client[], user: User): Client[] {
    if (user.role === "bcba") return clients;
    return clients.filter((c) => c.assignedTo.includes(user.id));
}

// ─── CLIENTS ──────────────────────────────────────────────────────────────────

export interface Client {
    id: string;  // UUID from backend
    name: string;
    initials: string;
    assignedTo: number[]; // array of user IDs
}

// ─── TEMPLATES ────────────────────────────────────────────────────────────────

export type TemplateId = "dri" | "custom";

export interface Template {
    id: number;
    name: string;
    createdBy: string;
}

export interface TemplateOption {
    id: TemplateId;
    label: string;
}

/** Available sheet types shown in the "Add Sheet" dropdown. */
export const SHEET_TYPES: TemplateOption[] = [
    { id: "dri", label: "DRI Data Sheet" },
    { id: "custom", label: "Custom Template" },
];

// ─── DATA ENTRY ───────────────────────────────────────────────────────────────

export interface Behavior {
    id: number;
    label: string;
    definition: string;
}

export interface FormErrors {
    client?: string;
    template?: string;
    sessionNumber?: string;
    timePeriod?: string;
    behaviorOccurred?: string;
    measurement?: string;
    behaviors?: string;
}

/** Shape of the payload sent to POST /api/datasheets/ */
export interface DataEntryPayload {
    client_id: string;
    template: string;
    collected_by: string;
    data_section: string;
    session_number: string;
    behaviors: Pick<Behavior, "label" | "definition">[];
    time_period: string;
    behavior_occurred: string;
    measurement_type: string;
    measurement_value: string;
    notes: string;
}

// ─── DATA SHEETS ──────────────────────────────────────────────────────────────

export type OccurrenceValue = "Yes" | "No" | "Partial";

export interface SheetRow {
    id: number;
    session: number;
    date: string;
    collectedBy: string;
    timePeriod: string;
    occurred: OccurrenceValue;
    measurement: string;
    value: number;
    notes: string;
}

// ─── GRAPHS ───────────────────────────────────────────────────────────────────

export interface BehaviorDataPoint {
    session: string;
    value: number;
}

export interface BehaviorRecord {
    id: number;
    label: string;
    definition: string;
    color: string;
    data: BehaviorDataPoint[];
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

export const TIME_PERIODS: string[] = [
    "Morning (8am–12pm)",
    "Afternoon (12pm–4pm)",
    "Evening (4pm–8pm)",
    "Full Day",
    "Custom",
];

export const MEASUREMENT_OPTIONS: string[] = [
    "Duration (minutes)",
    "Frequency (count)",
    "Rate (per hour)",
];

export const API_BASE = "http://localhost:8000/api";