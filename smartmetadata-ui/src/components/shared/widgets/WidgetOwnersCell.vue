<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import type { OwnerOption } from '@/governance/catalogOptions';
import type { EntityRef } from '@/types/api';
import WidgetRefListCell from './WidgetRefListCell.vue';

/**
 * Shared owners widget cell (D-2 batch 2): the product port of pin
 * `OwnerWidget` — users and teams (`multiple={{user, team}}` per
 * entityRules), gate `canEditOwners`. The caller derives
 * `hasEditAccess` (`isAdminUser || canEditOwners`); the one exception
 * is GlossaryTerm, whose pin gate reads the raw
 * `permissions?.EditOwners || permissions?.EditAll` — that view passes
 * that raw-OR value in as `hasEditAccess` (A8 §0.2, kept verbatim).
 */
withDefaults(
  defineProps<{
    owners: EntityRef[];
    options: OwnerOption[];
    hasEditAccess: boolean;
    onChange: (owners: Array<{ id: string; type: 'user' | 'team' }>) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { testId: 'widget-owners-cell' },
);
</script>

<template>
  <WidgetRefListCell
    :refs="owners"
    :options="options"
    :has-edit-access="hasEditAccess"
    entity-label-key="label.owner-plural"
    :on-change="onChange"
    :test-id="testId"
  />
</template>
