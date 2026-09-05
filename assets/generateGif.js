const fs = require('fs');
const path = require('path');
const { createGif } = require('./gifEncoder');

const width = 640;
const height = 320;
const topPadding = 50;
const bottomPadding = 50;
const contentHeight = height - topPadding - bottomPadding; // 220px (from y=50 to y=270)

// 5x7 bitmap font for key text rendering
const FONT = {
  'A': [
    " ### ",
    "#   #",
    "#   #",
    "#####",
    "#   #",
    "#   #",
    "#   #"
  ],
  'B': [
    "#### ",
    "#   #",
    "#### ",
    "#   #",
    "#   #",
    "#### "
  ],
  'C': [
    " ####",
    "#    ",
    "#    ",
    "#    ",
    "#    ",
    " ####"
  ],
  'D': [
    "#### ",
    "#   #",
    "#   #",
    "#   #",
    "#   #",
    "#### "
  ],
  'E': [
    "#####",
    "#    ",
    "#### ",
    "#    ",
    "#    ",
    "#####"
  ],
  'F': [
    "#####",
    "#    ",
    "#### ",
    "#    ",
    "#    ",
    "#    "
  ],
  'G': [
    " ####",
    "#    ",
    "# ###",
    "#   #",
    "#   #",
    " ### "
  ],
  'H': [
    "#   #",
    "#   #",
    "#####",
    "#   #",
    "#   #",
    "#   #"
  ],
  'I': [
    "#####",
    "  #  ",
    "  #  ",
    "  #  ",
    "  #  ",
    "#####"
  ],
  'J': [
    "  ###",
    "   # ",
    "   # ",
    "   # ",
    "#  # ",
    " ##  "
  ],
  'K': [
    "#   #",
    "#  # ",
    "###  ",
    "#  # ",
    "#   #",
    "#   #"
  ],
  'L': [
    "#    ",
    "#    ",
    "#    ",
    "#    ",
    "#    ",
    "#####"
  ],
  'M': [
    "#   #",
    "## ##",
    "# # #",
    "#   #",
    "#   #",
    "#   #"
  ],
  'N': [
    "#   #",
    "##  #",
    "# # #",
    "#  ##",
    "#   #",
    "#   #"
  ],
  'O': [
    " ### ",
    "#   #",
    "#   #",
    "#   #",
    "#   #",
    " ### "
  ],
  'P': [
    "#### ",
    "#   #",
    "#### ",
    "#    ",
    "#    ",
    "#    "
  ],
  'Q': [
    " ### ",
    "#   #",
    "#   #",
    "# # #",
    "#  # ",
    " ## # "
  ],
  'R': [
    "#### ",
    "#   #",
    "#### ",
    "#  # ",
    "#   #",
    "#   #"
  ],
  'S': [
    " ####",
    "#    ",
    " ### ",
    "    #",
    "    #",
    "#### "
  ],
  'T': [
    "#####",
    "  #  ",
    "  #  ",
    "  #  ",
    "  #  ",
    "  #  "
  ],
  'U': [
    "#   #",
    "#   #",
    "#   #",
    "#   #",
    "#   #",
    " ### "
  ],
  'V': [
    "#   #",
    "#   #",
    "#   #",
    " # # ",
    " # # ",
    "  #  "
  ],
  'W': [
    "#   #",
    "#   #",
    "# # #",
    "# # #",
    "## ##",
    "#   #"
  ],
  'X': [
    "#   #",
    " # # ",
    "  #  ",
    " # # ",
    "#   #",
    "#   #"
  ],
  'Y': [
    "#   #",
    " # # ",
    "  #  ",
    "  #  ",
    "  #  ",
    "  #  "
  ],
  'Z': [
    "#####",
    "   # ",
    "  #  ",
    " #   ",
    "#    ",
    "#####"
  ],
  ' ': [
    "     ",
    "     ",
    "     ",
    "     ",
    "     ",
    "     "
  ],
  '-': [
    "     ",
    "     ",
    "#####",
    "     ",
    "     ",
    "     "
  ],
  '•': [
    "     ",
    " ##  ",
    " ##  ",
    "     ",
    "     ",
    "     "
  ],
  '.': [
    "     ",
    "     ",
    "     ",
    "     ",
    " ##  ",
    " ##  "
  ],
  ':': [
    " ##  ",
    " ##  ",
    "     ",
    " ##  ",
    " ##  ",
    "     "
  ],
  '2': [
    " ### ",
    "#   #",
    "    #",
    "  ## ",
    " #   ",
    "#####"
  ],
  '0': [
    " ### ",
    "#  ##",
    "# # #",
    "##  #",
    "#   #",
    " ### "
  ],
  '6': [
    " ### ",
    "#    ",
    "#### ",
    "#   #",
    "#   #",
    " ### "
  ]
};

function renderText(buf, text, startX, startY, scale, r, g, b) {
  let cx = startX;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch] || FONT[' '];
    const h = glyph.length;
    for (let row = 0; row < h; row++) {
      const line = glyph[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === '#') {
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              const px = cx + col * scale + dx;
              const py = startY + row * scale + dy;
              if (px >= 0 && px < width && py >= 0 && py < height) {
                const idx = (py * width + px) * 4;
                buf[idx] = r;
                buf[idx+1] = g;
                buf[idx+2] = b;
                buf[idx+3] = 255;
              }
            }
          }
        }
      }
    }
    cx += 6 * scale;
  }
}

function measureText(text, scale) {
  return text.length * 6 * scale;
}

const numFrames = 16;
const frames = [];

for (let f = 0; f < numFrames; f++) {
  const buf = Buffer.alloc(width * height * 4);
  const t = f / numFrames; // 0 to 1
  const scanX = Math.floor(t * (width + 100)) - 50;

  // Background gradient from dark navy/cyan to dark crimson
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const xRatio = x / width;
      // top & bottom 50px padding background
      const inPadding = (y < topPadding || y >= height - bottomPadding);
      let rBg = Math.floor(10 + xRatio * 20);
      let gBg = Math.floor(15 + (1 - Math.abs(xRatio - 0.5) * 2) * 5);
      let bBg = Math.floor(35 - xRatio * 15);

      if (inPadding) {
        // slightly darker for framing
        rBg = Math.floor(rBg * 0.7);
        gBg = Math.floor(gBg * 0.7);
        bBg = Math.floor(bBg * 0.7);
      }

      // Cyber Grid lines
      if (x % 40 === 0 || (y - topPadding) % 30 === 0) {
        rBg += 8; gBg += 12; bBg += 16;
      }

      // Scanner beam sweep effect
      const distToScan = Math.abs(x - scanX);
      if (distToScan < 30) {
        const factor = (1 - distToScan / 30) * 40;
        rBg += factor * 0.6;
        gBg += factor * 0.9;
        bBg += factor;
      }

      buf[idx] = Math.min(255, rBg);
      buf[idx+1] = Math.min(255, gBg);
      buf[idx+2] = Math.min(255, bBg);
      buf[idx+3] = 255;
    }
  }

  // Draw Top & Bottom Padding border guides (safe visual margins)
  for (let x = 0; x < width; x++) {
    const idx1 = (topPadding * width + x) * 4;
    const idx2 = ((height - bottomPadding - 1) * width + x) * 4;
    buf[idx1] = 0; buf[idx1+1] = 180; buf[idx1+2] = 240; buf[idx1+3] = 255;
    buf[idx2] = 255; buf[idx2+1] = 60; buf[idx2+2] = 90; buf[idx2+3] = 255;
  }

  // Left & Right decorative constellation nodes & lines
  // Left nodes (Western)
  const leftPulse = Math.sin(t * Math.PI * 2) * 0.3 + 0.7;
  const rightPulse = Math.cos(t * Math.PI * 2) * 0.3 + 0.7;

  // Render Title: WESTERN TECH (Left)
  const westText = "WESTERN TECH";
  const westScale = 4;
  const westW = measureText(westText, westScale);
  const westX = Math.floor(165 - westW / 2);
  const westY = topPadding + 28;
  renderText(buf, westText, westX, westY, westScale, Math.floor(0 * leftPulse), Math.floor(242 * leftPulse), Math.floor(254 * leftPulse));

  // Subtitle Left: USA / EU
  const westSub = "INNOVATION & FRONTIER";
  renderText(buf, westSub, 165 - measureText(westSub, 1)/2, topPadding + 62, 1, 140, 200, 255);

  // VS Badge (Center)
  const vsText = "VS";
  const vsScale = 4;
  const vsW = measureText(vsText, vsScale);
  const vsX = Math.floor(width / 2 - vsW / 2);
  const vsY = topPadding + 35;
  
  // Center glowing box
  const boxW = 50, boxH = 34;
  const bx = Math.floor(width/2 - boxW/2);
  const by = vsY - 5;
  for (let cy = by; cy < by + boxH; cy++) {
    for (let cx = bx; cx < bx + boxW; cx++) {
      const idx = (cy * width + cx) * 4;
      if (cx === bx || cx === bx + boxW - 1 || cy === by || cy === by + boxH - 1) {
        buf[idx] = 255; buf[idx+1] = 210; buf[idx+2] = 0;
      } else {
        buf[idx] = 20; buf[idx+1] = 16; buf[idx+2] = 32;
      }
    }
  }
  renderText(buf, vsText, vsX, vsY, vsScale, 255, 215, 0);

  // Center Clash Sparks
  const sparkRadius = Math.floor(10 + Math.sin(t * Math.PI * 4) * 6);
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2 + t * Math.PI;
    const sx = Math.floor(width/2 + Math.cos(angle) * sparkRadius);
    const sy = Math.floor((topPadding + 52) + Math.sin(angle) * sparkRadius);
    if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
      const idx = (sy * width + sx) * 4;
      buf[idx] = 255; buf[idx+1] = 240; buf[idx+2] = 100;
    }
  }

  // Render Title: CHINESE CHALLENGER (Right)
  const chinaText = "CHINESE CHALLENGER";
  const chinaScale = 3;
  const chinaW = measureText(chinaText, chinaScale);
  const chinaX = Math.floor(475 - chinaW / 2);
  const chinaY = topPadding + 32;
  renderText(buf, chinaText, chinaX, chinaY, chinaScale, Math.floor(255 * rightPulse), Math.floor(40 * rightPulse), Math.floor(80 * rightPulse));

  // Subtitle Right: CHINA
  const chinaSub = "SCALE & SPEED 2026";
  renderText(buf, chinaSub, 475 - measureText(chinaSub, 1)/2, topPadding + 62, 1, 255, 170, 160);

  // Left Tag: AI • SEMICONDUCTORS • AEROSPACE
  const leftPill = "AI • CHIPS • AEROSPACE";
  const pillY = topPadding + 95;
  renderText(buf, leftPill, 165 - measureText(leftPill, 1)/2, pillY, 1, 0, 240, 255);

  // Right Tag: BATTERIES • 6G • ROBOTICS
  const rightPill = "BATTERIES • 6G • ROBOTICS";
  renderText(buf, rightPill, 475 - measureText(rightPill, 1)/2, pillY, 1, 255, 100, 120);

  // Bottom Center Feature Strip (Safe within padding)
  const tagline = "GLOBAL TECH SUPREMACY COMPARISON 2026";
  const tagW = measureText(tagline, 2);
  const tagX = Math.floor(width / 2 - tagW / 2);
  const tagY = topPadding + 140;

  // Box around tagline
  const tbW = tagW + 24;
  const tbH = 26;
  const tbx = Math.floor(width/2 - tbW/2);
  const tby = tagY - 6;
  for (let cy = tby; cy < tby + tbH; cy++) {
    for (let cx = tbx; cx < tbx + tbW; cx++) {
      if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
        const idx = (cy * width + cx) * 4;
        if (cx === tbx || cx === tbx + tbW - 1 || cy === tby || cy === tby + tbH - 1) {
          buf[idx] = 80; buf[idx+1] = 120; buf[idx+2] = 200;
        } else {
          buf[idx] = 15; buf[idx+1] = 22; buf[idx+2] = 42;
        }
      }
    }
  }
  renderText(buf, tagline, tagX, tagY, 2, 230, 240, 255);

  // Tech items summary line
  const techSummary = "20 CONTESTED DOMAINS • 15 CHINESE LEADS";
  const sumW = measureText(techSummary, 1);
  renderText(buf, techSummary, Math.floor(width/2 - sumW/2), topPadding + 185, 1, 255, 215, 0);

  frames.push({ rgba: buf });
}

console.log('Encoding GIF...');
const gifData = createGif(width, height, frames, 8);
const outPath = path.join(__dirname, 'social_preview.gif');
fs.writeFileSync(outPath, gifData);
console.log(`Saved ${outPath} (${gifData.length} bytes)`);
