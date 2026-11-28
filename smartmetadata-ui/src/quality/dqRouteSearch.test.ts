/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { describe, expect, it } from 'vitest';
import { routeQueryToSearch, searchStringToQuery } from './dqRouteSearch';

describe('dqRouteSearch', () => {
  it('round-trips multi-value query params', () => {
    const search = '?testCaseStatus=Success&testCaseStatus=Queued';
    const route = {
      query: {
        testCaseStatus: ['Success', 'Queued'],
        tab: 'test-cases',
      },
    } as Parameters<typeof routeQueryToSearch>[0];

    expect(routeQueryToSearch(route)).toBe('?testCaseStatus=Success&testCaseStatus=Queued');

    const restored = searchStringToQuery(search);
    expect(restored.testCaseStatus).toEqual(['Success', 'Queued']);
  });
});