// A small, total expression evaluator -- the TS twin of the harness guard
// language (harness/src/engine/orchestration/guard.rs), scoped to what authored
// flows use. It backs both branch guards (`when`) and `set` right-hand sides so
// the in-app runner takes exactly the branches maestro would.
//
// Grammar: or := and ("||" and)* ; and := cmp ("&&" cmp)* ;
//   cmp := unary (("=="|"!="|"<"|"<="|">"|">=") unary)? ;
//   unary := "!" unary | atom ; atom := "(" or ")" | string | number | bool | path
//
// Evaluation is total: an unknown path or a type mismatch yields a benign value
// (a guard that does not hold), never a throw -- matching the harness so a flow
// that references a variable before it is set never crashes the run.

/** A scalar value in the expression space. */
export type Value = string | number | boolean;

/** The state guards/sets see: flow variables plus the previous node's outcome. */
export interface EvalContext {
  vars: Record<string, Value>;
  /** The outgoing node's outcome: `text`, `verdict`, `exit`, ... (or null at start). */
  outcome: Record<string, Value> | null;
}

/** Resolve a dotted path. `outcome.*` reads the outcome; a bare name reads a var. */
function lookup(path: string, ctx: EvalContext): Value | undefined {
  const dot = path.indexOf(".");
  if (dot === -1) return ctx.vars[path];
  const head = path.slice(0, dot);
  const tail = path.slice(dot + 1);
  if (head === "outcome") return ctx.outcome ? ctx.outcome[tail] : undefined;
  return undefined;
}

/** Truthiness matching the harness: bool as-is, number != 0, non-empty string. */
export function truthy(v: Value | undefined): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  return false;
}

// --- lexer ------------------------------------------------------------------

type Tok =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const two = ["||", "&&", "==", "!=", "<=", ">="];
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j++;
      toks.push({ t: "str", v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    const pair = src.slice(i, i + 2);
    if (two.includes(pair)) {
      toks.push({ t: "op", v: pair });
      i += 2;
      continue;
    }
    if ("()!<>".includes(c)) {
      toks.push({ t: "op", v: c });
      i++;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j])) j++;
      toks.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      toks.push({ t: "id", v: src.slice(i, j) });
      i = j;
      continue;
    }
    // Unknown character: skip it (keep evaluation total).
    i++;
  }
  return toks;
}

// --- recursive-descent parser + evaluator -----------------------------------

class Parser {
  private pos = 0;
  constructor(
    private toks: Tok[],
    private ctx: EvalContext,
  ) {}

  /** Evaluate the whole expression; returns a benign `false` on any parse gap. */
  eval(): Value {
    if (!this.toks.length) return false;
    const v = this.or();
    return v;
  }

  private peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  private isOp(v: string): boolean {
    const t = this.peek();
    return !!t && t.t === "op" && t.v === v;
  }

  private or(): Value {
    let left = this.and();
    while (this.isOp("||")) {
      this.pos++;
      const right = this.and();
      left = truthy(left) || truthy(right);
    }
    return left;
  }

  private and(): Value {
    let left = this.cmp();
    while (this.isOp("&&")) {
      this.pos++;
      const right = this.cmp();
      left = truthy(left) && truthy(right);
    }
    return left;
  }

  private cmp(): Value {
    const left = this.unary();
    const t = this.peek();
    if (t && t.t === "op" && ["==", "!=", "<", "<=", ">", ">="].includes(t.v)) {
      this.pos++;
      const right = this.unary();
      return compare(t.v, left, right);
    }
    return left;
  }

  private unary(): Value {
    if (this.isOp("!")) {
      this.pos++;
      return !truthy(this.unary());
    }
    return this.atom();
  }

  private atom(): Value {
    const t = this.peek();
    if (!t) return false;
    if (t.t === "op" && t.v === "(") {
      this.pos++;
      const v = this.or();
      if (this.isOp(")")) this.pos++;
      return v;
    }
    this.pos++;
    if (t.t === "num") return t.v;
    if (t.t === "str") return t.v;
    if (t.t === "id") {
      if (t.v === "true") return true;
      if (t.v === "false") return false;
      return lookup(t.v, this.ctx) ?? false;
    }
    return false;
  }
}

/** Compare two values. Numbers compare numerically; otherwise by string form. */
function compare(op: string, a: Value, b: Value): boolean {
  if (op === "==") return eq(a, b);
  if (op === "!=") return !eq(a, b);
  const na = Number(a);
  const nb = Number(b);
  const numeric = !Number.isNaN(na) && !Number.isNaN(nb);
  const x = numeric ? na : String(a);
  const y = numeric ? nb : String(b);
  if (op === "<") return x < y;
  if (op === "<=") return x <= y;
  if (op === ">") return x > y;
  if (op === ">=") return x >= y;
  return false;
}

/** Equality: same type compares directly; cross-type compares by string form. */
function eq(a: Value, b: Value): boolean {
  if (typeof a === typeof b) return a === b;
  return String(a) === String(b);
}

/** Evaluate `src` to a Value against `ctx`. Total: never throws. */
export function evalExpr(src: string, ctx: EvalContext): Value {
  return new Parser(lex(src), ctx).eval();
}

/** Evaluate `src` as a boolean guard (truthiness of the result). */
export function evalGuard(src: string, ctx: EvalContext): boolean {
  return truthy(evalExpr(src, ctx));
}
