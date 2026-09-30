import { Art, sparklePath, type IllustrationProps } from "./Art";

/** Rewards: a wrapped gift with a yellow bow. */
export function GiftBox({ className }: IllustrationProps) {
  return (
    <Art {...(className ? { className } : {})}>
      <circle cx="80" cy="66" r="54" className="fill-kaya-soft" />
      {/* bow */}
      <path d="M80 54C58 20 34 40 50 55C61 62 75 60 80 54Z" className="fill-kaya" />
      <path d="M80 54C102 20 126 40 110 55C99 62 85 60 80 54Z" className="fill-kaya" />
      <path d="M78 53C62 34 50 42 56 51C61 56 71 56 78 53Z" className="fill-kaya-strong/25" />
      <path d="M82 53C98 34 110 42 104 51C99 56 89 56 82 53Z" className="fill-kaya-strong/25" />
      {/* box */}
      <rect x="46" y="70" width="68" height="44" rx="7" className="fill-kaki" />
      <rect x="40" y="52" width="80" height="22" rx="7" className="fill-kaki-hover" />
      <rect x="40" y="68" width="80" height="6" className="fill-ink/10" />
      {/* ribbon */}
      <rect x="73" y="52" width="14" height="62" className="fill-kaya" />
      <rect x="73" y="52" width="14" height="22" className="fill-kaya-strong/15" />
      <rect x="72" y="46" width="16" height="13" rx="6.5" className="fill-kaya" />
      <rect x="72" y="46" width="16" height="13" rx="6.5" className="fill-kaya-strong/20" />
      <path d="M52 80v26" className="stroke-white/20" strokeWidth="3" strokeLinecap="round" />
      <path d={sparklePath(30, 42, 8)} className="fill-coral" />
      <path d={sparklePath(132, 60, 6)} className="fill-kaki" />
      <circle cx="126" cy="30" r="3.5" className="fill-kaya" />
      <circle cx="32" cy="96" r="3.5" className="fill-kaki/40" />
    </Art>
  );
}
