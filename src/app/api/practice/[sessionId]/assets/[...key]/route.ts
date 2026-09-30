import { getCurrentChild } from "@/application/queries/current-child";
import { getPracticeAsset } from "@/application/queries/practice";

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * A picture in a question of the practice set this child is doing. It needs the child's own session and
 * only serves pictures the set's questions use, so there is no link to keep or share. Every failure looks the same.
 */
export async function GET(_request: Request, context: { params: Promise<{ sessionId: string; key: string[] }> }): Promise<Response> {
  const child = await getCurrentChild();
  if (!child) return notFound();
  const { sessionId, key } = await context.params;
  const asset = await getPracticeAsset(child, sessionId, key.join("/"));
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
