"use client";

/* ==========================================================================
 * CivicLens · ROLE-BASED ACCESS CONTROL
 *
 * Two personas share one application:
 *   citizen — voice/text grievances, geolocation, downloadable PDF receipt.
 *   admin   — the full Ward Command Center: incident map, SLA triage queue and
 *             ward budget-gap deficit analytics.
 *
 * There is no credential wall on purpose: a judge must be able to open the
 * command centre in one click. State is device-local (localStorage) and is
 * read through useSyncExternalStore, so the very first client render already
 * carries the real role and the server snapshot can never disagree with it.
 * ========================================================================== */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";

export type CivicRole = "citizen" | "admin";

export const CITIZEN_ROUTE = "/";
export const AUTHORITY_ROUTE = "/dashboard";

export const DEFAULT_CITIZEN_NAME = "Citizen User";
export const DEFAULT_ADMIN_NAME = "A. Kumar";
export const CITIZEN_ROLE_LABEL = "Citizen Contributor";
export const ADMIN_ROLE_LABEL = "Ward 12 Authority";

const ROLE_KEY = "civiclens-role";
const CITIZEN_NAME_KEY = "civiclens-user-name";
const ADMIN_NAME_KEY = "civiclens-admin-name";
const AUTH_CHANGE_EVENT = "civiclens-auth-change";

type AuthState = {
  role: CivicRole;
  citizenName: string;
  adminName: string;
};

export type AuthContextValue = AuthState & {
  isAdmin: boolean;
  /** The name on the receipt, i.e. the one belonging to the active role. */
  displayName: string;
  initials: string;
  roleLabel: string;
  setRole: (role: CivicRole) => void;
  /** One-click judge access used by the dashboard gate. */
  grantAdmin: () => void;
  revokeAdmin: () => void;
  setCitizenName: (name: string) => void;
  setAdminName: (name: string) => void;
};

/* ------------------------- name helpers -------------------------------- */

export function displayNameOr(raw: string | null | undefined, fallback: string): string {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  return name || fallback;
}

/* "Mahmudul Hasan" -> "MH", single word -> first two letters. */
export function initialsOf(raw: string | null | undefined, fallback: string): string {
  const parts = displayNameOr(raw, fallback).split(" ").filter(Boolean);
  if (parts.length === 0) return "CU";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ------------------------- external store ------------------------------ */

function readRole(): CivicRole {
  try {
    return window.localStorage.getItem(ROLE_KEY) === "admin" ? "admin" : "citizen";
  } catch {
    return "citizen";
  }
}

function readName(key: string, fallback: string): string {
  try {
    return displayNameOr(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

/* useSyncExternalStore compares snapshots with Object.is, so the object is
   cached and only rebuilt when one of the three fields actually changes. */
let cachedSnapshot: AuthState | null = null;

function getSnapshot(): AuthState {
  const next: AuthState = {
    role: typeof window === "undefined" ? "citizen" : readRole(),
    citizenName: typeof window === "undefined" ? DEFAULT_CITIZEN_NAME : readName(CITIZEN_NAME_KEY, DEFAULT_CITIZEN_NAME),
    adminName: typeof window === "undefined" ? DEFAULT_ADMIN_NAME : readName(ADMIN_NAME_KEY, DEFAULT_ADMIN_NAME),
  };
  if (
    cachedSnapshot &&
    cachedSnapshot.role === next.role &&
    cachedSnapshot.citizenName === next.citizenName &&
    cachedSnapshot.adminName === next.adminName
  ) {
    return cachedSnapshot;
  }
  cachedSnapshot = next;
  return next;
}

/* The server never has a role, and this object must be a stable reference:
   useSyncExternalStore compares the server snapshot with Object.is on every
   render, so returning a fresh literal here loops forever. */
const SERVER_SNAPSHOT: AuthState = {
  role: "citizen",
  citizenName: DEFAULT_CITIZEN_NAME,
  adminName: DEFAULT_ADMIN_NAME,
};

function getServerSnapshot(): AuthState {
  return SERVER_SNAPSHOT;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  window.addEventListener(AUTH_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(AUTH_CHANGE_EVENT, onChange);
  };
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* Quota or private mode: the change still applies for this session. */
  }
}

function setRole(role: CivicRole) {
  write(ROLE_KEY, role);
  announce();
}

function setCitizenName(raw: string) {
  const value = displayNameOr(raw, DEFAULT_CITIZEN_NAME);
  if (value === DEFAULT_CITIZEN_NAME) {
    try {
      window.localStorage.removeItem(CITIZEN_NAME_KEY);
    } catch {
      /* ignored */
    }
  } else {
    write(CITIZEN_NAME_KEY, value);
  }
  announce();
}

function setAdminName(raw: string) {
  const value = displayNameOr(raw, DEFAULT_ADMIN_NAME);
  if (value === DEFAULT_ADMIN_NAME) {
    try {
      window.localStorage.removeItem(ADMIN_NAME_KEY);
    } catch {
      /* ignored */
    }
  } else {
    write(ADMIN_NAME_KEY, value);
  }
  announce();
}

function announce() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

/* ----------------------------- provider -------------------------------- */

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const grantAdmin = useCallback(() => setRole("admin"), []);
  const revokeAdmin = useCallback(() => setRole("citizen"), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAdmin: state.role === "admin",
      displayName: state.role === "admin" ? state.adminName : state.citizenName,
      initials: initialsOf(
        state.role === "admin" ? state.adminName : state.citizenName,
        state.role === "admin" ? DEFAULT_ADMIN_NAME : DEFAULT_CITIZEN_NAME,
      ),
      roleLabel: state.role === "admin" ? ADMIN_ROLE_LABEL : CITIZEN_ROLE_LABEL,
      setRole,
      grantAdmin,
      revokeAdmin,
      setCitizenName,
      setAdminName,
    }),
    [state, grantAdmin, revokeAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within an <AuthProvider>.");
  return value;
}
