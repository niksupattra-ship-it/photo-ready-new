import sharp from 'sharp';

/**
 * English-only cleanup for the OUTSIDE CUTOUT CONTOUR (not a face/skin mask).
 * The Natural result supplies edge RGB and alpha; Makeup supplies the interior.
 * A smooth, short feather prevents a visible new edge or band. The operation
 * runs once when the AI result is created, not whenever finishes are switched.
 */
export async function restoreEnglishMakeupSilhouette(naturalPng, aiPng, width, height) {
  const [{data: natural, info: source}, {data: makeup, info: edited}] = await Promise.all([
    sharp(naturalPng).ensureAlpha().raw().toBuffer({resolveWithObject: true}),
    sharp(aiPng).resize(width, height).ensureAlpha().raw().toBuffer({resolveWithObject: true})
  ]);
  if (!width || !height || source.width !== width || source.height !== height ||
      edited.width !== width || edited.height !== height ||
      source.channels !== 4 || edited.channels !== 4 ||
      natural.length !== width * height * 4 || makeup.length !== natural.length) {
    throw Error('ขนาดภาพแต่งหน้าไม่ตรงกับภาพฐาน');
  }

  const count = width * height;
  const output = Buffer.from(makeup);
  // Distance from the transparent/anti-aliased outer silhouette, in pixels.
  // A Uint16 two-pass Manhattan transform avoids expensive per-pixel searches.
  const distance = new Uint16Array(count);
  let hasCutout = false;
  for (let p = 0; p < count; p++) {
    const a = natural[p * 4 + 3];
    if (a < 250) hasCutout = true;
    const y = Math.floor(p / width), x = p - y * width;
    distance[p] = a < 250 || x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 0 : 0xffff;
    output[p * 4 + 3] = a;
  }
  // When Natural has no alpha silhouette, preserve the old behaviour and do
  // not attempt to infer a boundary from RGB (which could erase real details).
  if (!hasCutout) return sharp(output, {raw: {width, height, channels: 4}}).png().toBuffer();

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 1; x < width; x++) {
      const p = row + x;
      if (distance[p] > distance[p - 1] + 1) distance[p] = distance[p - 1] + 1;
    }
    for (let x = width - 2; x >= 0; x--) {
      const p = row + x;
      if (distance[p] > distance[p + 1] + 1) distance[p] = distance[p + 1] + 1;
    }
  }
  for (let y = 1; y < height; y++) {
    const row = y * width, previous = row - width;
    for (let x = 0; x < width; x++) {
      const p = row + x;
      if (distance[p] > distance[previous + x] + 1) distance[p] = distance[previous + x] + 1;
    }
  }
  for (let y = height - 2; y >= 0; y--) {
    const row = y * width, next = row + width;
    for (let x = 0; x < width; x++) {
      const p = row + x;
      if (distance[p] > distance[next + x] + 1) distance[p] = distance[next + x] + 1;
    }
  }

  const featherEnd = Math.max(4, Math.min(18, Math.round(Math.min(width, height) * 0.008)));
  const solidEdge = Math.max(1, Math.min(3, Math.floor(featherEnd * 0.25)));
  for (let p = 0; p < count; p++) {
    const d = distance[p];
    if (d >= featherEnd) continue; // interior Makeup pixels remain unchanged
    const t = Math.max(0, Math.min(1, (d - solidEdge) / (featherEnd - solidEdge)));
    const keepNatural = 1 - t * t * (3 - 2 * t);
    const j = p * 4;
    for (let c = 0; c < 3; c++) {
      output[j + c] = Math.round(natural[j + c] * keepNatural + makeup[j + c] * (1 - keepNatural));
    }
  }
  return sharp(output, {raw: {width, height, channels: 4}}).png().toBuffer();
}
