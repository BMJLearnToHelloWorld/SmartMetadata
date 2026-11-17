/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listClassifications } from '@/api/classifications';
import { listDomains } from '@/api/domains';
import { listGlossaries } from '@/api/glossaries';
import { listGlossaryTerms } from '@/api/glossaryTerms';
import { listTags } from '@/api/tags';
import { listTeams } from '@/api/teams';
import { listUsers } from '@/api/users';
import { classificationTagOptions, loadGovernanceCatalog } from './catalogOptions';

vi.mock('@/api/classifications', () => ({ listClassifications: vi.fn() }));
vi.mock('@/api/domains', () => ({ listDomains: vi.fn() }));
vi.mock('@/api/glossaries', () => ({ listGlossaries: vi.fn() }));
vi.mock('@/api/glossaryTerms', () => ({ listGlossaryTerms: vi.fn() }));
vi.mock('@/api/tags', () => ({ listTags: vi.fn() }));
vi.mock('@/api/teams', () => ({ listTeams: vi.fn() }));
vi.mock('@/api/users', () => ({ listUsers: vi.fn() }));

const mockedListClassifications = vi.mocked(listClassifications);
const mockedListDomains = vi.mocked(listDomains);
const mockedListGlossaries = vi.mocked(listGlossaries);
const mockedListGlossaryTerms = vi.mocked(listGlossaryTerms);
const mockedListTags = vi.mocked(listTags);
const mockedListTeams = vi.mocked(listTeams);
const mockedListUsers = vi.mocked(listUsers);

describe('loadGovernanceCatalog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedListUsers.mockResolvedValue({ data: [] });
    mockedListTeams.mockResolvedValue({ data: [] });
    mockedListClassifications.mockResolvedValue({ data: [] });
    mockedListGlossaries.mockResolvedValue({ data: [] });
    mockedListDomains.mockResolvedValue({ data: [] });
    mockedListTags.mockResolvedValue({ data: [] });
    mockedListGlossaryTerms.mockResolvedValue({ data: [] });
  });

  it('carries displayName and description onto classification tag options', async () => {
    mockedListClassifications.mockResolvedValue({
      data: [{ id: 'c1', name: 'PII', fullyQualifiedName: 'PII', owners: [] }],
    });
    mockedListTags.mockResolvedValue({
      data: [
        {
          id: 't1',
          name: 'Sensitive',
          displayName: 'Sensitive Data',
          description: 'Handle with care',
          fullyQualifiedName: 'PII.Sensitive',
          owners: [],
        },
        { id: 't2', name: 'Plain', fullyQualifiedName: 'PII.Plain', owners: [] },
      ],
    });
    const catalog = await loadGovernanceCatalog();
    expect(mockedListTags).toHaveBeenCalledWith({ parent: 'PII', limit: 100 });
    expect(catalog.tags).toEqual([
      {
        tagFQN: 'PII.Sensitive',
        name: 'Sensitive Data',
        source: 'Classification',
        displayName: 'Sensitive Data',
        description: 'Handle with care',
      },
      {
        tagFQN: 'PII.Plain',
        name: 'Plain',
        source: 'Classification',
        displayName: undefined,
        description: undefined,
      },
    ]);
  });

  it('carries displayName and description onto glossary term options', async () => {
    mockedListGlossaries.mockResolvedValue({
      data: [{ id: 'g1', name: 'Business', fullyQualifiedName: 'Business', owners: [], reviewers: [], tags: [], domains: [] }],
    });
    mockedListGlossaryTerms.mockResolvedValue({
      data: [
        {
          id: 'gt1',
          name: 'Revenue',
          displayName: 'Total Revenue',
          description: 'Gross revenue',
          fullyQualifiedName: 'Business.Revenue',
          relatedTerms: [],
          owners: [],
          tags: [],
        },
      ],
    });
    const catalog = await loadGovernanceCatalog();
    expect(mockedListGlossaryTerms).toHaveBeenCalledWith({ glossary: 'g1', limit: 100 });
    expect(catalog.tags).toEqual([
      {
        tagFQN: 'Business.Revenue',
        name: 'Total Revenue',
        source: 'Glossary',
        displayName: 'Total Revenue',
        description: 'Gross revenue',
      },
    ]);
    expect(classificationTagOptions(catalog)).toEqual([]);
  });

  it('builds owner options and passes domains through, tolerating failed lists', async () => {
    mockedListUsers.mockResolvedValue({
      data: [{ id: 'u1', name: 'amy', displayName: 'Amy', teams: [], roles: [] }],
    });
    mockedListTeams.mockRejectedValue(new Error('down'));
    mockedListDomains.mockResolvedValue({
      data: [{ id: 'd1', name: 'Finance', fullyQualifiedName: 'Finance', domainType: 'Aggregate', owners: [], experts: [], tags: [] }],
    });
    const catalog = await loadGovernanceCatalog();
    expect(catalog.owners).toEqual([
      { key: 'user:u1', id: 'u1', type: 'user', label: 'Amy (user)' },
    ]);
    expect(catalog.domains).toHaveLength(1);
    expect(catalog.tags).toEqual([]);
  });
});
