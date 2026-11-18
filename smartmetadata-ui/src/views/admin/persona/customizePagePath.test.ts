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
import { getCustomizePagePath } from './customizePagePath';

describe('getCustomizePagePath', () => {
  it('replaces :fqn and :pageFqn with no mapping', () => {
    expect(getCustomizePagePath('Analyst', 'Table')).toBe('/customize-page/Analyst/Table');
    expect(getCustomizePagePath('Analyst', 'app-layout')).toBe(
      '/customize-page/Analyst/app-layout',
    );
    expect(getCustomizePagePath('Analyst', 'homepage')).toBe('/customize-page/Analyst/homepage');
  });

  it('encodes the persona FQN and leaves the pageFqn verbatim', () => {
    // Dots survive encoding (FQN separators); spaces and slashes do not.
    expect(getCustomizePagePath('team.analyst', 'Table')).toBe(
      '/customize-page/team.analyst/Table',
    );
    expect(getCustomizePagePath('Data Analyst', 'Table')).toBe(
      '/customize-page/Data%20Analyst/Table',
    );
    expect(getCustomizePagePath('a/b', 'Table')).toBe('/customize-page/a%2Fb/Table');
  });

  it('does not encode a pageFqn that looks encodable', () => {
    // The official replacement leaves :pageFqn untouched; a value with
    // a space passes through verbatim (pageFqn values are fixed keys).
    expect(getCustomizePagePath('Analyst', 'a b')).toBe('/customize-page/Analyst/a b');
  });
});
