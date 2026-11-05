<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Tag, Typography } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import SmIcon from './SmIcon.vue';

/**
 * Official PageHeader bridge (PageHeader.component.tsx): an h5 heading at
 * text-md (16px), semibold, an optional sub-heading below it, a Beta
 * badge when isBeta, and a learning icon when a learningPageId is given.
 * Breadcrumbs are deliberately NOT part of this component in the
 * official design; use SmBreadcrumb per page instead.
 *
 * This is the product's ONE page-title component (R-18 convergence): the
 * detail/list/preference shells all render their titles through it, so no
 * page carries a second hand-rolled title block. The optional `badge` slot
 * renders inline in the title row (e.g. a Deleted tag) and `below` renders
 * under the sub-heading (e.g. a lead paragraph plus a meta slot).
 */
const { t } = useI18n();
withDefaults(
  defineProps<{
    header: string;
    subHeader?: string;
    isBeta?: boolean;
    learningPageId?: string;
    testId?: string;
  }>(),
  { subHeader: undefined, isBeta: false, learningPageId: undefined, testId: 'page-header' },
);
</script>

<template>
  <div class="sm-page-header" :data-testid="testId">
    <h5 class="sm-page-header__title" :data-testid="`${testId}-heading`">
      {{ header }}
      <Tag v-if="isBeta" class="sm-page-header__beta" :data-testid="`${testId}-beta`" color="blue">{{ t('shared.beta') }}</Tag>
      <SmIcon v-if="learningPageId" icon-key="learning" class="sm-page-header__learning" :test-id="`${testId}-learning`" :aria-label="learningPageId" />
      <slot name="badge" />
    </h5>
    <Typography.Paragraph v-if="subHeader" class="sm-page-header__sub" :data-testid="`${testId}-sub`" type="secondary">
      {{ subHeader }}
    </Typography.Paragraph>
    <slot name="below" />
  </div>
</template>

<style scoped>
.sm-page-header__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--sm-text-primary);
}
.sm-page-header__beta {
  margin-left: 8px;
  vertical-align: middle;
}
.sm-page-header__learning {
  margin-left: 8px;
  color: var(--sm-color-primary);
}
.sm-page-header__sub {
  margin: 4px 0 0;
}
</style>
