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
import { ApiError } from '@/api/client';
import { getErrorText, isAlreadyExistsError } from './accessApiErrors';

describe('accessApiErrors', () => {
  it('returns a string error as-is', () => {
    expect(getErrorText('plain failure', 'fallback')).toBe('plain failure');
  });

  it('prefers the body message, then responseMessage, then the raw body', () => {
    expect(getErrorText(new ApiError(400, JSON.stringify({ message: 'bad rule' })), 'fallback')).toBe('bad rule');
    expect(getErrorText(new ApiError(400, JSON.stringify({ responseMessage: 'resp msg' })), 'fallback')).toBe(
      'resp msg',
    );
    expect(getErrorText(new ApiError(400, 'raw text body'), 'fallback')).toBe('raw text body');
  });

  it('falls back when the body carries no readable message', () => {
    expect(getErrorText(new ApiError(400, JSON.stringify({ code: 400 })), 'fallback')).toBe('fallback');
    expect(getErrorText(new ApiError(400, ''), 'fallback')).toBe('fallback');
    expect(getErrorText(new Error(''), 'fallback')).toBe('fallback');
    expect(getErrorText(undefined, 'fallback')).toBe('fallback');
  });

  it('uses a generic Error message', () => {
    expect(getErrorText(new Error('network down'), 'fallback')).toBe('network down');
  });

  it('matches already-exists on the extracted text, case-sensitively', () => {
    expect(
      isAlreadyExistsError(new ApiError(409, JSON.stringify({ message: 'Entity already exists' }))),
    ).toBe(true);
    expect(isAlreadyExistsError(new ApiError(409, JSON.stringify({ message: 'Already Exists' })))).toBe(false);
    expect(isAlreadyExistsError(new ApiError(400, JSON.stringify({ message: 'bad request' })))).toBe(false);
    expect(isAlreadyExistsError('already exists')).toBe(true);
  });
});
