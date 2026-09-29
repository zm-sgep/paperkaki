import type { VersionStatus } from "@/domain/curriculum";
import { STATUS_LABEL } from "./labels";

const styles: Record<VersionStatus, string> = {
  draft: "border-amber-600 bg-amber-50 text-amber-900",
  published: "border-kaki bg-kaki-soft text-kaki-strong",
  retired: "border-line bg-paper text-ink-soft",
};

/** The version's status as a word, never colour alone. */
export function StatusBadge({ status }: { status: VersionStatus }) {
  return (
    <span
      data-status={status}
      className={`inline-flex items-center rounded-full border px-3 py-0.5 text-sm font-semibold ${styles[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function VerificationTag({ state }: { state: "verified" | "unverified" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium ${
        state === "verified" ? "border-kaki bg-kaki-soft text-kaki-strong" : "border-line bg-paper text-ink-soft"
      }`}
    >
      {state === "verified" ? "Verified" : "Unverified"}
    </span>
  );
}
