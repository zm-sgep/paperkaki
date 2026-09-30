import { getAttemptAsset } from "@/application/queries/attempts";
import { getCurrentChild } from "@/application/queries/current-child";

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * A picture in a question of the paper this child is sitting. It needs the child's own session, so
 * there is no link that outlives the paper (a signed link would expire mid-mock). Every failure looks the same.
 */
export async function GET(_request: Request, context: { params: Promise<{ attemptId: string; key: string[] }> }): Promise<Response> {
  const child = await getCurrentChild();
  if (!child) return notFound();
  const { attemptId, key } = await context.params;
  const asset = await getAttemptAsset(child, attemptId, key.join("/"));
  if (!asset) return notFound();
  return new Response(new Blob([asset.body.slice()], { type: asset.contentType }), {
    status: 200,
    headers: {
      "Content-Type": asset.contentType,
      "Content-Length": String(asset.body.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
