"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { setPaperSettings, resetToRecommendedSettings } from "@/application/commands/assessments";
import { InputError, NotFoundError } from "@/application/errors";
import { getAssessmentSetup } from "@/application/queries/assessment-setup";
import { requireParent } from "@/application/queries/current-parent";
import { getRequestId } from "@/lib/request-context";

export type MockState = { message?: string };

/**
 * STUB. Creating the mock paper is the next milestone (M4). This only checks that the assessment
 * belongs to the signed-in parent and says so honestly; it stores nothing.
 */
export async function generateMockAction(assessmentId: string): Promise<MockState> {
  const parent = await requireParent();
  const setup = await getAssessmentSetup(parent.parentProfileId, assessmentId);
  if (!setup) notFound();
  return { message: "Mock papers aren't built yet. Your topics and settings are saved, so nothing is lost." };
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
  const values = { totalMarks: text(formData, "totalMarks"), durationMinutes: text(formData, "durationMinutes"), difficulty: text(formData, "difficulty") };
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
