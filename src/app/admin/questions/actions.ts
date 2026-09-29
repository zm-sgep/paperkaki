"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ForbiddenError } from "@/application/errors";
import {
  createQuestionDraft,
  retireQuestion,
  reviewQuestion,
  reviseQuestion,
  submitForReview,
} from "@/application/commands/questions";
import { requireAdmin } from "@/application/queries/current-parent";
import { QuestionError } from "@/domain/questions";
import { getRequestId } from "@/lib/request-context";
import { asUuid } from "../curriculum/labels";

export type QuestionActionState = { error?: string; issues?: string[]; done?: string };

/**
 * Every action repeats `requireAdmin()`: server actions are public endpoints and must not rely on
 * the page that rendered the form. The commands check the admin role again, and the server
 * validates everything the form shows, so malformed content cannot be saved from here or from
 * anywhere else.
 */

function fail(error: unknown): QuestionActionState {
  if (error instanceof QuestionError) {
    return { error: error.message, issues: [...error.issues] };
  }
  if (error instanceof ForbiddenError) {
    return { error: error.message };
  }
  throw error;
}

/** Parses the editor's fields into the draft object. Returns per-field JSON errors instead of throwing. */
async function readDraftFromForm(formData: FormData): Promise<{ draft: unknown } | { issues: string[] }> {
  const text = (name: string) => formData.get(name)?.toString() ?? "";
  const issues: string[] = [];
  const json = (name: string): unknown => {
    try {
      return JSON.parse(text(name));
    } catch {
      issues.push(`${name}: is not valid JSON`);
      return undefined;
    }
  };
  const number = (name: string) => (text(name).trim() === "" ? undefined : Number(text(name)));
  const draft = {
    familyCode: text("familyCode").trim(),
    familyTitle: text("familyTitle").trim(),
    primaryOutcomeCode: text("primaryOutcomeCode"),
    secondaryOutcomeCodes: formData.getAll("secondaryOutcomeCodes").map(String),
    questionType: text("questionType"),
    difficulty: text("difficulty"),
    cognitiveDemand: text("cognitiveDemand"),
    marks: number("marks"),
    estimatedSeconds: number("estimatedSeconds"),
    provenance: text("provenance"),
    content: json("content"),
    answer: json("answer"),
    verification: json("verification"),
    workedSolution: json("workedSolution"),
    markingScheme: json("markingScheme"),
  };
  return issues.length > 0 ? { issues } : { draft };
}

/** Saves the editor: a new draft, a draft edited in place, or (for an approved question) a new version. */
export async function saveQuestionAction(_previous: QuestionActionState, formData: FormData): Promise<QuestionActionState> {
  const admin = await requireAdmin();
  const parsed = await readDraftFromForm(formData);
  if ("issues" in parsed) {
    return { error: "This question is not valid yet.", issues: parsed.issues };
  }
  const questionId = asUuid(formData.get("questionId")?.toString());
  const curriculumVersionId = asUuid(formData.get("curriculumVersionId")?.toString());
  const context = { requestId: await getRequestId() };
  const actor = { profileId: admin.parentProfileId };

  let target: string;
  try {
    if (questionId) {
      const result = await reviseQuestion({ questionId, draft: parsed.draft }, actor, context);
      target = result.questionId;
    } else {
      if (!curriculumVersionId) return { error: "Choose a curriculum version." };
      const created = await createQuestionDraft({ curriculumVersionId, draft: parsed.draft }, actor, context);
      target = created.questionId;
    }
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/questions", "layout");
  redirect(`/admin/questions/${target}`);
}

export async function submitForReviewAction(_previous: QuestionActionState, formData: FormData): Promise<QuestionActionState> {
  const admin = await requireAdmin();
  const questionId = asUuid(formData.get("questionId")?.toString());
  if (!questionId) return { error: "That question could not be found." };
  try {
    await submitForReview({ questionId }, { profileId: admin.parentProfileId }, { requestId: await getRequestId() });
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/questions", "layout");
  return { done: "Sent for review." };
}

/** Approve or request changes, chosen by the button that was pressed. */
export async function reviewAction(_previous: QuestionActionState, formData: FormData): Promise<QuestionActionState> {
  const admin = await requireAdmin();
  const questionId = asUuid(formData.get("questionId")?.toString());
  if (!questionId) return { error: "That question could not be found." };
  const decision = formData.get("decision")?.toString();
  const checked = (name: string) => formData.get(name) === "on";
  const checklist = {
    curriculum: checked("curriculum"),
    answer: checked("answer"),
    clarity: checked("clarity"),
    ageAppropriate: checked("ageAppropriate"),
  };
  const notes = formData.get("notes")?.toString() ?? "";
  const context = { requestId: await getRequestId() };
  const actor = { profileId: admin.parentProfileId };
  try {
    if (decision === "retire") {
      await retireQuestion({ questionId, notes }, actor, context);
    } else if (decision === "approved" || decision === "changes_requested") {
      await reviewQuestion({ questionId, decision, checklist, notes }, actor, context);
    } else {
      return { error: "Choose Approve, Request changes or Retire." };
    }
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/questions", "layout");
  return {
    done: decision === "approved" ? "Approved." : decision === "retire" ? "Retired." : "Sent back to draft with your notes.",
  };
}
