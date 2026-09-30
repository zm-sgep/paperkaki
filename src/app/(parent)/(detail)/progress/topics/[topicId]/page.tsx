import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getParentTopicProgress } from "@/application/queries/progress";
import { requireParent } from "@/application/queries/current-parent";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export const metadata: Metadata = { title: "Topic · PaperKaki" };
export const dynamic = "force-dynamic";

/** One topic: how it is going, its skills in plain words, how much that rests on, and one action. Lives outside (main) so an unknown topic answers 404. */
export default async function TopicProgressPage({ params }: { params: Promise<{ topicId: string }> }) {
  const parent = await requireParent();
  const { topicId } = await params;
  const topic = await getParentTopicProgress(parent.parentProfileId, topicId);
  if (!topic) notFound();

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/progress" className="inline-flex min-h-12 items-center text-base font-semibold text-kaki underline underline-offset-4">
          Back to Progress
        </Link>
        <PageHeader title={topic.label} description={`${topic.childNickname} · ${topic.word}`} />
        <p className="text-lg text-ink-soft">
          {topic.help} {topic.evidence}.
        </p>
      </div>

      <Card className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-ink">Skills in this topic</h2>
        <ul data-outcomes className="flex flex-col">
          {topic.outcomes.map((outcome) => (
            <li key={outcome.label} className="flex flex-col gap-0.5 border-b border-line py-3 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <span className="text-lg text-ink">{outcome.label}</span>
              <span className="text-right">
                <span className="block text-lg font-semibold text-kaki-strong">{outcome.word}</span>
                <span className="block text-base text-ink-soft">{outcome.evidence}</span>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <div>
        <ButtonLink href={topic.suggest.href} variant="primary" className="w-full sm:w-auto">
          {topic.suggest.ctaLabel}
        </ButtonLink>
      </div>
    </>
  );
}
