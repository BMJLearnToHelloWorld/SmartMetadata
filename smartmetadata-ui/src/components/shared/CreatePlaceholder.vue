<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Vue port of components/common/EmptyPlaceholder/CreatePlaceholder.tsx.

  When `permission` is explicitly `false` it falls back to a
  PermissionPlaceholder: the caller's create icon, title, description,
  `actions` and `footer` describe the create state and never reach the
  denied state. The denied state keeps the permission test id whatever
  the caller passed, so "no access" stays distinguishable from
  "nothing here yet".

  The doc link renders only when the call site passes `doc`, opens in a
  new window, and uses the `message.refer-to-our-doc` template with the
  <0>...</0> element split (splitTransElement).
-->
<script setup lang="ts">
import { computed, useSlots } from 'vue';
import { useI18n } from 'vue-i18n';
import { PlusOutlined } from '@ant-design/icons-vue';
import {
  resolveSingleAction,
  splitTransElement,
  type EmptyPlaceholderContentPropsInput,
} from '@/utils/emptyPlaceholder';
import EmptyPlaceholder from './EmptyPlaceholder.vue';
import PermissionPlaceholder from './PermissionPlaceholder.vue';

const props = withDefaults(
  defineProps<
    EmptyPlaceholderContentPropsInput & {
      permission?: boolean;
      heading?: string;
      doc?: string;
      buttonId?: string;
      permissionValue?: string;
      onCreate?: () => void;
    }
  >(),
  // Tri-state prop: absent (undefined) means "no permission info" and
  // must NOT fall back; only an explicit `false` denies. A Boolean-typed
  // prop without a default casts absent to `false` at runtime, which
  // would deny every caller that omits it — hence the explicit
  // `undefined` default.
  { permission: undefined }
);
const slots = useSlots();
const { t } = useI18n();

const denied = computed(() => props.permission === false);

const resolvedActions = computed(() =>
  resolveSingleAction(
    props.actions,
    props.onCreate,
    'add',
    t('label.add'),
    props.buttonId,
    props.buttonId ?? 'add-placeholder-button'
  )
);

const hasDescription = computed(() => !!props.description || !!slots.description);
const defaultDescriptionText = computed(() =>
  t('message.adding-new-entity-is-easy-just-give-it-a-spin', {
    entity: props.heading ?? t('label.entity'),
  })
);
const referMessage = computed(() =>
  t('message.refer-to-our-doc', { doc: t('label.doc-plural-lowercase') })
);
const referParts = computed(() => splitTransElement(referMessage.value));
</script>

<template>
  <PermissionPlaceholder
    v-if="denied"
    :permission-value="permissionValue"
    :width="width"
    :gap="gap"
    :class-name="className"
    test-id="permission-error-placeholder"
  />
  <EmptyPlaceholder
    v-else
    variant="blank"
    :actions="resolvedActions"
    :width="width"
    :gap="gap"
    :class-name="className"
    :test-id="testId"
    :icon="icon ?? PlusOutlined"
    :title="title"
    :description="description"
  >
    <template v-if="$slots.icon" #icon><slot name="icon" /></template>
    <template v-if="$slots.title" #title><slot name="title" /></template>
    <template v-if="$slots.description" #description><slot name="description" /></template>
    <template v-else-if="!hasDescription" #description>
      {{ defaultDescriptionText }}<template v-if="doc">{{ ' ' }}<template v-if="referParts"
          >{{ referParts.before
          }}<a
            :href="doc"
            :aria-label="t('label.documentation')"
            rel="noopener noreferrer"
            target="_blank"
            >{{ referParts.inner }}</a
          >{{ referParts.after }}</template
        ><template v-else>{{ referMessage }}</template></template
      >
    </template>
    <template v-if="$slots.footer" #footer><slot name="footer" /></template>
  </EmptyPlaceholder>
</template>
