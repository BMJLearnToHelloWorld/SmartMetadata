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
  BETA_SERVICES,
  customServiceComparator,
  EXCLUDED_SERVICES,
  getSupportedServiceFromList,
  getValidatedServiceType,
  getWizardConnectors,
  getWizardDisplayName,
  isBetaService,
  UNSUPPORTED_SERVICES,
} from './wizardServiceTypes';

describe('wizard tables', () => {
  it('pins the exclusion, beta, and unsupported table sizes', () => {
    expect(EXCLUDED_SERVICES).toHaveLength(4);
    expect(BETA_SERVICES).toHaveLength(29);
    expect(UNSUPPORTED_SERVICES).toHaveLength(31);
  });

  it('excludes 9 of the 40 product types from the wizard, leaving 31 exposable', () => {
    const all = getWizardConnectors('all');
    expect(all).toHaveLength(31);
    const types = all.map(({ type }) => type);
    for (const excluded of ['Alation', 'WEBHOOK', 'VertexAI', 'Ranger', 'SharePoint', 'Collibra']) {
      expect(types).not.toContain(excluded);
    }
    for (const excluded of ['Sklearn', 'MetadataES', 'OpenMetadata']) {
      expect(types).not.toContain(excluded);
    }
  });

  it('orders the flattened grid by ServiceCategory enum order', () => {
    const categories = [...new Set(getWizardConnectors('all').map(({ type: _t, category }) => category))];
    // Security contributes no connectors (Ranger is unsupported), so it
    // leaves no trace in the flattened grid.
    expect(categories).toEqual([
      'database',
      'messaging',
      'dashboard',
      'pipeline',
      'mlmodel',
      'metadata',
      'storage',
      'search',
      'api',
      'drive',
    ]);
  });
});

describe('customServiceComparator', () => {
  it('sorts Custom types last and the rest alphabetically', () => {
    const sorted = ['Mlflow', 'CustomMlModel', 'SageMaker'].sort(customServiceComparator);
    expect(sorted).toEqual(['Mlflow', 'SageMaker', 'CustomMlModel']);
    expect(['b', 'a'].sort(customServiceComparator)).toEqual(['a', 'b']);
  });
});

describe('getSupportedServiceFromList', () => {
  it('removes unsupported types and sorts each category', () => {
    const supported = getSupportedServiceFromList();
    expect(supported.messaging).toEqual(['Kafka', 'Redpanda']);
    expect(supported.metadata).toEqual(['AlationSink', 'Amundsen', 'Atlas', 'MetadataES', 'OpenMetadata']);
    expect(supported.security).toEqual([]);
    expect(supported.mlmodel).toEqual(['Mlflow', 'SageMaker', 'Sklearn', 'CustomMlModel']);
  });
});

describe('getValidatedServiceType', () => {
  it('admits only supported types for the category', () => {
    expect(getValidatedServiceType({ serviceType: 'Kafka' }, 'messaging')).toBe('Kafka');
    expect(getValidatedServiceType({ serviceType: 'Ranger' }, 'security')).toBe('');
    expect(getValidatedServiceType({ serviceType: 'Kafka' }, 'database')).toBe('');
    expect(getValidatedServiceType({}, 'messaging')).toBe('');
    expect(getValidatedServiceType(null, 'messaging')).toBe('');
  });

  it('does not consult the exclusion table', () => {
    expect(getValidatedServiceType({ serviceType: 'Sklearn' }, 'mlmodel')).toBe('Sklearn');
  });
});

describe('getWizardDisplayName', () => {
  it('startCases Custom types, maps known types, and keeps the rest raw', () => {
    expect(getWizardDisplayName('CustomMlModel')).toBe('Custom Ml Model');
    expect(getWizardDisplayName('UnityCatalog')).toBe('Unity Catalog');
    expect(getWizardDisplayName('ElasticSearch')).toBe('Elasticsearch');
    expect(getWizardDisplayName('AlationSink')).toBe('Alation Sink');
    expect(getWizardDisplayName('Kafka')).toBe('Kafka');
  });
});

describe('isBetaService', () => {
  it('flags pin beta types, including the product-visible ones', () => {
    expect(isBetaService('Prefect')).toBe(true);
    expect(isBetaService('GoogleDrive')).toBe(true);
    expect(isBetaService('Sftp')).toBe(true);
    expect(isBetaService('Kafka')).toBe(false);
  });
});

describe('getWizardConnectors', () => {
  it('filters one category by the exclusion table', () => {
    expect(getWizardConnectors('mlmodel').map(({ type }) => type)).toEqual([
      'Mlflow',
      'SageMaker',
      'CustomMlModel',
    ]);
  });

  it('matches the search term against the raw type, trimmed and lowercased', () => {
    const found = getWizardConnectors('all', '  SQL  ');
    expect(found.map(({ type }) => type)).toEqual(['Mssql', 'Mysql']);
    expect(getWizardConnectors('all', 'kafka connect')).toEqual([]);
  });
});
