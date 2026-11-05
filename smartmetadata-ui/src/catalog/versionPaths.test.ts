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
  getClassificationVersionPath,
  getDomainVersionPath,
  getGlossaryTermVersionPath,
  getGlossaryVersionPath,
  getGovernanceDetailPath,
  getGovernanceVersionPath,
  getTagVersionPath,
  getTestCaseVersionPath,
} from './versionPaths';

describe('versionPaths', () => {
  it('builds the official :version paths for each governance kind and test cases', () => {
    expect(getDomainVersionPath('d1', '0.2')).toBe('/governance/domains/d1/versions/0.2');
    expect(getGlossaryVersionPath('g1', '1.0')).toBe('/governance/glossaries/g1/versions/1.0');
    expect(getGlossaryTermVersionPath('t1', '0.3')).toBe('/governance/terms/t1/versions/0.3');
    expect(getGlossaryTermVersionPath('t1', '0.3', 'overview')).toBe(
      '/governance/terms/t1/versions/0.3/overview',
    );
    expect(getClassificationVersionPath('c1', '0.1')).toBe(
      '/governance/classifications/c1/versions/0.1',
    );
    // M-Next A4: official TAG_VERSION is the generic entity-version route.
    expect(getTagVersionPath('t1', '0.1')).toBe('/governance/tags/t1/versions/0.1');
    expect(getGovernanceVersionPath('tag', 't1', '0.1')).toBe('/governance/tags/t1/versions/0.1');
    expect(getGovernanceDetailPath('tag', 't1')).toBe('/governance/tags/t1');
    expect(getTestCaseVersionPath('tc1', '0.2')).toBe('/quality/test-cases/tc1/versions/0.2');
    expect(getTestCaseVersionPath('tc1', '0.2', 'results')).toBe(
      '/quality/test-cases/tc1/versions/0.2/results',
    );
  });

  it('dispatches by kind and builds matching detail back-links', () => {
    expect(getGovernanceVersionPath('domain', 'd1', '0.2')).toBe('/governance/domains/d1/versions/0.2');
    expect(getGovernanceVersionPath('testCase', 'tc1', '0.2')).toBe(
      '/quality/test-cases/tc1/versions/0.2',
    );
    expect(getGovernanceDetailPath('glossary', 'g1')).toBe('/governance/glossaries/g1');
    expect(getGovernanceDetailPath('term', 't1')).toBe('/governance/terms/t1');
    expect(getGovernanceDetailPath('classification', 'c1')).toBe('/governance/classifications/c1');
  });
});
