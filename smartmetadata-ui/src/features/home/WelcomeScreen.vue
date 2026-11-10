<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Button } from 'ant-design-vue';
import { CloseOutlined } from '@ant-design/icons-vue';
import { useAuthStore } from '@/stores/auth';
import { useAddServiceAction } from './useAddServiceAction';

/**
 * The first-login welcome screen, ported from the official framework
 * (openmetadata-ui `components/MyData/WelcomeScreen/WelcomeScreen.tsx`),
 * full version per B-4 (a).
 *
 * It replaces the whole grid on first login: a first-name greeting,
 * the platform name, and two ways in — connect a data source (only
 * when the user can add a database service, the classic-mode rule)
 * or take the product tour. Closing dismisses it for this mount; the
 * server-side `isFirstTimeUser` flag is what makes it once-per-user.
 * The right-rail HomeHero never renders alongside it.
 *
 * AI mode does not exist in the product, so the AI-mode branches are
 * omitted, not stubbed.
 */
const props = defineProps<{ onClose: () => void }>();

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const { addService, canAddService } = useAddServiceAction('database');

const firstName = computed(() => {
  const name = auth.displayName || auth.user?.name || '';
  return name.split(' ')[0] || t('home.user');
});

function connectDataSource(): void {
  props.onClose();
  addService();
}

function takeTour(): void {
  props.onClose();
  void router.push({ name: 'tour' });
}
</script>

<template>
  <div class="welcome-screen" data-testid="welcome-screen">
    <button
      class="welcome-screen__close"
      type="button"
      :aria-label="t('home.close')"
      data-testid="welcome-screen-close"
      @click="props.onClose()"
    >
      <CloseOutlined />
    </button>
    <div class="welcome-screen__body">
      <p class="welcome-screen__greeting">
        {{ t('home.welcome', { name: firstName }) }} 👋
      </p>
      <h1 class="welcome-screen__title">
        {{ t('home.yourPlatformIsReady', { platform: t('product.name') }) }}
      </h1>
      <p class="welcome-screen__message">{{ t('home.welcomeScreenMessage') }}</p>
      <div class="welcome-screen__actions">
        <Button
          v-if="canAddService"
          type="primary"
          data-testid="welcome-connect-data-source"
          @click="connectDataSource"
        >
          {{ t('home.connectDataSource') }}
        </Button>
        <Button data-testid="welcome-take-tour" @click="takeTour">
          {{ t('home.takeQuickProductTour') }}
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.welcome-screen {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}
.welcome-screen__close {
  position: absolute;
  top: 8px;
  right: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--sm-text-secondary);
  cursor: pointer;
}
.welcome-screen__close:hover {
  background: var(--sm-bg-elevated);
  color: var(--sm-text-primary);
}
.welcome-screen__body {
  max-width: 560px;
  text-align: center;
}
.welcome-screen__greeting {
  margin: 0 0 8px;
  font-size: 15px;
  color: var(--sm-text-secondary);
}
.welcome-screen__title {
  margin: 0 0 12px;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.25;
}
.welcome-screen__message {
  margin: 0 0 24px;
  font-size: 15px;
  color: var(--sm-text-secondary);
}
.welcome-screen__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}
</style>
