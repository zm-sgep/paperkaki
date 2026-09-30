import { getCurrentParent } from "@/application/queries/current-parent";
import { getUploadPageFile } from "@/application/queries/print-upload";

export const dynamic = "force-dynamic";

function notFound(): Response {
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

/** One photographed page of a finished paper, for the parent who uploaded it. Every failure looks the same. */
export async function GET(_request: Request, context: { params: Promise<{ pageId: string }> }): Promise<Response> {
  const parent = await getCurrentParent();
  if (!parent) return notFound();
  const { pageId } = await context.params;
  const file = await getUploadPageFile(parent.parentProfileId, pageId);
  if (!file) return notFound();
  return new Response(new Blob([file.body.slice()], { type: file.contentType }), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.body.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
