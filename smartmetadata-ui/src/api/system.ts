/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asBoolean, asNumber, asRecord, asString, parsePaged } from '@/api/json';
import type {
  AuthConfiguration,
  EmailConfiguration,
  LoginConfiguration,
  Paged,
  ServerVersion,
  SystemSetting,
} from '@/types/admin';
import { apiRequest } from './client';

export const EDITABLE_SETTING_TYPES = new Set(['loginConfiguration', 'emailConfiguration']);

function mapAuth(raw: unknown): AuthConfiguration {
  const rec = asRecord(raw) ?? {};
  return {
    provider: asString(rec.provider) || undefined,
    providerName: asString(rec.providerName) || undefined,
    clientType: asString(rec.clientType) || undefined,
    enableSelfSignup: asBoolean(rec.enableSelfSignup),
    enableAutoRedirect: asBoolean(rec.enableAutoRedirect),
    clientId: asString(rec.clientId) || undefined,
    authority: asString(rec.authority) || undefined,
    callbackUrl: asString(rec.callbackUrl) || undefined,
  };
}

function mapLogin(raw: unknown): LoginConfiguration {
  const rec = asRecord(raw) ?? {};
  return {
    maxLoginFailAttempts: asNumber(rec.maxLoginFailAttempts),
    accessBlockTime: asNumber(rec.accessBlockTime),
    jwtTokenExpiryTime: asNumber(rec.jwtTokenExpiryTime),
  };
}

function mapEmail(raw: unknown): EmailConfiguration {
  const rec = asRecord(raw) ?? {};
  return {
    emailingEntity: asString(rec.emailingEntity) || undefined,
    supportUrl: asString(rec.supportUrl) || undefined,
    enableSmtpServer: asBoolean(rec.enableSmtpServer),
    senderMail: asString(rec.senderMail) || undefined,
    serverEndpoint: asString(rec.serverEndpoint) || undefined,
    serverPort: asNumber(rec.serverPort),
    username: asString(rec.username) || undefined,
    password: asString(rec.password) || undefined,
    transportationStrategy: asString(rec.transportationStrategy) || undefined,
    templates: asString(rec.templates) || undefined,
  };
}

function mapSetting(raw: Record<string, unknown>): SystemSetting | null {
  const configType = asString(raw.configType) || asString(raw.config_type);
  if (!configType) {
    return null;
  }
  return {
    configType,
    configValue: raw.configValue !== undefined ? raw.configValue : raw.config_value,
  };
}

export function fetchAuthConfig(): Promise<AuthConfiguration> {
  return apiRequest<unknown>('/v1/system/config/auth', { auth: false }).then(mapAuth);
}

export function fetchLoginConfig(): Promise<LoginConfiguration> {
  return apiRequest<unknown>('/v1/system/config/loginConfig').then(mapLogin);
}

export function fetchServerVersion(): Promise<ServerVersion> {
  return apiRequest<unknown>('/v1/system/version').then((raw) => {
    const rec = asRecord(raw) ?? {};
    return {
      version: asString(rec.version) || undefined,
      revision: asString(rec.revision) || undefined,
      timestamp: asNumber(rec.timestamp),
    };
  });
}

export function listSettings(): Promise<Paged<SystemSetting>> {
  return apiRequest<unknown>('/v1/system/settings').then((payload) => parsePaged(payload, mapSetting));
}

export async function getSetting(name: string): Promise<SystemSetting> {
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/system/settings/${encodeURIComponent(name)}`,
  );
  const mapped = mapSetting(raw);
  if (!mapped) {
    throw new Error(`Setting "${name}" was missing config_type`);
  }
  return mapped;
}

export function updateSetting(configType: string, configValue: unknown): Promise<SystemSetting> {
  return apiRequest<Record<string, unknown>>('/v1/system/settings', {
    method: 'PUT',
    json: { config_type: configType, config_value: configValue },
  }).then((raw) => {
    const mapped = mapSetting(raw);
    if (!mapped) {
      return { configType, configValue };
    }
    return mapped;
  });
}

export function settingAsLoginConfig(value: unknown): LoginConfiguration {
  return mapLogin(value);
}

export function settingAsEmailConfig(value: unknown): EmailConfiguration {
  return mapEmail(value);
}
