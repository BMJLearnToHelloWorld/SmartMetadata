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
import {
  getCategoryDefaultLogo,
  getServiceTypeLogo,
  normalizeServiceIconKey,
} from './serviceLogos';

describe('normalizeServiceIconKey', () => {
  it('lowercases and strips underscores and dashes', () => {
    expect(normalizeServiceIconKey('MySQL')).toBe('mysql');
    expect(normalizeServiceIconKey('my-sql')).toBe('mysql');
    expect(normalizeServiceIconKey('my_sql')).toBe('mysql');
    expect(normalizeServiceIconKey('KafkaConnect')).toBe('kafkaconnect');
  });
});

describe('getServiceTypeLogo', () => {
  it('prefers the source style iconURL', () => {
    expect(
      getServiceTypeLogo({ serviceType: 'Mysql', style: { iconURL: 'https://x/logo.png' } }),
    ).toEqual({ kind: 'url', url: 'https://x/logo.png' });
  });

  it('falls back to the parent service style iconURL', () => {
    expect(
      getServiceTypeLogo({
        serviceType: 'Mysql',
        service: { style: { iconURL: 'https://x/parent.png' } },
      }),
    ).toEqual({ kind: 'url', url: 'https://x/parent.png' });
  });

  it('prefers the own iconURL over the parent service iconURL', () => {
    expect(
      getServiceTypeLogo({
        serviceType: 'Mysql',
        style: { iconURL: 'https://x/own.png' },
        service: { style: { iconURL: 'https://x/parent.png' } },
      }),
    ).toEqual({ kind: 'url', url: 'https://x/own.png' });
  });

  it('resolves known types to their category default glyph', () => {
    expect(getServiceTypeLogo({ serviceType: 'Mysql' })).toEqual({
      kind: 'icon',
      iconKey: 'service-database',
    });
    expect(getServiceTypeLogo({ serviceType: 'Kafka' })).toEqual({
      kind: 'icon',
      iconKey: 'service-messaging',
    });
    expect(getServiceTypeLogo({ serviceType: 'Superset' })).toEqual({
      kind: 'icon',
      iconKey: 'service-dashboard',
    });
    expect(getServiceTypeLogo({ serviceType: 'Prefect' })).toEqual({
      kind: 'icon',
      iconKey: 'service-pipeline',
    });
    expect(getServiceTypeLogo({ serviceType: 'S3' })).toEqual({
      kind: 'icon',
      iconKey: 'service-storage',
    });
  });

  it('resolves unknown types to defaultservice', () => {
    expect(getServiceTypeLogo({ serviceType: 'SomethingNew' })).toEqual({
      kind: 'icon',
      iconKey: 'service-default',
    });
  });

  it('resolves a missing serviceType to the default icon', () => {
    expect(getServiceTypeLogo({})).toEqual({ kind: 'icon', iconKey: 'service-default' });
    expect(getServiceTypeLogo(undefined)).toEqual({ kind: 'icon', iconKey: 'service-default' });
  });
});

describe('getCategoryDefaultLogo', () => {
  it('maps each category to its default glyph', () => {
    expect(getCategoryDefaultLogo('database')).toEqual({
      kind: 'icon',
      iconKey: 'service-database',
    });
    expect(getCategoryDefaultLogo('messaging')).toEqual({
      kind: 'icon',
      iconKey: 'service-messaging',
    });
    expect(getCategoryDefaultLogo('security')).toEqual({
      kind: 'icon',
      iconKey: 'service-default',
    });
  });
});
