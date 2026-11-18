/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { parsePropertyLayout } from './customPropertiesLayout';

describe('parsePropertyLayout', () => {
  it('returns [] for non-array input', () => {
    expect(parsePropertyLayout(undefined)).toEqual([]);
    expect(parsePropertyLayout({})).toEqual([]);
    expect(parsePropertyLayout('x')).toEqual([]);
  });

  it('keeps valid items with valid sizes, drops invalid ones', () => {
    expect(
      parsePropertyLayout([
        { name: 'a', width: 'half', size: 'small' },
        { name: 'b', width: 'full', size: 'huge' },
        { name: 'c', width: 'wide' },
        { name: '', width: 'half' },
        { width: 'half' },
        'd',
      ]),
    ).toEqual([
      { name: 'a', width: 'half', size: 'small' },
      { name: 'b', width: 'full' },
    ]);
  });
});
