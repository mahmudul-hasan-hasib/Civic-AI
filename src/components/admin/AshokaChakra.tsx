/* The national emblem's wheel, drawn as 24 spokes so it renders crisply at any
   size without shipping a raster asset. */

const SPOKES = Array.from({ length: 24 }, (_, index) => index);

export default function AshokaChakra({
  className = "h-6 w-6",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="Ashoka Chakra"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="24" cy="24" r="21" />
      <circle cx="24" cy="24" r="3.4" fill="currentColor" stroke="none" />
      {SPOKES.map((index) => {
        const angle = (index * 15 * Math.PI) / 180;
        const inner = 4.2;
        const outer = 20.2;
        return (
          <line
            key={index}
            x1={24 + Math.cos(angle) * inner}
            y1={24 + Math.sin(angle) * inner}
            x2={24 + Math.cos(angle) * outer}
            y2={24 + Math.sin(angle) * outer}
            strokeWidth="1"
          />
        );
      })}
    </svg>
  );
}
