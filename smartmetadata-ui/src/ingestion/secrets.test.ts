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
import { displaySecret, isEnvPlaceholder, isMaskedSecret, shouldPersistSecret } from './secrets';

describe('ingestion secrets', () => {
  it('accepts ${VAR} and ${VAR:-default} placeholders', () => {
    expect(isEnvPlaceholder('${PG_PASSWORD}')).toBe(true);
    expect(isEnvPlaceholder('${PG_PASSWORD:-secret}')).toBe(true);
    expect(isEnvPlaceholder('hunter2')).toBe(false);
  });

  it('treats asterisk masks as stored secrets', () => {
    expect(isMaskedSecret('********')).toBe(true);
    expect(isMaskedSecret('hidden')).toBe(true);
    expect(isMaskedSecret('${PG_PASSWORD}')).toBe(false);
  });

  it('never echoes stored secrets into form fields', () => {
    expect(displaySecret('********')).toBe('');
    expect(displaySecret('real-password')).toBe('');
  });

  it('persists placeholders always and literals only when asked', () => {
    expect(shouldPersistSecret('${PG_PASSWORD}', false)).toBe(true);
    expect(shouldPersistSecret('hunter2', false)).toBe(false);
    expect(shouldPersistSecret('hunter2', true)).toBe(true);
    expect(shouldPersistSecret('********', true)).toBe(false);
    expect(shouldPersistSecret('', true)).toBe(false);
  });
});
