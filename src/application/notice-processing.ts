import { pickMathematics, buildNoticeReview, todayInSingapore, unmatchedWordings } from "@/domain/assessments";
import { logger } from "@/lib/logger";
import type { Database } from "@/repositories/postgres/client";
import { getSourceById, updateSource } from "@/repositories/postgres/assessment-sources";
import type { StoredNotice } from "@/schemas/notice-extraction";
import { AIError, getAIService, NOTICE_EXTRACTION_PROMPT, type AIService, type NoticeFile } from "@/services/ai";
import { getStorage, type StorageService } from "@/services/storage";
import { JobFailure } from "@/services/jobs";
import { SUPPORTED_SUBJECT } from "@/schemas/assessment-setup";
import { NOTICE_LEVEL, getTopicAliasIndex, loadPublishedTopics } from "./notice-topics";

/**
 * Why a notice could not be turned into a review. The screen shows a calm sentence for each; none of
 * these words is shown to a parent.
 */
export type NoticeFailureCode = "unreadable" | "no_maths" | "ai_unavailable" | "timeout" | "file_missing" | "internal";

/** Failures worth a "Try again" with the same file. The others need a different file. */
export const RETRYABLE_FAILURES: readonly string[] = ["ai_unavailable", "timeout", "internal"];

export const NOTICE_EXTRACTION_JOB = "notice.extract";

function failureFor(error: unknown): NoticeFailureCode {
  if (error instanceof AIError) {
    switch (error.code) {
      case "timeout":
        return "timeout";
      case "disabled":
      case "unavailable":
        return "ai_unavailable";
      default:
        return "unreadable";
    }
  }
  return "internal";
}

export type ProcessDeps = { db: Database; ai?: AIService; storage?: StorageService; now?: Date };

/**
 * The job: read the stored file, ask the AI service what the notice says, and turn the Mathematics
 * part into the review the parent checks. Safe to run again for the same source: it starts by
 * marking the source running and ends with a result or a failure code.
 */
export async function processNoticeSource(sourceId: string, deps: ProcessDeps): Promise<void> {
  const { db } = deps;
  const ai = deps.ai ?? getAIService();
  const storage = deps.storage ?? getStorage();

  const source = await getSourceById(db, sourceId);
  if (!source || source.fileDeletedAt) return;

  const fail = async (code: NoticeFailureCode): Promise<never> => {
    await updateSource(db, sourceId, { status: "failed", failureCode: code, extraction: null });
    throw new JobFailure(code);
  };

  await updateSource(db, sourceId, { status: "running", failureCode: null });

  const refs = [{ objectKey: source.objectKey, mime: source.mime }, ...source.extraFiles];
  const files: NoticeFile[] = [];
  for (const ref of refs) {
    const stored = await storage.get({ bucket: "assessment-source-uploads", key: ref.objectKey });
    if (!stored) return fail("file_missing");
    files.push({ bytes: stored.body, mime: ref.mime });
  }

  let extraction;
  try {
    extraction = await ai.extractSchoolNotice({
      files,
      sha256: source.sha256,
      subject: SUPPORTED_SUBJECT,
      level: NOTICE_LEVEL,
      today: todayInSingapore(deps.now),
    });
  } catch (error) {
    return fail(failureFor(error));
  }

  const found = pickMathematics(extraction);
  if (!found) return fail("no_maths");

  const published = await loadPublishedTopics(db);
  if (!published) return fail("internal");
  const knownCodes = new Set(published.topics.map((topic) => topic.code));
  const index = getTopicAliasIndex();

  // Deterministic first: only wording the alias table could not place goes to the model, and its
  // answers are always marked "Please check".
  let guesses: { schoolLabel: string; topicCodes: readonly string[] }[] = [];
  const unmatched = unmatchedWordings(found.subject, index);
  if (unmatched.length > 0) {
    try {
      guesses = (
        await ai.mapTopics({
          labels: unmatched,
          topics: published.topics.map((topic) => ({ code: topic.code, label: topic.label })),
          subject: SUPPORTED_SUBJECT,
          level: NOTICE_LEVEL,
        })
      ).mappings;
    } catch (error) {
      // The parent can still tick the topics by hand, so a failed guess is not a failed notice.
      logger.warn({ code: error instanceof AIError ? error.code : "internal" }, "Topic wording could not be matched by the model");
    }
  }

  const review = buildNoticeReview({ ...found, index, knownCodes, guesses });
  const stored: StoredNotice = {
    version: 1,
    raw: { subjects: [found.subject], ...(extraction.documentYear === undefined ? {} : { documentYear: extraction.documentYear }) },
    review,
  };
  await updateSource(db, sourceId, {
    status: "succeeded",
    failureCode: null,
    extraction: stored,
    promptVersion: NOTICE_EXTRACTION_PROMPT.version,
  });
}
