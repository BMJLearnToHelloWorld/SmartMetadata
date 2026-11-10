<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { listAnnouncements } from '@/api/announcements';
import { useDismissedAnnouncements, DismissedAnnouncementsScope } from '@/features/home/useDismissedAnnouncements';
import { useRailPager } from '@/features/home/useRailPager';
import { useAuthStore } from '@/stores/auth';
import type { Announcement } from '@/types/collaboration';
import CriticalAnnouncementBanner from './CriticalAnnouncementBanner.vue';
import RailPager from './RailPager.vue';

// A page size, not a cap: the banner pages until the cursor runs out,
// so no live critical is ever left behind. Live criticals are a
// handful, so this is one request in practice.
const CRITICAL_ANNOUNCEMENTS_PAGE_SIZE = 25;

const auth = useAuthStore();
const { t } = useI18n();

const userId = computed(() => auth.user?.id);
const { dismissedIds, dismiss, prune } = useDismissedAnnouncements(
  userId,
  DismissedAnnouncementsScope.CriticalBanner,
);

// Every live critical, newest first. The server pages in its own
// order, not by start time, so the newest may sit on any page:
// sorting one page alone could leave it out of the banner without
// a trace.
async function fetchCriticalAnnouncements(): Promise<Announcement[]> {
  const announcements: Announcement[] = [];
  let after: string | undefined;
  do {
    const response = await listAnnouncements({
      active: true,
      after,
      limit: CRITICAL_ANNOUNCEMENTS_PAGE_SIZE,
      system: true,
      type: 'Critical',
    });
    announcements.push(...response.data);
    after = response.paging?.after;
  } while (after);
  return announcements.sort((a, b) => (b.startTime ?? 0) - (a.startTime ?? 0));
}

const announcements = ref<Announcement[]>([]);
const loaded = ref(false);

async function load(): Promise<void> {
  try {
    announcements.value = await fetchCriticalAnnouncements();
  } catch {
    announcements.value = [];
  } finally {
    loaded.value = true;
  }
}

onMounted(() => {
  void load();
});

// An id no longer returned has expired or been deleted, and cannot return.
watch(announcements, (items) => {
  prune(items.map(({ id }) => id));
});

const visible = computed(() =>
  announcements.value.filter(({ id }) => !dismissedIds.value.has(id)),
);
const count = computed(() => visible.value.length);
const countRef = computed(() => count.value);
const { railRef, canScroll, pageIndex, syncScrollState, goToPrevious, goToNext } =
  useRailPager(countRef);
</script>

<template>
  <!-- The Home page's top banner: the live critical system announcements,
       one full-width banner at a time. Several make a rail that pages
       exactly like the announcements rail below it — the same pager,
       the same slide — moved only by the user, so an outage notice
       never slides away mid-read.
       The banner takes the page's top slot, so whatever normally sits
       there is passed as `fallback` and shown whenever no critical
       announcement is live. -->
  <section
    v-if="loaded && count > 0"
    :aria-label="t('home.criticalAnnouncements')"
    class="critical-announcements"
    data-testid="critical-announcements"
  >
    <div v-if="count > 1" class="critical-announcements__pager-row">
      <RailPager
        test-id-prefix="critical-announcement"
        :can-scroll="canScroll"
        @previous="goToPrevious"
        @next="goToNext"
      />
      <!-- One banner fills the rail, so its page is the banner's
           position. Clamped: a dismissal can shorten the rail before
           it re-measures. -->
      <span aria-live="polite" class="sr-only" data-testid="critical-announcement-position">
        {{ t('home.currentOfTotal', { current: Math.min(pageIndex, count - 1) + 1, total: count }) }}
      </span>
    </div>
    <ul
      :aria-label="t('home.criticalAnnouncements')"
      class="critical-announcements__rail"
      data-testid="critical-announcement-rail"
      ref="railRef"
      @scroll="syncScrollState"
    >
      <li v-for="announcement in visible" :key="announcement.id" class="critical-announcements__cell">
        <CriticalAnnouncementBanner
          :announcement="announcement"
          @dismiss="dismiss(announcement.id)"
        />
      </li>
    </ul>
  </section>
  <slot v-else-if="loaded" name="fallback" />
</template>

<style scoped>
.critical-announcements {
  position: relative;
}
.critical-announcements__pager-row {
  margin-right: 8px;
  margin-bottom: 12px;
  display: flex;
  justify-content: flex-end;
}
.critical-announcements__rail {
  display: flex;
  gap: 14px;
  margin: 0;
  padding: 0;
  overflow-x: auto;
  list-style: none;
  scroll-snap-type: x mandatory;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.critical-announcements__rail::-webkit-scrollbar {
  display: none;
}
.critical-announcements__cell {
  display: flex;
  flex-shrink: 0;
  flex-basis: 100%;
  scroll-snap-align: start;
}
.critical-announcements__cell > * {
  width: 100%;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
