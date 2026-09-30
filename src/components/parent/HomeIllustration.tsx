import { CheckCircleBurst, GiftBox, PaperStack, ReadyPaper, Sprout } from "@/components/illustrations";
import type { ParentActionKind } from "@/domain/recommendations/next-parent-action";
import { HOME_ILLUSTRATION, type HomeIllustrationName } from "./home-illustrations";

const SIZE = "h-24 w-auto md:h-36";

function Named({ name }: { name: HomeIllustrationName }) {
  switch (name) {
    case "paper-stack":
      return <PaperStack className={SIZE} />;
    case "ready-paper":
      return <ReadyPaper className={SIZE} />;
    case "sprout":
      return <Sprout className={SIZE} />;
    case "check-burst":
      return <CheckCircleBurst className={SIZE} />;
    case "gift-box":
      return <GiftBox className={SIZE} />;
  }
}

/** The picture for the Home hero: one per kind of next action. A reward request uses the gift box. */
export function HomeIllustration({ kind }: { kind: ParentActionKind | "reward_request" }) {
  return <Named name={kind === "reward_request" ? "gift-box" : HOME_ILLUSTRATION[kind]} />;
}
