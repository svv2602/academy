/**
 * The "adult" gate of the parents' section (PLAY-14): a multiplication of two numbers from 6 to 9.
 * No DOM here: the question is a pure function of the previous question and a source of randomness.
 */
export interface GateQuestion { a: number; b: number; answer: number; }

/** The smallest and the largest factor, both included. */
export const GATE_MIN = 6, GATE_MAX = 9;

/**
 * A new question. It never has the answer of `prev` (the question shown last time), so neither the same example
 * nor its mirror ("7 × 8" after "8 × 7") comes twice in a row: an answer learnt by heart does not open the next gate.
 * `rnd` is `Math.random`-like: a number from 0 (included) to 1 (not included).
 */
export function gateQuestion(prev: GateQuestion | null = null, rnd: () => number = Math.random): GateQuestion {
  const all: GateQuestion[] = [];
  for (let a = GATE_MIN; a <= GATE_MAX; a++) for (let b = GATE_MIN; b <= GATE_MAX; b++) all.push({ a, b, answer: a * b });
  const fresh = all.filter((q) => q.answer !== prev?.answer);
  return fresh[Math.min(fresh.length - 1, Math.floor(rnd() * fresh.length))];
}

/** Does what is typed open the gate? Only the whole right answer does: a part of it, a guess or nothing does not. */
export const gateOpens = (q: GateQuestion, typed: string) => typed.trim() === String(q.answer);
