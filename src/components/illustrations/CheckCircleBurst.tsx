import { Art, type IllustrationProps } from "./Art";

const RAYS = Array.from({ length: 12 }, (_, index) => {
  const angle = (index * 30 - 90) * (Math.PI / 180);
  const near = index % 2 === 0 ? 40 : 43;
  const far = index % 2 === 0 ? 53 : 50;
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    x1: round(80 + near * Math.cos(angle)),
    y1: round(64 + near * Math.sin(angle)),
    x2: round(80 + far * Math.cos(angle)),
    y2: round(64 + far * Math.sin(angle)),
    className: index % 3 === 0 ? "stroke-kaya" : index % 3 === 1 ? "stroke-kaki/40" : "stroke-coral",
  };
});

/** Done and success: a big tick in a teal circle with a burst of small rays. */
export function CheckCircleBurst({ className }: IllustrationProps) {
  return (
    <Art {...(className ? { className } : {})}>
      <circle cx="80" cy="64" r="36" className="fill-kaki-soft" />
      {RAYS.map((ray, index) => (
        <line key={index} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} className={ray.className} strokeWidth="4" strokeLinecap="round" />
      ))}
      <circle cx="80" cy="64" r="27" className="fill-kaki" />
      <path d="m67 65 9.5 9.5L94 55" className="stroke-white" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="28" cy="32" r="3.5" className="fill-kaya" />
      <circle cx="134" cy="100" r="3.5" className="fill-kaya" />
      <circle cx="136" cy="30" r="3" className="fill-coral" />
      <circle cx="26" cy="98" r="3" className="fill-kaki/40" />
    </Art>
  );
}
