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
import { LINEAGE_DEPTH_DEFAULT, LINEAGE_SESSION_DEPTH_DEFAULT, clampLineageDepth } from './depth';

describe('lineage depth', () => {
  it('keeps the REST default at 1 and the session/store default at the official 3', () => {
    expect(LINEAGE_DEPTH_DEFAULT).toBe(1);
    expect(LINEAGE_SESSION_DEPTH_DEFAULT).toBe(3);
  });

  it('keeps the fetch clamp at 0–3', () => {
    expect(clampLineageDepth(9)).toBe(3);
    expect(clampLineageDepth(-1)).toBe(0);
    expect(clampLineageDepth(0)).toBe(0);
    expect(clampLineageDepth(3)).toBe(3);
    expect(clampLineageDepth(2)).toBe(2);
  });

  it('truncates fractional depths before clamping', () => {
    expect(clampLineageDepth(2.9)).toBe(2);
    expect(clampLineageDepth(-0.5)).toBe(0);
  });

  it('coerces numeric strings and falls back to the default for the rest', () => {
    expect(clampLineageDepth('2')).toBe(2);
    expect(clampLineageDepth(Number.NaN)).toBe(LINEAGE_DEPTH_DEFAULT);
    expect(clampLineageDepth(undefined)).toBe(LINEAGE_DEPTH_DEFAULT);
    expect(clampLineageDepth('nope')).toBe(LINEAGE_DEPTH_DEFAULT);
  });
});
