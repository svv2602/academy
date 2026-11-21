import { beforeEach } from 'vitest';
import { dealState } from './game/deal';

// The deal of the day (src/game/deal.ts) lowers one price, a different one each day, read from the real calendar: a
// test that buys something would pass or fail by the date it is run on (2026-11-21: the funny potion was the deal,
// and the price asserted in src/game/supplies.test.ts was 8 stars off). Every test starts with the deal held, as the
// walkthrough holds it; the tests of the deal itself release it in their own beforeEach, which runs after this one.
beforeEach(() => { dealState.held = true; dealState.day = null; });
