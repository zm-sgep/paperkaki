import { Art, sparklePath, type IllustrationProps } from "./Art";

/** Progress and growth: a seedling in a pot under a small sun. */
export function Sprout({ className }: IllustrationProps) {
  return (
    <Art {...(className ? { className } : {})}>
      <circle cx="80" cy="66" r="54" className="fill-kaki-soft" />
      <circle cx="122" cy="34" r="11" className="fill-kaya" />
      <circle cx="122" cy="34" r="17" className="fill-kaya/25" />
      {/* leaves */}
      <path d="M80 70C80 50 92 36 112 32C114 54 102 68 80 70Z" className="fill-kaki" />
      <path d="M80 76C80 60 68 50 48 48C46 66 58 76 80 76Z" className="fill-kaki-hover" />
      <path d="M80 70C86 58 96 48 106 41" className="stroke-white/50" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M80 76C74 68 64 60 55 55" className="stroke-white/40" strokeWidth="2.4" strokeLinecap="round" />
      {/* stem */}
      <path d="M80 92V68" className="stroke-kaki-strong" strokeWidth="5" strokeLinecap="round" />
      {/* pot */}
      <path d="M56 88h48l-5 25a5 5 0 0 1-5 4H66a5 5 0 0 1-5-4l-5-25Z" className="fill-coral" />
      <rect x="51" y="82" width="58" height="11" rx="5.5" className="fill-coral-strong" />
      <ellipse cx="80" cy="83" rx="24" ry="3.4" className="fill-kaki-strong" />
      <path d="M71 98v12" className="stroke-white/30" strokeWidth="3" strokeLinecap="round" />
      <path d={sparklePath(36, 40, 7)} className="fill-kaya" />
      <circle cx="30" cy="86" r="3.5" className="fill-coral/70" />
      <circle cx="132" cy="92" r="3.5" className="fill-kaki/40" />
    </Art>
  );
}
