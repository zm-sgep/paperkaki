import { getJobService } from "@/application/jobs";
import { getCurrentParent } from "@/application/queries/current-parent";
import { getMarkingStatus } from "@/application/queries/results";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

/**
 * GET /api/attempts/{id}/marking: where marking a handed-in paper stands, for the page that waits for
 * it. Signed-in parents only, and only their own child's papers: anyone else's is a 404. A marking job
 * nobody started (the server restarted) is picked up here, so waiting never lasts forever.
 */
export async function GET(_request: Request, context: { params: Promise<{ attemptId: string }> }): Promise<Response> {
  const parent = await getCurrentParent();
  if (!parent) return Response.json({ error: "unauthenticated" }, { status: 401, headers });
  const { attemptId } = await context.params;
  const scope = { parentProfileId: parent.parentProfileId };
  let status = await getMarkingStatus(scope, attemptId);
  if (!status) return Response.json({ error: "not_found" }, { status: 404, headers });
  if (status.state === "marking") {
    try {
      const jobs = await getJobService();
      await jobs.recover();
      if ((await jobs.runOverdue()) > 0) status = (await getMarkingStatus(scope, attemptId)) ?? status;
    } catch {
      // Polling must never fail because a job could not be started; the next poll tries again.
    }
  }
  return Response.json({ state: status.state, steps: "steps" in status ? status.steps : [], waitingCount: status.state === "needs_check" ? status.waitingCount : 0 }, { status: 200, headers });
}
