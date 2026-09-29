import { getCurrentParent } from "@/application/queries/current-parent";
import { listSelectableTopics } from "@/application/queries/list-selectable-topics";
import { SelectableTopicsQuerySchema, SelectableTopicsResponseSchema } from "@/schemas/curriculum-selection";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store" };

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers });
}

/**
 * GET /api/curriculum/topics?subject=Mathematics&level=P3
 * The topics and outcomes of the latest published curriculum, in parent and child wording.
 * Needs a signed-in parent (the curriculum itself is not personal data, but the app is not public).
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await getCurrentParent())) {
    return json({ error: "unauthenticated" }, 401);
  }

  const { searchParams } = new URL(request.url);
  const query = SelectableTopicsQuerySchema.safeParse({
    subject: searchParams.get("subject") ?? "",
    level: searchParams.get("level") ?? "",
  });
  if (!query.success) {
    return json(
      { error: "invalid_query", issues: query.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) },
      400,
    );
  }

  const result = await listSelectableTopics(query.data);
  if (!result) {
    return json({ error: "not_found" }, 404);
  }
  return json(SelectableTopicsResponseSchema.parse(result), 200);
}
