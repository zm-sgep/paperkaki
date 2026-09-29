import { referencedAssetKeys, verifyQuestionAnswer } from "@/domain/questions";
import type { PaperQuestionFacts } from "@/domain/papers";
import type { Database } from "@/repositories/postgres/client";
import { listPaperQuestionSources } from "@/repositories/postgres/papers";
import { AnswerSchema, type QuestionDraft } from "@/schemas/question-content";
import type { PdfImage } from "@/services/pdf";
import type { StorageService } from "@/services/storage";
import { rowToDraftInput, safeParseDraft } from "./question-drafts";

/**
 * Loads the exact question versions chosen for a paper and checks each one on its own terms:
 * approved, answer present, answer independently verified, every file it needs available and
 * drawable. The result feeds `validatePaper` (facts) and the two document builders (drafts).
 */

const QUESTION_ASSET_BUCKET = "question-assets";
const IMAGE_FORMATS: Record<string, PdfImage["format"]> = { png: "png", jpg: "jpg", jpeg: "jpg" };

export type LoadedPaperQuestion = {
  questionId: string;
  facts: PaperQuestionFacts;
  /** Null when the stored question no longer passes the schema (facts then say why it cannot be used). */
  draft: QuestionDraft | null;
  topicId: string;
  /** The parent-facing label of the topic of the question's primary outcome. */
  topicLabel: string;
  /** Asset keys of images in the stem and worked solution. */
  imageKeys: string[];
};

function extensionOf(key: string): string {
  return key.split(".").pop()?.toLowerCase() ?? "";
}

export async function loadPaperQuestions(
  db: Database,
  storage: StorageService,
  questionIds: readonly string[],
): Promise<LoadedPaperQuestion[]> {
  const sources = await listPaperQuestionSources(db, questionIds);
  return Promise.all(
    sources.map(async ({ question, outcomes, assets }): Promise<LoadedPaperQuestion> => {
      const parsed = safeParseDraft(rowToDraftInput(question, outcomes));
      const draft = parsed.ok ? parsed.draft : null;
      const verification = draft ? verifyQuestionAnswer(draft) : null;
      const reasons = verification && !verification.ok ? verification.reasons : parsed.ok ? [] : parsed.issues.map((i) => i.message);
      const primary = outcomes.find((o) => o.role === "primary");

      const imageKeys = draft ? referencedAssetKeys(draft) : [];
      const missingAssets: string[] = [];
      for (const key of imageKeys) {
        const stored = assets.find((asset) => asset.objectKey === key && asset.bucket === QUESTION_ASSET_BUCKET);
        const drawable = extensionOf(key) in IMAGE_FORMATS;
        if (!stored || !drawable || !(await storage.exists({ bucket: QUESTION_ASSET_BUCKET, key }))) missingAssets.push(key);
      }

      return {
        questionId: question.id,
        facts: {
          questionId: question.id,
          approved: question.status === "approved",
          marks: question.marks,
          questionType: question.questionType,
          hasAnswer: AnswerSchema.safeParse(question.answer).success,
          answerVerified: verification?.ok === true,
          verificationReasons: reasons,
          missingAssets,
        },
        draft,
        topicId: primary?.topicId ?? "",
        topicLabel: primary?.topicLabel ?? "",
        imageKeys,
      };
    }),
  );
}

/** Image bytes for the renderers, keyed by asset key. A file that cannot be read becomes `null` (a placeholder box). */
export async function loadPaperImages(
  storage: StorageService,
  questions: readonly LoadedPaperQuestion[],
): Promise<Record<string, PdfImage | null>> {
  const images: Record<string, PdfImage | null> = {};
  for (const key of new Set(questions.flatMap((q) => q.imageKeys))) {
    const format = IMAGE_FORMATS[extensionOf(key)];
    const stored = format ? await storage.get({ bucket: QUESTION_ASSET_BUCKET, key }) : null;
    images[key] = stored && format ? { data: stored.body, format } : null;
  }
  return images;
}
