"use client";

/* ==========================================================================
 * CivicLens · AMBIENT CANVAS
 *
 * The fixed backdrop every route sits on: an ice-blue plane, a 32px
 * architectural blueprint grid, faint topographic contour loops and a
 * diagonal tricolor ribbon in the bottom-right corner. Purely decorative, so
 * the whole thing is aria-hidden and never intercepts pointer events.
 * ========================================================================== */

const CONTOURS = [44, 36, 28, 20, 12];

function ContourLoops({
  className,
  ring = "border-emerald-400/20",
}: {
  className: string;
  ring?: string;
}) {
  return (
    <div aria-hidden="true" className={`pointer-events-none fixed z-0 ${className}`}>
      {CONTOURS.map((rem) => (
        <div
          key={rem}
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border ${ring}`}
          style={{ height: `${rem}rem`, width: `${rem}rem` }}
        />
      ))}
    </div>
  );
}

export default function AmbientCanvas() {
  return (
    <>
      {/* Architectural vector grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(148, 163, 184, 0.15) 1px, transparent 1px), linear-gradient(to bottom, rgba(148, 163, 184, 0.15) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Topographic contour loops, tucked away from the tricolor ribbon */}
      <ContourLoops
        className="right-[-20rem] top-[-9rem] hidden h-[44rem] w-[44rem] lg:block"
      />
      <ContourLoops
        className="-left-[16rem] bottom-[-14rem] hidden h-[34rem] w-[34rem] opacity-70 xl:block"
        ring="border-sky-400/20"
      />

      {/* Diagonal tricolor ribbon, bottom-right */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-0 right-0 z-0 h-44 w-72 overflow-hidden"
      >
        <div className="absolute -bottom-24 -right-16 h-80 w-80 rotate-[-45deg] opacity-90">
          <div className="grid h-full w-full grid-rows-3">
            <div className="bg-[#f59e0b]" />
            <div className="bg-white" />
            <div className="bg-[#10b981]" />
          </div>
        </div>
      </div>
    </>
  );
}
