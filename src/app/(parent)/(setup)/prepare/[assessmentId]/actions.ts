"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { resetToRecommendedSettings, setPaperFormat, setPaperSettings } from "@/application/commands/assessments";
import { MockGenerationError, generateMock } from "@/application/commands/papers";
import { InputError, NotFoundError } from "@/application/errors";
import { requireParent } from "@/application/queries/current-parent";
import { getRequestId } from "@/lib/request-context";

export type MockState = { problems?: string[] };

/**
 * Creates the next mock for this assessment. The form carries a request key made when the screen
 * was drawn, so pressing twice, or a retried request, gives the same mock instead of two.
 */
export async function generateMockAction(assessmentId: string, _previous: MockState, formData: FormData): Promise<MockState> {
  const parent = await requireParent();
  const requestKey = text(formData, "requestKey");
  let result;
  try {
    result = await generateMock(parent.parentProfileId, assessmentId, requestKey, { requestId: (await getRequestId()) ?? null });
  } catch (error) {
    if (error instanceof MockGenerationError) return { problems: error.problems };
    if (error instanceof InputError) return { problems: [error.message] };
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  revalidatePath("/", "layout");
  redirect(`/prepare/${assessmentId}/mocks/${result.paperId}`);
}

export type SettingsState = { errors?: Record<string, string>; saved?: boolean; values?: Record<string, string> };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

/** "Customise paper": saves the parent's own marks, time and difficulty, or goes back to the recommendation. */
export async function saveSettingsAction(assessmentId: string, _previous: SettingsState, formData: FormData): Promise<SettingsState> {
  const parent = await requireParent();
  const context = { requestId: (await getRequestId()) ?? null };
  // A paper whose marks and time come from its paper format only shows the difficulty.
  const values: { difficulty: string; totalMarks?: string; durationMinutes?: string } = { difficulty: text(formData, "difficulty") };
  if (formData.has("totalMarks")) values.totalMarks = text(formData, "totalMarks");
  if (formData.has("durationMinutes")) values.durationMinutes = text(formData, "durationMinutes");
  try {
    if (text(formData, "intent") === "recommended") {
      await resetToRecommendedSettings(parent.parentProfileId, assessmentId, context);
    } else {
      await setPaperSettings(parent.parentProfileId, assessmentId, values, context);
    }
  } catch (error) {
    if (error instanceof InputError) return { errors: error.fieldErrors, values };
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  revalidatePath("/", "layout");
  return { saved: true };
}

export type FormatState = { errors?: Record<string, string>; saved?: boolean };

/** "Paper format": saves the parent's choice, or their own parts when they match their school's paper. */
export async function saveFormatAction(assessmentId: string, _previous: FormatState, formData: FormData): Promise<FormatState> {
  const parent = await requireParent();
  const context = { requestId: (await getRequestId()) ?? null };
  let customFormat: unknown;
  try {
    customFormat = JSON.parse(text(formData, "customFormat") || "null");
  } catch {
    customFormat = null;
  }
  try {
    await setPaperFormat(
      parent.parentProfileId,
      assessmentId,
      { choice: text(formData, "choice"), customFormat, saveForFuture: formData.get("saveForFuture") !== null },
      context,
    );
  } catch (error) {
    if (error instanceof InputError) return { errors: error.fieldErrors };
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  revalidatePath("/", "layout");
  return { saved: true };
}
