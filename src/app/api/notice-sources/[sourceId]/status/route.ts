import { getNoticeStatus } from "@/application/queries/notice-sources";
import { getCurrentParent } from "@/application/queries/current-parent";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

/**
 * GET /api/notice-sources/{id}/status: where reading a notice stands, for the page that polls it.
 * Signed-in parents only, and only their own notices: anyone else's is a 404, the same as one that
 * does not exist.
 */
export async function GET(_request: Request, context: { params: Promise<{ sourceId: string }> }): Promise<Response> {
  const parent = await getCurrentParent();
  if (!parent) return Response.json({ error: "unauthenticated" }, { status: 401, headers });
  const { sourceId } = await context.params;
  const status = await getNoticeStatus(parent.parentProfileId, sourceId);
  if (!status) return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json(status, { status: 200, headers });
}
