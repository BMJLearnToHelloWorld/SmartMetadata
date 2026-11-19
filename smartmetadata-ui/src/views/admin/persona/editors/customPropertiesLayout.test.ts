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
import {
  applyPropertyLayout,
  getTabDefaultWidth,
  parsePropertyLayout,
  toPropertyLayout,
} from './customPropertiesLayout';

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

describe('applyPropertyLayout', () => {
  const defs = [
    { name: 'a', propertyType: 'string' },
    { name: 'b', propertyType: 'markdown' },
    { name: 'c', propertyType: 'string' },
  ];

  it('orders by the stored layout and appends missing definitions with default widths', () => {
    expect(
      applyPropertyLayout(defs, [
        { name: 'c', width: 'full' },
        { name: 'a', width: 'half', size: 'large' },
      ]),
    ).toEqual([
      { property: { name: 'c', propertyType: 'string' }, width: 'full' },
      { property: { name: 'a', propertyType: 'string' }, width: 'half', size: 'large' },
      { property: { name: 'b', propertyType: 'markdown' }, width: 'full' },
    ]);
  });

  it('drops stored entries whose definition no longer exists', () => {
    expect(
      applyPropertyLayout(defs, [
        { name: 'gone', width: 'half' },
        { name: 'a', width: 'half' },
      ]),
    ).toEqual([
      { property: { name: 'a', propertyType: 'string' }, width: 'half' },
      { property: { name: 'b', propertyType: 'markdown' }, width: 'full' },
      { property: { name: 'c', propertyType: 'string' }, width: 'half' },
    ]);
  });

  it('derives the full layout from definitions alone when nothing is stored', () => {
    expect(applyPropertyLayout(defs, [])).toEqual([
      { property: { name: 'a', propertyType: 'string' }, width: 'half' },
      { property: { name: 'b', propertyType: 'markdown' }, width: 'full' },
      { property: { name: 'c', propertyType: 'string' }, width: 'half' },
    ]);
  });
});

describe('toPropertyLayout', () => {
  it('round-trips laid-out items back to a stored layout', () => {
    expect(
      toPropertyLayout([
        { property: { name: 'a', propertyType: 'string' }, width: 'half' },
        { property: { name: 'b', propertyType: 'markdown' }, width: 'full', size: 'large' },
      ]),
    ).toEqual([
      { name: 'a', width: 'half' },
      { name: 'b', width: 'full', size: 'large' },
    ]);
  });
});

describe('getTabDefaultWidth', () => {
  it('is full for wide types and half otherwise', () => {
    for (const wide of ['timeInterval', 'table-cp', 'sqlQuery', 'markdown']) {
      expect(getTabDefaultWidth({ name: 'p', propertyType: wide })).toBe('full');
    }
    for (const narrow of ['string', 'integer', 'enum', undefined]) {
      expect(getTabDefaultWidth({ name: 'p', propertyType: narrow })).toBe('half');
    }
  });
});
