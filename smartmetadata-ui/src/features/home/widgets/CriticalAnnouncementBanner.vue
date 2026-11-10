<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { Tag, Tooltip } from 'ant-design-vue';
import { CloseOutlined } from '@ant-design/icons-vue';
import { SM_PALETTE, SM_TEXT_ON_PRIMARY } from '@/theme/tokens';
import { getAnnouncementTypeConfig } from '@/catalog/announcementType';
import { stripMarkdown } from '@/utils/stripMarkdown';
import type { Announcement } from '@/types/collaboration';

const props = defineProps<{
  announcement: Announcement;
}>();

const emit = defineEmits<{
  dismiss: [];
}>();

const { t } = useI18n();
const typeConfig = getAnnouncementTypeConfig(props.announcement);
const title = props.announcement.displayName ?? props.announcement.name ?? '';
const description = stripMarkdown(props.announcement.description ?? '').trim();
</script>

<template>
  <!-- One critical system announcement as the Home page's top banner.
       Official draws it as a dark gray-900 slab; the product palette's
       darkest neutral is gray 100 (#4d4d4f), used here with white text
       (ADR:2026-11-08-my-data-announcements-rail). -->
  <div
    class="critical-banner"
    :style="{ background: SM_PALETTE.gray[100], color: SM_TEXT_ON_PRIMARY }"
    data-testid="critical-announcement-banner"
  >
    <div class="critical-banner__content">
      <component :is="typeConfig.icon" class="critical-banner__icon" />
      <div class="critical-banner__body">
        <div class="critical-banner__title-row">
          <h2 class="critical-banner__title" data-testid="critical-announcement-title">
            {{ title }}
          </h2>
          <Tag color="error">{{ t('home.announcementCritical') }}</Tag>
        </div>
        <Tooltip v-if="description" :title="description">
          <p class="critical-banner__description" data-testid="critical-announcement-description">
            {{ description }}
          </p>
        </Tooltip>
      </div>
      <button
        type="button"
        class="critical-banner__dismiss"
        :aria-label="t('home.dismiss')"
        :title="t('home.dismiss')"
        data-testid="critical-announcement-dismiss"
        @click="emit('dismiss')"
      >
        <CloseOutlined />
      </button>
    </div>
  </div>
</template>

<style scoped>
.critical-banner {
  position: relative;
  display: flex;
  border-radius: 12px;
}
.critical-banner__content {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 16px;
  padding: 16px 48px 16px 20px;
}
.critical-banner__icon {
  flex-shrink: 0;
  font-size: 20px;
}
.critical-banner__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}
.critical-banner__title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.critical-banner__title {
  margin: 0;
  min-width: 0;
  overflow-wrap: break-word;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.55;
}
.critical-banner__description {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.critical-banner__dismiss {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
</style>
