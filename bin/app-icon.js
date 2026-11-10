/*
 * The app icon for desktop and HarmonyOS projects: build/icon.png (a square PNG).
 * A project's own icon is never touched. Without one, the Kreft logo is copied; if the package has no logo file, a plain
 * square icon is drawn, so tools that need an icon (tauri icon, DevEco Studio) never fail on a missing file.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc(buf) { return zlib.crc32(buf) >>> 0; }
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, sum]);
}

// A size x size PNG: rounded violet square with a lighter rounded square in the middle.
function placeholderPng(size = 1024) {
  const bg = [79, 70, 229], fg = [224, 231, 255];
  const rows = Buffer.alloc((size * 4 + 1) * size);
  const r = size * 0.22, inner0 = size * 0.3, inner1 = size * 0.7, ir = size * 0.08;
  const inside = (x, y, a, b, rad) => {
    if (x < a || x >= b || y < a || y >= b) return false;
    const cx = x < a + rad ? a + rad : x > b - rad ? b - rad : x;
    const cy = y < a + rad ? a + rad : y > b - rad ? b - rad : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
  };
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    rows[row] = 0;
    for (let x = 0; x < size; x++) {
      const o = row + 1 + x * 4;
      const on = inside(x, y, 0, size, r);
      const c = inside(x, y, inner0, inner1, ir) ? fg : bg;
      rows[o] = c[0]; rows[o + 1] = c[1]; rows[o + 2] = c[2]; rows[o + 3] = on ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

// Returns the path of build/icon.png, making it when the project has none. `made` tells whether it was written now.
function ensureIcon(root) {
  const file = path.join(root, 'build', 'icon.png');
  if (fs.existsSync(file)) return { file, made: false };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const logo = path.join(__dirname, '..', 'assets', 'logo-mark.png');
  if (fs.existsSync(logo)) fs.copyFileSync(logo, file);
  else fs.writeFileSync(file, placeholderPng(1024));
  return { file, made: true };
}

module.exports = { ensureIcon, placeholderPng };
