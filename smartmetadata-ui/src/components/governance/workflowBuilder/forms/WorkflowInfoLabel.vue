<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { InfoCircleOutlined } from '@ant-design/icons-vue';
import { Button, Typography } from 'ant-design-vue';

/**
 * Official InfoLabel (pin a3012259ca): a field label with an optional
 * info icon (a button when onInfoClick is given) and an optional
 * description line below it. Its only caller is WorkflowFormField.
 */
withDefaults(
  defineProps<{
    text: string;
    description?: string;
    showIcon?: boolean;
    className?: string;
    onInfoClick?: () => void;
  }>(),
  { description: undefined, showIcon: true, className: '', onInfoClick: undefined },
);
</script>

<template>
  <div :class="className">
    <div style="display: flex; align-items: center; gap: 4px" :style="description ? 'margin-bottom: 4px' : undefined">
      <Typography.Text type="secondary" style="font-size: 14px; font-weight: 500">
        {{ text }}
      </Typography.Text>
      <Button
        v-if="showIcon && onInfoClick"
        type="text"
        size="small"
        :aria-label="text"
        style="padding: 0; height: auto; line-height: 1"
        @click="onInfoClick"
      >
        <InfoCircleOutlined />
      </Button>
      <InfoCircleOutlined v-else-if="showIcon" style="color: var(--sm-color-primary); font-size: 16px" />
    </div>
    <Typography.Text v-if="description" type="secondary" style="display: block; font-size: 12px">
      {{ description }}
    </Typography.Text>
  </div>
</template>
