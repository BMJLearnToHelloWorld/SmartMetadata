<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import type { OwnerOption } from '@/governance/catalogOptions';
import type { EntityRef } from '@/types/api';
import WidgetRefListCell from './WidgetRefListCell.vue';

/**
 * Shared reviewers widget cell (D-2 batch 2): the product port of pin
 * `ReviewerLabelV2` — users only (`UserTeamSelectableList` with
 * `multiple={{user: true, team: false}}`), gate `can(Operation.
 * EditReviewers)` (no named `canEdit*` flag exists for it, per the pin
 * file comment). The caller derives `hasEditAccess`
 * (`isAdminUser || can('EditReviewers')`). The pin inherited-vs-assigned
 * split is a DataProduct-only read concern handled by the caller.
 */
withDefaults(
  defineProps<{
    reviewers: EntityRef[];
    options: OwnerOption[];
    hasEditAccess: boolean;
    onChange: (reviewers: Array<{ id: string; type: 'user' | 'team' }>) => Promise<unknown> | unknown;
    testId?: string;
  }>(),
  { testId: 'widget-reviewer-cell' },
);
</script>

<template>
  <WidgetRefListCell
    :refs="reviewers"
    :options="options"
    :has-edit-access="hasEditAccess"
    entity-label-key="label.reviewer-plural"
    :user-only="true"
    :on-change="onChange"
    :test-id="testId"
  />
</template>
