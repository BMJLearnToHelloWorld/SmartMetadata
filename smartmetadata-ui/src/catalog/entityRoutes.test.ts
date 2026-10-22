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
  assetLocation,
  encodeFqnForApi,
  resolveDetailEndpoint,
} from './entityRoutes';

describe('entityRoutes', () => {
  it('builds a Vue route that keeps the raw FQN in params', () => {
    expect(assetLocation('table', 'svc.db.schema.orders')).toEqual({
      name: 'asset',
      params: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    });
  });

  it('percent-encodes FQNs for GET /v1/{collection}/name/{fqn}', () => {
    expect(encodeFqnForApi('svc.db."Sales Schema".orders')).toBe(
      encodeURIComponent('svc.db."Sales Schema".orders'),
    );
  });

  it('maps Phase 1 entity types onto documented collections', () => {
    expect(resolveDetailEndpoint('table', 'svc.db.schema.orders')).toEqual({
      path: `/v1/tables/name/${encodeURIComponent('svc.db.schema.orders')}`,
      fields: 'owners,tags,columns',
    });
    expect(resolveDetailEndpoint('topic', 'kafka.events')).toEqual({
      path: `/v1/topics/name/${encodeURIComponent('kafka.events')}`,
      fields: 'owners,tags',
    });
  });

  it('does not invent endpoints for unwired entity types', () => {
    expect(resolveDetailEndpoint('dashboard', 'bi.sales')).toBeNull();
    expect(resolveDetailEndpoint('', 'x')).toBeNull();
  });
});
