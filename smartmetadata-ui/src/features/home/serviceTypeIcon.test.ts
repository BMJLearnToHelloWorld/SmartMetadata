/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ApartmentOutlined, CloudOutlined, DatabaseOutlined, PieChartOutlined } from '@ant-design/icons-vue';
import { describe, expect, it } from 'vitest';
import { serviceTypeIcon } from './serviceTypeIcon';

describe('serviceTypeIcon', () => {
  it('maps known service families to ant icons without OM SVG copies', () => {
    expect(serviceTypeIcon('Mysql')).toBe(DatabaseOutlined);
    expect(serviceTypeIcon('Postgres')).toBe(DatabaseOutlined);
    expect(serviceTypeIcon('Superset')).toBe(PieChartOutlined);
    expect(serviceTypeIcon('Custom Pipeline')).toBe(ApartmentOutlined);
    expect(serviceTypeIcon('Custom Storage')).toBe(CloudOutlined);
  });
});
