<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Avatar } from 'ant-design-vue';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const { t } = useI18n();

// Official greets with the display name in start case
// (`getEntityName` + lodash `startCase`).
function startCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

const displayName = computed(() => {
  const name = auth.displayName || auth.user?.name || '';
  return name ? startCase(name) : t('chrome.signedIn');
});
const userName = computed(() => auth.user?.name || '');
</script>

<template>
  <!-- Classic mode's greeting at the top of the home page, the page's
       single welcome copy (D-2: the HomeHero welcome line is removed).
       Styled like official AI mode's "Needs you now" heading, which
       greets the user there instead, so the two modes open the same way.
       Classic always renders — the product has no AI mode. -->
  <div class="home-landing-page-header" data-testid="home-landing-page-header">
    <Avatar v-if="userName" :size="40" class="home-landing-page-header__avatar">
      {{ displayName.charAt(0).toUpperCase() }}
    </Avatar>
    <div class="home-landing-page-header__copy">
      <h2 class="home-landing-page-header__title">
        {{ t('home.hiUser', { user: displayName }) }}
      </h2>
      <p class="home-landing-page-header__subtitle">
        {{ t('home.landingPageSubtitle') }}
      </p>
    </div>
  </div>
</template>

<style scoped>
.home-landing-page-header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.home-landing-page-header__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}
.home-landing-page-header__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.home-landing-page-header__subtitle {
  margin: 0;
  font-size: 12px;
  color: var(--sm-text-secondary, #595959);
}
</style>
