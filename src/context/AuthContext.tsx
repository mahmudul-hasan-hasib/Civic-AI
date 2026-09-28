"use client";

/* ==========================================================================
 * CivicLens · IDENTITY & ROLE-BASED ACCESS CONTROL
 *
 * Two personas share one application:
 *   citizen — voice/text grievances, geolocation, downloadable PDF receipt.
 *   admin   — the Ward Command Center: incident heatmap, SLA triage queue and
 *             ward budget-gap deficit analytics.
 *
 * An admin role is not an identity. When a real officer signs in we also store
 * their official profile (name, designation, government ID, assigned ward) so
 * the header, the audit trail on the briefing export and the case-management
 * rows all attribute work to a named human rather than a placeholder.
 *
 * There is no credential wall on purpose: a judge must be able to open the
 * command centre in one click, and Quick Demo Login fills the official form
 * with a complete, realistic profile. State is device-local (localStorage) and
 * is read through useSyncExternalStore, so the very first client render already
 * carries the real identity and the server snapshot can never disagree with it.
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

/** A verified municipal official on whose behalf the command center is used. */
export type Officer = {
  name: string;
  designation: string;
  officialId: string;
  ward: string;
};

export const CITIZEN_ROUTE = "/";
export const AUTHORITY_ROUTE = "/dashboard";

export const DEFAULT_CITIZEN_NAME = "Citizen User";
export const UNSIGNED_OFFICER_LABEL = "Authority Officer";
export const CITIZEN_ROLE_LABEL = "Citizen Contributor";
export const ADMIN_ROLE_LABEL = "Ward Authority";

/** Prefilled profile behind the modal's "Quick Demo Login" judge affordance. */
export const DEMO_OFFICER: Officer = {
  name: "Dr. Priya Sen",
  designation: "Ward 12 Executive Engineer",
  officialId: "MUNI-2026-8841",
  ward: "Ward 04 · Mohammadpur",
};

const ROLE_KEY = "civiclens-role";
const CITIZEN_NAME_KEY = "civiclens-user-name";
const OFFICER_KEY = "civiclens-officer";
const AUTH_CHANGE_EVENT = "civiclens-auth-change";

type AuthState = {
  role: CivicRole;
  citizenName: string;
  officer: Officer | null;
};

export type AuthContextValue = AuthState & {
  isAdmin: boolean;
  isOfficerSignedIn: boolean;
  /** The name on the receipt, i.e. the one belonging to the active role. */
  displayName: string;
  initials: string;
  roleLabel: string;
  setRole: (role: CivicRole) => void;
  /** One-click judge access used by the dashboard gate. */
  grantAdmin: () => void;
  revokeAdmin: () => void;
  setCitizenName: (name: string) => void;
  /** Registers the official and promotes the session to the authority role. */
  loginOfficer: (officer: Officer) => void;
  /** Clears the official but leaves the citizen role intact. */
  logoutOfficer: () => void;
  /** Sign in as the prefilled demo profile in a single action. */
  quickDemoLogin: () => void;
};

/* ------------------------- identity helpers ----------------------------- */

export function displayNameOr(raw: string | null | undefined, fallback: string): string {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  return name || fallback;
}

/* "Mahmudul Hasan" -> "MH"; "Dr. Priya Sen" -> "PS" (honorifics skipped). */
const HONORIFICS = new Set(["dr", "mr", "mrs", "ms", "shri", "smt", "prof", "er"]);

export function initialsOf(raw: string | null | undefined, fallback: string): string {
  const parts = displayNameOr(raw, fallback)
    .split(" ")
    .filter(Boolean);
  const meaningful = parts.filter((part) => !HONORIFICS.has(part.replace(/\./g, "").toLowerCase()));
  const source = meaningful.length > 0 ? meaningful : parts;
  if (source.length === 0) return "AO";
  if (source.length === 1) return source[0].slice(0, 2).toUpperCase();
  return (source[0][0] + source[source.length - 1][0]).toUpperCase();
}

/* Every field is required, so a partial or hand-edited record is rejected
   rather than rendering a half-empty official badge. */
function coerceOfficer(value: unknown): Officer | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const name = displayNameOr(typeof raw.name === "string" ? raw.name : null, "");
  const designation = displayNameOr(
    typeof raw.designation === "string" ? raw.designation : null,
    "",
  );
  const officialId = displayNameOr(typeof raw.officialId === "string" ? raw.officialId : null, "");
  const ward = displayNameOr(typeof raw.ward === "string" ? raw.ward : null, "");
  if (!name || !designation || !officialId || !ward) return null;
  /* Employee codes are quoted verbatim on dispatch paperwork, so they are
     canonicalised here rather than trusting each caller to normalise them. */
  return { name, designation, officialId: officialId.toUpperCase(), ward };
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

function readOfficer(): Officer | null {
  try {
    const raw = window.localStorage.getItem(OFFICER_KEY);
    return raw ? coerceOfficer(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/* useSyncExternalStore compares snapshots with Object.is, so the object is
   cached and only rebuilt when a field actually changes. */
let cachedSnapshot: AuthState | null = null;

function getSnapshot(): AuthState {
  const next: AuthState = {
    role: typeof window === "undefined" ? "citizen" : readRole(),
    citizenName:
      typeof window === "undefined"
        ? DEFAULT_CITIZEN_NAME
        : readName(CITIZEN_NAME_KEY, DEFAULT_CITIZEN_NAME),
    officer: typeof window === "undefined" ? null : readOfficer(),
  };
  const previous = cachedSnapshot;
  if (
    previous &&
    previous.role === next.role &&
    previous.citizenName === next.citizenName &&
    previous.officer?.name === next.officer?.name &&
    previous.officer?.designation === next.officer?.designation &&
    previous.officer?.officialId === next.officer?.officialId &&
    previous.officer?.ward === next.officer?.ward
  ) {
    return previous;
  }
  cachedSnapshot = next;
  return next;
}

/* The server never has a session. This object must be a stable reference:
   useSyncExternalStore compares the server snapshot with Object.is on every
   render, so returning a fresh literal here loops forever. */
const SERVER_SNAPSHOT: AuthState = {
  role: "citizen",
  citizenName: DEFAULT_CITIZEN_NAME,
  officer: null,
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

function announce() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
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

function storeOfficer(officer: Officer | null) {
  try {
    if (officer) window.localStorage.setItem(OFFICER_KEY, JSON.stringify(officer));
    else window.localStorage.removeItem(OFFICER_KEY);
  } catch {
    /* Quota or private mode: the change still applies for this session. */
  }
  announce();
}

/* ----------------------------- provider -------------------------------- */

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const grantAdmin = useCallback(() => setRole("admin"), []);
  const revokeAdmin = useCallback(() => setRole("citizen"), []);

  const loginOfficer = useCallback((officer: Officer) => {
    const profile = coerceOfficer(officer) ?? DEMO_OFFICER;
    storeOfficer(profile);
    setRole("admin");
  }, []);

  const logoutOfficer = useCallback(() => storeOfficer(null), []);

  const quickDemoLogin = useCallback(() => {
    storeOfficer({ ...DEMO_OFFICER });
    setRole("admin");
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    /* When an official is signed in their designation is the role label, so the
       header shows "Ward 12 Executive Engineer" rather than a generic tier. */
    const identityName =
      state.role === "admin" ? (state.officer?.name ?? UNSIGNED_OFFICER_LABEL) : state.citizenName;

    return {
      ...state,
      isAdmin: state.role === "admin",
      isOfficerSignedIn: state.officer !== null,
      displayName: identityName,
      initials: initialsOf(
        identityName,
        state.role === "admin" ? UNSIGNED_OFFICER_LABEL : DEFAULT_CITIZEN_NAME,
      ),
      roleLabel:
        state.role === "admin" ? (state.officer?.designation ?? ADMIN_ROLE_LABEL) : CITIZEN_ROLE_LABEL,
      setRole,
      grantAdmin,
      revokeAdmin,
      setCitizenName,
      loginOfficer,
      logoutOfficer,
      quickDemoLogin,
    };
  }, [state, grantAdmin, revokeAdmin, loginOfficer, logoutOfficer, quickDemoLogin]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within an <AuthProvider>.");
  return value;
}
