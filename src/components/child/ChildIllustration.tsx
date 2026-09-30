import { CheckCircleBurst, PaperStack, ReadyPaper, Sprout, Sunrise } from "@/components/illustrations";
import type { ChildActionKind } from "@/domain/recommendations/next-child-action";
import { CHILD_ILLUSTRATION, type ChildIllustrationName } from "./child-illustrations";

/** The big picture on a child's mission card. */
export const CHILD_HERO_ART = "h-28 w-auto sm:h-32 md:h-44";

export function NamedChildIllustration({ name, className = CHILD_HERO_ART }: { name: ChildIllustrationName; className?: string }) {
  switch (name) {
    case "sunrise":
      return <Sunrise className={className} />;
    case "ready-paper":
      return <ReadyPaper className={className} />;
    case "paper-stack":
      return <PaperStack className={className} />;
    case "sprout":
      return <Sprout className={className} />;
    case "check-burst":
      return <CheckCircleBurst className={className} />;
  }
}

/** The picture for a mission: one per kind of next action. */
export function ChildIllustration({ kind }: { kind: ChildActionKind }) {
  return <NamedChildIllustration name={CHILD_ILLUSTRATION[kind]} />;
}
