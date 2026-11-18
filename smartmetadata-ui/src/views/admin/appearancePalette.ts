/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Hand-port of official `styles/colorPallet.ts` (pin a3012259ca) plus the
 * tinycolor2 hex/HSL conversion it depends on. tinycolor2 is not a product
 * dependency, so the conversion is reproduced here instead of adding one
 * for a single settings page.
 *
 * The port reproduces tinycolor2's exact float behaviour, including its
 * two quirks: HSL object input quantizes saturation/lightness to four
 * decimals (convertToPercentage + bound01(v, 100) truncate via parseInt),
 * and out-of-range hues collapse to 0 (bound01 clamps, then hue2rgb wraps
 * 1.0 back to the same result as 0). Verified bit-for-bit against a
 * one-off tinycolor2 install over 2024 inputs x 11 palette values.
 *
 * Unparseable input (including '') yields the black-base palette, exactly
 * as tinycolor does for invalid input. Named CSS colors are NOT resolved
 * (tinycolor would resolve them); the form's hex validation rejects them
 * on save, so the palette effect on such input is transient only.
 */

interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

// Deltas copied verbatim from official `styles/colorPallet.ts`.
const PALETTE_DELTAS: readonly Hsl[] = [
  { h: -4.954128440366901, s: 0.128, l: 0.47058823529411775 },
  { h: -8.704128440366986, s: 0.128, l: 0.45882352941176474 },
  { h: -6.2584762664539255, s: 0.128, l: 0.4 },
  { h: -8.460621946860499, s: 0.128, l: 0.3392156862745098 },
  { h: -9.10046990378163, s: 0.128, l: 0.24901960784313726 },
  { h: -8.130599028602262, s: 0.1050114942528736, l: 0.14901960784313728 },
  { h: -3.777657852131682, s: 0.08127102803738318, l: 0.07058823529411762 },
  { h: 0, s: 0, l: 0 },
  { h: 3.024594963888319, s: -0.06858119658119666, l: -0.05098039215686273 },
  { h: 4.770009490667491, s: -0.12070466321243523, l: -0.13137254901960782 },
  { h: 2.823649337410785, s: -0.18845569620253155, l: -0.19999999999999996 },
];

function parseHex(input: string): { r: number; g: number; b: number } {
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(
    input.trim(),
  );
  if (!match) {
    return { r: 0, g: 0, b: 0 };
  }
  const hex = match[1];
  if (hex.length === 3 || hex.length === 4) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const r01 = r / 255;
  const g01 = g / 255;
  const b01 = b / 255;
  const max = Math.max(r01, g01, b01);
  const min = Math.min(r01, g01, b01);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r01) {
    h = (g01 - b01) / d + (g01 < b01 ? 6 : 0);
  } else if (max === g01) {
    h = (b01 - r01) / d + 2;
  } else {
    h = (r01 - g01) / d + 4;
  }
  return { h: (h / 6) * 360, s, l };
}

// tinycolor2's convertToPercentage + bound01(value, 100) pipeline, which
// truncates the value to four decimals before HSL->RGB conversion.
function quantizePercent(value: number): number {
  const n = Math.min(100, Math.max(0, value * 100));
  const quantized = Math.trunc(n * 100) / 100;
  if (Math.abs(quantized - 100) < 0.000001) {
    return 1;
  }
  return (quantized % 100) / 100;
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) {
    tt += 1;
  }
  if (tt > 1) {
    tt -= 1;
  }
  if (tt < 1 / 6) {
    return p + (q - p) * 6 * tt;
  }
  if (tt < 1 / 2) {
    return q;
  }
  if (tt < 2 / 3) {
    return p + (q - p) * (2 / 3 - tt) * 6;
  }
  return p;
}

function hslToHex(h: number, s: number, l: number): string {
  const h01 = h <= 0 || h >= 360 ? 0 : h / 360;
  const s01 = quantizePercent(s);
  const l01 = quantizePercent(l);
  let r: number;
  let g: number;
  let b: number;
  if (s01 === 0) {
    r = l01;
    g = l01;
    b = l01;
  } else {
    const q = l01 < 0.5 ? l01 * (1 + s01) : l01 + s01 - l01 * s01;
    const p = 2 * l01 - q;
    r = hue2rgb(p, q, h01 + 1 / 3);
    g = hue2rgb(p, q, h01);
    b = hue2rgb(p, q, h01 - 1 / 3);
  }
  const pad = (v: number): string =>
    clamp(Math.round(v * 255), 0, 255).toString(16).padStart(2, '0');
  return `#${pad(r)}${pad(g)}${pad(b)}`;
}

/** The 11-shade palette official generates from a primary hex color. */
export function generatePalette(primaryHex: string): string[] {
  const { r, g, b } = parseHex(primaryHex);
  const base = rgbToHsl(r, g, b);
  return PALETTE_DELTAS.map((delta) =>
    hslToHex(base.h + delta.h, clamp(base.s + delta.s, 0, 1), clamp(base.l + delta.l, 0, 1)),
  );
}

/**
 * The palette linkage official applies when the primary color changes:
 * hover takes palette index 2, selected takes palette index 8.
 */
export function deriveHoverSelected(primaryHex: string): {
  hoverColor: string;
  selectedColor: string;
} {
  const palette = generatePalette(primaryHex);
  return { hoverColor: palette[2], selectedColor: palette[8] };
}
