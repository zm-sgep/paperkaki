/**
 * The words on the child's mock screens and on the parent's attempt status. Pure, so the sentences
 * are tested and never assembled inside components. Calm and short; no points, rewards or hints.
 */

/** "Mathematics WA2 · Mock 1" */
export function attemptLabel(subject: string, assessmentName: string, mockNumber: number): string {
  return `${subject} ${assessmentName} · Mock ${mockNumber}`;
}

/** Three short lines shown once, before Start. */
export const MOCK_INSTRUCTIONS: readonly string[] = [
  "Read each question, then write your answer in the box.",
  "Use the working space to show how you got your answer.",
  "You can go back to any question. Your answers save by themselves.",
];

export const SUBMITTED_HEADING = "Paper submitted. Well done!";
export const SUBMITTED_TEXT = "You can put the iPad down now.";
export const TIME_UP_TEXT = "Time is up. Please submit your paper.";

export function questionCountText(count: number): string {
  return count === 1 ? "1 question" : `${count} questions`;
}

export function marksText(marks: number): string {
  return marks === 1 ? "1 mark" : `${marks} marks`;
}

/** On the parent's mock page, once the mock has been given to the iPad. */
export function waitingOnTodayText(mockNumber: number, childNickname: string): string {
  return `Mock ${mockNumber} is waiting on ${childNickname}'s Today screen.`;
}

export function inProgressOnIpadText(mockNumber: number, childNickname: string): string {
  return `${childNickname} is doing Mock ${mockNumber} on the iPad.`;
}

export function handedInText(mockNumber: number, childNickname: string): string {
  return `${childNickname} handed in Mock ${mockNumber}.`;
}

export type MarkingStep = { id: "uploaded" | "reading" | "marking" | "preparing"; label: string; state: "done" | "active" | "waiting" | "failed" };

/**
 * The steps of the marking progress screen. It only ever shows where marking really is (no countdown,
 * no made-up time). A paper done on the iPad was never uploaded or read from photos, so it has fewer steps.
 */
export function markingStepsFor(mode: "ipad" | "print_upload", stage: string): MarkingStep[] {
  const order = ["reading", "marking", "preparing", "done"];
  const at = stage === "failed" ? 0 : Math.max(0, order.indexOf(stage));
  const state = (own: number): MarkingStep["state"] => {
    if (stage === "failed" && own === 0) return "failed";
    if (stage === "done" || own < at) return "done";
    return own === at ? "active" : "waiting";
  };
  const steps: MarkingStep[] = [];
  if (mode === "print_upload") {
    steps.push({ id: "uploaded", label: "Uploading paper", state: "done" });
    steps.push({ id: "reading", label: "Reading answers", state: state(0) });
  } else {
    steps.push({ id: "uploaded", label: "Paper handed in", state: "done" });
  }
  steps.push({ id: "marking", label: "Marking questions", state: state(1) });
  steps.push({ id: "preparing", label: "Preparing results", state: state(2) });
  return steps;
}
