import type { Metadata } from "next";

export const metadata: Metadata = {
  title:
    "Authority Command Center · CivicLens — Municipal Operations, Ward Budgets & SLA Triage",
  description:
    "Internal CivicLens workspace for municipal engineers, Ward Commissioners and Public Works officers: ward-level incident map with spatial clusters, budget-versus-citizen-demand deficit analysis, an actionable SLA triage queue with dispatch triggers, and live AI triage engine telemetry.",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
