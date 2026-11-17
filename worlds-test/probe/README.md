# Files of the probe world

The probe world (`src/worlds/probe/`) is a test world: the published game never has it. Its files live here, outside
`public/`, under the paths the game asks for them. Only the probe build (`vite build --mode probe --outDir dist-probe`,
made by `tools/worlds.mjs`, the step `worlds` of `npm run e2e`) copies them, with the same paths; this README is not
copied. `npm test` keeps `public/models` equal to `tools/models-used.json`, so nothing of a test world may lie there.

| File | What it is | Source |
|---|---|---|
| `models/probe/stump.glb` | the world's own model, put into the scene with `staticGeo('probe/stump', …)` | a byte-for-byte copy of `public/models/nature_pack/TreeStump_Moss.glb` (Quaternius, Ultimate Nature pack, CC0 1.0 — see `CREDITS.md`); no external textures |
| `story/probe/sign.webp` | the picture on the world's signboard, loaded as a texture | drawn for this world: a few plain SVG shapes turned into WebP with `sharp`, 256×128; no outside source |

A file added here must be loaded by the world: the step `worlds` fails when the page never asks for one of them, and
when one of them is not in a folder named after the world (`…/probe/…`).
