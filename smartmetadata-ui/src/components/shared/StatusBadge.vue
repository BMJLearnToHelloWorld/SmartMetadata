<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Official StatusBadge (components/common/StatusBadge/StatusBadge.component.tsx).
  Vue + ant-design-vue Tag; do not copy official CCL Badge CSS. Icon is
  resolved from the LABEL (exact, then lowercased); color comes from
  STATUS_TYPE_TO_BADGE_COLOR with the `failed` → Failure alias and a
  gray default. Official Badge colors map onto the nearest antd Tag
  preset; `brand` has no antd preset and renders as blue.
-->
<script setup lang="ts">
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  RocketOutlined,
  StopOutlined,
} from '@ant-design/icons-vue';
import { Tag } from 'ant-design-vue';
import { computed, type Component } from 'vue';
import {
  resolveStatusBadgeColor,
  statusBadgeIconKey,
} from '@/utils/statusBadge';

const props = withDefaults(
  defineProps<{
    label: string;
    status: string;
    dataTestId?: string;
    className?: string;
  }>(),
  { dataTestId: undefined, className: undefined },
);

const ICONS: Record<string, Component> = {
  active: CheckCircleOutlined,
  success: CheckCircleOutlined,
  completed: CheckCircleOutlined,
  failed: CloseCircleOutlined,
  aborted: CloseCircleOutlined,
  running: PlayCircleOutlined,
  started: RocketOutlined,
  stopped: StopOutlined,
  pending: PauseOutlined,
  activeError: ExclamationCircleOutlined,
};

const TAG_COLORS: Record<string, string> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  orange: 'orange',
  brand: 'blue',
  blue: 'blue',
  purple: 'purple',
  gray: 'default',
};

const icon = computed(() => {
  const key = statusBadgeIconKey(props.label);
  return key ? ICONS[key] : undefined;
});

const tagColor = computed(() => TAG_COLORS[resolveStatusBadgeColor(props.status)] ?? 'default');
</script>

<template>
  <Tag
    :class="['status-badge', status, className]"
    :color="tagColor"
    :data-testid="dataTestId"
    style="display: inline-flex; align-items: center; gap: 4px"
  >
    <component :is="icon" v-if="icon" :style="{ fontSize: '14px' }" />
    <span :class="['status-badge-label', status]">{{ label }}</span>
  </Tag>
</template>