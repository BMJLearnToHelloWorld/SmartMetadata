/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asNumber, asRecord, asString } from '@/api/json';
import { ApiError, apiRequest } from './client';

export interface UsageDay {
  date: string;
  count: number;
}

export async function getEntityUsage(entityType: string, fqn: string, days = 30): Promise<UsageDay[]> {
  try {
    const raw = await apiRequest<unknown>(
      `/v1/usage/${encodeURIComponent(entityType)}/name/${encodeURIComponent(fqn)}`,
      { query: { days: Math.min(Math.max(days, 1), 30) } },
    );
    const root = asRecord(raw);
    if (!root || !Array.isArray(root.usage)) {
      return [];
    }
    return root.usage.flatMap((item) => {
      const rec = asRecord(item);
      if (!rec) {
        return [];
      }
      const date = asString(rec.date);
      const daily = asRecord(rec.dailyStats);
      const count = asNumber(daily?.count) ?? asNumber(rec.count);
      if (!date || count === undefined) {
        return [];
      }
      return [{ date, count }];
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return [];
    }
    throw error;
  }
}
