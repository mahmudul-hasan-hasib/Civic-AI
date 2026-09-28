"use client";

/* ==========================================================================
 * CivicLens · OFFICIAL LOGIN / REGISTRATION
 *
 * Collects the four attributes a municipal command-center session must be
 * attributable to: who the officer is, what post they hold, their government
 * employee code and the ward they are answerable for. These are persisted and
 * then stamped onto the header badge, the case-management rows and the exported
 * briefing, so nothing in the audit trail is anonymous.
 *
 * "Quick Demo Login" exists for hackathon judges: one click signs in the
 * prefilled demo officer and lands straight on the triage view, with no typing
 * and no credential wall.
 * ========================================================================== */

import { useEffect, useRef, useState } from "react";
import { BadgeCheck, IdCard, Sparkles, UserRound, X } from "lucide-react";

import {
  DEMO_OFFICER,
  useAuth,
} from "@/context/AuthContext";
import type { Officer } from "@/context/AuthContext";

type AuthorityAuthModalProps = {
  open: boolean;
  onClose: () => void;
  /** Optional pre-fill, e.g. re-registering from the profile dropdown. */
  initial?: Officer | null;
};

const FIELDS = [
  {
    key: "name",
    label: "Official name",
    placeholder: "Dr. Priya Sen",
    icon: UserRound,
    maxLength: 60,
    hint: "As recorded on your government ID",
  },
  {
    key: "designation",
    label: "Designation / post",
    placeholder: "Ward 12 Executive Engineer",
    icon: BadgeCheck,
    maxLength: 60,
    hint: "Your role within the ward office",
  },
  {
    key: "officialId",
    label: "Official ID / employee code",
    placeholder: "MUNI-2026-8841",
    icon: IdCard,
    maxLength: 32,
    hint: "Unique to you, quoted on every dispatch",
  },
  {
    key: "ward",
    label: "Assigned ward / jurisdiction",
    placeholder: "Ward 04 · Mohammadpur",
    icon: Sparkles,
    maxLength: 48,
    hint: "Determines which reports reach your queue",
  },
] as const satisfies ReadonlyArray<{
  key: keyof Officer;
  label: string;
  placeholder: string;
  icon: typeof UserRound;
  maxLength: number;
  hint: string;
}>;

const EMPTY: Officer = { name: "", designation: "", officialId: "", ward: "" };

export default function AuthorityAuthModal({
  open,
  onClose,
  initial = null,
}: AuthorityAuthModalProps) {
  const { loginOfficer, quickDemoLogin, isOfficerSignedIn, displayName, roleLabel } = useAuth();
  const [draft, setDraft] = useState<Officer>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Officer, string>>>({});
  const [wasOpen, setWasOpen] = useState(open);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  /* Re-seed the form when the dialog opens, so a cancelled edit never leaks
     into the next attempt. Adjusting state during render on a prop change is
     the sanctioned alternative to a synchronising effect here. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(initial ?? EMPTY);
      setErrors({});
    }
  }

  useEffect(() => {
    if (!open) return;
    firstFieldRef.current?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const update = (key: keyof Officer, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const commit = () => {
    const next: Partial<Record<keyof Officer, string>> = {};
    for (const field of FIELDS) {
      if (!draft[field.key].trim()) next[field.key] = `${field.label} is required`;
    }
    if (draft.officialId.trim() && !/^[A-Za-z0-9-]{4,32}$/.test(draft.officialId.trim())) {
      next.officialId = "Use letters, numbers and hyphens only";
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return;
    }
    loginOfficer({
      name: draft.name.trim(),
      designation: draft.designation.trim(),
      officialId: draft.officialId.trim().toUpperCase(),
      ward: draft.ward.trim(),
    });
    onClose();
  };

  /* A judge must reach the triage view in one click, with the form still there
     if they would rather enter their own details. */
  const demo = () => {
    quickDemoLogin();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-[#0b2136]/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="authority-auth-title"
      data-testid="authority-auth-modal"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#1e4d88] bg-[#133e70] text-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#1b4578] p-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">
              Restricted · Municipal Staff Only
            </p>
            <h2
              id="authority-auth-title"
              className="mt-1 text-lg font-extrabold tracking-tight text-white"
            >
              {isOfficerSignedIn ? "Switch authority account" : "Official login / register"}
            </h2>
            <p className="mt-1 text-xs text-slate-300">
              {isOfficerSignedIn
                ? `Signed in as ${displayName} · ${roleLabel}. Registering below replaces this session.`
                : "Sign in with your official credentials to open the command center."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            commit();
          }}
          className="space-y-3.5 p-5"
          noValidate
        >
          {FIELDS.map((field, index) => {
            const Icon = field.icon;
            const error = errors[field.key];
            return (
              <div key={field.key}>
                <label
                  htmlFor={`officer-${field.key}`}
                  className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-sky-200"
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {field.label}
                </label>
                <input
                  id={`officer-${field.key}`}
                  ref={index === 0 ? firstFieldRef : undefined}
                  value={draft[field.key]}
                  maxLength={field.maxLength}
                  autoComplete="off"
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `officer-${field.key}-error` : undefined}
                  placeholder={field.placeholder}
                  onChange={(event) => update(field.key, event.target.value)}
                  className={`mt-1.5 w-full rounded-lg border bg-[#0d2e55] px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:ring-2 ${
                    error
                      ? "border-rose-400/70 focus:border-rose-300 focus:ring-rose-400/30"
                      : "border-[#1b4475] focus:border-sky-400 focus:ring-sky-400/30"
                  }`}
                />
                {error ? (
                  <p
                    id={`officer-${field.key}-error`}
                    className="mt-1 text-[11px] font-medium text-rose-300"
                  >
                    {error}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">{field.hint}</p>
                )}
              </div>
            );
          })}

          <button
            type="submit"
            data-testid="officer-register"
            className="mt-1 w-full rounded-lg bg-[#1d63b8] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#2569bd]"
          >
            {isOfficerSignedIn ? "Switch to this official" : "Register & open command center"}
          </button>
        </form>

        {/* Judge affordance: no typing, no network, no credential wall. */}
        <div className="border-t border-[#1b4578] bg-[#0d2e55] p-5">
          <button
            type="button"
            onClick={demo}
            data-testid="quick-demo-login"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#2f6fb8] bg-[#16406f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#1d4f8c]"
          >
            <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />
            Quick Demo Login · sign in instantly
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Prefills {DEMO_OFFICER.name} · {DEMO_OFFICER.designation} · {DEMO_OFFICER.officialId}
          </p>
        </div>
      </div>
    </div>
  );
}
