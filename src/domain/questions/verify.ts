import type { Inline, QuestionDraft } from "@/schemas/question-content";
import { evaluateExpression, ExpressionError } from "./expression";
import { isSimplestFraction } from "./answers";
import { equals, formatRational, rational, tryParseRational, type Rational } from "./rational";

export type VerificationResult =
  | { ok: true; needsHumanCheck?: true }
  | { ok: false; reasons: string[] };

/** A single text or frac inline that parses as a number, else null. */
function optionValue(inlines: Inline[]): Rational | null {
  if (inlines.length !== 1) return null;
  const only = inlines[0] as Inline;
  if (only.t === "text") return tryParseRational(only.v);
  if (only.t === "frac") {
    const d = BigInt(only.d);
    return rational(BigInt(only.whole ?? 0) * d + BigInt(only.n), d);
  }
  return null;
}

/**
 * Independent, deterministic answer verification (M2-05). Evaluates the
 * verification expression with exact rational arithmetic and compares it with
 * the stored answer. Never uses floating point.
 */
export function verifyQuestionAnswer(draft: QuestionDraft): VerificationResult {
  const { answer, verification } = draft;
  const reasons: string[] = [];

  if (answer.kind !== draft.questionType) {
    reasons.push(`Answer kind "${answer.kind}" does not match questionType "${draft.questionType}"`);
    return { ok: false, reasons };
  }

  if ("human" in verification) {
    if (answer.kind === "number" || answer.kind === "fraction") {
      return { ok: false, reasons: [`${answer.kind} answers must be verified by expression, not by a human flag`] };
    }
    return { ok: true, needsHumanCheck: true };
  }

  if (answer.kind === "text") {
    return { ok: false, reasons: ["Text answers cannot be verified by expression; they need a human check"] };
  }

  let result: Rational;
  try {
    result = evaluateExpression(verification.expression);
  } catch (error) {
    if (error instanceof ExpressionError) {
      return { ok: false, reasons: [`Verification expression failed: ${error.message}`] };
    }
    throw error;
  }

  switch (answer.kind) {
    case "number": {
      const stored = tryParseRational(answer.value);
      if (!stored) return { ok: false, reasons: [`Answer value "${answer.value}" is not a number`] };
      if (!equals(stored, result)) {
        reasons.push(`Expression gives ${formatRational(result)} but the stored answer is ${answer.value}`);
      }
      break;
    }
    case "fraction": {
      const stored = tryParseRational(answer.value);
      if (!stored) return { ok: false, reasons: [`Answer value "${answer.value}" is not a fraction`] };
      if (!equals(stored, result)) {
        reasons.push(`Expression gives ${formatRational(result)} but the stored answer is ${answer.value}`);
      }
      if (answer.requireSimplest && !isSimplestFraction(answer.value)) {
        reasons.push(`Answer "${answer.value}" is not in simplest form but requireSimplest is set`);
      }
      break;
    }
    case "mcq": {
      const options = draft.content.options ?? [];
      const values = new Map<string, Rational>();
      for (const option of options) {
        const value = optionValue(option.c);
        if (!value) {
          reasons.push(`Option ${option.id} is not purely numeric, so it cannot be verified by expression`);
        } else {
          values.set(option.id, value);
        }
      }
      if (reasons.length > 0) break;
      const matching = options.filter((o) => {
        const v = values.get(o.id);
        return v !== undefined && equals(v, result);
      });
      if (matching.length === 0) {
        reasons.push(`No option equals the expression result ${formatRational(result)}`);
      } else if (matching.length > 1) {
        reasons.push(`Options ${matching.map((o) => o.id).join(", ")} all equal the expression result`);
      } else if ((matching[0] as { id: string }).id !== answer.correct) {
        reasons.push(
          `Expression result ${formatRational(result)} matches option ${(matching[0] as { id: string }).id}, but the stored correct option is ${answer.correct}`,
        );
      }
      break;
    }
  }

  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
