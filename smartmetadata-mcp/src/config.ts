/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface RuntimeConfig {
  apiUrl: string;
  jwt: string;
  timeoutMs: number;
}

const DEFAULT_ORIGIN = 'http://localhost:8585';
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;

function readEnv(env: NodeJS.Dict<string>, key: string): string | undefined {
  const value = env[key];
  return typeof value === 'string' ? value : undefined;
}

export function normalizeApiUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ConfigError('OM_API_URL is empty');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ConfigError('OM_API_URL must be an absolute http(s) URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ConfigError('OM_API_URL must be http or https');
  }
  if (parsed.pathname === '' || parsed.pathname === '/') {
    return `${parsed.origin}/api`;
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

function parseTimeout(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_TIMEOUT_MS;
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_TIMEOUT_MS;
  }
  return Math.min(MAX_TIMEOUT_MS, Math.max(1, Math.trunc(numeric)));
}

export function loadConfig(env: NodeJS.Dict<string> = process.env): RuntimeConfig {
  const jwt = readEnv(env, 'OM_JWT')?.trim() ?? '';
  if (!jwt) {
    throw new ConfigError('OM_JWT is required (bot JWT or PAT). Refusing to start without credentials.');
  }
  const rawUrl = readEnv(env, 'OM_API_URL')?.trim() || readEnv(env, 'OM_HOST_PORT')?.trim() || DEFAULT_ORIGIN;
  return {
    apiUrl: normalizeApiUrl(rawUrl),
    jwt,
    timeoutMs: parseTimeout(readEnv(env, 'OM_TIMEOUT_MS')),
  };
}
