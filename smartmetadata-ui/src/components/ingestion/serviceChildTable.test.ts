/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  certificationCellTags,
  childTableEmptyText,
  compareChildNames,
  entityDisplayName,
  serviceChildColumns,
  tierCellTags,
  visibleChildTags,
  withRequiredFqn,
} from './serviceChildTable';

function label(tagFQN: string) {
  return { tagFQN, source: 'Classification' };
}

describe('serviceChildTable tag cells', () => {
  const tags = [label('PII.Sensitive'), label('Tier.Tier1'), label('Certification.Gold')];

  it('shows the first tier label only in the tier cell', () => {
    expect(tierCellTags(tags).map((tag) => tag.tagFQN)).toEqual(['Tier.Tier1']);
    expect(tierCellTags([label('PII.Sensitive')])).toEqual([]);
    expect(tierCellTags(undefined)).toEqual([]);
  });

  it('prefers certification.tagLabel and falls back to the Certification.* label', () => {
    expect(
      certificationCellTags({ certification: { tagLabel: label('Certification.Platinum') }, tags }),
    ).toEqual([label('Certification.Platinum')]);
    expect(certificationCellTags({ tags }).map((tag) => tag.tagFQN)).toEqual([
      'Certification.Gold',
    ]);
    expect(certificationCellTags({ tags: [label('PII.Sensitive')] })).toEqual([]);
  });

  it('shows every label except tier and certification in the tags cell', () => {
    expect(visibleChildTags(tags).map((tag) => tag.tagFQN)).toEqual(['PII.Sensitive']);
    expect(visibleChildTags(undefined)).toEqual([]);
  });
});

describe('serviceChildTable columns and helpers', () => {
  it('builds the six pin main-tab columns with the detail widths', () => {
    const columns = serviceChildColumns({
      name: 'Name',
      description: 'Description',
      owners: 'Owners',
      tags: 'Tags',
      tier: 'Tier',
      certification: 'Certification',
    }) as Array<{ key: string; width: number; sorter?: unknown }>;
    expect(columns.map((column) => column.key)).toEqual([
      'name',
      'description',
      'owners',
      'tags',
      'tier',
      'certification',
    ]);
    expect(columns.map((column) => column.width)).toEqual([280, 300, 280, 240, 120, 150]);
    expect(typeof columns[0].sorter).toBe('function');
  });

  it('sorts by name and stays inert without string names', () => {
    expect(compareChildNames({ name: 'b' }, { name: 'a' })).toBeGreaterThan(0);
    expect(compareChildNames({ name: 'a' }, { name: 'b' })).toBeLessThan(0);
    expect(compareChildNames({}, {})).toBe(0);
    expect(compareChildNames({ name: 3 }, { name: 'a' })).toBe(0);
  });

  it('prefers displayName for the single-line name', () => {
    expect(entityDisplayName({ displayName: 'Shown', name: 'raw' })).toBe('Shown');
    expect(entityDisplayName({ name: 'raw' })).toBe('raw');
    expect(entityDisplayName({})).toBe('');
  });

  it('renders the spelling hint while searching and the no-data text otherwise', () => {
    const messages = { noMatchingResults: 'No matches', checkSpelling: 'Check spelling', noData: 'Empty' };
    expect(childTableEmptyText(true, messages)).toBe('No matches — Check spelling');
    expect(childTableEmptyText(false, messages)).toBe('Empty');
  });

  it('fills a missing FQN without touching the rest of the row', () => {
    const page = { id: 'x', name: 'x', owners: [], domains: [], dataProducts: [], tags: [] };
    expect(withRequiredFqn(page)).toEqual({ ...page, fullyQualifiedName: '' });
    expect(withRequiredFqn({ ...page, fullyQualifiedName: 'svc.x' }).fullyQualifiedName).toBe(
      'svc.x',
    );
  });
});
