<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Checkbox, Form, Input, InputNumber, Select, Typography } from 'ant-design-vue';
import { requiredField } from '@/features/crud/formRules';
import { PASSWORD_PLACEHOLDERS } from '@/ingestion/connections';
import type { ServiceFormValues } from '@/types/ingestion';

const props = defineProps<{ form: ServiceFormValues }>();
const { t } = useI18n();

const type = computed(() => props.form.serviceType);
const passwordPlaceholder = computed(() => PASSWORD_PLACEHOLDERS[type.value] ?? '');
</script>

<template>
  <template v-if="type === 'Postgres'">
    <Form.Item :label="t('connection.hostPort')" :rules="requiredField(t, t('connection.hostPort'))">
      <Input v-model:value="form.hostPort" data-testid="service-host-port" placeholder="localhost:5432" />
    </Form.Item>
    <Form.Item :label="t('connection.username')" :rules="requiredField(t, t('connection.username'))">
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item :label="t('connection.database')" :rules="requiredField(t, t('connection.database'))">
      <Input v-model:value="form.database" data-testid="service-database" />
    </Form.Item>
  </template>
  <template v-else-if="type === 'Mysql'">
    <Form.Item :label="t('connection.hostPort')" :rules="requiredField(t, t('connection.hostPort'))">
      <Input v-model:value="form.hostPort" data-testid="service-host-port" placeholder="localhost:3306" />
    </Form.Item>
    <Form.Item :label="t('connection.username')" :rules="requiredField(t, t('connection.username'))">
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item :label="t('connection.databaseName')">
      <Input v-model:value="form.databaseName" data-testid="service-database-name" placeholder="default" />
    </Form.Item>
    <Form.Item :label="t('connection.databaseSchema')">
      <Input v-model:value="form.databaseSchema" data-testid="service-database-schema" />
    </Form.Item>
  </template>
  <template v-else-if="type === 'Snowflake'">
    <Form.Item :label="t('connection.account')" :rules="requiredField(t, t('connection.account'))">
      <Input v-model:value="form.account" data-testid="service-account" />
    </Form.Item>
    <Form.Item :label="t('connection.username')" :rules="requiredField(t, t('connection.username'))">
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item :label="t('connection.warehouse')" :rules="requiredField(t, t('connection.warehouse'))">
      <Input v-model:value="form.warehouse" data-testid="service-warehouse" />
    </Form.Item>
    <Form.Item :label="t('connection.database')">
      <Input v-model:value="form.database" data-testid="service-database" />
    </Form.Item>
    <Form.Item :label="t('connection.role')">
      <Input v-model:value="form.role" data-testid="service-role" />
    </Form.Item>
  </template>
  <template v-else-if="type === 'Doris'">
    <Form.Item :label="t('connection.hostPort')" :rules="requiredField(t, t('connection.hostPort'))">
      <Input v-model:value="form.hostPort" data-testid="service-host-port" placeholder="localhost:9030" />
    </Form.Item>
    <Form.Item :label="t('connection.username')" :rules="requiredField(t, t('connection.username'))">
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item :label="t('connection.databaseName')">
      <Input v-model:value="form.databaseName" data-testid="service-database-name" placeholder="default" />
    </Form.Item>
    <Form.Item :label="t('connection.databaseSchema')">
      <Input v-model:value="form.databaseSchema" data-testid="service-database-schema" />
    </Form.Item>
  </template>
  <template v-else-if="type === 'Mssql'">
    <Form.Item :label="t('connection.hostPort')" :rules="requiredField(t, t('connection.hostPort'))">
      <Input v-model:value="form.hostPort" data-testid="service-host-port" placeholder="localhost:1433" />
    </Form.Item>
    <Form.Item :label="t('connection.username')" :rules="requiredField(t, t('connection.username'))">
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item :label="t('connection.database')" :rules="requiredField(t, t('connection.database'))">
      <Input v-model:value="form.database" data-testid="service-database" />
    </Form.Item>
    <Form.Item :label="t('connection.scheme')">
      <Select
        v-model:value="form.scheme"
        data-testid="service-scheme"
        :options="[
          { value: 'mssql+pytds', label: 'mssql+pytds' },
          { value: 'mssql+pyodbc', label: 'mssql+pyodbc' },
          { value: 'mssql+pymssql', label: 'mssql+pymssql' },
        ]"
        allow-clear
        placeholder="mssql+pytds"
      />
    </Form.Item>
    <Form.Item v-if="(form.scheme || 'mssql+pytds') === 'mssql+pyodbc'" :label="t('connection.driver')">
      <Input v-model:value="form.driver" data-testid="service-driver" placeholder="ODBC Driver 18 for SQL Server" />
    </Form.Item>
    <Form.Item :label="t('connection.encrypt')">
      <Checkbox v-model:checked="form.encrypt" data-testid="service-encrypt">{{ t('connection.encrypt') }}</Checkbox>
    </Form.Item>
    <Form.Item :label="t('connection.trustServerCertificate')">
      <Checkbox v-model:checked="form.trustServerCertificate" data-testid="service-trust-cert">
        {{ t('connection.trustServerCertificate') }}
      </Checkbox>
    </Form.Item>
    <Form.Item :label="t('connection.ingestAllDatabases')">
      <Checkbox v-model:checked="form.ingestAllDatabases" data-testid="service-ingest-all-dbs">
        {{ t('connection.ingestAllDatabases') }}
      </Checkbox>
    </Form.Item>
    <Form.Item :label="t('connection.includeSynonyms')">
      <Checkbox v-model:checked="form.includeSynonyms" data-testid="service-include-synonyms">
        {{ t('connection.includeSynonyms') }}
      </Checkbox>
    </Form.Item>
  </template>
  <template v-else-if="type === 'MariaDB'">
    <Form.Item :label="t('connection.hostPort')" :rules="requiredField(t, t('connection.hostPort'))">
      <Input v-model:value="form.hostPort" data-testid="service-host-port" placeholder="localhost:3306" />
    </Form.Item>
    <Form.Item :label="t('connection.username')" :rules="requiredField(t, t('connection.username'))">
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item :label="t('connection.databaseName')">
      <Input v-model:value="form.databaseName" data-testid="service-database-name" placeholder="default" />
    </Form.Item>
    <Form.Item :label="t('connection.databaseSchema')">
      <Input v-model:value="form.databaseSchema" data-testid="service-database-schema" />
    </Form.Item>
  </template>
  <template v-else-if="type === 'Redshift' || type === 'Greenplum' || type === 'Timescale'">
    <Form.Item :label="t('connection.hostPort')" :rules="requiredField(t, t('connection.hostPort'))">
      <Input
        v-model:value="form.hostPort"
        data-testid="service-host-port"
        :placeholder="type === 'Redshift' ? 'localhost:5439' : 'localhost:5432'"
      />
    </Form.Item>
    <Form.Item :label="t('connection.username')" :rules="requiredField(t, t('connection.username'))">
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item :label="t('connection.database')" :rules="requiredField(t, t('connection.database'))">
      <Input v-model:value="form.database" data-testid="service-database" />
    </Form.Item>
    <Form.Item :label="t('connection.ingestAllDatabases')">
      <Checkbox v-model:checked="form.ingestAllDatabases" data-testid="service-ingest-all-dbs">
        {{ t('connection.ingestAllDatabases') }}
      </Checkbox>
    </Form.Item>
  </template>
  <template v-else-if="type === 'Kafka'">
    <Form.Item :label="t('connection.bootstrapServers')" :rules="requiredField(t, t('connection.bootstrapServers'))">
      <Input
        v-model:value="form.bootstrapServers"
        data-testid="service-bootstrap-servers"
        placeholder="localhost:9092"
      />
    </Form.Item>
    <Form.Item :label="t('connection.schemaRegistry')">
      <Input
        v-model:value="form.schemaRegistryURL"
        data-testid="service-schema-registry"
        placeholder="http://localhost:8081"
      />
    </Form.Item>
    <Typography.Paragraph type="secondary">
      {{ t('connection.confluentNote') }}
    </Typography.Paragraph>
  </template>
  <template v-else-if="type === 'Redpanda'">
    <Form.Item :label="t('connection.bootstrapServers')" :rules="requiredField(t, t('connection.bootstrapServers'))">
      <Input
        v-model:value="form.bootstrapServers"
        data-testid="service-bootstrap-servers"
        placeholder="localhost:9092"
      />
    </Form.Item>
    <Form.Item :label="t('connection.schemaRegistry')">
      <Input
        v-model:value="form.schemaRegistryURL"
        data-testid="service-schema-registry"
        placeholder="http://localhost:8081"
      />
    </Form.Item>
    <Form.Item :label="t('connection.securityProtocol')">
      <Select
        v-model:value="form.securityProtocol"
        data-testid="service-security-protocol"
        allow-clear
        :options="[
          { value: 'PLAINTEXT', label: 'PLAINTEXT' },
          { value: 'SASL_PLAINTEXT', label: 'SASL_PLAINTEXT' },
          { value: 'SASL_SSL', label: 'SASL_SSL' },
          { value: 'SSL', label: 'SSL' },
        ]"
      />
    </Form.Item>
    <Typography.Paragraph type="secondary">
      {{ t('connection.redpandaNote') }}
    </Typography.Paragraph>
  </template>
  <template v-else-if="type === 'Superset'">
    <Form.Item :label="t('connection.hostPort')" :rules="requiredField(t, t('connection.hostPort'))">
      <Input
        v-model:value="form.hostPort"
        data-testid="service-host-port"
        placeholder="http://localhost:8088"
      />
    </Form.Item>
    <Form.Item :label="t('connection.provider')" :rules="requiredField(t, t('connection.provider'))">
      <Select
        v-model:value="form.provider"
        data-testid="service-provider"
        :options="[
          { value: 'db', label: t('connection.providerDb') },
          { value: 'ldap', label: t('connection.providerLdap') },
        ]"
      />
    </Form.Item>
    <Form.Item :label="t('connection.username')" :rules="requiredField(t, t('connection.username'))">
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Typography.Paragraph type="secondary">
      {{ t('connection.supersetApiNote') }}
    </Typography.Paragraph>
  </template>
  <template v-else-if="type === 'S3'">
    <Form.Item :label="t('connection.awsRegion')" :rules="requiredField(t, t('connection.awsRegion'))">
      <Input v-model:value="form.awsRegion" data-testid="service-aws-region" placeholder="us-east-1" />
    </Form.Item>
    <Form.Item :label="t('connection.awsAccessKeyId')">
      <Input v-model:value="form.awsAccessKeyId" data-testid="service-aws-access-key" />
    </Form.Item>
    <Form.Item :label="t('connection.awsSecretAccessKey')">
      <Input.Password
        v-model:value="form.awsSecretAccessKey"
        data-testid="service-aws-secret-key"
        :placeholder="passwordPlaceholder"
        autocomplete="new-password"
      />
      <Typography.Paragraph type="secondary" class="svc-hint">
        {{ t('connection.secretHint') }}
      </Typography.Paragraph>
    </Form.Item>
    <Form.Item :label="t('connection.awsSessionToken')">
      <Input.Password
        v-model:value="form.awsSessionToken"
        data-testid="service-aws-session-token"
        autocomplete="new-password"
      />
    </Form.Item>
    <Form.Item :label="t('connection.awsEndPointURL')">
      <Input
        v-model:value="form.awsEndPointURL"
        data-testid="service-aws-endpoint"
        placeholder="https://s3.us-east-1.amazonaws.com"
      />
    </Form.Item>
    <Form.Item :label="t('connection.awsProfileName')">
      <Input v-model:value="form.awsProfileName" data-testid="service-aws-profile" />
    </Form.Item>
    <Form.Item :label="t('connection.assumeRoleArn')">
      <Input v-model:value="form.assumeRoleArn" data-testid="service-aws-role-arn" />
    </Form.Item>
    <Form.Item :label="t('connection.assumeRoleSessionName')">
      <Input v-model:value="form.assumeRoleSessionName" data-testid="service-aws-role-session" />
    </Form.Item>
    <Form.Item :label="t('connection.assumeRoleSourceIdentity')">
      <Input v-model:value="form.assumeRoleSourceIdentity" data-testid="service-aws-role-source" />
    </Form.Item>
    <Form.Item :label="t('connection.awsIamEnabled')">
      <Checkbox v-model:checked="form.awsIamEnabled" data-testid="service-aws-iam-enabled">
        {{ t('connection.awsIamEnabled') }}
      </Checkbox>
    </Form.Item>
    <Form.Item :label="t('connection.bucketNames')" :extra="t('connection.bucketNamesHelp')">
      <Input v-model:value="form.bucketNames" data-testid="service-bucket-names" placeholder="analytics, raw" />
    </Form.Item>
    <Form.Item :label="t('connection.consoleEndpointURL')">
      <Input
        v-model:value="form.consoleEndpointURL"
        data-testid="service-console-endpoint"
        placeholder="https://s3.console.aws.amazon.com"
      />
    </Form.Item>
    <Form.Item>
      <Checkbox v-model:checked="form.storeConnectionSecrets" data-testid="service-store-secrets">
        {{ t('connection.persistSecrets') }}
      </Checkbox>
    </Form.Item>
    <Typography.Paragraph type="secondary">
      {{ t('connection.s3Note') }}
    </Typography.Paragraph>
  </template>
  <template v-else-if="type === 'Prefect'">
    <Form.Item :label="t('connection.hostPort')" name="hostPort" :rules="[requiredField(t('connection.hostPort'))]">
      <Input v-model:value="form.hostPort" placeholder="https://api.prefect.cloud or http://localhost:4200" data-testid="service-host-port" />
    </Form.Item>
    <Form.Item :label="t('connection.prefectAuthMode')" name="prefectAuthMode">
      <Select v-model:value="form.prefectAuthMode" style="width: 100%" data-testid="service-prefect-auth-mode">
        <Select.Option value="cloud">{{ t('connection.prefectCloud') }}</Select.Option>
        <Select.Option value="server">{{ t('connection.prefectServer') }}</Select.Option>
      </Select>
    </Form.Item>
    <template v-if="form.prefectAuthMode === 'cloud'">
      <Form.Item :label="t('connection.prefectAccountId')" name="prefectAccountId" :rules="[requiredField(t('connection.prefectAccountId'))]">
        <Input v-model:value="form.prefectAccountId" data-testid="service-prefect-account-id" />
      </Form.Item>
      <Form.Item :label="t('connection.prefectWorkspaceId')" name="prefectWorkspaceId" :rules="[requiredField(t('connection.prefectWorkspaceId'))]">
        <Input v-model:value="form.prefectWorkspaceId" data-testid="service-prefect-workspace-id" />
      </Form.Item>
      <Form.Item :label="t('connection.apiKey')" name="apiKey">
        <Input.Password v-model:value="form.apiKey" :placeholder="passwordPlaceholder" data-testid="service-api-key" />
      </Form.Item>
    </template>
    <template v-else>
      <Form.Item :label="t('connection.prefectAuthString')" name="prefectAuthString">
        <Input.Password v-model:value="form.prefectAuthString" :placeholder="t('connection.prefectAuthStringHint')" data-testid="service-prefect-auth-string" />
      </Form.Item>
    </template>
    <Form.Item :label="t('connection.numberOfStatus')" name="numberOfStatus">
      <InputNumber v-model:value="form.numberOfStatus" :min="1" :max="100" style="width: 100%" data-testid="service-number-of-status" />
    </Form.Item>
    <p class="form-hint">{{ t('connection.prefectNote') }}</p>
  </template>
  <template v-else-if="type === 'Dagster'">
    <Form.Item :label="t('connection.host')" name="hostPort" :rules="[requiredField(t('connection.host'))]">
      <Input v-model:value="form.hostPort" placeholder="http://localhost:3000" data-testid="service-host-port" />
    </Form.Item>
    <Form.Item :label="t('connection.token')" name="apiKey">
      <Input.Password v-model:value="form.apiKey" :placeholder="passwordPlaceholder" data-testid="service-api-key" />
    </Form.Item>
    <Form.Item :label="t('connection.timeout')" name="dagsterTimeout">
      <InputNumber v-model:value="form.dagsterTimeout" :min="1" style="width: 100%" data-testid="service-dagster-timeout" />
    </Form.Item>
    <Form.Item :label="t('connection.stripAssetKeyPrefixLength')" name="stripAssetKeyPrefixLength">
      <InputNumber v-model:value="form.stripAssetKeyPrefixLength" :min="0" style="width: 100%" data-testid="service-strip-prefix" />
    </Form.Item>
    <p class="form-hint">{{ t('connection.dagsterNote') }}</p>
  </template>
  <template v-else-if="type === 'Metabase'">
    <Form.Item :label="t('connection.hostPort')" :rules="requiredField(t, t('connection.hostPort'))">
      <Input
        v-model:value="form.hostPort"
        data-testid="service-host-port"
        placeholder="http://localhost:3000"
      />
    </Form.Item>
    <Form.Item :label="t('connection.username')">
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item :label="t('connection.apiKey')">
      <Input.Password
        v-model:value="form.apiKey"
        data-testid="service-api-key"
        :placeholder="t('connection.apiKeyHint')"
        autocomplete="new-password"
      />
      <Typography.Paragraph type="secondary" class="svc-hint">
        {{ t('connection.metabaseAuthNote') }}
      </Typography.Paragraph>
    </Form.Item>
  </template>
  <template v-else-if="type === 'Databricks' || type === 'UnityCatalog'">
    <Form.Item :label="t('connection.hostPort')" :rules="requiredField(t, t('connection.hostPort'))">
      <Input
        v-model:value="form.hostPort"
        data-testid="service-host-port"
        placeholder="adb-xxxx.azuredatabricks.net"
      />
    </Form.Item>
    <Form.Item
      v-if="type === 'Databricks'"
      :label="t('connection.httpPath')"
      :rules="requiredField(t, t('connection.httpPath'))"
    >
      <Input
        v-model:value="form.httpPath"
        data-testid="service-http-path"
        placeholder="/sql/1.0/warehouses/..."
      />
    </Form.Item>
    <Form.Item v-else :label="t('connection.httpPath')">
      <Input
        v-model:value="form.httpPath"
        data-testid="service-http-path"
        placeholder="/sql/1.0/warehouses/..."
      />
    </Form.Item>
    <Form.Item :label="t('connection.catalog')">
      <Input v-model:value="form.catalog" data-testid="service-catalog" placeholder="hive_metastore" />
    </Form.Item>
    <Form.Item :label="t('connection.databaseSchema')">
      <Input v-model:value="form.databaseSchema" data-testid="service-database-schema" />
    </Form.Item>
    <Form.Item :label="t('connection.queryHistoryTable')">
      <Input
        v-model:value="form.queryHistoryTable"
        data-testid="service-query-history"
        placeholder="system.query.history"
      />
    </Form.Item>
    <Form.Item v-if="type === 'UnityCatalog'" :label="t('connection.includeMetricViews')">
      <Checkbox v-model:checked="form.includeMetricViews" data-testid="service-include-metric-views">
        {{ t('connection.includeMetricViews') }}
      </Checkbox>
    </Form.Item>
    <Form.Item :label="t('connection.authMode')" :rules="requiredField(t, t('connection.authMode'))">
      <Select
        v-model:value="form.authMode"
        data-testid="service-auth-mode"
        :options="[
          { value: 'pat', label: t('connection.authPat') },
          { value: 'oauth', label: t('connection.authOauth') },
          { value: 'azure', label: t('connection.authAzure') },
        ]"
      />
    </Form.Item>
    <template v-if="(form.authMode || 'pat') === 'pat'">
      <Form.Item :label="t('connection.token')">
        <Input.Password
          v-model:value="form.password"
          data-testid="service-password"
          :placeholder="passwordPlaceholder"
          autocomplete="new-password"
        />
        <Typography.Paragraph type="secondary" class="svc-hint">
          {{ t('connection.secretHint') }}
        </Typography.Paragraph>
      </Form.Item>
    </template>
    <template v-else-if="form.authMode === 'oauth'">
      <Form.Item :label="t('connection.clientId')" :rules="requiredField(t, t('connection.clientId'))">
        <Input v-model:value="form.clientId" data-testid="service-client-id" />
      </Form.Item>
      <Form.Item :label="t('connection.clientSecret')">
        <Input.Password
          v-model:value="form.clientSecret"
          data-testid="service-client-secret"
          :placeholder="passwordPlaceholder"
          autocomplete="new-password"
        />
      </Form.Item>
    </template>
    <template v-else>
      <Form.Item :label="t('connection.azureClientId')" :rules="requiredField(t, t('connection.azureClientId'))">
        <Input v-model:value="form.azureClientId" data-testid="service-azure-client-id" />
      </Form.Item>
      <Form.Item :label="t('connection.azureTenantId')" :rules="requiredField(t, t('connection.azureTenantId'))">
        <Input v-model:value="form.azureTenantId" data-testid="service-azure-tenant-id" />
      </Form.Item>
      <Form.Item :label="t('connection.azureClientSecret')">
        <Input.Password
          v-model:value="form.azureClientSecret"
          data-testid="service-azure-client-secret"
          :placeholder="passwordPlaceholder"
          autocomplete="new-password"
        />
      </Form.Item>
    </template>
    <Form.Item>
      <Checkbox v-model:checked="form.storeConnectionSecrets" data-testid="service-store-secrets">
        {{ t('connection.persistSecrets') }}
      </Checkbox>
    </Form.Item>
  </template>
  <Form.Item v-if="type !== 'Kafka' && type !== 'Redpanda' && type !== 'Databricks' && type !== 'UnityCatalog' && type !== 'S3' && type !== 'Prefect' && type !== 'Dagster' && type !== 'Metabase'" :label="t('connection.password')">
    <Input.Password
      v-model:value="form.password"
      data-testid="service-password"
      :placeholder="passwordPlaceholder"
      autocomplete="new-password"
    />
    <Typography.Paragraph type="secondary" class="svc-hint">
      {{ t('connection.secretHint') }}
    </Typography.Paragraph>
  </Form.Item>
  <Form.Item v-if="type !== 'Kafka' && type !== 'Redpanda' && type !== 'Databricks' && type !== 'UnityCatalog' && type !== 'S3' && type !== 'Prefect' && type !== 'Dagster' && type !== 'Metabase'">
    <Checkbox v-model:checked="form.storeConnectionSecrets" data-testid="service-store-secrets">
      {{ t('connection.persistSecrets') }}
    </Checkbox>
  </Form.Item>
</template>

<style scoped>
.svc-hint {
  margin-top: 8px;
  margin-bottom: 0;
}
</style>
