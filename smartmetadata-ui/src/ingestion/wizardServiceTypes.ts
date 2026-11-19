/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { SERVICE_TYPES_BY_KIND } from '@/ingestion/connections';
import { startCase } from '@/ingestion/ingestionSchemas';
import type { ServiceKind } from '@/types/ingestion';
import { ALL_SERVICES_CATEGORY, type ServiceCategoryKind } from './serviceCategories';

/**
 * Wizard connector data (01 §5.1), ported from official
 * `constants/ServiceType.constant.ts`, `utils/ServiceUtilClassBase.ts`
 * (`getSupportedServiceFromList`, `unSupportedServices`),
 * `utils/ServiceUtils.tsx` (`getValidatedServiceType`) and
 * `components/Settings/Services/AddService/Steps/SelectServiceType.tsx`
 * (pin a3012259ca).
 *
 * Table values are pin enum values (note `WEBHOOK`, `Sftp`,
 * `SapErp`, `Neo4j` — member names differ). The per-category type
 * lists come from the product's `SERVICE_TYPES_BY_KIND`: the wizard
 * can only offer types the product has connection handling for.
 * Filtering, ordering, display-name, and validation logic are the
 * port; the enum source is the product universe.
 */

/** Pin `excludedService` (ServiceType.constant.ts:35-40). */
export const EXCLUDED_SERVICES: readonly string[] = [
  'Sklearn',
  'MetadataES',
  'OpenMetadata',
  'Spark',
];

/** Pin `BETA_SERVICES` (ServiceType.constant.ts:172-202). */
export const BETA_SERVICES: readonly string[] = [
  'Ssis',
  'Ssas',
  'Epic',
  'Hex',
  'Omni',
  'SapSuccessFactors',
  'ServiceNow',
  'Dremio',
  'Collibra',
  'Mulesoft',
  'BurstIQ',
  'StarRocks',
  'Sftp',
  'GoogleDrive',
  'Informix',
  'MicrosoftAccess',
  'QuestDB',
  'Nats',
  'SapS4Hana',
  'Data360',
  'Data360Pipeline',
  'SapBw4Hana',
  'SapBw4HanaPipeline',
  'Prefect',
  'TableauPipeline',
  'Iomete',
  'Clickzetta',
  'Databend',
  'Neo4j',
];

/** Pin `SERVICE_TYPE_WITH_DISPLAY_NAME` (ServiceType.constant.ts:346-368). */
export const SERVICE_TYPE_WITH_DISPLAY_NAME: ReadonlyMap<string, string> = new Map([
  ['GluePipeline', 'Glue Pipeline'],
  ['DomoDatabase', 'Domo Database'],
  ['DomoDashboard', 'Domo Dashboard'],
  ['MicroStrategy', 'Micro Strategy'],
  ['PowerBIReportServer', 'PowerBI Report Server'],
  ['DatabricksPipeline', 'Databricks Pipeline'],
  ['DomoPipeline', 'Domo Pipeline'],
  ['KafkaConnect', 'Kafka Connect'],
  ['SapErp', 'SAP ERP'],
  ['SapHana', 'SAP HANA'],
  ['UnityCatalog', 'Unity Catalog'],
  ['DataFactory', 'Data Factory'],
  ['DBTCloud', 'DBT Cloud'],
  ['OpenLineage', 'Open Lineage'],
  ['AlationSink', 'Alation Sink'],
  ['ElasticSearch', 'Elasticsearch'],
  ['MicrosoftFabric', 'Microsoft Fabric'],
  ['MicrosoftFabricPipeline', 'Microsoft Fabric Pipeline'],
  ['Data360', 'Salesforce Data 360'],
  ['Data360Pipeline', 'Salesforce Data 360 Pipeline'],
  ['TableauPipeline', 'Tableau Pipeline'],
]);

/** Pin `unSupportedServices` (ServiceUtilClassBase.ts:88-120). */
export const UNSUPPORTED_SERVICES: readonly string[] = [
  'Adls',
  'QueryLog',
  'Dbt',
  'Synapse',
  'Alation',
  'WEBHOOK',
  'VertexAI',
  'Matillion',
  'DataFactory',
  'Stitch',
  'PowerBIReportServer',
  'Ssas',
  'ThoughtSpot',
  'Ssis',
  'Wherescape',
  'Ranger',
  'Epic',
  'Snowplow',
  'SharePoint',
  'Informix',
  'ServiceNow',
  'Dremio',
  'Collibra',
  'Mulesoft',
  'MicrosoftFabric',
  'MicrosoftFabricPipeline',
  'MicrosoftAccess',
  'SapS4Hana',
  'SapSuccessFactors',
  'SapBw4Hana',
  'SapBw4HanaPipeline',
];

/**
 * `ServiceCategory` enum order (enums/service.enum.ts:26-38) — the
 * iteration order of the flattened "all services" grid. Distinct
 * from the title-keys order used by the category Select.
 */
export const SERVICE_CATEGORY_ENUM_ORDER: readonly ServiceCategoryKind[] = [
  'database',
  'messaging',
  'dashboard',
  'pipeline',
  'mlmodel',
  'metadata',
  'storage',
  'search',
  'api',
  'security',
  'drive',
];

/** Pin `customServiceComparator` (StringUtils.ts:305-311). */
export function customServiceComparator(a: string, b: string): number {
  if (a.includes('Custom') || b.includes('Custom')) {
    return a.includes('Custom') ? 1 : -1;
  } else {
    return a.localeCompare(b);
  }
}

export function filterUnsupportedServiceType(types: readonly string[]): string[] {
  return types.filter((type) => !UNSUPPORTED_SERVICES.includes(type));
}

/**
 * Pin `getSupportedServiceFromList`: per-category enum values minus
 * unsupported types, in `customServiceComparator` order. Keyed by
 * kind for the 11 wizard categories.
 */
export function getSupportedServiceFromList(): Record<ServiceCategoryKind, string[]> {
  const result = {} as Record<ServiceCategoryKind, string[]>;
  for (const kind of SERVICE_CATEGORY_ENUM_ORDER) {
    result[kind] = filterUnsupportedServiceType(
      SERVICE_TYPES_BY_KIND[kind as ServiceKind] as readonly string[],
    ).sort(customServiceComparator);
  }
  return result;
}

/**
 * Pin `getValidatedServiceType` (ServiceUtils.tsx:153-169): the
 * router state's requested type is admitted only when the category's
 * supported list contains it. The exclusion table is NOT consulted
 * here — exposure filtering lives in the connector grid.
 */
export function getValidatedServiceType(state: unknown, serviceCategory: string): string {
  const requested = (state as { serviceType?: string } | null)?.serviceType;
  if (!requested) {
    return '';
  }
  const supported = (getSupportedServiceFromList() as Record<string, string[]>)[serviceCategory];
  return (supported ?? []).includes(requested) ? requested : '';
}

/** Pin `getServiceName` (SelectServiceType.tsx:120-126). */
export function getWizardDisplayName(type: string): string {
  if (type.includes('Custom')) {
    return startCase(type);
  }
  return SERVICE_TYPE_WITH_DISPLAY_NAME.get(type) || type;
}

export function isBetaService(type: string): boolean {
  return (BETA_SERVICES as readonly string[]).includes(type);
}

export interface WizardConnector {
  category: ServiceCategoryKind;
  type: string;
}

/**
 * Pin `categoryConnectors` + `filteredConnectors`
 * (SelectServiceType.tsx:89-118): the selected categories flattened
 * in enum order, the exclusion table applied in every mode, each
 * connector paired with its category; the search term matches the
 * raw type value, trimmed and lowercased.
 */
export function getWizardConnectors(
  category: ServiceCategoryKind | typeof ALL_SERVICES_CATEGORY,
  searchTerm = '',
): WizardConnector[] {
  const categories =
    category === ALL_SERVICES_CATEGORY
      ? SERVICE_CATEGORY_ENUM_ORDER
      : [category as ServiceCategoryKind];
  const supported = getSupportedServiceFromList();
  const connectors = categories.flatMap((serviceCategoryKey) =>
    (supported[serviceCategoryKey] ?? [])
      .filter((connectorType) => !EXCLUDED_SERVICES.includes(connectorType))
      .map((connectorType) => ({ category: serviceCategoryKey, type: connectorType })),
  );
  const term = searchTerm.trim().toLowerCase();
  return term
    ? connectors.filter(({ type }) => type.toLowerCase().includes(term))
    : connectors;
}
