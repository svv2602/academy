# Credits

3D models: **Quaternius** (https://quaternius.com) — CC0 1.0 packs: Ultimate Nature, Ultimate Animated Animals,
Medieval Village, Platformer Game Kit, Ultimate RPG, plus single models (cat, castle, fantasy house, mushroom)
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

Heroine's items (crown, wreath, wizard hat, star earrings, star and crystal wands, butterfly wings, and the free items
of the four looks: tiara, little wizard cap, elf ears, flower, moon and leaf wands; `models-src/items/`): our own simple shapes made in Blender for this game with
`tools/items/items.py` — not taken from any pack or service.

Creatures of the first world (`models-src/creatures/`): Quaternius "Bird" (https://poly.pizza/m/gYYC0gYMnw),
"Clownfish" (https://poly.pizza/m/769fHo3eEB) and "Fish" (https://poly.pizza/m/XWl86YFtpF), single models fetched
from https://poly.pizza (its fish packs, https://quaternius.com/packs/animatedfish.html, are CC0 too) — each CC0 1.0
on its page; made static (no skeleton, no animation; the bird's texture turned into flat colours) in Blender.
The fairies and their little flowers are our own simple shapes built in code (`src/worlds/fairy/creatures.ts`),
not taken from any pack or service.

Cut-scene frames of the first world (WORLD-13; `public/story/`), each file:
`w1_intro_1.webp`, `w1_intro_2.webp`, `w1_intro_3.webp`, `w1_intro_4.webp`, `w1_intro_5.webp`, `w1_crystal_1.webp`,
`w1_crystal_2.webp`, `w1_crystal_3.webp` — generated with the model `google/gemini-3-pro-image` through the OpenRouter
service on 2026-11-15 (saving of the requests in the account turned off), dedicated to the public domain under CC0 1.0;
viewed and accepted by the customer on 2026-11-15.
Their depth maps `w1_intro_1_depth.webp`, `w1_intro_2_depth.webp`, `w1_intro_3_depth.webp`, `w1_intro_4_depth.webp`,
`w1_intro_5_depth.webp`, `w1_crystal_1_depth.webp`, `w1_crystal_2_depth.webp`, `w1_crystal_3_depth.webp` — computed
from those frames on 2026-11-15 with Depth Anything V2 Small (Apache-2.0, the ONNX export of onnx-community) by
`tools/depth.py`, locally; the model is not part of the game. Dedicated to the public domain under CC0 1.0.

Code: Three.js (MIT).
