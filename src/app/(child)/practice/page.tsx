import type { Metadata } from "next";
import { ChildEmptyState } from "@/components/child/child-card";

export const metadata: Metadata = { title: "Practice · PaperKaki" };

export default function ChildPracticePage() {
  return <ChildEmptyState title="Practice">Practice will appear here after your first mock.</ChildEmptyState>;
}
