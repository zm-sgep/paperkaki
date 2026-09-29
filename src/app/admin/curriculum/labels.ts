import type { SourceProvenance, VersionStatus } from "@/domain/curriculum";

/** Admin-only wording. The family area never shows status, provenance or verification. */

export const STATUS_LABEL: Record<VersionStatus, string> = {
  draft: "Draft",
  published: "Published",
  retired: "Retired",
};

export const PROVENANCE_LABEL: Record<SourceProvenance, string> = {
  official_moe: "Official (MOE)",
  official_seab: "Official (SEAB)",
  official_school: "Official (school)",
  parent_provided: "Provided by a parent",
  historical_observation: "Historical observation",
  system_inference: "System inference",
};

export function formatDate(value: Date | string | null): string {
  if (!value) return "not set";
  return (value instanceof Date ? value.toISOString() : value).slice(0, 10);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Route and query parameters go to a uuid column: anything else is "not found", not an error. */
export function asUuid(value: string | string[] | undefined): string | null {
  return typeof value === "string" && UUID.test(value) ? value : null;
}
