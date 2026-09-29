import { notFound } from "next/navigation";
import { MockPreview } from "./MockPreview";
import { previewPaper } from "./fixture";

/**
 * Development-only preview of Mock Mode with a fixture paper. Returns a 404 in production builds.
 * `?attempt=<id>` picks a separate saved attempt (letters, digits and dashes), so a browser test
 * can start from a clean paper without touching another one.
 */

export const metadata = { title: "Mock Mode preview" };
export const dynamic = "force-dynamic";

export default async function MockPreviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { attempt } = await searchParams;
  const requested = typeof attempt === "string" && /^[a-z0-9-]{1,40}$/i.test(attempt) ? attempt : "preview-attempt";
  return <MockPreview paper={previewPaper(requested)} />;
}
