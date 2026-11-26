/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SearchHit, TagRef } from '@/types/api';
import {
  fetchPreviewOverviewRefresh,
  findPreviewColumnRow,
  hasPreviewOverviewSavePath,
  previewOverviewEditAccess,
  savePreviewDataProducts,
  savePreviewDescription,
  savePreviewDisplayName,
  savePreviewDomains,
  savePreviewOwners,
  savePreviewTags,
  type PreviewOverviewEditFlags,
} from './previewOverviewEdits';

vi.mock('@/api/entities', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/entities')>();
  return { ...actual, fetchAssetDetail: vi.fn(), patchAsset: vi.fn() };
});

vi.mock('@/api/domains', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/domains')>();
  return { ...actual, getDomainByName: vi.fn(), patchDomain: vi.fn() };
});

vi.mock('@/api/dataProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/dataProducts')>();
  return { ...actual, getDataProductByName: vi.fn(), patchDataProduct: vi.fn() };
});

vi.mock('@/api/glossaryTerms', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/glossaryTerms')>();
  return { ...actual, getGlossaryTermByFqn: vi.fn(), patchGlossaryTerm: vi.fn() };
});

vi.mock('@/api/columns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/columns')>();
  return { ...actual, updateColumnDetails: vi.fn() };
});

import { fetchAssetDetail, patchAsset } from '@/api/entities';
import { getDomainByName, patchDomain } from '@/api/domains';
import { getDataProductByName, patchDataProduct } from '@/api/dataProducts';
import { getGlossaryTermByFqn, patchGlossaryTerm } from '@/api/glossaryTerms';
import { updateColumnDetails } from '@/api/columns';

const patchMock = patchAsset as unknown as ReturnType<typeof vi.fn>;
const domainPatchMock = patchDomain as unknown as ReturnType<typeof vi.fn>;
const productPatchMock = patchDataProduct as unknown as ReturnType<typeof vi.fn>;
const termPatchMock = patchGlossaryTerm as unknown as ReturnType<typeof vi.fn>;
const columnMock = updateColumnDetails as unknown as ReturnType<typeof vi.fn>;
const fetchMock = fetchAssetDetail as unknown as ReturnType<typeof vi.fn>;
const domainMock = getDomainByName as unknown as ReturnType<typeof vi.fn>;
const productMock = getDataProductByName as unknown as ReturnType<typeof vi.fn>;
const termMock = getGlossaryTermByFqn as unknown as ReturnType<typeof vi.fn>;

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    entityType: 'table',
    owners: [],
    tags: [],
    domains: [],
    dataProducts: [],
    ...overrides,
  };
}

const ALL_FLAGS: PreviewOverviewEditFlags = {
  isAdmin: false,
  canEditDescription: true,
  canEditDisplayName: true,
  canEditAll: true,
  can: () => true,
};

beforeEach(() => {
  for (const mock of [
    patchMock,
    domainPatchMock,
    productPatchMock,
    termPatchMock,
    columnMock,
    fetchMock,
    domainMock,
    productMock,
    termMock,
  ]) {
    mock.mockReset();
    mock.mockResolvedValue({});
  }
});

describe('hasPreviewOverviewSavePath', () => {
  it('covers DETAIL_ENDPOINTS types, the three governance types, and tableColumn', () => {
    for (const entityType of ['table', 'topic', 'database', 'apiEndpoint', 'query']) {
      expect(hasPreviewOverviewSavePath(entityType)).toBe(true);
    }
    for (const entityType of ['domain', 'dataProduct', 'glossaryTerm', 'tableColumn']) {
      expect(hasPreviewOverviewSavePath(entityType)).toBe(true);
    }
  });

  it('excludes types with no wired patch endpoint (tag, testSuite, user, page, service)', () => {
    for (const entityType of ['tag', 'testSuite', 'testCase', 'user', 'team', 'page', 'databaseService']) {
      expect(hasPreviewOverviewSavePath(entityType)).toBe(false);
    }
  });
});

describe('previewOverviewEditAccess', () => {
  it('grants every section for a table hit with all permissions', () => {
    const access = previewOverviewEditAccess('table', ALL_FLAGS);
    expect(access).toEqual({
      description: true,
      owners: true,
      domains: true,
      tier: true,
      glossaryTerms: true,
      tags: true,
      dataProducts: true,
      displayName: true,
    });
  });

  it('grants only description and tags for a table column (owners/domains/tier/data products inherit)', () => {
    // Pin DataAssetSummaryPanelV1.tsx:490-493: columns inherit owners,
    // domains, tier and data products from their parent table.
    const access = previewOverviewEditAccess('tableColumn', ALL_FLAGS);
    expect(access.description).toBe(true);
    expect(access.tags).toBe(true);
    expect(access.glossaryTerms).toBe(true);
    expect(access.displayName).toBe(true);
    expect(access.owners).toBe(false);
    expect(access.domains).toBe(false);
    expect(access.tier).toBe(false);
    expect(access.dataProducts).toBe(false);
  });

  it('withholds domains and data products for a domain (it has neither field)', () => {
    const access = previewOverviewEditAccess('domain', ALL_FLAGS);
    expect(access.domains).toBe(false);
    expect(access.dataProducts).toBe(false);
    expect(access.description).toBe(true);
    expect(access.owners).toBe(true);
    expect(access.tags).toBe(true);
  });

  it('withholds data products for a glossary term (it has no dataProducts field)', () => {
    const access = previewOverviewEditAccess('glossaryTerm', ALL_FLAGS);
    expect(access.dataProducts).toBe(false);
    expect(access.domains).toBe(true);
  });

  it('denies everything without a save path, whatever the permissions say', () => {
    const access = previewOverviewEditAccess('tag', ALL_FLAGS);
    expect(Object.values(access).every(Boolean)).toBe(false);
  });

  it('denies a section when its field permission is missing', () => {
    const access = previewOverviewEditAccess('table', {
      ...ALL_FLAGS,
      can: (operation) => operation !== 'EditOwners',
    });
    expect(access.owners).toBe(false);
    expect(access.tags).toBe(true);
  });

  it('lets the admin line stand in for a missing field permission', () => {
    const access = previewOverviewEditAccess('table', {
      ...ALL_FLAGS,
      isAdmin: true,
      can: () => false,
    });
    expect(access.owners).toBe(true);
    expect(access.domains).toBe(true);
    expect(access.tier).toBe(true);
    expect(access.tags).toBe(true);
    expect(access.dataProducts).toBe(true);
    expect(access.displayName).toBe(true);
    // Description follows AssetDetailView's bare gate (no admin line).
    expect(access.description).toBe(true);
  });

  it('denies description for an admin when the description flag itself is missing', () => {
    const access = previewOverviewEditAccess('table', {
      ...ALL_FLAGS,
      isAdmin: true,
      canEditDescription: false,
    });
    expect(access.description).toBe(false);
  });
});

describe('preview overview saves route per type', () => {
  it('saves a table description as a /description replace through patchAsset', async () => {
    patchMock.mockResolvedValue({});
    await savePreviewDescription(hit(), 't1', 'Old', 'New');
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      { op: 'replace', path: '/description', value: 'New' },
    ]);
  });

  it('adds /description when the entity had none', async () => {
    patchMock.mockResolvedValue({});
    await savePreviewDescription(hit(), 't1', undefined, 'New');
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      { op: 'add', path: '/description', value: 'New' },
    ]);
  });

  it('saves a table-column description through updateColumnDetails', async () => {
    columnMock.mockResolvedValue({});
    await savePreviewDescription(
      hit({ entityType: 'tableColumn', fullyQualifiedName: 'svc.db.schema.orders.customer_id' }),
      undefined,
      'Old',
      'New',
    );
    expect(columnMock).toHaveBeenCalledWith('svc.db.schema.orders.customer_id', 'table', {
      description: 'New',
    });
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('saves tags as a whole-/tags PATCH with labelType/state preserved', async () => {
    patchMock.mockResolvedValue({});
    const current: TagRef[] = [
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
    ];
    await savePreviewTags(hit(), 't1', current, [
      { tagFQN: 'PII.Email', name: 'Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
      { tagFQN: 'PII.Sensitive', name: 'Sensitive', source: 'Classification' },
    ]);
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      {
        op: 'replace',
        path: '/tags',
        value: [
          { tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
          { tagFQN: 'PII.Sensitive', source: 'Classification', labelType: 'Manual', state: 'Confirmed' },
        ],
      },
    ]);
  });

  it('saves column tags through updateColumnDetails', async () => {
    columnMock.mockResolvedValue({});
    await savePreviewTags(
      hit({ entityType: 'tableColumn', fullyQualifiedName: 'svc.db.schema.orders.customer_id' }),
      undefined,
      [],
      [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification' }],
    );
    expect(columnMock).toHaveBeenCalledWith('svc.db.schema.orders.customer_id', 'table', {
      tags: [{ tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
    });
  });

  it('saves owners as a whole-/owners PATCH of {id, type} refs', async () => {
    patchMock.mockResolvedValue({});
    await savePreviewOwners(hit(), 't1', [], [{ id: 'u1', type: 'user' }]);
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      { op: 'replace', path: '/owners', value: [{ id: 'u1', type: 'user' }] },
    ]);
  });

  it('saves domains as a whole-/domains PATCH of domain refs', async () => {
    patchMock.mockResolvedValue({});
    await savePreviewDomains(hit(), 't1', [], ['d1']);
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      { op: 'replace', path: '/domains', value: [{ id: 'd1', type: 'domain' }] },
    ]);
  });

  it('saves data products through patchDataProduct for a data-product hit and drops id-less refs', async () => {
    productPatchMock.mockResolvedValue({});
    await savePreviewDataProducts(
      hit({ entityType: 'dataProduct', fullyQualifiedName: 'biz.dp' }),
      'dp-1',
      [],
      [
        { name: 'dp2', displayName: 'DP2', id: 'dp-2', type: 'dataProduct' },
        { name: 'ghost', displayName: 'Ghost' },
      ],
    );
    expect(productPatchMock).toHaveBeenCalledWith('dp-1', [
      { op: 'replace', path: '/dataProducts', value: [{ id: 'dp-2', type: 'dataProduct' }] },
    ]);
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('routes a domain description save through patchDomain', async () => {
    domainPatchMock.mockResolvedValue({});
    await savePreviewDescription(
      hit({ entityType: 'domain', fullyQualifiedName: 'biz.finance' }),
      'dom-1',
      'Old',
      'New',
    );
    expect(domainPatchMock).toHaveBeenCalledWith('dom-1', [
      { op: 'replace', path: '/description', value: 'New' },
    ]);
  });

  it('routes a glossary-term tags save through patchGlossaryTerm', async () => {
    termPatchMock.mockResolvedValue({});
    await savePreviewTags(
      hit({ entityType: 'glossaryTerm', fullyQualifiedName: 'biz.term' }),
      'term-1',
      [],
      [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification' }],
    );
    expect(termPatchMock).toHaveBeenCalledWith('term-1', [
      {
        op: 'replace',
        path: '/tags',
        value: [{ tagFQN: 'PII.Email', source: 'Classification', labelType: 'Manual', state: 'Confirmed' }],
      },
    ]);
  });

  it('saves a display name as a /displayName replace through patchAsset', async () => {
    patchMock.mockResolvedValue({});
    await savePreviewDisplayName(hit(), 't1', 'Orders', 'Orders v2');
    expect(patchMock).toHaveBeenCalledWith('table', 't1', [
      { op: 'replace', path: '/displayName', value: 'Orders v2' },
    ]);
  });

  it('saves a column display name through updateColumnDetails', async () => {
    columnMock.mockResolvedValue({});
    await savePreviewDisplayName(
      hit({ entityType: 'tableColumn', fullyQualifiedName: 'svc.db.schema.orders.customer_id' }),
      undefined,
      'customer_id',
      'Customer ID',
    );
    expect(columnMock).toHaveBeenCalledWith('svc.db.schema.orders.customer_id', 'table', {
      displayName: 'Customer ID',
    });
  });

  it('throws without an entity id instead of sending an id-less PATCH', async () => {
    await expect(savePreviewDescription(hit(), undefined, 'Old', 'New')).rejects.toThrow(
      'without an entity id',
    );
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('propagates a failed PATCH so the caller keeps the editor open', async () => {
    patchMock.mockRejectedValue(new Error('boom'));
    await expect(savePreviewDescription(hit(), 't1', 'Old', 'New')).rejects.toThrow('boom');
  });
});

describe('findPreviewColumnRow', () => {
  it('finds a nested STRUCT child by FQN', () => {
    const rows = [
      {
        key: 'a',
        name: 'a',
        dataType: 'struct',
        fullyQualifiedName: 't.a',
        children: [
          { key: 'a.b', name: 'b', dataType: 'varchar', fullyQualifiedName: 't.a.b', description: 'B' },
        ],
      },
    ];
    expect(findPreviewColumnRow(rows, 't.a.b')?.description).toBe('B');
    expect(findPreviewColumnRow(rows, 't.a.c')).toBeUndefined();
  });
});

describe('fetchPreviewOverviewRefresh', () => {
  it('returns null for DETAIL_ENDPOINTS types (their refetch is the entity watcher)', async () => {
    await expect(fetchPreviewOverviewRefresh(hit())).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads a data product back through its by-name getter', async () => {
    productMock.mockResolvedValue({
      id: 'dp-1',
      name: 'dp',
      displayName: 'DP',
      description: 'Fresh',
      domains: [{ name: 'finance' }],
      owners: [{ name: 'alice' }],
      tags: [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification' }],
    });
    const refresh = await fetchPreviewOverviewRefresh(
      hit({ entityType: 'dataProduct', fullyQualifiedName: 'biz.dp' }),
    );
    expect(productMock).toHaveBeenCalledWith('biz.dp');
    expect(refresh).toMatchObject({ id: 'dp-1', description: 'Fresh', displayName: 'DP' });
  });

  it('reads a column back from its parent table rows', async () => {
    fetchMock.mockResolvedValue({
      entityType: 'table',
      schemaRows: [
        {
          key: 'customer_id',
          name: 'customer_id',
          dataType: 'varchar(50)',
          fullyQualifiedName: 'svc.db.schema.orders.customer_id',
          description: 'Fresh column',
          tags: [{ tagFQN: 'PII.Email', name: 'Email', source: 'Classification' }],
        },
      ],
    });
    const refresh = await fetchPreviewOverviewRefresh(
      hit({
        entityType: 'tableColumn',
        fullyQualifiedName: 'svc.db.schema.orders.customer_id',
        tableFqn: 'svc.db.schema.orders',
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith('table', 'svc.db.schema.orders');
    expect(refresh).toMatchObject({ description: 'Fresh column' });
  });

  it('returns null when the read-back fails (the save already succeeded)', async () => {
    domainMock.mockRejectedValue(new Error('gone'));
    await expect(
      fetchPreviewOverviewRefresh(hit({ entityType: 'domain', fullyQualifiedName: 'biz.finance' })),
    ).resolves.toBeNull();
  });
});
