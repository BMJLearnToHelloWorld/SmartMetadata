<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button, Dropdown, Menu } from 'ant-design-vue';
import { DownOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { getAgentMenuItems } from '@/ingestion/supportedPipelines';
import type { PipelineType } from '@/types/ingestion';

const props = defineProps<{
  /** Addable kinds, already filtered by getIngestionTypes (one-Usage rule applied). */
  types: readonly PipelineType[];
  /** A dataInsight pipeline already exists: its menu item is disabled. */
  isDataInsightExists: boolean;
  /** The pipeline service is unavailable: the button is disabled. */
  disabled: boolean;
  /** Route params of the owning service, for the add-ingestion navigation. */
  serviceKind: string;
  serviceId: string;
}>();

const { t } = useI18n();
const router = useRouter();

/**
 * Port of official AddIngestionButton (openmetadata-ui, pin
 * a3012259ca): nothing renders when no kind is addable; otherwise
 * the Add Agent button with the flag-driven kind menu. The
 * permission gate lives in the parent's showAddAgent (the resource
 * Create bit plus a non-disabled platform), matching the fork's
 * global-list precedent — there is no LimitWrapper in this console.
 */
const menuItems = computed(() => getAgentMenuItems(props.types, props.isDataInsightExists));

function onSelect(type: PipelineType): void {
  void router.push({
    name: 'ingestion-service-add-ingestion',
    params: { kind: props.serviceKind, id: props.serviceId, ingestionType: type },
  });
}
</script>

<template>
  <Dropdown v-if="types.length > 0" :trigger="['click']">
    <template #overlay>
      <Menu>
        <Menu.Item
          v-for="item in menuItems"
          :key="item.key"
          :disabled="item.disabled"
          :data-testid="item.testId"
          @click="onSelect(item.key)"
        >
          {{
            t('ingestion.agents.addWorkflowAgent', {
              workflow: t(`ingestion.pipelines.types.${item.key}`),
            })
          }}
        </Menu.Item>
      </Menu>
    </template>
    <Button type="primary" data-testid="add-new-ingestion-button" :disabled="disabled">
      <PlusOutlined />
      {{ t('ingestion.agents.addAgent') }}
      <DownOutlined />
    </Button>
  </Dropdown>
</template>
