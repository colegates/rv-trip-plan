#!/usr/bin/env node
/* Generate PWA icons (192x192, 512x512, 180x180 apple-touch-icon)
   Uses only Node.js built-ins (no external deps).
   Writes minimal valid PNGs with a simple mountain/tent design.
*/
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.join(__dirname, '..', 'icons');
fs.mkdirSync(OUT_DIR, { recursive: true });

/* ── Minimal PNG encoder ──────────────────────────────────────────────── */
function pngEncode(width, height, pixels) {
  /* pixels: Uint8Array of RGBA values, row by row */
  function chunk(type, data) {
    const len  = Buffer.alloc(4);  len.writeUInt32BE(data.length);
    const tBuf = Buffer.from(type, 'ascii');
    const crc  = crc32(Buffer.concat([tBuf, data]));
    const cBuf = Buffer.alloc(4);  cBuf.writeInt32BE(crc);
    return Buffer.concat([len, tBuf, data, cBuf]);
  }

  function crc32(buf) {
    let c = 0xFFFFFFFF;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    return (c ^ 0xFFFFFFFF) | 0;
  }

  /* IHDR */
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: RGB (we'll strip alpha for simplicity — actually use 6 for RGBA)
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  /* IDAT — raw scanlines with filter byte 0 */
  const rowLen = width * 4;
  const raw    = Buffer.alloc(height * (rowLen + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (rowLen + 1)] = 0; // filter None
    pixels.copy(raw, y * (rowLen + 1) + 1, y * rowLen, y * rowLen + rowLen);
  }
  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG sig
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── Draw icon ─────────────────────────────────────────────────────────── */
function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);

  const BG_R = 0x2d, BG_G = 0x5a, BG_B = 0x27;   /* forest green */
  const MT_R = 0xff, MT_G = 0xff, MT_B = 0xff;     /* white mountain */
  const SN_R = 0xc8, SN_G = 0xa0, SN_B = 0x6e;    /* earth (snow cap) */
  const TR_R = 0x1e, TR_G = 0x3a, TR_B = 0x1e;    /* dark green (tree) */

  const s = size;
  const cx = s / 2;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      /* Rounded rectangle background (simple circle mask) */
      const rad = s * 0.15;
      const dx  = Math.min(x, s-1-x) - rad;
      const dy  = Math.min(y, s-1-y) - rad;
      const inRR = dx >= 0 || dy >= 0 ? true :
                   (Math.hypot(Math.min(x, s-1-x) - rad, Math.min(y, s-1-y) - rad) <= rad);

      let r = BG_R, g = BG_G, b = BG_B, a = inRR ? 255 : 0;

      const nx = x / s, ny = y / s;

      /* Mountain triangle: peak at (0.5, 0.18), base from (0.05, 0.72) to (0.95, 0.72) */
      const peakX = 0.5,  peakY = 0.18;
      const baseL = 0.05, baseR = 0.95, baseY = 0.72;

      function side(ax, ay, bx, by, px, py) {
        return (bx-ax)*(py-ay) - (by-ay)*(px-ax);
      }
      const inMountain = side(peakX,peakY, baseR,baseY, nx,ny) <= 0 &&
                         side(baseR,baseY, baseL,baseY, nx,ny) <= 0 &&
                         side(baseL,baseY, peakX,peakY, nx,ny) <= 0;

      if (inMountain && a > 0) {
        /* Snow cap: upper 30% of mountain height */
        const capCutY = peakY + (baseY - peakY) * 0.32;
        if (ny < capCutY) {
          r = SN_R; g = SN_G; b = SN_B;
        } else {
          r = MT_R; g = MT_G; b = MT_B;
        }
      }

      /* Pine tree: left third of base */
      const treeX = 0.28, treeBaseY = 0.72, treeTipY = 0.50, treeHalfW = 0.09;
      const treeInTriangle = ny >= treeTipY && ny <= treeBaseY &&
        Math.abs(nx - treeX) <= treeHalfW * ((ny - treeTipY) / (treeBaseY - treeTipY));
      if (treeInTriangle && !inMountain && a > 0) {
        r = TR_R; g = TR_G; b = TR_B;
      }

      /* Tree trunk */
      if (nx >= treeX - 0.02 && nx <= treeX + 0.02 &&
          ny >= treeBaseY && ny <= treeBaseY + 0.06 && a > 0) {
        r = 0x8b; g = 0x5e; b = 0x3c;
      }

      const i = (y * s + x) * 4;
      pixels[i]   = r;
      pixels[i+1] = g;
      pixels[i+2] = b;
      pixels[i+3] = a;
    }
  }
  return pixels;
}

/* ── Generate & write ──────────────────────────────────────────────────── */
const sizes = [
  { size: 192, file: 'icon-192.png'        },
  { size: 512, file: 'icon-512.png'        },
  { size: 180, file: 'apple-touch-icon.png' },
];

for (const { size, file } of sizes) {
  const pixels = drawIcon(size);
  const png    = pngEncode(size, size, pixels);
  const dest   = path.join(OUT_DIR, file);
  fs.writeFileSync(dest, png);
  console.log(`✓ ${file} (${size}×${size}, ${(png.length/1024).toFixed(1)} KB)`);
}
console.log('Icons generated in icons/');
