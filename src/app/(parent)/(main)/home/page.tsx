import type { Metadata } from "next";
import { getParentHome } from "@/application/queries/parent-home";
import { requireParent } from "@/application/queries/current-parent";
import { HeroAction } from "@/components/ui/hero-action";

export const metadata: Metadata = { title: "Home · PaperKaki" };

/** Home is a decision surface: one hero with one primary button, and at most one line of context. */
export default async function HomePage() {
  const parent = await requireParent();
  const { action, contextLine } = await getParentHome(parent.parentProfileId);
  return (
    <>
      <HeroAction
        title={action.title}
        supportingText={action.supportingText}
        ctaLabel={action.ctaLabel}
        href={action.href}
      />
      {contextLine ? <p className="text-lg text-ink-soft">{contextLine}</p> : null}
    </>
  );
}
