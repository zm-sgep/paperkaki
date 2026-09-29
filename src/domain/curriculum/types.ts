/** Curriculum vocabulary shared by domain rules, repositories and queries. Pure types. */

export const VERSION_STATUSES = ["draft", "published", "retired"] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const VERIFICATION_STATES = ["unverified", "verified"] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

export const SOURCE_PROVENANCES = [
  "official_moe",
  "official_seab",
  "official_school",
  "parent_provided",
  "historical_observation",
  "system_inference",
] as const;
export type SourceProvenance = (typeof SOURCE_PROVENANCES)[number];

export type CurriculumVersionSummary = {
  id: string;
  code: string;
  subject: string;
  title: string;
  levels: string[];
  status: VersionStatus;
  effectiveFrom: string | null;
  publishedAt: Date | null;
};

export type OutcomeNode = {
  id: string;
  code: string;
  statement: string;
  childLabel: string;
  level: string;
  sortOrder: number;
  verification: VerificationState;
};

export type TopicNode = {
  id: string;
  code: string;
  title: string;
  parentLabel: string;
  level: string;
  sortOrder: number;
  scopeNotes: string[];
  outcomes: OutcomeNode[];
};

export type DomainNode = {
  id: string;
  code: string;
  title: string;
  sortOrder: number;
  topics: TopicNode[];
};

export type CurriculumTree = {
  version: CurriculumVersionSummary;
  domains: DomainNode[];
};

export type OutcomeSourceLink = {
  linkId: string;
  sourceId: string;
  sourceCode: string;
  title: string;
  publisher: string;
  url: string | null;
  provenance: SourceProvenance;
  sourceVerification: VerificationState;
  pageOrSection: string | null;
};

export type OutcomeDetail = OutcomeNode & {
  curriculumVersionId: string;
  topicId: string;
  topicCode: string;
  topicTitle: string;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  sources: OutcomeSourceLink[];
};

/** Which readers may see unpublished versions. Parents and children only ever see published ones. */
export type CurriculumAudience = "public" | "admin";
