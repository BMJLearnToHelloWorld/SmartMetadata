<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Button, Space, Switch, Table, Tag, Typography } from 'ant-design-vue';
import type { IntakeForm } from '@/api/intakeForms';
import { getIntakeFormFields } from '@/views/admin/intakeFormDesigner';
import { ENTITY_TYPE_LABEL_KEYS } from '@/views/admin/intakeFormDesigner';

const { t } = useI18n();

defineProps<{ forms: IntakeForm[]; loading: boolean }>();

const emit = defineEmits<{
  edit: [form: IntakeForm];
  delete: [form: IntakeForm];
  toggleEnabled: [form: IntakeForm, enabled: boolean];
}>();
</script>

<template>
  <Table
    :columns="[
      { title: t('intakeForms.columns.entityType'), key: 'entityType' },
      { title: t('intakeForms.columns.fields'), key: 'fields' },
      { title: t('crud.enabled'), key: 'enabled' },
      { title: t('crud.actions'), key: 'actions' },
    ]"
    :data-source="forms"
    :loading="loading"
    :pagination="false"
    row-key="id"
    data-testid="intake-forms-table"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'entityType'">
        <Typography.Text strong>
          {{ t(ENTITY_TYPE_LABEL_KEYS[(record as IntakeForm).entityType]) }}
        </Typography.Text>
      </template>
      <template v-if="column.key === 'fields'">
        <Space v-if="getIntakeFormFields(record as IntakeForm).length > 0" direction="vertical" size="small">
          <Tag
            v-for="field in getIntakeFormFields(record as IntakeForm)"
            :key="field.fieldPath"
            :color="field.fieldKind === 'customProperty' ? 'default' : 'blue'"
          >
            {{ field.fieldLabel }}
            <Typography.Text type="secondary" style="margin-left: 4px">
              ({{ field.fieldPath }})
            </Typography.Text>
            <Typography.Text type="secondary" style="margin-left: 4px">
              {{ field.required ? t('intakeForms.required') : t('intakeForms.optional') }}
            </Typography.Text>
          </Tag>
        </Space>
        <Typography.Text v-else type="secondary">
          {{ t('intakeForms.noFields') }}
        </Typography.Text>
      </template>
      <template v-if="column.key === 'enabled'">
        <Switch
          :checked="(record as IntakeForm).enabled ?? false"
          :data-testid="`toggle-${(record as IntakeForm).entityType}`"
          :aria-label="t('crud.enabled')"
          @change="(enabled: boolean) => emit('toggleEnabled', record as IntakeForm, enabled)"
        />
      </template>
      <template v-if="column.key === 'actions'">
        <Space>
          <Button
            type="link"
            :data-testid="`edit-${(record as IntakeForm).entityType}`"
            @click="emit('edit', record as IntakeForm)"
          >
            {{ t('crud.edit') }}
          </Button>
          <Button
            type="link"
            danger
            :data-testid="`delete-${(record as IntakeForm).entityType}`"
            @click="emit('delete', record as IntakeForm)"
          >
            {{ t('crud.delete') }}
          </Button>
        </Space>
      </template>
    </template>
  </Table>
</template>
