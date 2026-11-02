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
import {
  LINEAGE_SETTINGS_DEPTH,
  clampLineageDepth,
  isLineageSettingsDepthValid,
} from './depth';

describe('lineage depth', () => {
  it('keeps the fetch clamp at 0–3', () => {
    expect(clampLineageDepth(9)).toBe(3);
    expect(clampLineageDepth(-1)).toBe(0);
  });

  it('accepts exactly the settings form range 0–3 (official min 0, product effective max 3)', () => {
    expect(LINEAGE_SETTINGS_DEPTH).toEqual({ min: 0, max: 3 });
    expect(isLineageSettingsDepthValid(0)).toBe(true);
    expect(isLineageSettingsDepthValid(3)).toBe(true);
    expect(isLineageSettingsDepthValid(4)).toBe(false);
    expect(isLineageSettingsDepthValid(5)).toBe(false);
    expect(isLineageSettingsDepthValid(-1)).toBe(false);
    expect(isLineageSettingsDepthValid(1.5)).toBe(false);
    expect(isLineageSettingsDepthValid(undefined)).toBe(false);
  });
});
