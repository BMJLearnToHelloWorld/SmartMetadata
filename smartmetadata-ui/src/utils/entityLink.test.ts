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
import { ENTITY_LINK_SEPARATOR, getEntityFeedLink } from './entityLink';

describe('getEntityFeedLink (official EntityPureUtils)', () => {
  it('builds the <#E::type::fqn> link', () => {
    expect(getEntityFeedLink('databaseService', 'pg.warehouse')).toBe(
      '<#E::databaseService::pg.warehouse>',
    );
  });

  it('appends the field segment when given', () => {
    expect(getEntityFeedLink('table', 'db.schema.t', 'columns')).toBe(
      '<#E::table::db.schema.t::columns>',
    );
  });

  it('returns an empty string when the type or fqn is undefined', () => {
    expect(getEntityFeedLink(undefined, 'pg.warehouse')).toBe('');
    expect(getEntityFeedLink('databaseService', undefined)).toBe('');
    expect(getEntityFeedLink()).toBe('');
  });

  it('exposes the :: separator', () => {
    expect(ENTITY_LINK_SEPARATOR).toBe('::');
  });
});
