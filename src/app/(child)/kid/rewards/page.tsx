import type { Metadata } from "next";
import { ChildEmptyState } from "@/components/child/child-card";

export const metadata: Metadata = { title: "Rewards · PaperKaki" };

/** Served at /rewards for a child device (see proxy.ts). */
export default function ChildRewardsPage() {
  return <ChildEmptyState title="Rewards">Rewards will appear here when a grown-up sets them up.</ChildEmptyState>;
}
