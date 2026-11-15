// The registry of worlds (ARCH-06): one line per world. src/main.ts reads it as `import * as worlds`, whose members
// come in the order of their names; the first one is the world the published game plays (`?world=<id>` with `?debug`
// picks another, src/game/world.ts `pickWorld`).
export { fairy } from './fairy';
