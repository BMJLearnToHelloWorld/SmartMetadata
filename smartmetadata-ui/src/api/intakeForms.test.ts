/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getIntakeFormByEntityType } from './intakeForms';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('getIntakeFormByEntityType', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the form for the entity type and maps it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          id: 'f1',
          name: 'metric-intake',
          entityType: 'metric',
          formFields: [
            { fieldPath: 'displayName', fieldLabel: 'Display name', fieldKind: 'native', required: true },
          ],
        }),
      ),
    );
    const form = await getIntakeFormByEntityType('metric');
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toContain(
      '/api/v1/governance/intakeForms/entityType/metric',
    );
    expect(form).toMatchObject({ id: 'f1', entityType: 'metric' });
    expect(form?.formFields).toHaveLength(1);
  });

  it('resolves to null on 404 (no form configured is not an error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'not found' }, 404)));
    await expect(getIntakeFormByEntityType('metric')).resolves.toBeNull();
  });

  it('throws on a non-404 failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ message: 'boom' }, 500)));
    await expect(getIntakeFormByEntityType('metric')).rejects.toThrow('boom');
  });
});
