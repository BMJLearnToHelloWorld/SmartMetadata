/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { getSafeHttpUrl } from './safeHttpUrl';

describe('getSafeHttpUrl', () => {
  it('passes http and https URLs through', () => {
    expect(getSafeHttpUrl('https://example.com/guide')).toBe('https://example.com/guide');
    expect(getSafeHttpUrl('http://example.com/guide')).toBe('http://example.com/guide');
  });

  it('rejects non-http protocols, relative paths and malformed URLs', () => {
    expect(getSafeHttpUrl('javascript:alert(1)')).toBeUndefined();
    expect(getSafeHttpUrl('data:text/html,<h1>x</h1>')).toBeUndefined();
    expect(getSafeHttpUrl('/context-center/articles/x')).toBeUndefined();
    expect(getSafeHttpUrl('not a url')).toBeUndefined();
    expect(getSafeHttpUrl(undefined)).toBeUndefined();
  });
});
