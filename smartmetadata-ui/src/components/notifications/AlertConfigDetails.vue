<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Divider, Spin } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAlertSelection } from '@/composables/useAlertSelection';
import type { EventSubscription } from '@/types/quality';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import { getClassicAlertInitialValues, getModifiedAlertDataForForm } from '@/utils/notifications/alertSave';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import AlertFormSourceItem from './AlertFormSourceItem.vue';
import AlertRuleSection from './AlertRuleSection.vue';
import DestinationFormItem from './DestinationFormItem.vue';

/**
 * Pin `AlertConfigDetails` (AlertConfigDetails.tsx:51-213): the saved alert
 * reshaped through `getModifiedAlertDataForForm` + `getClassicAlertInitialValues`,
 * capabilities asked from the saved sources with NO input passed, and the
 * four segments rendered in view mode — Source always, Filters / Actions
 * only when the saved input has content, Destination always — separated by
 * dashed dividers. The template chain never starts in OSS (the extension
 * widgets are empty), so there is no templates fetch here. The tab waits
 * for the capabilities answer before showing anything.
 */
const props = defineProps<{
  alertDetails: EventSubscription | undefined;
  isNotificationAlert: boolean;
  hooks: AlertSearchHooks;
}>();

const { t } = useI18n();
const translate = t as unknown as TranslateFn;

const modifiedAlertData = computed(() =>
  props.alertDetails
    ? getClassicAlertInitialValues(getModifiedAlertDataForForm(props.alertDetails))
    : null,
);

const selection = useAlertSelection({
  alertType: () => (props.isNotificationAlert ? 'Notification' : 'Observability'),
  sources: () => props.alertDetails?.filteringRules?.resources ?? [],
  t: translate,
  notifyError: props.hooks.notifyError,
});

const hasFilters = computed(() => (modifiedAlertData.value?.input?.filters?.length ?? 0) > 0);
const hasActions = computed(() => (modifiedAlertData.value?.input?.actions?.length ?? 0) > 0);
</script>

<template>
  <div v-if="!selection.ready" class="alert-config-details__loader">
    <Spin />
  </div>
  <div v-else-if="modifiedAlertData" class="alert-config-details">
    <AlertFormSourceItem
      is-view-mode
      :value="modifiedAlertData.resources ?? []"
      :selection="selection"
    />
    <template v-if="hasFilters">
      <Divider dashed />
      <AlertRuleSection
        field="filters"
        :title="t('label.filter-plural')"
        is-view-only
        :rules="modifiedAlertData.input?.filters ?? []"
        :selection="selection"
        :hooks="props.hooks"
      />
    </template>
    <template v-if="hasActions">
      <Divider dashed />
      <AlertRuleSection
        field="actions"
        :title="t('label.trigger')"
        is-view-only
        :rules="modifiedAlertData.input?.actions ?? []"
        :selection="selection"
        :hooks="props.hooks"
      />
    </template>
    <Divider dashed />
    <DestinationFormItem
      is-view-mode
      :destinations="modifiedAlertData.destinations ?? []"
      :timeout="modifiedAlertData.timeout"
      :read-timeout="modifiedAlertData.readTimeout"
      :sources="modifiedAlertData.resources ?? []"
      :selection="selection"
      :validation-errors="{}"
      :hooks="props.hooks"
    />
  </div>
</template>

<style scoped>
.alert-config-details__loader {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}
</style>
