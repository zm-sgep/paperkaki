import { Art, sparklePath, type IllustrationProps } from "./Art";

/** A mock paper that is ready: a clean sheet, a sharpened pencil and a tick. */
export function ReadyPaper({ className }: IllustrationProps) {
  return (
    <Art {...(className ? { className } : {})}>
      <circle cx="80" cy="66" r="54" className="fill-kaki-soft" />
      <path
        d="M56 14h36l18 18v72a8 8 0 0 1-8 8H56a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8Z"
        className="fill-white stroke-line"
        strokeWidth="2"
      />
      <path d="M92 14v10a8 8 0 0 0 8 8h10L92 14Z" className="fill-kaya" />
      <rect x="58" y="30" width="22" height="7" rx="3.5" className="fill-kaki" />
      <rect x="58" y="48" width="42" height="5" rx="2.5" className="fill-ink/15" />
      <rect x="58" y="59" width="42" height="5" rx="2.5" className="fill-ink/15" />
      <rect x="58" y="70" width="42" height="5" rx="2.5" className="fill-ink/15" />
      <rect x="58" y="81" width="26" height="5" rx="2.5" className="fill-ink/15" />
      {/* pencil */}
      <g transform="rotate(38 116 82)">
        <rect x="110" y="44" width="13" height="50" rx="3" className="fill-kaya" />
        <rect x="110" y="44" width="13" height="9" rx="3" className="fill-coral" />
        <rect x="110" y="56" width="13" height="3" className="fill-kaya-strong/30" />
        <path d="M110 94h13l-6.5 15L110 94Z" className="fill-kaya-soft" />
        <path d="M114.3 103.5h4.4l-2.2 5.5-2.2-5.5Z" className="fill-ink" />
      </g>
      {/* tick */}
      <circle cx="52" cy="100" r="14" className="fill-kaki" />
      <path d="m45.5 100 5 5L59 95" className="stroke-white" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={sparklePath(30, 34, 8)} className="fill-kaya" />
      <circle cx="136" cy="38" r="4" className="fill-coral" />
    </Art>
  );
}
