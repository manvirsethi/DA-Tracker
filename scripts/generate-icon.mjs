import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const width = 512;
const height = 512;
const stride = width * 4 + 1;
const raw = Buffer.alloc(stride * height);

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = y * stride + 1 + x * 4;
  raw[offset] = r;
  raw[offset + 1] = g;
  raw[offset + 2] = b;
  raw[offset + 3] = a;
}

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x >= left + radius && x <= right - radius && y >= top && y <= bottom) return true;
  if (y >= top + radius && y <= bottom - radius && x >= left && x <= right) return true;

  const corners = [
    [left + radius, top + radius],
    [right - radius, top + radius],
    [left + radius, bottom - radius],
    [right - radius, bottom - radius],
  ];

  return corners.some(([cx, cy]) => {
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  });
}

function drawRect(left, top, right, bottom, colour) {
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      setPixel(x, y, ...colour);
    }
  }
}

for (let y = 0; y < height; y += 1) {
  raw[y * stride] = 0;
  for (let x = 0; x < width; x += 1) {
    setPixel(x, y, 239, 242, 255, 255);
  }
}

for (let y = 48; y <= 464; y += 1) {
  for (let x = 48; x <= 464; x += 1) {
    if (insideRoundedRect(x, y, 48, 48, 464, 464, 94)) {
      setPixel(x, y, 83, 102, 242, 255);
    }
  }
}

// Stylised D.
drawRect(142, 165, 171, 346, [255, 255, 255, 255]);
drawRect(171, 165, 233, 192, [255, 255, 255, 255]);
drawRect(171, 319, 233, 346, [255, 255, 255, 255]);
drawRect(226, 190, 255, 321, [255, 255, 255, 255]);

// Stylised A.
for (let y = 165; y <= 346; y += 1) {
  const progress = (y - 165) / 181;
  const half = Math.round(progress * 54);
  const left = 349 - half;
  const right = 349 + half;

  for (let dx = -8; dx <= 8; dx += 1) {
    setPixel(left + dx, y, 255, 255, 255, 255);
    setPixel(right + dx, y, 255, 255, 255, 255);
  }
}
drawRect(315, 259, 383, 278, [255, 255, 255, 255]);

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) {
    c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, checksum]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 6;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const output = resolve('src-tauri/app-icon.png');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, png);
console.log(`Generated valid 512x512 RGBA icon at ${output}`);
