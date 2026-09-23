// =============================================================================
// Placeholder stimulus generator (deterministic, self-hosted, no CDN).
// Generates abstract, neutral SVG images for the two target categories.
// The researcher will REPLACE these files with real photos later — the engine,
// database, scoring and dashboard never depend on image content or filenames.
//
// Run: bun scripts/generate-stimuli.mjs
// Output: public/iat/stimuli/iranian/iranian-01..08.svg
//         public/iat/stimuli/afghan/afghan-01..08.svg
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "public/iat/stimuli";

// Two muted, clearly distinguishable neutral palettes (placeholders only).
const PALETTES = {
  iranian: { bg: "#f5f1ea", frame: "#b08954", glyph: "#7c5c33" },
  afghan: { bg: "#eef1f2", frame: "#5f7382", glyph: "#3c4f5c" },
};

// 8 distinct abstract glyphs per category (deterministic geometry).
const GLYPHS = [
  // (cx, cy, r) triplets in a 400x400 viewBox
  (p) => `<circle cx="200" cy="200" r="90" fill="${p.glyph}"/>`,
  (p) => `<rect x="125" y="125" width="150" height="150" rx="18" fill="${p.glyph}" transform="rotate(45 200 200)"/>`,
  (p) => `<polygon points="200,105 295,265 105,265" fill="${p.glyph}"/>`,
  (p) => `<polygon points="200,95 290,200 200,305 110,200" fill="${p.glyph}"/>`,
  (p) => `<rect x="120" y="140" width="160" height="120" rx="24" fill="${p.glyph}"/><circle cx="200" cy="140" r="46" fill="${p.glyph}"/>`,
  (p) => `<circle cx="200" cy="200" r="92" fill="none" stroke="${p.glyph}" stroke-width="26"/><circle cx="200" cy="200" r="34" fill="${p.glyph}"/>`,
  (p) => `<rect x="128" y="128" width="144" height="144" rx="30" fill="${p.glyph}"/><circle cx="200" cy="200" r="30" fill="${p.bg}"/>`,
  (p) => `<polygon points="120,270 200,120 280,270" fill="none" stroke="${p.glyph}" stroke-width="30" stroke-linejoin="round"/><circle cx="200" cy="238" r="20" fill="${p.glyph}"/>`,
];

function svg(palette, glyphIndex, label) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" role="img" aria-label="${label}">
  <rect width="400" height="400" fill="${palette.bg}"/>
  <rect x="14" y="14" width="372" height="372" rx="28" fill="none" stroke="${palette.frame}" stroke-width="10"/>
  ${GLYPHS[glyphIndex % GLYPHS.length](palette)}
</svg>
`;
}

for (const category of ["iranian", "afghan"]) {
  const dir = join(ROOT, category);
  mkdirSync(dir, { recursive: true });
  for (let i = 1; i <= 8; i++) {
    const name = `${category}-${String(i).padStart(2, "0")}.svg`;
    writeFileSync(join(dir, name), svg(PALETTES[category], i - 1, `Abstract placeholder stimulus (${category})`));
  }
  console.log(`generated 8 placeholders -> ${dir}`);
}
console.log("done");
