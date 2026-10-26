<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Checkbox, Form, Input, Typography } from 'ant-design-vue';
import type { ServiceFormValues } from '@/types/ingestion';

const props = defineProps<{ form: ServiceFormValues }>();
const { t } = useI18n();

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
    <Form.Item :label="t('connection.hostPort')" required>
      <Input v-model:value="form.hostPort" data-testid="service-host-port" placeholder="localhost:5432" />
    </Form.Item>
    <Form.Item :label="t('connection.username')" required>
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item :label="t('connection.database')" required>
      <Input v-model:value="form.database" data-testid="service-database" />
    </Form.Item>
  </template>
  <template v-else-if="type === 'Mysql'">
    <Form.Item :label="t('connection.hostPort')" required>
      <Input v-model:value="form.hostPort" data-testid="service-host-port" placeholder="localhost:3306" />
    </Form.Item>
    <Form.Item :label="t('connection.username')" required>
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
    <Form.Item :label="t('connection.account')" required>
      <Input v-model:value="form.account" data-testid="service-account" />
    </Form.Item>
    <Form.Item :label="t('connection.username')" required>
      <Input v-model:value="form.username" data-testid="service-username" />
    </Form.Item>
    <Form.Item :label="t('connection.warehouse')" required>
      <Input v-model:value="form.warehouse" data-testid="service-warehouse" />
    </Form.Item>
    <Form.Item :label="t('connection.database')">
      <Input v-model:value="form.database" data-testid="service-database" />
    </Form.Item>
    <Form.Item :label="t('connection.role')">
      <Input v-model:value="form.role" data-testid="service-role" />
    </Form.Item>
  </template>
  <template v-else-if="type === 'Kafka'">
    <Form.Item :label="t('connection.bootstrapServers')" required>
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
  <Form.Item v-if="type !== 'Kafka'" :label="t('connection.password')">
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
  <Form.Item v-if="type !== 'Kafka'">
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
