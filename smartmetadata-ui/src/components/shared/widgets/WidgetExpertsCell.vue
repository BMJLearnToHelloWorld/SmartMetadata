<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import type { OwnerOption } from '@/governance/catalogOptions';
import type { EntityRef } from '@/types/api';
import WidgetRefListCell from './WidgetRefListCell.vue';

/**
 * Shared experts widget cell (D-2 batch 2): the product port of pin
 * `DomainExpertWidget` — users only (`UserSelectableList`), gate
 * reuses `canEditOwners`. The pin `editAllPermission` is only the
 * version-view diff label, not the edit gate, so it is not wired here.
 * The caller derives `hasEditAccess` (`isAdminUser || canEditOwners`).
 */
withDefaults(
  defineProps<{
    experts: EntityRef[];
    options: OwnerOption[];
    hasEditAccess: boolean;
    onChange: (experts: Array<{ id: string; type: 'user' | 'team' }>) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { testId: 'widget-experts-cell' },
);
</script>

<template>
  <WidgetRefListCell
    :refs="experts"
    :options="options"
    :has-edit-access="hasEditAccess"
    entity-label-key="label.expert-plural"
    :user-only="true"
    :on-change="onChange"
    :test-id="testId"
  />
</template>
