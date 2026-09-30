import { Art, sparklePath, type IllustrationProps } from "./Art";

/** Prepare, and the empty Prepare list: a small stack of papers with a ticked one on top. */
export function PaperStack({ className }: IllustrationProps) {
  return (
    <Art {...(className ? { className } : {})}>
      <circle cx="80" cy="66" r="54" className="fill-kaki-soft" />
      <g transform="rotate(-9 80 70)">
        <rect x="47" y="26" width="62" height="80" rx="8" className="fill-white stroke-line" strokeWidth="2" />
      </g>
      <g transform="rotate(6 80 70)">
        <rect x="51" y="23" width="62" height="82" rx="8" className="fill-white stroke-line" strokeWidth="2" />
        <rect x="61" y="36" width="24" height="6" rx="3" className="fill-kaki/30" />
      </g>
      <path
        d="M57 19h38l18 18v61a8 8 0 0 1-8 8H57a8 8 0 0 1-8-8V27a8 8 0 0 1 8-8Z"
        className="fill-white stroke-line"
        strokeWidth="2"
      />
      <path d="M95 19v11a7 7 0 0 0 7 7h11L95 19Z" className="fill-kaya" />
      <rect x="59" y="33" width="26" height="7" rx="3.5" className="fill-kaki" />
      <rect x="59" y="50" width="44" height="5" rx="2.5" className="fill-ink/15" />
      <rect x="59" y="61" width="44" height="5" rx="2.5" className="fill-ink/15" />
      <rect x="59" y="72" width="30" height="5" rx="2.5" className="fill-ink/15" />
      <circle cx="104" cy="98" r="13" className="fill-kaki" />
      <path d="m98 98 4.5 4.5L110.5 93" className="stroke-white" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d={sparklePath(30, 36, 8)} className="fill-kaya" />
      <circle cx="134" cy="42" r="4" className="fill-coral" />
      <circle cx="27" cy="92" r="3.5" className="fill-kaki/40" />
    </Art>
  );
}
