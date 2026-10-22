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
import { ConfigError, loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('requires OM_JWT and fails closed before any HTTP call', () => {
    expect(() => loadConfig({ OM_API_URL: 'http://localhost:8585' })).toThrow(ConfigError);
    expect(() => loadConfig({ OM_API_URL: 'http://localhost:8585' })).toThrow(/OM_JWT/);
  });

  it('rejects a blank JWT', () => {
    expect(() => loadConfig({ OM_JWT: '   ' })).toThrow(ConfigError);
  });

  it('rewrites a bare origin to the /api root', () => {
    const config = loadConfig({
      OM_API_URL: 'http://localhost:8585',
      OM_JWT: 'bot-token',
    });
    expect(config.apiUrl).toBe('http://localhost:8585/api');
    expect(config.jwt).toBe('bot-token');
    expect(config.timeoutMs).toBe(30_000);
  });

  it('keeps an explicit /api path', () => {
    const config = loadConfig({
      OM_API_URL: 'https://catalog.example.com/api',
      OM_JWT: 'pat',
    });
    expect(config.apiUrl).toBe('https://catalog.example.com/api');
  });

  it('accepts OM_HOST_PORT as an alias', () => {
    const config = loadConfig({
      OM_HOST_PORT: 'http://om:8585/',
      OM_JWT: 'bot-token',
    });
    expect(config.apiUrl).toBe('http://om:8585/api');
  });

  it('rejects a non-http URL', () => {
    expect(() => loadConfig({ OM_API_URL: 'ftp://catalog.example', OM_JWT: 't' })).toThrow(
      /http or https/,
    );
  });

  it('clamps OM_TIMEOUT_MS to 1–120000', () => {
    expect(
      loadConfig({ OM_JWT: 't', OM_TIMEOUT_MS: '500000' }).timeoutMs,
    ).toBe(120_000);
    expect(loadConfig({ OM_JWT: 't', OM_TIMEOUT_MS: '0' }).timeoutMs).toBe(1);
    expect(loadConfig({ OM_JWT: 't', OM_TIMEOUT_MS: '15000' }).timeoutMs).toBe(15_000);
  });
});
