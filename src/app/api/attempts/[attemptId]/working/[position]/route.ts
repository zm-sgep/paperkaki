import { getAttemptWorkingImage } from "@/application/queries/attempts";
import { getCurrentChild } from "@/application/queries/current-child";
import { getCurrentParent } from "@/application/queries/current-parent";

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * The picture of a child's working on one question, for the child it belongs to or their parent.
 * Every failure (no session, someone else's paper, no picture) looks the same.
 */
export async function GET(_request: Request, context: { params: Promise<{ attemptId: string; position: string }> }): Promise<Response> {
  const child = await getCurrentChild();
  const parent = child ? null : await getCurrentParent();
  if (!child && !parent) return notFound();
  const { attemptId, position } = await context.params;
  const scope = child ? { childId: child.childId } : { parentProfileId: (parent as { parentProfileId: string }).parentProfileId };
  const image = await getAttemptWorkingImage(scope, attemptId, Number(position));
  if (!image) return notFound();
  return new Response(new Blob([image.body.slice()], { type: image.contentType }), {
    status: 200,
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.body.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
