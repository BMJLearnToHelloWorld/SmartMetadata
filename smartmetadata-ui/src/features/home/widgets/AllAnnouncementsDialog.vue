<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Badge, Button, Modal, Spin } from 'ant-design-vue';
import { BellOutlined } from '@ant-design/icons-vue';
import { listAnnouncements } from '@/api/announcements';
import { compareAnnouncements } from '@/catalog/announcementLifecycle';
import type { Announcement } from '@/types/collaboration';
import AnnouncementCard from './AnnouncementCard.vue';

// Every live announcement — the full version of the rail, which shows
// two at a time. Expired and scheduled ones stay out: the section
// itself only appears while something is live, so it is no place for
// them; each asset's Announcements drawer lists those. Paged on the
// API's `after` cursor rather than capped at one fetch, so a busy
// estate never silently loses the rest.
const ALL_ANNOUNCEMENTS_PAGE_SIZE = 50;

const props = defineProps<{
  open: boolean;
  /** The rail owns dismissals; the dialog honours them. */
  dismissedIds: Set<string>;
}>();

const emit = defineEmits<{
  close: [];
  dismiss: [id: string];
}>();

const { t } = useI18n();

const loaded = ref<Announcement[]>([]);
const total = ref<number | undefined>(undefined);
const after = ref<string | undefined>(undefined);
const isLoading = ref(false);
const isFetchingNextPage = ref(false);

async function fetchPage(pageAfter: string | undefined, first: boolean): Promise<void> {
  if (first) {
    isLoading.value = true;
  } else {
    isFetchingNextPage.value = true;
  }
  try {
    const page = await listAnnouncements({
      active: true,
      limit: ALL_ANNOUNCEMENTS_PAGE_SIZE,
      after: pageAfter,
      system: false,
    });
    if (first) {
      loaded.value = page.data;
      total.value = page.paging?.total;
    } else {
      loaded.value = [...loaded.value, ...page.data];
    }
    after.value = page.paging?.after;
  } catch {
    if (first) {
      loaded.value = [];
      total.value = undefined;
    }
  } finally {
    isLoading.value = false;
    isFetchingNextPage.value = false;
  }
}

// Deferred until the dialog is opened — most sessions never open it,
// and the rail's own query already covers the first few.
watch(
  () => props.open,
  (open) => {
    if (open) {
      loaded.value = [];
      total.value = undefined;
      after.value = undefined;
      void fetchPage(undefined, true);
    }
  },
  { immediate: true },
);

// Sorted across every page loaded so far, so a later page can slot
// items in above ones already shown; the API pages in its own order,
// not this one.
const announcements = computed(() =>
  loaded.value
    .filter((a) => !props.dismissedIds.has(a.id))
    .sort(compareAnnouncements),
);

// The badge counts the whole list, not just the pages loaded: the
// server's total, less what the user dismissed among the ones already here.
const count = computed(() =>
  total.value === undefined
    ? announcements.value.length
    : Math.max(total.value - (loaded.value.length - announcements.value.length), 0),
);

const hasNextPage = computed(() => after.value !== undefined);

function onClose(): void {
  emit('close');
}
</script>

<template>
  <Modal
    :open="open"
    :footer="null"
    :width="720"
    :title="null"
    data-testid="all-announcements-dialog"
    @cancel="onClose"
  >
    <div class="all-announcements__header">
      <span class="all-announcements__icon"><BellOutlined /></span>
      <span class="all-announcements__title">{{ t('home.allAnnouncements', { entity: t('home.announcements') }) }}</span>
      <Badge :count="count" data-testid="all-announcements-count" />
    </div>
    <div class="all-announcements__body">
      <div v-if="isLoading" class="all-announcements__center">
        <Spin />
      </div>
      <p v-else-if="announcements.length === 0 && !hasNextPage" class="all-announcements__center">
        {{ t('home.noActiveAnnouncements') }}
      </p>
      <template v-else>
        <ul class="all-announcements__list" data-testid="all-announcements-list">
          <li v-for="announcement in announcements" :key="announcement.id" class="all-announcements__cell">
            <AnnouncementCard
              :announcement="announcement"
              :on-navigate="onClose"
              @dismiss="emit('dismiss', $event)"
            />
          </li>
        </ul>
        <div v-if="hasNextPage" class="all-announcements__more">
          <Button
            data-testid="all-announcements-load-more"
            :loading="isFetchingNextPage"
            @click="void fetchPage(after, false)"
          >
            {{ t('home.loadMore') }}
          </Button>
        </div>
      </template>
    </div>
  </Modal>
</template>

<style scoped>
.all-announcements__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 16px;
}
.all-announcements__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--sm-color-primary-bg, #e7f3fb);
  color: var(--sm-color-primary, #005587);
}
.all-announcements__title {
  font-size: 14px;
  font-weight: 600;
}
.all-announcements__body {
  max-height: 60vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-bottom: 24px;
}
.all-announcements__center {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 0;
}
.all-announcements__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.all-announcements__cell {
  display: flex;
}
.all-announcements__cell > * {
  width: 100%;
}
.all-announcements__more {
  margin-top: 12px;
  display: flex;
  justify-content: center;
}
</style>
