/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { deriveHoverSelected, generatePalette } from './appearancePalette';

/**
 * Expectations computed with real tinycolor2 + official colorPallet
 * deltas (one-off /tmp install, 2026-11-18); the port matched tinycolor2
 * bit-for-bit over 2024 inputs x 11 values, and these pins lock the
 * product's two brand primaries plus the achromatic edges.
 */

describe('generatePalette', () => {
  it('matches tinycolor2 for the iSmart primary', () => {
    expect(generatePalette('#005587')).toEqual([
      '#78d8ff',
      '#72dfff',
      '#54d2ff',
      '#35d1ff',
      '#07c9ff',
      '#00a1d3',
      '#0076ab',
      '#005587',
      '#043f69',
      '#042540',
      '#03131e',
    ]);
  });

  it('matches tinycolor2 for the official brand primary', () => {
    expect(generatePalette('#1570ef')).toEqual([
      '#f5faff',
      '#eff8ff',
      '#d1e9ff',
      '#b2ddff',
      '#84caff',
      '#53b1fd',
      '#2e90fa',
      '#1570ef',
      '#175cd3',
      '#1849a9',
      '#194185',
    ]);
  });

  it('keeps the input color at the identity index', () => {
    expect(generatePalette('#f5a623')[7]).toBe('#f5a623');
    expect(generatePalette('#7a5af8')[7]).toBe('#7a5af8');
  });

  it('expands 3-digit hex', () => {
    expect(generatePalette('#abc')[7]).toBe('#aabbcc');
  });

  it('yields the black-base palette for unparseable input', () => {
    expect(generatePalette('zzz')).toEqual(generatePalette('#000000'));
    expect(generatePalette('')).toEqual(generatePalette('#000000'));
    expect(generatePalette('#000000')).toEqual([
      '#876969',
      '#846666',
      '#735959',
      '#624b4b',
      '#483737',
      '#2a2222',
      '#131111',
      '#000000',
      '#000000',
      '#000000',
      '#000000',
    ]);
  });

  it('matches tinycolor2 for white, including the quantization edge', () => {
    expect(generatePalette('#ffffff')).toEqual([
      '#ffffff',
      '#ffffff',
      '#ffffff',
      '#ffffff',
      '#ffffff',
      '#ffffff',
      '#ffffff',
      '#ffffff',
      '#f2f2f2',
      '#dddddd',
      '#cccccc',
    ]);
  });
});

describe('deriveHoverSelected', () => {
  it('takes hover from palette index 2 and selected from index 8', () => {
    expect(deriveHoverSelected('#005587')).toEqual({
      hoverColor: '#54d2ff',
      selectedColor: '#043f69',
    });
    expect(deriveHoverSelected('#1570ef')).toEqual({
      hoverColor: '#d1e9ff',
      selectedColor: '#175cd3',
    });
  });
});
