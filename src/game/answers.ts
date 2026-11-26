/**
 * The answers of the skills for the parents' report (the customer's word of 2026-11-26: «отчёт … делаем»): every task
 * recorded (src/game/skills.ts `recordTask`) leaves its answer - the last ANSWERS_KEPT of a skill (`save.answers`) and
 * the day's sums (`save.skillDays`, the last SKILL_DAYS_KEPT days). New optional fields of the save, no new version.
 * `skillReport` reads them for the parents' section (src/ui/ui.ts): the share right of the last answers, the mean
 * time of an answer, the kinds hardest for the child now, this week against the week before.
 */
import { ANSWERS_KEPT, SKILL_DAYS_KEPT, type Save, type SkillAnswer } from '../core/save';
import { dayKey } from './playtime';

/** ms: an answer timed longer than this (the child went away from the screen) is counted as this. */
export const MS_MAX = 120_000;
/** The wrong answers of a kind among the last ones from which it is named hard. */
export const HARD_WRONG = 3;

/** One answer: the task's type, whether it was right at the first try with no helper, its ms (none for a task in the world). */
export interface AnswerNote { type: string; ok: boolean; ms?: number }

/** Writes the answer `a` of `skill` on the day `day`: into the last answers and the day's sums, the oldest dropped. */
export function noteAnswer(s: Pick<Save, 'answers' | 'skillDays'>, skill: string, a: AnswerNote, day = dayKey(new Date())) {
  const ms = a.ms === undefined || !Number.isFinite(a.ms) || a.ms < 0 ? undefined : Math.round(Math.min(a.ms, MS_MAX));
  const list = ((s.answers ??= {})[skill] ??= []);
  list.push({ t: a.type, ok: a.ok ? 1 : 0, d: day, ...(ms === undefined ? {} : { ms }) });
  if (list.length > ANSWERS_KEPT) list.splice(0, list.length - ANSWERS_KEPT);
  const days = (s.skillDays ??= {});
  const c = ((days[day] ??= {})[skill] ??= { n: 0, ok: 0, ms: 0, k: 0 });
  c.n++; if (a.ok) c.ok++;
  if (ms !== undefined) { c.ms += ms; c.k++; }
  for (const old of Object.keys(days).sort().slice(0, -SKILL_DAYS_KEPT)) delete days[old];
}

export interface SkillReport {
  /** The last answers, the oldest first: right at the first try or not. */
  last: boolean[];
  /** Of them right. */
  right: number;
  /** The mean ms of the last answers that were timed; null - none was. */
  meanMs: number | null;
  /** The types with the most wrong answers among the last ones (HARD_WRONG at least), the hardest first, two at most. */
  hard: string[];
  /** This week (today and the 6 days before) against the 7 before it: answers and right ones; the trend when both have answers. */
  week: { now: { n: number; ok: number }; before: { n: number; ok: number }; trend: 'up' | 'same' | 'down' | null };
}

/** The local day `n` days before `day` (YYYY-MM-DD). */
const back = (day: string, n: number) => { const [y, m, d] = day.split('-').map(Number); return dayKey(new Date(y, m - 1, d - n)); };

/** The report of `skill` as of the day `today`. */
export function skillReport(s: Pick<Save, 'answers' | 'skillDays'>, skill: string, today = dayKey(new Date())): SkillReport {
  const list: readonly SkillAnswer[] = s.answers?.[skill] ?? [];
  const timed = list.filter((a) => a.ms !== undefined);
  const wrongBy = new Map<string, number>();
  for (const a of list) if (!a.ok) wrongBy.set(a.t, (wrongBy.get(a.t) ?? 0) + 1);
  const hard = [...wrongBy.entries()].filter(([, n]) => n >= HARD_WRONG).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([t]) => t);
  const sum = (from: number, to: number) => {
    let n = 0, ok = 0;
    for (let i = from; i < to; i++) { const c = s.skillDays?.[back(today, i)]?.[skill]; if (c) { n += c.n; ok += c.ok; } }
    return { n, ok };
  };
  const now = sum(0, 7), before = sum(7, 14);
  let trend: SkillReport['week']['trend'] = null;
  if (now.n > 0 && before.n > 0) {
    const d = now.ok / now.n - before.ok / before.n;
    trend = d > 0.1 ? 'up' : d < -0.1 ? 'down' : 'same';
  }
  return {
    last: list.map((a) => a.ok === 1), right: list.filter((a) => a.ok === 1).length,
    meanMs: timed.length ? timed.reduce((t, a) => t + (a.ms ?? 0), 0) / timed.length : null,
    hard, week: { now, before, trend },
  };
}
