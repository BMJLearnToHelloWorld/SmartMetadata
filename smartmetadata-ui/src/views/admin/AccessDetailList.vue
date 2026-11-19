<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Shared port of RolesDetailPageList.component.tsx and
  PoliciesDetailsList.component.tsx (03 §4.5/§7.4): the two pin lists differ
  only in the link target per type and in the name-link testid, so the type
  dispatch lives in the caller's linkFor and the testid asymmetry is kept
  via nameTestId (Roles passes 'entity-name', Policies passes nothing).
  Columns: Name (200) + description + Actions (80, remove button, tooltip
  remove vs no-permission-for-action, disabled when !hasAccess).
  Pagination is off, rowKey is id, size small.
-->
<script setup lang="ts">
import { MinusCircleOutlined } from '@ant-design/icons-vue';
import { Button, Table, Tooltip } from 'ant-design-vue';
import type { RouteLocationRaw } from 'vue-router';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import DescriptionCell from '@/components/shared/DescriptionCell.vue';
import EntityNameLink from '@/components/shared/EntityNameLink.vue';
import type { AdminEntityRef } from '@/types/admin';
import { descriptionColumnDef, entityNameColumnDef } from '@/utils/columns';
import { getEntityName } from '@/components/shared/profilePictureUtils';

const props = defineProps<{
  items: AdminEntityRef[];
  hasAccess: boolean;
  linkFor: (record: AdminEntityRef) => RouteLocationRaw;
  nameTestId?: string;
  onRemove: (record: AdminEntityRef) => void;
  tableTestId?: string;
}>();

const { t } = useI18n();

const columns = computed(() => [
  ...entityNameColumnDef(t('label.name')),
  ...descriptionColumnDef(t('label.description')),
  {
    title: t('label.action-plural'),
    dataIndex: 'actions',
    key: 'actions',
    width: 80,
  },
]);
</script>

<template>
  <Table
    :columns="columns"
    :data-source="items"
    :pagination="false"
    row-key="id"
    size="small"
    :data-testid="tableTestId"
  >
    <template #bodyCell="{ column, record }">
      <template v-if="column.key === 'name'">
        <EntityNameLink :record="record" :to="linkFor(record as AdminEntityRef)" :test-id="nameTestId" />
      </template>
      <template v-else-if="column.key === 'description'">
        <DescriptionCell :markdown="record.description" />
      </template>
      <template v-else-if="column.key === 'actions'">
        <Tooltip
          :title="
            hasAccess ? t('label.remove') : t('message.no-permission-for-action')
          "
        >
          <span>
            <Button
              type="text"
              size="small"
              :disabled="!hasAccess"
              :data-testid="`remove-action-${getEntityName(record)}`"
              @click="onRemove(record as AdminEntityRef)"
            >
              <template #icon><MinusCircleOutlined /></template>
            </Button>
          </span>
        </Tooltip>
      </template>
    </template>
  </Table>
</template>
