import {
  RationalError,
  add,
  div,
  mul,
  neg,
  parseUnsignedDecimal,
  sub,
  type Rational,
} from "./rational";

/**
 * Deterministic arithmetic expression evaluator: + - * / ( ), unary minus,
 * integers and decimals. `a/b` is ordinary division. Exact rational result;
 * no eval, no floating point.
 */

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
  }
}

type Token =
  | { kind: "num"; value: string }
  | { kind: "op"; value: "+" | "-" | "*" | "/" | "(" | ")" };

const MAX_LENGTH = 500;
const MAX_DEPTH = 100;

function tokenise(expr: string): Token[] {
  if (expr.length > MAX_LENGTH) throw new ExpressionError("Expression is too long");
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i] as string;
    if (/\s/.test(ch)) {
      i += 1;
    } else if (/\d/.test(ch)) {
      let j = i;
      while (j < expr.length && /\d/.test(expr[j] as string)) j += 1;
      if (expr[j] === ".") {
        j += 1;
        const start = j;
        while (j < expr.length && /\d/.test(expr[j] as string)) j += 1;
        if (j === start) throw new ExpressionError(`Malformed number at position ${i}`);
      }
      tokens.push({ kind: "num", value: expr.slice(i, j) });
      i = j;
    } else if ("+-*/()".includes(ch)) {
      tokens.push({ kind: "op", value: ch as "+" | "-" | "*" | "/" | "(" | ")" });
      i += 1;
    } else {
      throw new ExpressionError(`Unexpected character "${ch}" at position ${i}`);
    }
  }
  return tokens;
}

class Parser {
  private pos = 0;
  private depth = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): Rational {
    if (this.tokens.length === 0) throw new ExpressionError("Empty expression");
    const value = this.expression();
    if (this.pos < this.tokens.length) throw new ExpressionError("Unexpected trailing input");
    return value;
  }

  private peekOp(): string | null {
    const t = this.tokens[this.pos];
    return t && t.kind === "op" ? t.value : null;
  }

  private expression(): Rational {
    let left = this.term();
    for (let op = this.peekOp(); op === "+" || op === "-"; op = this.peekOp()) {
      this.pos += 1;
      const right = this.term();
      left = op === "+" ? add(left, right) : sub(left, right);
    }
    return left;
  }

  private term(): Rational {
    let left = this.unary();
    for (let op = this.peekOp(); op === "*" || op === "/"; op = this.peekOp()) {
      this.pos += 1;
      const right = this.unary();
      if (op === "*") {
        left = mul(left, right);
      } else {
        if (right.n === 0n) throw new ExpressionError("Division by zero");
        left = div(left, right);
      }
    }
    return left;
  }

  private unary(): Rational {
    const op = this.peekOp();
    if (op === "-") {
      this.pos += 1;
      return neg(this.unary());
    }
    if (op === "+") {
      this.pos += 1;
      return this.unary();
    }
    return this.primary();
  }

  private primary(): Rational {
    const t = this.tokens[this.pos];
    if (!t) throw new ExpressionError("Unexpected end of expression");
    if (t.kind === "num") {
      this.pos += 1;
      return parseUnsignedDecimal(t.value);
    }
    if (t.value === "(") {
      this.pos += 1;
      this.depth += 1;
      if (this.depth > MAX_DEPTH) throw new ExpressionError("Expression is nested too deeply");
      const inner = this.expression();
      if (this.peekOp() !== ")") throw new ExpressionError("Missing closing parenthesis");
      this.pos += 1;
      this.depth -= 1;
      return inner;
    }
    throw new ExpressionError(`Unexpected "${t.value}"`);
  }
}

/** Evaluate to an exact Rational. Throws ExpressionError on any malformed input or division by zero. */
export function evaluateExpression(expr: string): Rational {
  try {
    return new Parser(tokenise(expr)).parse();
  } catch (error) {
    if (error instanceof ExpressionError) throw error;
    if (error instanceof RationalError) throw new ExpressionError(error.message);
    throw error;
  }
}
