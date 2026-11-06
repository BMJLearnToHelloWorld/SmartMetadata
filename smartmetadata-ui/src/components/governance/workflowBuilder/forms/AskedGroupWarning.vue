<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Alert } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { asksARequiredGroup } from '@/utils/collectMetadataUtils';

/**
 * Official AskedGroupWarning (pin a3012259ca): warns when a collect-metadata
 * stage asks the same group (owners/reviewers) that the stage also requires
 * as a field — the task may then go to the admins until the field is set.
 */
const props = defineProps<{
  assignees: string;
  fields?: { field: string }[];
  groupLabel: string;
}>();

const { t } = useI18n();
</script>

<template>
  <Alert
    v-if="asksARequiredGroup(assignees, fields ?? [])"
    type="warning"
    show-icon
    data-testid="collect-metadata-asks-required-group"
    :message="t('workflows.builder.collectMetadataAsksRequiredGroup', { group: groupLabel })"
  />
</template>
