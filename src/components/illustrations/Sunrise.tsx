import { Art, type IllustrationProps } from "./Art";

const RAYS = Array.from({ length: 7 }, (_, index) => {
  const angle = (180 + index * 30) * (Math.PI / 180);
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    x1: round(80 + 34 * Math.cos(angle)),
    y1: round(82 + 34 * Math.sin(angle)),
    x2: round(80 + 46 * Math.cos(angle)),
    y2: round(82 + 46 * Math.sin(angle)),
  };
});

/** The child's Today: the sun coming up over two soft hills. Used by the child screens. */
export function Sunrise({ className }: IllustrationProps) {
  return (
    <Art {...(className ? { className } : {})}>
      <defs>
        <clipPath id="pk-sunrise-window">
          <circle cx="80" cy="66" r="54" />
        </clipPath>
      </defs>
      <circle cx="80" cy="66" r="54" className="fill-kaya-soft" />
      <g clipPath="url(#pk-sunrise-window)">
        {RAYS.map((ray, index) => (
          <line key={index} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} className="stroke-kaya" strokeWidth="4.5" strokeLinecap="round" />
        ))}
        <circle cx="80" cy="82" r="25" className="fill-kaya" />
        <rect x="34" y="46" width="24" height="8" rx="4" className="fill-white" />
        <rect x="40" y="40" width="14" height="8" rx="4" className="fill-white" />
        <rect x="106" y="42" width="22" height="8" rx="4" className="fill-white" />
        <rect x="112" y="36" width="12" height="8" rx="4" className="fill-white" />
        <path d="M20 104C44 84 70 84 92 98C108 92 126 92 146 100V128H20Z" className="fill-kaki" />
        <path d="M20 113C46 97 76 99 98 111C116 105 132 107 146 113V128H20Z" className="fill-kaki-strong" />
      </g>
    </Art>
  );
}
