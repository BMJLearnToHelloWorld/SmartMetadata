<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Vue port of components/common/EmptyPlaceholder/PermissionPlaceholder.tsx.
  The no-access message renders through the <0>...</0> element split
  (splitTransElement): the entity name is wrapped in <b>, matching the
  official Transi18next renderElement. Caller actions, when provided,
  pass through (official spreads ...props); this variant never
  generates its own action.
  Rebase note: the shell batch's narrower variant (required
  `permissionValue`, settings.shell.* copy, bare ant-design Empty) is
  subsumed here — this port already carries `permissionValue`
  (optional, defaulting to the translated "Resource") and renders the
  same title + one description sentence with the entity interpolated,
  with no action buttons unless the caller supplies them. The
  `testId` defaults to `permission-error-placeholder`, the test id the
  AppShell guard-denial slot asserts (DESIGN §5.4 / D-3); callers may
  still override it.
-->
<script setup lang="ts">
import { computed, useSlots } from 'vue';
import { useI18n } from 'vue-i18n';
import { LockOutlined } from '@ant-design/icons-vue';
import {
  splitTransElement,
  type EmptyPlaceholderContentPropsInput,
} from '@/utils/emptyPlaceholder';
import EmptyPlaceholder from './EmptyPlaceholder.vue';

const props = defineProps<EmptyPlaceholderContentPropsInput & { permissionValue?: string }>();
const slots = useSlots();
const { t } = useI18n();

const hasTitle = computed(() => !!props.title || !!slots.title);
const hasDescription = computed(() => !!props.description || !!slots.description);
const showNoAccess = computed(() => !hasDescription.value && !hasTitle.value);
const noAccessMessage = computed(() =>
  t('settings.shell.noAccessPlaceholder', { entity: props.permissionValue ?? t('label.resource') })
);
const noAccessParts = computed(() => splitTransElement(noAccessMessage.value));
</script>

<template>
  <EmptyPlaceholder
    variant="blank"
    :actions="actions"
    :width="width"
    :gap="gap"
    :class-name="className"
    :test-id="testId ?? 'permission-error-placeholder'"
    :icon="icon ?? LockOutlined"
    :title="title ?? t('settings.shell.accessDenied')"
    :description="description"
  >
    <template v-if="$slots.icon" #icon><slot name="icon" /></template>
    <template v-if="$slots.title" #title><slot name="title" /></template>
    <template v-if="$slots.description" #description><slot name="description" /></template>
    <template v-else-if="showNoAccess" #description>
      <template v-if="noAccessParts"
        >{{ noAccessParts.before }}<b>{{ noAccessParts.inner }}</b>{{ noAccessParts.after }}</template
      >
      <template v-else>{{ noAccessMessage }}</template>
    </template>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </EmptyPlaceholder>
</template>
