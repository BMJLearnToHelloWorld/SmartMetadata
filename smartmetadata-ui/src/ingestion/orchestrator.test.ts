/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it, vi } from 'vitest';
import { isAirflowAvailable } from './orchestrator';

vi.mock('@/api/ingestionPipelines', () => ({
  getOrchestratorStatus: vi.fn(),
}));

import { getOrchestratorStatus } from '@/api/ingestionPipelines';

const mockedStatus = vi.mocked(getOrchestratorStatus);

describe('isAirflowAvailable', () => {
  it('is true only on code 200', async () => {
    mockedStatus.mockResolvedValueOnce({ code: 200, platform: 'airflow' });
    await expect(isAirflowAvailable()).resolves.toBe(true);

    mockedStatus.mockResolvedValueOnce({ code: 503, platform: 'disabled', reason: 'down' });
    await expect(isAirflowAvailable()).resolves.toBe(false);

    mockedStatus.mockResolvedValueOnce({});
    await expect(isAirflowAvailable()).resolves.toBe(false);
  });

  it('is false when the status fetch fails', async () => {
    mockedStatus.mockRejectedValueOnce(new Error('network down'));
    await expect(isAirflowAvailable()).resolves.toBe(false);
  });
});
