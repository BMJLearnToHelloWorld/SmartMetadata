<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Badge, Button } from 'ant-design-vue';
import { listAnnouncements } from '@/api/announcements';
import { useDismissedAnnouncements, DismissedAnnouncementsScope } from '@/features/home/useDismissedAnnouncements';
import { useRailPager } from '@/features/home/useRailPager';
import { useAuthStore } from '@/stores/auth';
import type { Announcement } from '@/types/collaboration';
import AllAnnouncementsDialog from './AllAnnouncementsDialog.vue';
import AnnouncementCard from './AnnouncementCard.vue';
import RailPager from './RailPager.vue';

const auth = useAuthStore();
const { t } = useI18n();

const userId = computed(() => auth.user?.id);
const { dismissedIds, dismiss, prune } = useDismissedAnnouncements(
  userId,
  DismissedAnnouncementsScope.Rail,
);
const isAllOpen = ref(false);

// Asset announcements only: system ones reach users through the
// critical banner above the rail, never here.
async function fetchActiveAnnouncements(): Promise<Announcement[]> {
  const response = await listAnnouncements({ active: true, limit: 100, system: false });
  return response.data;
}

const announcements = ref<Announcement[]>([]);
const isError = ref(false);
const loaded = ref(false);

async function load(): Promise<void> {
  try {
    announcements.value = await fetchActiveAnnouncements();
    isError.value = false;
  } catch {
    announcements.value = [];
    isError.value = true;
  } finally {
    loaded.value = true;
  }
}

onMounted(() => {
  void load();
});

// Only a live announcement can be dismissed, so an id the active list
// no longer returns has expired or been deleted and will never show again.
watch(announcements, (items) => {
  prune(items.map(({ id }) => id));
});

const activeAnnouncements = computed(() =>
  announcements.value.filter((a) => !dismissedIds.value.has(a.id)),
);
const count = computed(() => activeAnnouncements.value.length);
const countRef = computed(() => count.value);
const { railRef, canScroll, syncScrollState, goToPrevious, goToNext } = useRailPager(countRef);

const hasLive = computed(() => loaded.value && !isError.value && count.value > 0);
</script>

<template>
  <!-- The dialog is mounted beside the section, not inside it:
       dismissing the last live card from the open dialog empties the
       rail, and unmounting the dialog with it would close it on the
       scheduled and expired ones it lists. -->
  <AllAnnouncementsDialog
    :open="isAllOpen"
    :dismissed-ids="dismissedIds"
    @close="isAllOpen = false"
    @dismiss="dismiss($event)"
  />
  <!-- With nothing live the whole section stands down — no heading,
       no "View all" into a list of only scheduled and expired ones. -->
  <section v-if="hasLive" data-testid="announcements-section" class="announcements-rail">
    <div class="announcements-rail__header">
      <span class="announcements-rail__title">{{ t('home.announcements') }}</span>
      <Badge :count="count" data-testid="announcements-count" />
      <div class="announcements-rail__actions">
        <RailPager
          v-if="count > 1"
          test-id-prefix="announcement"
          :can-scroll="canScroll"
          @previous="goToPrevious"
          @next="goToNext"
        />
        <Button
          type="link"
          size="small"
          data-testid="announcement-view-all"
          @click="isAllOpen = true"
        >
          {{ t('home.viewAll') }}
        </Button>
      </div>
    </div>

    <!-- Two-up at wide widths, one-up below it: official sizes the
         rail off the section's own width with a container query
         (`@2xl`); the product has no Tailwind container queries, so a
         plain media breakpoint on the rail carries the same rule
         (ADR:2026-11-08-my-data-announcements-rail). -->
    <div class="announcements-rail__container">
      <ul
        :aria-label="t('home.announcements')"
        class="announcements-rail__list"
        data-testid="announcement-rail"
        ref="railRef"
        @scroll="syncScrollState"
      >
        <!-- A lone announcement takes the full width rather than half
             the rail beside an empty column. -->
        <li
          v-for="announcement in activeAnnouncements"
          :key="announcement.id"
          class="announcements-rail__cell"
          :class="{ 'announcements-rail__cell--half': count > 1 }"
        >
          <AnnouncementCard :announcement="announcement" @dismiss="dismiss($event)" />
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.announcements-rail__header {
  display: flex;
  align-items: center;
  gap: 8px;
}
.announcements-rail__title {
  font-size: 14px;
  font-weight: 600;
}
.announcements-rail__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 16px;
}
.announcements-rail__container {
  margin-top: 12px;
  min-width: 0;
}
.announcements-rail__list {
  display: flex;
  gap: 14px;
  margin: -8px 0;
  padding: 8px 0;
  overflow-x: auto;
  list-style: none;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.announcements-rail__list::-webkit-scrollbar {
  display: none;
}
.announcements-rail__cell {
  display: flex;
  flex-shrink: 0;
  flex-basis: 100%;
  scroll-snap-align: start;
}
@media (min-width: 720px) {
  .announcements-rail__cell--half {
    flex-basis: calc(50% - 0.4375rem);
  }
}
.announcements-rail__cell > * {
  width: 100%;
}
</style>
