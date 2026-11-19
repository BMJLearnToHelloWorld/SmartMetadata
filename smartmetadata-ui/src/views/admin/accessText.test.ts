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
import { capitalize, startCase } from './accessText';

describe('accessText', () => {
  it('startCases camelCase, separators, and all-caps words like lodash', () => {
    expect(startCase('storedProcedure')).toBe('Stored Procedure');
    expect(startCase('dashboardDataModel')).toBe('Dashboard Data Model');
    expect(startCase('CREATE')).toBe('CREATE');
    expect(startCase('added')).toBe('Added');
    expect(startCase('all')).toBe('All');
    expect(startCase('fully-qualified_name')).toBe('Fully Qualified Name');
    expect(startCase('')).toBe('');
  });

  it('capitalizes with the rest lowercased', () => {
    expect(capitalize('allow')).toBe('Allow');
    expect(capitalize('DENY')).toBe('Deny');
    expect(capitalize('')).toBe('');
  });
});
