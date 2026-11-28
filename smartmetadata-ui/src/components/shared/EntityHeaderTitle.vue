<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
  Official EntityHeaderTitle: icon, displayName, name, deleted badge,
  optional badge/suffix, and copy-URL button. Vue + ant-design-vue;
  no CCL CSS and no invented name coloring.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Tooltip, Typography } from 'ant-design-vue';
import { CopyOutlined, ExclamationCircleFilled } from '@ant-design/icons-vue';

const props = withDefaults(
  defineProps<{
    name: string;
    displayName?: string;
    serviceName?: string;
    deleted?: boolean;
    isDisabled?: boolean;
    showName?: boolean;
    showOnlyDisplayName?: boolean;
    entityUrl?: string;
  }>(),
  {
    serviceName: '',
    deleted: false,
    isDisabled: false,
    showName: true,
    showOnlyDisplayName: false,
  },
);

const { t } = useI18n();

const copyLabel = computed(() =>
  t('label.copy-item', { item: t('label.url-uppercase') }),
);

const copyTooltip = ref('');
const tooltipTitle = computed(() => copyTooltip.value || copyLabel.value);

const rootTestId = computed(() => `${props.serviceName}-${props.name}`);

const hasDisplayName = computed(
  () => Boolean(props.displayName) && props.showName,
);

const entityName = computed(() => {
  if (props.showOnlyDisplayName) {
    return props.displayName || props.name;
  }
  return props.name;
});

async function onCopy(event: MouseEvent): Promise<void> {
  event.preventDefault();
  event.stopPropagation();
  const url = props.entityUrl ?? globalThis.location.href;
  try {
    await navigator.clipboard.writeText(url);
    copyTooltip.value = t('message.link-copy-to-clipboard');
    window.setTimeout(() => {
      copyTooltip.value = '';
    }, 2000);
  } catch {
    // Official EntityHeaderTitle only updates the tooltip on success.
  }
}
</script>

<template>
  <div class="entity-header-title" :data-testid="rootTestId">
    <div v-if="$slots.icon" class="entity-header-title__icon">
      <slot name="icon" />
    </div>
    <div class="entity-header-title__body">
      <div v-if="hasDisplayName" class="entity-header-title__row">
        <Tooltip :title="displayName || name" placement="bottom">
          <Typography.Text
            ellipsis
            class="entity-header-title__display-name"
            data-testid="entity-header-display-name"
          >
            {{ displayName || name }}
          </Typography.Text>
        </Tooltip>
        <span v-if="isDisabled" data-testid="disabled" class="entity-header-title__chip">
          {{ t('label.disabled') }}
        </span>
        <span v-if="deleted" data-testid="deleted-badge" class="entity-header-title__deleted">
          <ExclamationCircleFilled />
          {{ t('label.deleted') }}
        </span>
        <span v-if="$slots.badge" class="entity-header-title__badge">
          <slot name="badge" />
        </span>
        <slot name="suffix" />
      </div>
      <div class="entity-header-title__row" data-testid="entity-header-title">
        <Tooltip :title="entityName" placement="bottom">
          <Typography.Text
            ellipsis
            class="entity-header-title__name"
            :class="{ 'entity-header-title__name--solo': !hasDisplayName }"
            data-testid="entity-header-name"
          >
            {{ entityName }}
          </Typography.Text>
        </Tooltip>
        <Tooltip :title="tooltipTitle" placement="top">
          <Button
            type="text"
            size="small"
            :aria-label="copyLabel"
            data-testid="entity-header-copy-button"
            @click="onCopy"
          >
            <CopyOutlined />
          </Button>
        </Tooltip>
        <template v-if="!hasDisplayName">
          <slot name="suffix" />
        </template>
      </div>
    </div>
    <template v-if="!hasDisplayName">
      <span v-if="isDisabled" data-testid="disabled" class="entity-header-title__chip">
        {{ t('label.disabled') }}
      </span>
      <span v-if="deleted" data-testid="deleted-badge" class="entity-header-title__deleted">
        <ExclamationCircleFilled />
        {{ t('label.deleted') }}
      </span>
      <span v-if="$slots.badge" class="entity-header-title__badge">
        <slot name="badge" />
      </span>
    </template>
  </div>
</template>

<style scoped>
.entity-header-title {
  display: flex;
  min-width: 0;
  flex-wrap: nowrap;
  align-items: center;
  gap: var(--sm-spacing-sm, 12px);
}

.entity-header-title__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.entity-header-title__body {
  display: flex;
  flex-direction: column;
  gap: var(--sm-spacing-xs, 4px);
  min-width: 0;
  max-width: 100%;
}

.entity-header-title__row {
  display: flex;
  align-items: center;
  gap: var(--sm-spacing-xs, 8px);
  min-width: 0;
}

.entity-header-title__display-name {
  min-width: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--sm-color-text, rgba(0, 0, 0, 0.88));
}

.entity-header-title__name {
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}

.entity-header-title__name--solo {
  font-size: 20px;
  font-weight: 600;
  color: var(--sm-color-text, rgba(0, 0, 0, 0.88));
}

.entity-header-title__deleted,
.entity-header-title__chip,
.entity-header-title__badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sm-spacing-xs, 4px);
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--sm-color-text-secondary, rgba(0, 0, 0, 0.45));
}
</style>
