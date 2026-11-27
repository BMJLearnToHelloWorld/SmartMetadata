/**
 * Official TestDefinitionForm transform helpers (Vue, no CCL copy).
 * Enum lists are taken from official generated TestDefinition / DatabaseServiceType
 * (Dbt and QueryLog omitted from supported services, same as TestDefinitionFormBody).
 */
import type { CreateTestDefinitionRequest, TestDefinition, TestParameterDefinition } from '@/types/quality';

export const TEST_DATA_TYPES = [
  "ARRAY",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "DECIMAL",
  "DOUBLE",
  "FLOAT",
  "INT",
  "MAP",
  "NUMBER",
  "SET",
  "STRING",
  "TIME",
  "TIMESTAMP",
] as const;

export const COLUMN_DATA_TYPES = [
  "AGG_STATE",
  "AGGREGATEFUNCTION",
  "ARRAY",
  "BIGINT",
  "BINARY",
  "BIT",
  "BITMAP",
  "BLOB",
  "BOOLEAN",
  "BYTEA",
  "BYTEINT",
  "BYTES",
  "CIDR",
  "CHAR",
  "CLOB",
  "DATE",
  "DATETIME",
  "DATETIMERANGE",
  "DECIMAL",
  "DOUBLE",
  "ENUM",
  "ERROR",
  "FIXED",
  "FLOAT",
  "GEOGRAPHY",
  "GEOMETRY",
  "HEIRARCHY",
  "HIERARCHYID",
  "HLL",
  "HLLSKETCH",
  "IMAGE",
  "INET",
  "INT",
  "INTERVAL",
  "IPV4",
  "IPV6",
  "JSON",
  "KPI",
  "LARGEINT",
  "LONG",
  "LONGBLOB",
  "LOWCARDINALITY",
  "MACADDR",
  "MAP",
  "MEASURE",
  "MEASURE HIDDEN",
  "MEASURE VISIBLE",
  "MEDIUMBLOB",
  "MEDIUMTEXT",
  "MONEY",
  "NTEXT",
  "NULL",
  "NUMBER",
  "NUMERIC",
  "PG_LSN",
  "PG_SNAPSHOT",
  "POINT",
  "POLYGON",
  "QUANTILE_STATE",
  "RECORD",
  "ROWID",
  "SET",
  "SMALLINT",
  "SPATIAL",
  "STRING",
  "STRUCT",
  "SUPER",
  "TABLE",
  "TEXT",
  "TIME",
  "TIMESTAMP",
  "TIMESTAMPZ",
  "TINYINT",
  "TSQUERY",
  "TSVECTOR",
  "TUPLE",
  "TXID_SNAPSHOT",
  "UUID",
  "UINT",
  "UNION",
  "UNKNOWN",
  "VARBINARY",
  "VARCHAR",
  "VARIANT",
  "XML",
  "YEAR",
] as const;

export const DATABASE_SERVICE_TYPES = [
  "Athena",
  "AzureSQL",
  "BigQuery",
  "BigTable",
  "BurstIQ",
  "Cassandra",
  "Clickhouse",
  "Clickzetta",
  "Cockroach",
  "Couchbase",
  "CustomDatabase",
  "Data360",
  "Databend",
  "Databricks",
  "Datalake",
  "Db2",
  "DomoDatabase",
  "Doris",
  "Dremio",
  "Druid",
  "DynamoDB",
  "Epic",
  "Exasol",
  "Glue",
  "Greenplum",
  "Hive",
  "Impala",
  "Informix",
  "Iomete",
  "MariaDB",
  "MicrosoftAccess",
  "MicrosoftFabric",
  "MongoDB",
  "Mssql",
  "Mysql",
  "Neo4j",
  "Oracle",
  "PinotDB",
  "Postgres",
  "Presto",
  "QuestDB",
  "Redshift",
  "SAS",
  "SQLite",
  "Salesforce",
  "SapBw4Hana",
  "SapErp",
  "SapHana",
  "SapSuccessFactors",
  "ServiceNow",
  "SingleStore",
  "Snowflake",
  "SSAS",
  "StarRocks",
  "Synapse",
  "Teradata",
  "Timescale",
  "Trino",
  "UnityCatalog",
  "Vertica",
] as const;


export type TestDataTypeValue = (typeof TEST_DATA_TYPES)[number];
export type ColumnDataTypeValue = (typeof COLUMN_DATA_TYPES)[number];
export type DatabaseServiceTypeValue = (typeof DATABASE_SERVICE_TYPES)[number];

export interface TestDefinitionFormValues {
  name: string;
  displayName: string;
  description: string;
  sqlExpression: string;
  entityType: string;
  testPlatforms: string[];
  dataQualityDimension?: string;
  supportedServices: string[];
  supportedDataTypes: string[];
  parameterDefinition: TestParameterDefinition[];
  enabled?: boolean;
}

export function createEmptyTestDefinitionForm(): TestDefinitionFormValues {
  return {
    name: '',
    displayName: '',
    description: '',
    sqlExpression: '',
    entityType: 'TABLE',
    testPlatforms: ['OpenMetadata'],
    dataQualityDimension: undefined,
    supportedServices: [],
    supportedDataTypes: [],
    parameterDefinition: [],
    enabled: true,
  };
}

export function formValuesFromDefinition(definition?: TestDefinition): TestDefinitionFormValues {
  const empty = createEmptyTestDefinitionForm();
  if (!definition) {
    return empty;
  }
  return {
    name: definition.name,
    displayName: definition.displayName || '',
    description: definition.description || '',
    sqlExpression: definition.sqlExpression || '',
    entityType: definition.entityType || 'TABLE',
    testPlatforms: definition.testPlatforms.length ? [...definition.testPlatforms] : ['OpenMetadata'],
    dataQualityDimension: definition.dataQualityDimension,
    supportedServices: [...(definition.supportedServices ?? [])],
    supportedDataTypes: [...(definition.supportedDataTypes ?? [])],
    parameterDefinition: definition.parameterDefinition.map((item) => ({ ...item })),
    enabled: definition.enabled,
  };
}

/** Official getValidatorClass in transformTestDefinitionFormData.ts */
export function validatorClassFor(entityType: string, sqlExpression?: string): string | undefined {
  if (!sqlExpression?.trim()) {
    return undefined;
  }
  return entityType.toUpperCase() === 'COLUMN'
    ? 'ColumnRuleLibrarySqlExpressionValidator'
    : 'TableRuleLibrarySqlExpressionValidator';
}

export function isSystemTestDefinition(definition?: TestDefinition | null): boolean {
  return definition?.provider === 'system';
}

export function emptyParameter(): TestParameterDefinition {
  return { name: '', displayName: undefined, description: undefined, dataType: 'STRING', required: false };
}

export function toCreateTestDefinitionRequest(values: TestDefinitionFormValues): CreateTestDefinitionRequest {
  const sqlExpression = values.sqlExpression.trim() || undefined;
  return {
    name: values.name.trim(),
    displayName: values.displayName.trim() || undefined,
    description: values.description.trim() || undefined,
    entityType: values.entityType,
    testPlatforms: values.testPlatforms,
    dataQualityDimension: values.dataQualityDimension || undefined,
    supportedServices: values.supportedServices,
    supportedDataTypes: values.supportedDataTypes,
    parameterDefinition: values.parameterDefinition
      .map((item) => ({
        name: item.name.trim(),
        displayName: item.displayName?.trim() || undefined,
        description: item.description?.trim() || undefined,
        dataType: item.dataType || undefined,
        required: item.required,
      }))
      .filter((item) => item.name.length > 0),
    sqlExpression,
    validatorClass: validatorClassFor(values.entityType, sqlExpression),
  };
}

export function dimensionPatch(
  current: string | undefined,
  next: string | undefined,
): Array<{ op: 'add' | 'replace' | 'remove'; path: string; value?: string }> {
  if (current === next) {
    return [];
  }
  if (next && current) {
    return [{ op: 'replace', path: '/dataQualityDimension', value: next }];
  }
  if (next) {
    return [{ op: 'add', path: '/dataQualityDimension', value: next }];
  }
  return [{ op: 'remove', path: '/dataQualityDimension' }];
}
