const fs = require('fs');
const path = require('path');

// Simple, standalone GIF encoder for 256 colors
class NeuQuant {
  constructor(pixels, samplefac = 10) {
    this.network = [];
    this.netindex = new Int32Array(256);
    this.bias = new Int32Array(256);
    this.freq = new Int32Array(256);
    this.radpower = new Int32Array(32);
    this.pixels = pixels;
    this.samplefac = samplefac;
    this.init();
  }

  init() {
    for (let i = 0; i < 256; i++) {
      const v = (i << 4);
      this.network[i] = [v, v, v];
      this.freq[i] = 256;
      this.bias[i] = 0;
    }
  }

  buildPalette() {
    // Collect distinct colors or use a fast standard quantizer
    const map = new Map();
    const len = this.pixels.length;
    for (let i = 0; i < len; i += 4) {
      const r = this.pixels[i] & 0xF8;
      const g = this.pixels[i+1] & 0xF8;
      const b = this.pixels[i+2] & 0xF8;
      const key = (r << 16) | (g << 8) | b;
      map.set(key, (map.get(key) || 0) + 1);
    }
    const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    const palette = [];
    for (let i = 0; i < 256; i++) {
      if (i < sorted.length) {
        const k = sorted[i][0];
        palette.push([(k >> 16) & 0xFF, (k >> 8) & 0xFF, k & 0xFF]);
      } else {
        palette.push([0, 0, 0]);
      }
    }
    return palette;
  }
}

// LZW Encoder for GIF
function lzwEncode(width, height, indexedPixels, colorDepth) {
  const initCodeSize = Math.max(2, colorDepth);
  const accum = [];
  let accumCount = 0;
  const out = [];

  function flushPacket() {
    if (accumCount > 0) {
      out.push(accumCount);
      for (let i = 0; i < accumCount; i++) out.push(accum[i]);
      accumCount = 0;
    }
  }

  let curAccum = 0;
  let curBits = 0;

  function outputCode(code, codeSize) {
    curAccum |= (code << curBits);
    curBits += codeSize;
    while (curBits >= 8) {
      accum[accumCount++] = curAccum & 0xFF;
      if (accumCount === 254) flushPacket();
      curAccum >>= 8;
      curBits -= 8;
    }
  }

  const clearCode = 1 << initCodeSize;
  const eofCode = clearCode + 1;
  let codeSize = initCodeSize + 1;
  let maxCode = 1 << codeSize;

  let table = new Map();
  function resetTable() {
    table.clear();
    for (let i = 0; i < clearCode; i++) {
      table.set(String(i), i);
    }
    codeSize = initCodeSize + 1;
    maxCode = 1 << codeSize;
  }

  resetTable();
  outputCode(clearCode, codeSize);

  let prefix = '';
  for (let i = 0; i < indexedPixels.length; i++) {
    const k = indexedPixels[i];
    const combined = prefix === '' ? String(k) : prefix + ',' + k;
    if (table.has(combined)) {
      prefix = combined;
    } else {
      outputCode(table.get(prefix), codeSize);
      if (table.size < 4096) {
        table.set(combined, table.size + 2);
        if (table.size + 2 > maxCode && codeSize < 12) {
          codeSize++;
          maxCode = 1 << codeSize;
        }
      } else {
        outputCode(clearCode, codeSize);
        resetTable();
      }
      prefix = String(k);
    }
  }
  if (prefix !== '') {
    outputCode(table.get(prefix), codeSize);
  }
  outputCode(eofCode, codeSize);

  if (curBits > 0) {
    accum[accumCount++] = curAccum & 0xFF;
    if (accumCount === 254) flushPacket();
  }
  flushPacket();
  out.push(0x00); // block terminator
  return { initCodeSize, data: Buffer.from(out) };
}

function createGif(width, height, frames, delayCentisecs = 10) {
  // Global palette from first frame or merged
  // Each frame: { rgbaBuffer }
  // Find fixed 256 palette from all frames
  const colorMap = new Map();
  // Sample frames to build a 256 color palette
  for (const frame of frames) {
    const buf = frame.rgba;
    for (let i = 0; i < buf.length; i += 16) {
      const r = buf[i] & 0xF8;
      const g = buf[i+1] & 0xF8;
      const b = buf[i+2] & 0xF8;
      const k = (r << 16) | (g << 8) | b;
      colorMap.set(k, (colorMap.get(k) || 0) + 1);
    }
  }

  const sorted = Array.from(colorMap.entries()).sort((a, b) => b[1] - a[1]);
  const palette = [];
  for (let i = 0; i < 256; i++) {
    if (i < sorted.length) {
      const k = sorted[i][0];
      palette.push([(k >> 16) & 0xFF, (k >> 8) & 0xFF, k & 0xFF]);
    } else {
      palette.push([0, 0, 0]);
    }
  }

  // Fast nearest color lookup cache
  const cache = new Map();
  function nearestColorIndex(r, g, b) {
    const key = ((r & 0xF8) << 16) | ((g & 0xF8) << 8) | (b & 0xF8);
    if (cache.has(key)) return cache.get(key);
    let bestDist = Infinity;
    let bestIdx = 0;
    for (let i = 0; i < 256; i++) {
      const pr = palette[i][0], pg = palette[i][1], pb = palette[i][2];
      const dr = r - pr, dg = g - pg, db = b - pb;
      const dist = dr*dr*2 + dg*dg*4 + db*db*3;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
        if (dist === 0) break;
      }
    }
    cache.set(key, bestIdx);
    return bestIdx;
  }

  const chunks = [];
  // Header: GIF89a
  chunks.push(Buffer.from('GIF89a'));
  // Logical Screen Descriptor
  const lsd = Buffer.alloc(7);
  lsd.writeUInt16LE(width, 0);
  lsd.writeUInt16LE(height, 2);
  lsd[4] = 0xF7; // Global Color Table present, 8 bits/pixel, 256 colors
  lsd[5] = 0x00; // BG Color Index
  lsd[6] = 0x00; // Pixel Aspect Ratio
  chunks.push(lsd);

  // Global Color Table
  const gct = Buffer.alloc(768);
  for (let i = 0; i < 256; i++) {
    gct[i * 3] = palette[i][0];
    gct[i * 3 + 1] = palette[i][1];
    gct[i * 3 + 2] = palette[i][2];
  }
  chunks.push(gct);

  // Netscape 2.0 Loop Block (infinite loop)
  chunks.push(Buffer.from([0x21, 0xFF, 0x0B, 0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30, 0x03, 0x01, 0x00, 0x00, 0x00]));

  for (let f = 0; f < frames.length; f++) {
    const frame = frames[f];
    const indexed = new Uint8Array(width * height);
    for (let i = 0, j = 0; i < frame.rgba.length; i += 4, j++) {
      indexed[j] = nearestColorIndex(frame.rgba[i], frame.rgba[i+1], frame.rgba[i+2]);
    }

    // Graphic Control Extension
    const gce = Buffer.from([
      0x21, 0xF9, 0x04,
      0x04, // disposal method: retain
      delayCentisecs & 0xFF, (delayCentisecs >> 8) & 0xFF,
      0x00, // transparent index
      0x00  // block terminator
    ]);
    chunks.push(gce);

    // Image Descriptor
    const id = Buffer.alloc(10);
    id[0] = 0x2C;
    id.writeUInt16LE(0, 1); // left
    id.writeUInt16LE(0, 3); // top
    id.writeUInt16LE(width, 5);
    id.writeUInt16LE(height, 7);
    id[9] = 0x00; // no local color table
    chunks.push(id);

    // Image Data
    const lzw = lzwEncode(width, height, indexed, 8);
    chunks.push(Buffer.from([lzw.initCodeSize]));
    chunks.push(lzw.data);
  }

  // Trailer
  chunks.push(Buffer.from([0x3B]));
  return Buffer.concat(chunks);
}

module.exports = { createGif };
