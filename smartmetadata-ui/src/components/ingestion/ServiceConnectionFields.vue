<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Checkbox, Form, Input, Typography } from 'ant-design-vue';
import type { ServiceFormValues } from '@/types/ingestion';

const props = defineProps<{ form: ServiceFormValues }>();

const type = computed(() => props.form.serviceType);
const passwordPlaceholder = computed(() => {
  if (type.value === 'Postgres') {
    return '${PG_PASSWORD}';
  }
  if (type.value === 'Mysql') {
    return '${MYSQL_PASSWORD}';
  }
  if (type.value === 'Snowflake') {
    return '${SNOWFLAKE_PASSWORD}';
  }
  return '';
});
</script>

<template>
  <template v-if="type === 'Postgres'">
    <Form.Item label="Host and port" required>
      <Input v-model:value="form.hostPort" data-testid="service-host-port" placeholder="localhost:5432" />
    </Form.Item>
    <Form.Item label="Username" required>
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item label="Database" required>
      <Input v-model:value="form.database" data-testid="service-database" />
    </Form.Item>
  </template>
  <template v-else-if="type === 'Mysql'">
    <Form.Item label="Host and port" required>
      <Input v-model:value="form.hostPort" data-testid="service-host-port" placeholder="localhost:3306" />
    </Form.Item>
    <Form.Item label="Username" required>
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item label="Database name">
      <Input v-model:value="form.databaseName" data-testid="service-database-name" placeholder="default" />
    </Form.Item>
    <Form.Item label="Database schema">
      <Input v-model:value="form.databaseSchema" data-testid="service-database-schema" />
    </Form.Item>
  </template>
  <template v-else-if="type === 'Snowflake'">
    <Form.Item label="Account" required>
      <Input v-model:value="form.account" data-testid="service-account" />
    </Form.Item>
    <Form.Item label="Username" required>
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item label="Warehouse" required>
      <Input v-model:value="form.warehouse" data-testid="service-warehouse" />
    </Form.Item>
    <Form.Item label="Database">
      <Input v-model:value="form.database" data-testid="service-database" />
    </Form.Item>
    <Form.Item label="Role">
      <Input v-model:value="form.role" data-testid="service-role" />
    </Form.Item>
  </template>
  <template v-else-if="type === 'Kafka'">
    <Form.Item label="Bootstrap servers" required>
      <Input
        v-model:value="form.bootstrapServers"
        data-testid="service-bootstrap-servers"
        placeholder="localhost:9092"
      />
    </Form.Item>
    <Form.Item label="Schema Registry URL">
      <Input
        v-model:value="form.schemaRegistryURL"
        data-testid="service-schema-registry"
        placeholder="http://localhost:8081"
      />
    </Form.Item>
    <Typography.Paragraph type="secondary">
      Confluent REST Proxy URL is a CLI workflow key (<code>restProxyUrl</code>), not a catalog
      MessagingService field. It appears on the generated <code>smartmetadata-ingest</code> YAML.
    </Typography.Paragraph>
  </template>
  <Form.Item v-if="type !== 'Kafka'" label="Password or ${ENV} placeholder">
    <Input.Password
      v-model:value="form.password"
      data-testid="service-password"
      :placeholder="passwordPlaceholder"
      autocomplete="new-password"
    />
    <Typography.Paragraph type="secondary" class="svc-hint">
      Stored secrets are not shown. Leave blank to keep an existing password. A
      <code>${VAR}</code> placeholder is stored as-is. A literal password is sent only if you check
      persist secrets — default is off, matching Phase 6–7.
    </Typography.Paragraph>
  </Form.Item>
  <Form.Item v-if="type !== 'Kafka'">
    <Checkbox v-model:checked="form.storeConnectionSecrets" data-testid="service-store-secrets">
      Persist a typed literal password on the service entity
    </Checkbox>
  </Form.Item>
</template>

<style scoped>
.svc-hint {
  margin-top: 8px;
  margin-bottom: 0;
}
</style>
