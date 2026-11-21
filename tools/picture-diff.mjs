// How much two pictures of the game differ (WORLD-09: the magic of a world - tools/shot.mjs, tools/forest-grey.mjs).
//
// pictureDiffs(page, pics, pairs): `pics` - screenshots as base64 PNG; `pairs` - [a, b, top] each: the mean difference
// of the colours (0..1) of pics[a] and pics[b] over the top `top` of their rows (1: the whole picture, 0.2: its top fifth,
// the sky). Each picture is first scaled down to 160 pixels wide in the page itself (its canvas), so a picture of any
// size is compared the same way and a pixel of noise counts for little.
export async function pictureDiffs(page, pics, pairs) {
  return page.evaluate(async ([pics, pairs]) => {
    const px = async (b64) => {
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const cv = new OffscreenCanvas(160, Math.round((160 * bmp.height) / bmp.width)), x = cv.getContext('2d');
      x.drawImage(bmp, 0, 0, cv.width, cv.height);
      return { w: cv.width, h: cv.height, d: x.getImageData(0, 0, cv.width, cv.height).data };
    };
    const P = await Promise.all(pics.map(px));
    return pairs.map(([a, b, top]) => {
      const A = P[a], B = P[b], rows = Math.round(A.h * top);
      let s = 0, n = 0;
      for (let y = 0; y < rows; y++) for (let x = 0; x < A.w; x++) {
        const i = (y * A.w + x) * 4;
        s += Math.abs(A.d[i] - B.d[i]) + Math.abs(A.d[i + 1] - B.d[i + 1]) + Math.abs(A.d[i + 2] - B.d[i + 2]); n += 3;
      }
      return s / n / 255;
    });
  }, [pics, pairs]);
}

/** The thresholds of the magic's pictures: 0 and 1 differ over the whole and over the sky by more, and by 3 times two of the same. */
export const MAGIC_DIFF = { all: 0.02, sky: 0.02, same: 3 };
