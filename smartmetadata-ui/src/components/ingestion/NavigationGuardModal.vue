<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button, Modal } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';

/**
 * Port of official NavigationGuardModal (pin a3012259ca): the
 * unsaved-changes confirm used both by the router navigation guard
 * (see useNavigationGuard) and by the edit-service back-step confirm.
 * Discard leaves; Continue Editing stays; closing the dialog by any
 * other means (X, mask click) stays, as pin's onOpenChange/onClose
 * handlers do.
 */
withDefaults(
  defineProps<{
    open: boolean;
    testId?: string;
  }>(),
  { testId: 'navigation-guard-modal' },
);

const emit = defineEmits<{
  leave: [];
  stay: [];
}>();

const { t } = useI18n();
</script>

<template>
  <Modal
    :open="open"
    :width="480"
    :data-testid="testId"
    :footer="null"
    :destroy-on-close="true"
    @cancel="emit('stay')"
  >
    <div class="navigation-guard-body">
      <div class="navigation-guard-title">{{ t('forms.navigationGuard.unsavedChanges') }}</div>
      <p class="navigation-guard-description">
        {{ t('forms.navigationGuard.unsavedChangesDescription') }}
      </p>
    </div>
    <div class="navigation-guard-footer">
      <Button data-testid="navigation-guard-discard" @click="emit('leave')">
        {{ t('forms.navigationGuard.discard') }}
      </Button>
      <Button type="primary" @click="emit('stay')">
        {{ t('forms.navigationGuard.continueEditing') }}
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.navigation-guard-body {
  margin-top: 16px;
}

.navigation-guard-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.navigation-guard-description {
  margin: 2px 0 0;
  font-size: 14px;
  color: var(--sm-text-tertiary);
}

.navigation-guard-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
