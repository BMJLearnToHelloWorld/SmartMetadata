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
import { listDataQualityDimensions } from './dataQualityDimensions';

vi.mock('./client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from './client';

const mocked = apiRequest as unknown as ReturnType<typeof vi.fn>;

describe('dataQualityDimensions API', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('lists dimensions from /v1/dataQuality/dimensions', async () => {
    mocked.mockResolvedValueOnce({
      data: [{ id: '1', name: 'Accuracy', displayName: 'Accuracy' }],
    });
    const page = await listDataQualityDimensions({ limit: 10 });
    expect(page.data[0].name).toBe('Accuracy');
    expect(mocked).toHaveBeenCalledWith('/v1/dataQuality/dimensions?limit=10');
  });
});
