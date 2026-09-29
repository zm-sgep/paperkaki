import { env } from "@/config/env";
import { getStorage, isStorageBucket, verifySignedFileRequest } from "@/services/storage";

export const dynamic = "force-dynamic";

/** Every failure looks the same: nobody learns whether the link, the time or the file was wrong. */
function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Serves a private file to whoever holds a valid, unexpired signed link. The link itself is the
 * credential: it is only created by issueFileUrl, after an ownership check.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ bucket: string; key: string[] }> },
): Promise<Response> {
  const { bucket, key: segments } = await context.params;
  const key = segments.join("/");
  const url = new URL(request.url);

  const allowed = await verifySignedFileRequest(env.STORAGE_SIGNING_SECRET, {
    bucket,
    key,
    exp: url.searchParams.get("exp"),
    sig: url.searchParams.get("sig"),
  });
  if (!allowed || !isStorageBucket(bucket)) {
    return notFound();
  }

  const stored = await getStorage().get({ bucket, key });
  if (!stored) {
    return notFound();
  }

  return new Response(new Blob([stored.body.slice()], { type: stored.contentType }), {
    status: 200,
    headers: {
      "Content-Type": stored.contentType,
      "Content-Length": String(stored.body.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // Uploaded files must never run scripts on our origin.
      "Content-Security-Policy": "sandbox; default-src 'none'",
    },
  });
}
