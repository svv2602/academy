// Heroine (TECH-14), last step: gives the texture of the child model a name of its own.
// Blender exports the colour map as "Image_0"; tools/assets.mjs ships each texture as <model dir>/tex/<name>.webp,
// and hero/tex/ is shared with the old heroine (T_Ranger_BaseColor.webp, ...), so the child's map must not be "Image_0".
// Only the texture/image name changes; geometry, skin, material and the image bytes stay as they are.
//   node tools/hero/name_texture.mjs <in.glb> <out.glb> [name=T_Child_BaseColor]
import { createIO } from '../assets.mjs';

const [src, dest, name = 'T_Child_BaseColor'] = process.argv.slice(2);
if (!src || !dest) {
  console.error('usage: node tools/hero/name_texture.mjs <in.glb> <out.glb> [name]');
  process.exit(2);
}
const io = await createIO();
const doc = await io.read(src);
const textures = doc.getRoot().listTextures();
if (textures.length !== 1) throw new Error(`${src}: expected one texture, found ${textures.length}`);
textures[0].setName(name); // in a .glb the image has no URI, so tools/assets.mjs names the file after this
await io.write(dest, doc);
console.log(`${dest}: texture "${name}"`);
