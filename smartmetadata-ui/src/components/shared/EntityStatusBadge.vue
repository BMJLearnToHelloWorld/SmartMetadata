<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official EntityStatusBadge: StatusBadge plus optional divider;
  Unprocessed is not shown.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { Divider } from 'ant-design-vue';
import StatusBadge from '@/components/shared/StatusBadge.vue';
import { getEntityStatusClass, isUnprocessedStatus } from '@/utils/entityStatus';

const props = withDefaults(
  defineProps<{
    status: string;
    showDivider?: boolean;
  }>(),
  { showDivider: true },
);

const hidden = computed(() => isUnprocessedStatus(props.status));
const badgeStatus = computed(() => getEntityStatusClass(props.status));
</script>

<template>
  <span v-if="!hidden" class="entity-status-badge" data-testid="entity-status-badge">
    <Divider v-if="showDivider" type="vertical" class="entity-status-badge__divider" />
    <StatusBadge :label="status" :status="badgeStatus" />
  </span>
</template>

<style scoped>
.entity-status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-spacing-xs, 8px);
}

.entity-status-badge__divider {
  height: 24px;
  margin: 0 var(--sm-spacing-xs, 8px);
  top: 0;
}
</style>
