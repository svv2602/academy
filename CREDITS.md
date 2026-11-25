# Credits

3D models: **Quaternius** (https://quaternius.com) — CC0 1.0 packs: Ultimate Nature, Ultimate Animated Animals,
Medieval Village, Platformer Game Kit, Ultimate RPG, plus single models (castle, fantasy house, mushroom)
fetched from https://poly.pizza.

Textured trees, plants, flowers and rocks: Quaternius "Stylized Nature MegaKit" (CC0 1.0), converted from the
OpenUSD copy at https://github.com/chibifire-stages/quaternius-stage with `tools/usd2glb.py`.

Heroine: Quaternius "Universal Base Characters", "Modular Character Outfits - Fantasy" (free standard versions)
and "Universal Animation Library" — all CC0 1.0; original glTF files taken from the public mirror
https://github.com/kirbycope/godot-3d-player-controller-v2 and packed with `tools/pack_hero.mjs`.

Heroine as a child (TECH-14; `models-src/hero/child.glb`, built with `tools/hero/`): the mesh and its texture
were generated with the Meshy service (https://www.meshy.ai) on a paid plan on 2026-11-15; under Meshy's terms for
paid plans the model belongs to the customer (not CC0). Skeleton and animations: Quaternius "Universal Animation
Library" — CC0 1.0. The queen keeps the heroine models above.

The cat (`models-src/extra/cat.glb`): the mesh, its texture, its skeleton (four legs) and its clips (Meshy's cat
idle, walk, run and "act cute" for its dance) were generated with the Meshy service (https://www.meshy.ai) on a paid
plan on 2026-11-19; under Meshy's terms for paid plans the model belongs to the customer (not CC0), the skeleton and
the clips are Meshy's "Service Assets", licensed for use as part of the model. Joined, simplified and its texture
shrunk in Blender for this game.

The characters of the forest (world 2; `models-src/forest/`, shipped with the world from `worlds-data/forest/`): the
meshes and textures of Borovik and Tropka (the gnomes), Kolyuchka (the hedgehog), Shustrik (the squirrel) and Mudrena
(the owl) were generated with the Meshy service (https://www.meshy.ai) on a paid plan on 2026-11-20 (the squirrel and
the owl) and 2026-11-21 (the gnomes and the hedgehog); under Meshy's terms for paid plans the models belong to the
customer (not CC0). Skeletons and clips: the gnomes' skeleton and clips (idle, "Big Wave Hello" for their talk, walk,
run) are Meshy's "Service Assets", licensed for use as part of the model; the squirrel and the hedgehog have Meshy's
skeleton ("Service Assets") with our own clips made in Blender for this game; the owl has our own skeleton and clips
(Meshy rigs no birds). The owlet is the owl's model made small, its texture paler and its head larger, in Blender.
Joined and their textures shrunk in Blender for this game.

The characters of the sea (world 3; `models-src/sea/`, shipped with the world from `worlds-data/sea/`): the meshes and
textures of Khvylia (the mermaid queen), Bulk (the little sea dragon), Pantsyr (the turtle), Kleshnya (the crab) and
Iskorka (the lantern fish) were generated with the Meshy service (https://www.meshy.ai) on a paid plan on 2026-11-22;
under Meshy's terms for paid plans the models belong to the customer (not CC0). Skeletons and clips: our own, made in
Blender for this game (Meshy rigs only bipeds and quadrupeds). Set right in Blender: a stray growth by the turtle's head
cut away, the crab's hat let down onto his eyes and his eyes made black, the fish's stalk and its light added as our own
shapes. Joined and their textures shrunk in Blender for this game.

The characters of the Sweet Land (world 4; `models-src/sweet/`, shipped with the world from `worlds-data/sweet/`): the
meshes and textures of Pastila (the fairy confectioner), Imbir (the gingerbread man), Tyanuchka (the marmalade strongman)
and Kakao (the old miller) were generated with the Meshy service (https://www.meshy.ai) on a paid plan on 2026-11-24;
under Meshy's terms for paid plans the models belong to the customer (not CC0). Skeletons and clips: our own, made in
Blender for this game. Set right in Blender: Pastila's wings added as our own shapes (Meshy gave her none), the faces
joining Pastila's hands to her skirt, Tyanuchka's fists to his belt and Kakao's right hand to his apron cut, Kakao's
near-black beard made chocolate. Their textures shrunk in Blender for this game. Polosatik (the candy-cane watchman) is
made whole in Blender by code for this game, with no generated part: our own, the customer's.

The characters of the Sky Islands (world 5; `models-src/sky/`, shipped with the world from `worlds-data/sky/`): the
meshes and textures of Lazur (the cloud fairy), Mertsal (the stargazer) and Veterok (the ship's boy) were generated with
the Meshy service (https://www.meshy.ai) on a paid plan on 2026-11-25; under Meshy's terms for paid plans the models
belong to the customer (not CC0). Skeletons and clips: our own, made in Blender for this game; Lazur's grey-blue texture
recoloured in code by the parts of her figure (skin, hair, dress, wings, star). Their textures shrunk for this game.
Gromykhalo, the good dragon, is "Dragon Evolved" by Quaternius (https://poly.pizza/m/LlwD0QNUPj) — "Public Domain (CC0)"
on its page (read 2026-11-25); its clips renamed for the game (Flying_Idle as Idle, Yes as Talk, Fast_Flying as Cheer).

The things of the Sky Islands (world 5, step 6b; `models-src/sky/airship.glb`, `windmill.glb`, `drakey.glb`, shipped
with the world from `worlds-data/sky/`), three models by Quaternius, each "Public Domain (CC0)" on its page (read
2026-11-25): "Sail Ship" (https://poly.pizza/m/cIzO4MBPqI), the airship's hull under our own red balloon; "Tower
Windmill" (https://poly.pizza/m/52yaPyaAAG), the three windmills, its blades their turning sails; "Dragon"
(https://poly.pizza/m/VBvzjFIYws), the little dragons, in its own flying clip. Their materials' colours put into their
vertices in code, in the islands' colours.
Pushok, the Sky Islands' cloud lamb (`models-src/sky/pushok.glb`), is made whole in Blender by code for this game, with
no generated part: our own, the customer's.

The sunken ship of the sea (world 3, 2026-11-22; `models-src/sea/kenney/ship_wreck.glb`, shipped with the world from
`worlds-data/sea/`): Kenney's "Ship Wreck" (https://poly.pizza/m/4qia78IBmZ, https://kenney.nl) — CC0 1.0 on its page
(read 2026-11-22); its materials' colours put into its vertices in code. The sea's other landmarks — the castle of
shells, the throne, the grotto, the arch of the trench, the great shell, the reef's fans — and the cabin's door are our own
simple shapes built in code (`src/worlds/sea/landmarks.ts`); the chest is the Platformer Game Kit's (above).

The heroine's swimming in the sea (world 3; in the build `models/sea/swim.glb`, from
`worlds-test/probe/models/probe/swim.glb`, `tools/vite-worlds.mjs` WORLD_EXTRA_FILES): the clips `Swim_Fwd_Loop` and `Swim_Idle_Loop`
of Quaternius "Universal Animation Library" (`UAL1.glb`) — CC0 1.0, the source of the heroine's clips (above); cut and
compressed with `tools/pack_world_clips.mjs`, clips only, no mesh (`worlds-test/probe/README.md`).

The forest's things (world 2, 2026-11-21): the bridges, the fence, the woodpiles and the signpost are Kenney's
"Nature Kit" 2.1 (https://kenney.nl/assets/nature-kit) — CC0 1.0 (its License.txt: "Creative Commons Zero, CC0");
`models-src/forest/kenney/`. Its undergrowth — bushes, plants, flowers, mossy stones, the mossy log and the berry bush —
is Quaternius "Ultimate Nature" (CC0 1.0, above), moved from `models-unused/nature_pack/` to `models-src/forest/plants/`.
The mushroom houses, the elder's tower and the lanterns are our own shapes (`src/worlds/forest/village.ts`, `decor.ts`).

Heroine's items (crown, wreath, wizard hat, star earrings, star and crystal wands, butterfly wings, and the free items
of the four looks: tiara, little wizard cap, elf ears, flower, moon and leaf wands; `models-src/items/`): our own simple shapes made in Blender for this game with
`tools/items/items.py` — not taken from any pack or service.

The pets' items (the cat's bow, collar, gold bell and hat; the fawn's bell, ribbon, star crown and wreath;
`models-src/pet_items/`): our own simple shapes made in Blender for this game with `tools/items/pet_items.py` on
2026-11-20 — not taken from any pack or service.

Creatures of the first world (`models-src/creatures/`): Quaternius "Bird" (https://poly.pizza/m/gYYC0gYMnw),
"Clownfish" (https://poly.pizza/m/769fHo3eEB) and "Fish" (https://poly.pizza/m/XWl86YFtpF), single models fetched
from https://poly.pizza (its fish packs, https://quaternius.com/packs/animatedfish.html, are CC0 too) — each CC0 1.0
on its page; made static (no skeleton, no animation; the bird's texture turned into flat colours) in Blender.
The fairies and their little flowers are our own simple shapes built in code (`src/worlds/fairy/creatures.ts`),
not taken from any pack or service.

The hub, the Great Tree (`src/worlds/hub/tree-look.ts`, `src/worlds/hub/arch-look.ts`): the trunk, roots and branches,
the stone arches, their veil (a shader), the vines, the nests, the artifacts of the four next worlds, the flowers,
fireflies, grass, lantern fruits and birds are our own simple shapes built in code, not taken from any pack or
service. Its crown reuses the leaves of Quaternius "Ultimate Nature" CommonTree_1-4, its mushrooms the single
mushroom model and the crystal's nest the Crystal2 of "Ultimate RPG" (all CC0 1.0, credited above) - files the first
world already has, no new files.

Cut-scene frames of the first world (WORLD-13; `public/story/`), each file:
`w1_intro_1.webp`, `w1_intro_2.webp`, `w1_intro_3.webp`, `w1_intro_4.webp`, `w1_intro_5.webp`, `w1_crystal_1.webp`,
`w1_crystal_2.webp`, `w1_crystal_3.webp` — generated with the model `google/gemini-3-pro-image` through the OpenRouter
service on 2026-11-15, dedicated to the public domain under CC0 1.0;
viewed and accepted by the customer on 2026-11-15.
Their depth maps `w1_intro_1_depth.webp`, `w1_intro_2_depth.webp`, `w1_intro_3_depth.webp`, `w1_intro_4_depth.webp`,
`w1_intro_5_depth.webp`, `w1_crystal_1_depth.webp`, `w1_crystal_2_depth.webp`, `w1_crystal_3_depth.webp` — computed
from those frames on 2026-11-15 with Depth Anything V2 Small (Apache-2.0, the ONNX export of onnx-community) by
`tools/depth.py`, locally; the model is not part of the game. Dedicated to the public domain under CC0 1.0.

Cut-scene frames of the second world, the Enchanted Forest (WORLD-13; `worlds-data/forest/story/forest/`, in the build
`story/forest/`), each file: `w2_intro_1.webp`, `w2_intro_2.webp`, `w2_intro_3.webp`, `w2_back_1.webp`, `w2_back_2.webp`,
`w2_back_3.webp` — generated with the model `google/gemini-3-pro-image` through the OpenRouter service on 2026-11-22,
dedicated to the public domain under CC0 1.0; viewed and accepted by
the customer on 2026-11-22.
Their depth maps `w2_intro_1_depth.webp`, `w2_intro_2_depth.webp`, `w2_intro_3_depth.webp`, `w2_back_1_depth.webp`,
`w2_back_2_depth.webp`, `w2_back_3_depth.webp` — computed from those frames on 2026-11-22 with Depth Anything V2 Small
(Apache-2.0, the ONNX export of onnx-community) by `tools/depth.py`, locally; the model is not part of the game.
Dedicated to the public domain under CC0 1.0.

Cut-scene frames of the third world, the Underwater Kingdom (WORLD-13; `worlds-data/sea/story/sea/`, in the build
`story/sea/`), each file: `w3_intro_1.webp`, `w3_intro_2.webp`, `w3_intro_3.webp`, `w3_back_1.webp`, `w3_back_2.webp`,
`w3_back_3.webp` — generated with the model `google/gemini-3-pro-image` through the OpenRouter service on 2026-11-23,
dedicated to the public domain under CC0 1.0; viewed and accepted by the customer on 2026-11-23.
Their depth maps `w3_intro_1_depth.webp`, `w3_intro_2_depth.webp`, `w3_intro_3_depth.webp`, `w3_back_1_depth.webp`,
`w3_back_2_depth.webp`, `w3_back_3_depth.webp` — computed from those frames on 2026-11-23 with Depth Anything V2 Small
(Apache-2.0, the ONNX export of onnx-community) by `tools/depth.py`, locally; the model is not part of the game.
Dedicated to the public domain under CC0 1.0.

Cut-scene frames of the fourth world, the Sweet Land (WORLD-13; `worlds-data/sweet/story/sweet/`, in the build
`story/sweet/`), each file: `w4_intro_1.webp`, `w4_intro_2.webp`, `w4_intro_3.webp`, `w4_back_1.webp`, `w4_back_2.webp`,
`w4_back_3.webp` — generated with the model `google/gemini-3-pro-image` through the OpenRouter service on 2026-11-25
(the second try of `w4_intro_3`, `w4_back_1` and `w4_back_2`), dedicated to the public domain under CC0 1.0; viewed and
accepted by the customer on 2026-11-25. `w4_intro_3` is moved down by 7 % of its height, the sky above drawn on by us. The five lights over `w4_intro_3` and `w4_back_1` are not in the files: the game
draws them (`src/worlds/sweet/story.ts`).
Their depth maps `w4_intro_1_depth.webp`, `w4_intro_2_depth.webp`, `w4_intro_3_depth.webp`, `w4_back_1_depth.webp`,
`w4_back_2_depth.webp`, `w4_back_3_depth.webp` — computed from those frames on 2026-11-25 with Depth Anything V2 Small
(Apache-2.0, the ONNX export of onnx-community) by `tools/depth.py`, locally; the model is not part of the game.
Dedicated to the public domain under CC0 1.0.

Voice (`public/voice/`, `public/bank/`, and of the forest, published 2026-11-24, `worlds-data/forest/voice/` - in the
build `voice/forest/`; every clip has its record in `voice/qa.json`: text, intonation, model, voice):
synthesized speech of the Gemini API (Google), model `gemini-2.5-flash-preview-tts`, its prebuilt voices (the
narrator Puck; each character's voice is set in `src/worlds/<id>/voices.ts`). 249 clips were recorded for this game
with `tools/gen_voice.py` on 2026-11-13 to 2026-11-20 (a paid API key), and the forest's 81 the same way on 2026-11-22
and 2026-11-23; 394 clips of the earlier game, recorded with
the same model and voice, were copied with `tools/import_old_voice.py` (VOICE-07), without any clip that speaks a
name. Each clip was checked by transcribing it back with an OpenAI speech-to-text model; the transcription is not
part of the game. Rights: the Gemini API Additional Terms of Service (https://ai.google.dev/gemini-api/terms, effective
March 23, 2026), "Use of Generated Content": "Google won't claim ownership over that content", and "You're responsible
for your use of generated content, and for the use of that content by anyone you share it with."
The same terms, "Age Requirements", say the Services are not to be used "as part of a website, application, or other
service (collectively, "API Clients") that is directed towards or is likely to be accessed by individuals under the
age of 18". Decision of the customer, 2026-11-20: the game does not call the API, its clips are recorded beforehand;
the service is kept, and the voice goes on being recorded with it.

Code: Three.js (MIT).
