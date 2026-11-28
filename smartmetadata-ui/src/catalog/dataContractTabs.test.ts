/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import {
  EDataContractTab,
  getDataContractTabByEntity,
  getContractTabLabelKey,
} from './dataContractTabs';

describe('getDataContractTabByEntity', () => {
  it('returns all seven official tabs for table', () => {
    expect(getDataContractTabByEntity('table')).toEqual([
      EDataContractTab.CONTRACT_DETAIL,
      EDataContractTab.TERMS_OF_SERVICE,
      EDataContractTab.SCHEMA,
      EDataContractTab.SEMANTICS,
      EDataContractTab.SECURITY,
      EDataContractTab.QUALITY,
      EDataContractTab.SLA,
    ]);
  });

  it('omits quality for topic, apiEndpoint, and dashboardDataModel', () => {
    for (const type of ['topic', 'apiEndpoint', 'dashboardDataModel']) {
      expect(getDataContractTabByEntity(type)).toEqual([
        EDataContractTab.CONTRACT_DETAIL,
        EDataContractTab.TERMS_OF_SERVICE,
        EDataContractTab.SCHEMA,
        EDataContractTab.SEMANTICS,
        EDataContractTab.SECURITY,
        EDataContractTab.SLA,
      ]);
    }
  });

  it('omits schema and quality for dataProduct and unknown types', () => {
    expect(getDataContractTabByEntity('dataProduct')).toEqual([
      EDataContractTab.CONTRACT_DETAIL,
      EDataContractTab.TERMS_OF_SERVICE,
      EDataContractTab.SEMANTICS,
      EDataContractTab.SECURITY,
      EDataContractTab.SLA,
    ]);
    expect(getDataContractTabByEntity('metric')).toEqual(getDataContractTabByEntity('dataProduct'));
  });

  it('maps official tab label keys', () => {
    expect(getContractTabLabelKey(EDataContractTab.SEMANTICS)).toBe('label.semantic-plural');
    expect(getContractTabLabelKey(EDataContractTab.CONTRACT_DETAIL)).toBe('label.contract-detail-plural');
  });
});
