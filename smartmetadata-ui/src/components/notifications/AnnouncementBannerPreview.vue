<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the Apache License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Badge, Tooltip, Typography } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Announcement } from '@/types/collaboration';
import type { AnnouncementFormValues } from '@/types/notifications';
import { formatAnnouncementDate } from '@/utils/notifications/alertDates';
import {
  getAnnouncementStatus,
  getAnnouncementTypeConfig,
  getAnnouncementTypeLabel,
  SYSTEM_ANNOUNCEMENT_STATUS_LABEL_KEYS,
  toAnnouncementTypeFields,
  type AnnouncementStatusValue,
} from '@/utils/notifications/announcementUtils';
import {
  ANNOUNCEMENT_TYPE_ICONS,
  announcementSurfaceStyle,
} from '@/utils/notifications/announcementPresentation';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import { isDescriptionContentEmpty } from '@/utils/richTextUtils';
import { stripMarkdown } from '@/utils/stripMarkdown';

/**
 * Pin `AnnouncementBannerPreview` + the collapsed layout of
 * `AnnouncementBanner` (AnnouncementBannerPreview.tsx:44-100,
 * AnnouncementBanner.component.tsx:522-612): the banner as the
 * organization will see it, from the form's live values. The status
 * is derived from the window the same way the server derives it, so
 * the author sees whether saving puts it live now or schedules it.
 * The banner renders collapsed — one line with chip, badge, title
 * and a flattened description — with no footer, no toggle and no
 * dismiss, as in the preview's default banner props. `createdBy`
 * rides on the preview entity but has no visible surface here.
 */
const props = defineProps<{
  /** Shown in the banner footer, as it will be once saved. */
  createdBy?: string;
  values: AnnouncementFormValues;
}>();

const { t, locale } = useI18n();
const translate = t as unknown as TranslateFn;

const hasWindow = computed(
  () => props.values.startTime != null && props.values.endTime != null,
);

const preview = computed<Announcement>(() => ({
  id: 'preview',
  name: 'preview',
  displayName: props.values.title?.trim() || t('label.announcement-title'),
  description: isDescriptionContentEmpty(props.values.description)
    ? t('message.enter-a-description')
    : props.values.description,
  startTime: props.values.startTime ?? 0,
  endTime: props.values.endTime ?? 0,
  createdBy: props.createdBy,
  ...toAnnouncementTypeFields(props.values),
}));

const status = computed<AnnouncementStatusValue | undefined>(() =>
  hasWindow.value ? getAnnouncementStatus(preview.value) : undefined,
);

const typeConfig = computed(() => getAnnouncementTypeConfig(preview.value));
const surface = computed(() => announcementSurfaceStyle(typeConfig.value.color));
const title = computed(() => preview.value.displayName ?? preview.value.name ?? '');
const plainDescription = computed(() => stripMarkdown(preview.value.description ?? ''));
const hasDescription = computed(() => !isDescriptionContentEmpty(preview.value.description));

const statusBadgeStatus = computed(() => {
  if (status.value === 'Active') {
    return 'success';
  }
  if (status.value === 'Scheduled') {
    return 'processing';
  }
  return 'default';
});

const windowText = computed(() => {
  const { startTime, endTime } = props.values;
  if (startTime == null || endTime == null) {
    return '';
  }
  return `${formatAnnouncementDate(startTime, locale.value)} → ${formatAnnouncementDate(endTime, locale.value)}`;
});
</script>

<template>
  <div class="announcement-preview" data-testid="announcement-preview">
    <div class="announcement-preview__header">
      <Typography.Text strong type="secondary">{{ t('label.preview') }}</Typography.Text>
      <span v-if="status" data-testid="announcement-preview-status">
        <Badge
          :status="statusBadgeStatus"
          :text="t(SYSTEM_ANNOUNCEMENT_STATUS_LABEL_KEYS[status])"
        />
      </span>
    </div>
    <section
      class="announcement-preview__banner"
      :aria-label="`${t('label.announcement')}: ${title}`"
      :style="{ background: surface.background, outline: surface.outline }"
      data-testid="announcement-preview-banner"
    >
      <component
        :is="ANNOUNCEMENT_TYPE_ICONS[typeConfig.iconKey]"
        :style="{ color: surface.iconColor, flexShrink: 0, fontSize: '16px' }"
      />
      <span
        class="announcement-preview__badge"
        :style="{ color: surface.titleColor, borderColor: surface.titleColor }"
        data-testid="announcement-type-badge"
      >
        {{ getAnnouncementTypeLabel(typeConfig, translate) }}
      </span>
      <span class="announcement-preview__title-wrap">
        <Tooltip :title="title" placement="top">
          <Typography.Text
            strong
            class="announcement-preview__title"
            data-testid="announcement-title-btn"
          >
            {{ title }}
          </Typography.Text>
        </Tooltip>
      </span>
      <span v-if="hasDescription" class="announcement-preview__description-wrap">
        <Tooltip :title="plainDescription" placement="top">
          <Typography.Text
            type="secondary"
            class="announcement-preview__description"
            data-testid="announcement-description"
          >
            {{ plainDescription }}
          </Typography.Text>
        </Tooltip>
      </span>
    </section>
    <Typography.Text
      v-if="hasWindow"
      type="secondary"
      class="announcement-preview__window"
      data-testid="announcement-preview-window"
    >
      {{ windowText }}
    </Typography.Text>
    <Typography.Text type="secondary" class="announcement-preview__hint">
      {{ t('message.system-announcement-preview-hint') }}
    </Typography.Text>
  </div>
</template>

<style scoped>
.announcement-preview {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-radius: 12px;
  border: 1px solid var(--sm-border-secondary);
  background: var(--sm-content-bg);
  padding: 16px;
}

.announcement-preview__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.announcement-preview__banner {
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  outline-offset: -1px;
  padding: 8px 12px;
}

.announcement-preview__badge {
  background: var(--sm-bg-container);
  border: 1px solid;
  border-radius: 6px;
  padding: 1px 8px;
  font-size: 12px;
  line-height: 20px;
  white-space: nowrap;
}

.announcement-preview__title-wrap {
  min-width: 0;
  max-width: 50%;
  flex-shrink: 0;
}

.announcement-preview__title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-preview__description-wrap {
  flex: 1;
  min-width: 0;
}

.announcement-preview__description {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.announcement-preview__window,
.announcement-preview__hint {
  font-size: 12px;
}
</style>
