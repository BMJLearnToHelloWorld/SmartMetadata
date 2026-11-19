import { describe, expect, it } from 'vitest';

import {
  buildEditPatch,
  getEditConfigData,
  mergeEditConfig,
} from '@/ingestion/serviceEditMerge';
import type { CatalogService } from '@/types/ingestion';

function service(overrides: Partial<CatalogService> = {}): CatalogService {
  return {
    id: 'svc-1',
    name: 'postgres-svc',
    fullyQualifiedName: 'postgres-svc',
    kind: 'database',
    serviceType: 'Postgres',
    connection: {
      config: {
        type: 'Postgres',
        hostPort: 'db:5432',
        username: 'om',
        supportsMetadataExtraction: true,
        supportsProfiler: false,
        unmodeledKey: 'kept',
      },
    },
    ...overrides,
  };
}

describe('getEditConfigData', () => {
  it('shallow-merges the emitted config into the stored connection', () => {
    const merged = getEditConfigData(service(), {
      type: 'Postgres',
      hostPort: 'db2:5432',
    });
    expect(merged.connection?.config).toEqual({
      type: 'Postgres',
      hostPort: 'db2:5432',
      username: 'om',
      supportsMetadataExtraction: true,
      supportsProfiler: false,
      unmodeledKey: 'kept',
    });
  });

  it('preserves supports* and unmodeled keys the form did not emit', () => {
    const merged = getEditConfigData(service(), { type: 'Postgres' });
    expect(merged.connection?.config?.supportsMetadataExtraction).toBe(true);
    expect(merged.connection?.config?.unmodeledKey).toBe('kept');
  });

  it('returns the entity unchanged when there is no emitted data', () => {
    const original = service();
    expect(getEditConfigData(original, undefined)).toBe(original);
  });

  it('drops the emitted data when the entity has no connection', () => {
    const original = service({ connection: undefined });
    const merged = getEditConfigData(original, {
      type: 'Postgres',
      hostPort: 'db2:5432',
    });
    expect(merged.connection).toBeUndefined();
    expect(merged).not.toBe(original);
  });
});

describe('mergeEditConfig', () => {
  it('layers stored, step-1, and filter values with later layers winning', () => {
    const merged = mergeEditConfig(
      { type: 'Postgres', hostPort: 'db:5432', databaseFilterPattern: { includes: ['a'] } },
      { hostPort: 'db2:5432', username: 'om' },
      { databaseFilterPattern: { includes: ['b'] } },
    );
    expect(merged).toEqual({
      type: 'Postgres',
      hostPort: 'db2:5432',
      username: 'om',
      databaseFilterPattern: { includes: ['b'] },
    });
  });

  it('contributes nothing for missing or non-object layers', () => {
    expect(mergeEditConfig(undefined, null, { a: 1 })).toEqual({ a: 1 });
    expect(mergeEditConfig('nope', 42, {})).toEqual({});
  });
});

describe('buildEditPatch', () => {
  it('is empty when the rebuilt entity equals the fetched entity', () => {
    const original = service();
    const merged = getEditConfigData(original, original.connection?.config);
    expect(buildEditPatch(original, merged)).toEqual([]);
  });

  it('emits only ops for changed config keys', () => {
    const original = service();
    const merged = getEditConfigData(original, {
      type: 'Postgres',
      hostPort: 'db2:5432',
    });
    const patch = buildEditPatch(original, merged);
    expect(patch).toEqual([
      { op: 'replace', path: '/connection/config/hostPort', value: 'db2:5432' },
    ]);
  });

  it('emits filter-only ops when only filter values changed', () => {
    const original = service();
    const merged = {
      ...original,
      connection: {
        config: mergeEditConfig(original.connection?.config, undefined, {
          databaseFilterPattern: { includes: ['x'] },
        }),
      },
    };
    const patch = buildEditPatch(original, merged);
    expect(patch).toHaveLength(1);
    expect(patch[0]).toMatchObject({
      op: 'add',
      path: '/connection/config/databaseFilterPattern',
    });
  });

  it('emits no ops for supports* or unmodeled keys that were not touched', () => {
    const original = service();
    const merged = {
      ...original,
      connection: {
        config: mergeEditConfig(
          original.connection?.config,
          { type: 'Postgres', hostPort: 'db2:5432' },
          {},
        ),
      },
    };
    const patch = buildEditPatch(original, merged);
    expect(patch.map((op) => op.path)).toEqual(['/connection/config/hostPort']);
  });
});
