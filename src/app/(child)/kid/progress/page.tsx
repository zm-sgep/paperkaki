import type { Metadata } from "next";
import { ChildEmptyState } from "@/components/child/child-card";

export const metadata: Metadata = { title: "Progress · PaperKaki" };

/** Served at /progress for a child device (see proxy.ts). */
export default function ChildProgressPage() {
  return <ChildEmptyState title="Progress">Your progress will show here after your first mock.</ChildEmptyState>;
}
