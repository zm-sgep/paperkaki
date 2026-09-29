"use server";

import { revalidatePath } from "next/cache";
import { markOutcomeVerified } from "@/application/commands/curriculum-provenance";
import { requireAdmin } from "@/application/queries/current-parent";
import { CurriculumNotFoundError, CurriculumProvenanceError, CurriculumVersionLockedError } from "@/domain/curriculum";
import { getRequestId } from "@/lib/request-context";
import { asUuid } from "./labels";

export type VerifyState = { error?: string; done?: boolean };

/**
 * Marks one outcome verified by the signed-in admin. The admin check is repeated here: server
 * actions are public endpoints and must not rely on the page that rendered the form.
 */
export async function markVerifiedAction(_previous: VerifyState, formData: FormData): Promise<VerifyState> {
  const admin = await requireAdmin();
  const versionId = asUuid(formData.get("versionId")?.toString());
  const outcomeId = asUuid(formData.get("outcomeId")?.toString());
  if (!versionId || !outcomeId) {
    return { error: "That outcome could not be found." };
  }
  const pageOrSection = formData.get("pageOrSection")?.toString().trim() || null;

  try {
    await markOutcomeVerified(
      { versionId, outcomeId, verifierProfileId: admin.parentProfileId, pageOrSection },
      { requestId: await getRequestId() },
    );
  } catch (error) {
    if (
      error instanceof CurriculumProvenanceError ||
      error instanceof CurriculumVersionLockedError ||
      error instanceof CurriculumNotFoundError
    ) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath(`/admin/curriculum/${versionId}`, "layout");
  return { done: true };
}
