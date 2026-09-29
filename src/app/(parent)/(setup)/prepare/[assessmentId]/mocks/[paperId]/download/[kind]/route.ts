import { NextResponse } from "next/server";
import { getMockDownloadUrl } from "@/application/queries/papers";
import { getCurrentParent } from "@/application/queries/current-parent";

export const dynamic = "force-dynamic";

/** Every failure looks the same, so nobody learns whether a paper exists. */
function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Sends the signed-in parent to a fresh five-minute link for one of their own paper files.
 * The link is made at the moment of the click, so a page left open never holds an expired one.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ assessmentId: string; paperId: string; kind: string }> },
): Promise<Response> {
  const { assessmentId, paperId, kind } = await context.params;
  if (kind !== "student" && kind !== "answers") return notFound();
  const parent = await getCurrentParent();
  if (!parent) return NextResponse.redirect(new URL("/sign-in", request.url), 307);

  const url = await getMockDownloadUrl(parent, assessmentId, paperId, kind);
  if (!url) return notFound();
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "private, no-store" },
  });
}
