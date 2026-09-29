import type { Metadata } from "next";
import { getParentHomeAction } from "@/application/queries/parent-home";
import { requireParent } from "@/application/queries/current-parent";
import { HeroAction } from "@/components/ui/hero-action";

export const metadata: Metadata = { title: "Home · PaperKaki" };

export default async function HomePage() {
  const parent = await requireParent();
  const action = await getParentHomeAction(parent.parentProfileId);
  return (
    <>
      <HeroAction
        title={action.title}
        supportingText={action.supportingText}
        ctaLabel={action.ctaLabel}
        href={action.href}
      />
    </>
  );
}
