/**
 * What a marked mock says, worked out by rule (UX-08). Pure and deterministic: the results screens only
 * show what is computed here. Words are the parent's and the child's own: marks, topics and plain
 * status words; never a predicted exam score, a percentage or an ability label.
 */

export type ResultQuestion = {
  questionId: string;
  /** The printed question number. */
  position: number;
  marks: number;
  /** The mark that counts. */
  score: number;
  topicId: string;
  /** The topic as a parent reads it, e.g. "Fractions". */
  topicLabel: string;
  /** The skill as a child reads it, e.g. "Add and subtract big numbers". */
  skillLabel: string;
};

export const STRONG_AT = 0.85;
export const NEEDS_ATTENTION_BELOW = 0.7;
export const MAX_ATTENTION_TOPICS = 3;
export const MAX_THINGS_TO_LEARN = 3;

export type TopicStatus = "strong" | "getting_there" | "needs_attention";

export const TOPIC_STATUS_TEXT: Record<TopicStatus, string> = {
  strong: "Strong",
  getting_there: "Getting there",
  needs_attention: "Needs attention",
};

export type TopicRow = {
  topicId: string;
  label: string;
  marks: number;
  maxMarks: number;
  marksLost: number;
  status: TopicStatus;
  statusText: string;
};

export function scoreText(score: number, maxScore: number): string {
  return `${score}/${maxScore}`;
}

export function statusFor(marks: number, maxMarks: number): TopicStatus {
  const ratio = maxMarks === 0 ? 1 : marks / maxMarks;
  if (ratio >= STRONG_AT) return "strong";
  if (ratio < NEEDS_ATTENTION_BELOW) return "needs_attention";
  return "getting_there";
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** One row per topic on the paper: most marks lost first, so the table starts with what matters. */
export function topicBreakdown(questions: readonly ResultQuestion[]): TopicRow[] {
  const byTopic = new Map<string, TopicRow>();
  for (const question of questions) {
    const row = byTopic.get(question.topicId) ?? {
      topicId: question.topicId,
      label: question.topicLabel,
      marks: 0,
      maxMarks: 0,
      marksLost: 0,
      status: "strong" as TopicStatus,
      statusText: "",
    };
    row.marks += question.score;
    row.maxMarks += question.marks;
    byTopic.set(question.topicId, row);
  }
  return [...byTopic.values()]
    .map((row) => {
      const status = statusFor(row.marks, row.maxMarks);
      return { ...row, marksLost: row.maxMarks - row.marks, status, statusText: TOPIC_STATUS_TEXT[status] };
    })
    .sort((a, b) => b.marksLost - a.marksLost || byText(a.label, b.label));
}

/**
 * The one to three topics worth attention: those below the line, most marks lost first. When none is
 * below the line but marks were lost, the topic that lost the most is still named, so a gap always has
 * a topic beside it. A full-marks paper has none.
 */
export function topicsNeedingAttention(rows: readonly TopicRow[], limit: number = MAX_ATTENTION_TOPICS): TopicRow[] {
  const ranked = [...rows]
    .filter((row) => row.marksLost > 0)
    .sort((a, b) => b.marksLost - a.marksLost || a.marks / Math.max(1, a.maxMarks) - b.marks / Math.max(1, b.maxMarks) || byText(a.label, b.label));
  const below = ranked.filter((row) => row.status === "needs_attention");
  return (below.length > 0 ? below : ranked.slice(0, 1)).slice(0, limit);
}

export type MarksTotal = { score: number; maxScore: number };
export type PreviousMock = MarksTotal & { mockNumber: number };

export type ResultChange = { kind: "first" | "up" | "down" | "same" | "different_total"; text: string };

const marksWord = (n: number) => (n === 1 ? "1 mark" : `${n} marks`);

/** "Up 6 marks from Mock 1", or "First mock — this is your starting point". */
export function changeFromPrevious(current: MarksTotal, previous: PreviousMock | undefined): ResultChange {
  if (!previous) return { kind: "first", text: "First mock — this is your starting point" };
  if (previous.maxScore !== current.maxScore) {
    return {
      kind: "different_total",
      text: `Mock ${previous.mockNumber} was ${scoreText(previous.score, previous.maxScore)}, so the two can't be compared mark for mark`,
    };
  }
  const difference = current.score - previous.score;
  if (difference > 0) return { kind: "up", text: `Up ${marksWord(difference)} from Mock ${previous.mockNumber}` };
  if (difference < 0) return { kind: "down", text: `Down ${marksWord(-difference)} from Mock ${previous.mockNumber}` };
  return { kind: "same", text: `The same as Mock ${previous.mockNumber}` };
}

/** "Finished 4 minutes over time", or null when the paper was in time. Time over is a note, never a penalty. */
export function overTimeText(overTimeSeconds: number): string | null {
  if (overTimeSeconds <= 0) return null;
  if (overTimeSeconds < 60) return "Finished less than a minute over time";
  const minutes = Math.round(overTimeSeconds / 60);
  return `Finished ${minutes === 1 ? "1 minute" : `${minutes} minutes`} over time`;
}

export const isMistake = (question: Pick<ResultQuestion, "marks" | "score">): boolean => question.score < question.marks;

/**
 * The order of the marked paper: mistakes first (the ones that cost the most marks first), then the
 * questions that were right, in paper order. The few worth learning from come first.
 */
export function orderForReview<T extends Pick<ResultQuestion, "marks" | "score" | "position">>(questions: readonly T[]): T[] {
  const mistakes = questions.filter(isMistake).sort((a, b) => b.marks - b.score - (a.marks - a.score) || a.position - b.position);
  const right = questions.filter((question) => !isMistake(question)).sort((a, b) => a.position - b.position);
  return [...mistakes, ...right];
}

/** Up to three skills the child lost the most marks on, in the child's own words. */
export function thingsToLearn(questions: readonly ResultQuestion[], limit: number = MAX_THINGS_TO_LEARN): string[] {
  const lost = new Map<string, number>();
  for (const question of questions) {
    if (!isMistake(question)) continue;
    lost.set(question.skillLabel, (lost.get(question.skillLabel) ?? 0) + (question.marks - question.score));
  }
  return [...lost.entries()]
    .sort((a, b) => b[1] - a[1] || byText(a[0], b[0]))
    .slice(0, limit)
    .map(([label]) => label);
}

/** The child's headline: warm, plain, no comparison and no ability label. */
export function childHeadline(input: { score: number; maxScore: number; mistakeCount: number }): string {
  const ratio = input.maxScore === 0 ? 0 : input.score / input.maxScore;
  const opener = ratio >= 0.9 ? "Fantastic work!" : ratio >= 0.7 ? "Great effort!" : ratio >= 0.5 ? "Good effort!" : "You kept going, and that is what counts.";
  if (input.mistakeCount === 0) return `${opener} There is nothing to fix this time.`;
  return `${opener} Let's fix ${input.mistakeCount === 1 ? "1 mistake" : `${input.mistakeCount} mistakes`}.`;
}
