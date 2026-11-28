<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Alert, Button } from 'ant-design-vue';

const COLLAPSE_THRESHOLD = 400;

const props = defineProps<{
  message: string;
}>();

const { t } = useI18n();
const isDismissed = ref(false);
const isExpanded = ref(true);
const isCollapsible = computed(() => props.message.length > COLLAPSE_THRESHOLD);
</script>

<template>
  <Alert
    v-if="!isDismissed && message"
    type="error"
    closable
    show-icon
    data-testid="contract-status-alert"
    @close="isDismissed = true"
  >
    <template #message>
      <div class="contract-status-alert__body">
        <p
          class="contract-status-alert__message"
          :class="{ 'is-collapsed': isCollapsible && !isExpanded }"
          data-testid="contract-status-alert-message"
        >
          {{ message }}
        </p>
        <Button
          v-if="isCollapsible"
          type="link"
          size="small"
          data-testid="contract-status-alert-toggle"
          @click="isExpanded = !isExpanded"
        >
          {{ isExpanded ? t('label.show-less') : t('label.show-more') }}
        </Button>
      </div>
    </template>
  </Alert>
</template>

<style scoped>
.contract-status-alert__message {
  margin: 0;
  color: var(--sm-color-error-text);
  white-space: pre-wrap;
}
.contract-status-alert__message.is-collapsed {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
