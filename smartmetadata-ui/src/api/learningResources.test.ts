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
import { listLearningResources } from './learningResources';

vi.mock('./client', () => ({
  apiRequest: vi.fn(),
}));

import { apiRequest } from './client';

const mocked = apiRequest as unknown as ReturnType<typeof vi.fn>;

describe('learningResources API', () => {
  beforeEach(() => {
    mocked.mockReset();
  });

  it('lists resources from /v1/learning/resources', async () => {
    mocked.mockResolvedValueOnce({
      data: [
        {
          id: '1',
          name: 'intro',
          resourceType: 'article',
          source: { url: 'https://example.com' },
        },
      ],
    });
    const page = await listLearningResources();
    expect(page.data[0].source.url).toBe('https://example.com');
    expect(mocked).toHaveBeenCalledWith('/v1/learning/resources');
  });
});
