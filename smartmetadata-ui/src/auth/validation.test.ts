/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { isValidEmail, isValidPassword, passwordsMatch } from './validation';

describe('auth validation', () => {
  it('accepts the official email shape and rejects the rest', () => {
    expect(isValidEmail('admin@open-metadata.org')).toBe(true);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
  });

  it('enforces digit + upper + lower + symbol, 8-56 chars, no spaces', () => {
    expect(isValidPassword('Admin123!')).toBe(true);
    expect(isValidPassword('admin123!')).toBe(false);
    expect(isValidPassword('Admin123')).toBe(false);
    expect(isValidPassword('Admin 123!')).toBe(false);
    expect(isValidPassword('Ad1!')).toBe(false);
    // Deterministic on repeat: no /g lastIndex state.
    expect(isValidPassword('Admin123!')).toBe(true);
    expect(isValidPassword('Admin123!')).toBe(true);
  });

  it('matches only non-empty identical passwords', () => {
    expect(passwordsMatch('Admin123!', 'Admin123!')).toBe(true);
    expect(passwordsMatch('Admin123!', 'Admin123?')).toBe(false);
    expect(passwordsMatch('', '')).toBe(false);
  });
});
