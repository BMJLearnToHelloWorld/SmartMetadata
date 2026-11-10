<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Avatar, Tag, Tooltip } from 'ant-design-vue';
import { CloseOutlined } from '@ant-design/icons-vue';
import {
  ANNOUNCEMENT_STATUS_COLORS,
  ANNOUNCEMENT_STATUS_LABEL_KEYS,
  ANNOUNCEMENT_SURFACE,
  getAnnouncementTypeConfig,
  getAnnouncementTypeLabel,
} from '@/catalog/announcementType';
import { getAnnouncementLifecycle } from '@/catalog/announcementLifecycle';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import { getRelativeTime } from '@/utils/relativeTime';
import { stripMarkdown } from '@/utils/stripMarkdown';
import type { Announcement } from '@/types/collaboration';

const props = defineProps<{
  announcement: Announcement;
  /** Runs when the card's link is followed — the dialog closes itself on it. */
  onNavigate?: () => void;
}>();

const emit = defineEmits<{
  dismiss: [id: string];
}>();

const { t } = useI18n();
const router = useRouter();

// The type table lives in the catalog module so a Critical
// announcement reads the same here as it does on an entity page.
const typeConfig = computed(() => getAnnouncementTypeConfig(props.announcement));
const surface = computed(() => ANNOUNCEMENT_SURFACE[typeConfig.value.color]);
const typeLabel = computed(() => getAnnouncementTypeLabel(typeConfig.value, (key) => t(key)));

const lifecycle = computed(() => getAnnouncementLifecycle(props.announcement));

const title = computed(() => props.announcement.displayName ?? props.announcement.name ?? '');
const description = computed(() => stripMarkdown(props.announcement.description ?? ''));
const userName = computed(() => props.announcement.createdBy ?? '');

// An announcement with no entityLink has nowhere to navigate to.
// The link resolves only when the product has a detail route for the
// entity type: domain/dataProduct announcements carry an FQN, while
// the governance detail routes take an entity id, so those stay
// plain text — but the FQN still shows in the footer
// (ADR:2026-11-08-my-data-announcements-rail).
const entityRef = computed(() => {
  const link = props.announcement.entityLink ?? '';
  const match = /^<#E::([^:]+)::(.+)>$/.exec(link.trim());
  if (!match) {
    return null;
  }
  const [, entityType, fqn] = match;
  if (!entityType || !fqn) {
    return null;
  }
  return { entityType, fqn };
});

const href = computed(() =>
  entityRef.value && isDetailWired(entityRef.value.entityType)
    ? assetLocation(entityRef.value.entityType, entityRef.value.fqn)
    : null,
);

function onTitleClick(): void {
  props.onNavigate?.();
  if (href.value) {
    void router.push(href.value);
  }
}

function onDismiss(): void {
  emit('dismiss', props.announcement.id);
}
</script>

<template>
  <div
    class="announcement-card"
    :class="{ 'announcement-card--dimmed': !lifecycle.isDismissible }"
    :style="{ background: surface.background, outlineColor: surface.border }"
    :data-testid="`announcement-card-${announcement.id}`"
  >
    <div class="announcement-card__head">
      <component
        :is="typeConfig.icon"
        class="announcement-card__type-icon"
        :style="{ color: surface.color }"
      />
      <span
        class="announcement-card__type-label"
        :style="{ color: surface.color }"
        data-testid="announcement-type-badge"
      >
        {{ typeLabel }}
      </span>
      <div class="announcement-card__head-right">
        <!-- A live announcement is self-evidently live — only the ones
             the rail would not have shown need naming. -->
        <Tag
          v-if="!lifecycle.isDismissible"
          :color="ANNOUNCEMENT_STATUS_COLORS[lifecycle.status]"
          data-testid="announcement-status"
        >
          {{ t(ANNOUNCEMENT_STATUS_LABEL_KEYS[lifecycle.status]) }}
        </Tag>
        <button
          v-if="lifecycle.isDismissible"
          type="button"
          class="announcement-card__dismiss"
          :style="{ color: surface.color }"
          :aria-label="t('home.dismiss')"
          :title="t('home.dismiss')"
          data-testid="announcement-dismiss"
          @click.stop="onDismiss"
        >
          <CloseOutlined />
        </button>
      </div>
    </div>

    <!-- The stretched link makes the whole card the hit target: one tab
         stop, real link semantics, no nested interactives. -->
    <a
      v-if="href"
      href="#"
      class="announcement-card__title announcement-card__title--link"
      @click.prevent="onTitleClick"
    >
      {{ title }}
    </a>
    <span v-else class="announcement-card__title">{{ title }}</span>

    <Tooltip v-if="description" :title="description">
      <p class="announcement-card__description">{{ description }}</p>
    </Tooltip>

    <div class="announcement-card__footer">
      <Avatar v-if="userName" size="small" class="announcement-card__author">
        {{ userName.charAt(0).toUpperCase() }}
      </Avatar>
      <span v-if="entityRef" class="announcement-card__entity">{{ entityRef.fqn }}</span>
      <time
        v-if="lifecycle.timestamp"
        class="announcement-card__time"
        :datetime="new Date(lifecycle.timestamp).toISOString()"
      >
        {{ getRelativeTime(lifecycle.timestamp) }}
      </time>
    </div>
  </div>
</template>

<style scoped>
.announcement-card {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  border-radius: 12px;
  outline: 1px solid;
  outline-offset: -1px;
}
.announcement-card--dimmed {
  opacity: 0.7;
}
.announcement-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.announcement-card__type-icon {
  flex-shrink: 0;
  font-size: 16px;
}
.announcement-card__type-label {
  font-size: 12px;
  font-weight: 600;
}
.announcement-card__head-right {
  margin-left: auto;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 4px;
}
.announcement-card__dismiss {
  /* z-index keeps the dismiss target above the title's stretched link. */
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.announcement-card__title {
  margin-top: 8px;
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.announcement-card__title--link {
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}
.announcement-card__title--link::after {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  content: '';
}
.announcement-card__description {
  display: -webkit-box;
  margin: 6px 0 0;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.announcement-card__footer {
  margin-top: 10px;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.announcement-card__entity {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.announcement-card__time {
  margin-left: auto;
  flex-shrink: 0;
}
</style>
