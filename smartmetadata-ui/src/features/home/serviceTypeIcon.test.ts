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
import { navIcon } from '@/layouts/navIcons';
import { serviceTypeIcon } from './serviceTypeIcon';

describe('serviceTypeIcon', () => {
  it('maps known service families to the single icon map without OM SVG copies', () => {
    expect(serviceTypeIcon('Mysql')).toBe(navIcon('service-database'));
    expect(serviceTypeIcon('Postgres')).toBe(navIcon('service-database'));
    expect(serviceTypeIcon('Superset')).toBe(navIcon('service-dashboard'));
    expect(serviceTypeIcon('Custom Pipeline')).toBe(navIcon('service-pipeline'));
    expect(serviceTypeIcon('Custom Storage')).toBe(navIcon('service-storage'));
  });
});
