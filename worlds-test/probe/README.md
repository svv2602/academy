# Files of the probe world

The probe world (`src/worlds/probe/`) is a test world: the published game never has it. Its files live here, outside
`public/`, under the paths the game asks for them. Only the probe build (`vite build --mode probe --outDir dist-probe`,
made by `tools/worlds.mjs`, the step `worlds` of `npm run e2e`) copies them, with the same paths; this README is not
copied. `npm test` keeps `public/models` equal to `tools/models-used.json`, so nothing of a test world may lie there.

| File | What it is | Source |
|---|---|---|
| `models/probe/stump.glb` | the world's own model, put into the scene with `staticGeo('probe/stump', …)` | a byte-for-byte copy of `public/models/nature_pack/TreeStump_Moss.glb` (Quaternius, Ultimate Nature pack, CC0 1.0 — see `CREDITS.md`); no external textures |
| `models/probe/swim.glb` | the heroine's clips of this water world (`WorldDef.move`), loaded with `gltf('probe/swim')` and lent to her under the names `Swim` and `Float`; clips only, no mesh | `Swim_Fwd_Loop` and `Swim_Idle_Loop` of Quaternius "Universal Animation Library" (`UAL1.glb`, CC0 1.0 — the source of the heroine's clips, see `CREDITS.md`), cut and compressed by `node tools/pack_world_clips.mjs <UAL1.glb> worlds-test/probe/models/probe/swim.glb Swim_Fwd_Loop Swim_Idle_Loop`; the source is not in the repository |
| `story/probe/sign.webp` | the picture on the world's signboard, loaded as a texture | drawn for this world: a few plain SVG shapes turned into WebP with `sharp`, 256×128; no outside source |
| `voice/probe/probe_hi.mp3` | the clip of the world's one spoken line of its own, the greeting of its character (`probe_hi` in `src/worlds/probe/strings.ts`); listed in `src/worlds/probe/clips.json` | a byte-for-byte copy of `public/voice/h_count.mp3`, the clip of the shared line `h_count` («Порахуймо разом!», intonation `warm`, the narrator's voice): nothing was recorded for it |

A file added here must be loaded by the world: the step `worlds` fails when the page never asks for one of them, and
when one of them is not in a folder named after the world (`…/probe/…`).

## The clip of the voice

The voice of a next world lies in a folder of its world (`voice/<id>/`), apart from the voice of the core
(`public/voice/*.mp3`); this clip is what that path is tried on. The line `probe_hi` has exactly the text and the
intonation of the shared line `h_count`, so its clip is a copy of that line's clip and its check record in
`voice/qa.json` — under the name `probe/probe_hi` — is a copy of that line's record with `from` saying where it was
taken from. `python3 tools/gen_voice.py --dry-run` then finds the line recorded and sends nothing to the paid service.
`npm test` holds the copy to its source (`tools/gen_voice.test.mjs`, "the clip of the probe world").

If the clip of `h_count` is ever recorded anew, make the copy again (from the root of the repository):

    cp public/voice/h_count.mp3 worlds-test/probe/voice/probe/probe_hi.mp3
    python3 -c "import json, pathlib; p = pathlib.Path('voice/qa.json'); q = json.loads(p.read_text()); q['probe/probe_hi'] = {**q['h_count'], 'from': 'copy of h_count (public/voice/h_count.mp3)'}; p.write_text(json.dumps(q, ensure_ascii=False, indent=1) + '\n')"

`src/worlds/probe/clips.json` is written by `tools/gen_voice.py` after a recording; with nothing to record it stays as
it is (`["probe_hi"]`).
