<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { usePersonaStore } from '@/stores/persona';
import {
  PERSONA_LANDING_HANDLED_KEY,
  resolveLandingRedirect,
  resolvePersonaLandingPage,
} from '@/views/admin/personaPage';

/**
 * Root redirect, mirroring the official PersonaLandingRedirect: only
 * the app entry is redirected, and only when the selected persona's
 * default landing page differs from Home. A session flag marks the
 * entry as handled, so later in-app visits to the root resolve to
 * Home instead of redirecting again. A stored login redirect already
 * wins over the root route before this component ever mounts.
 */
const router = useRouter();
const store = usePersonaStore();
const deciding = ref(true);

onMounted(async () => {
  const alreadyHandled = window.sessionStorage.getItem(PERSONA_LANDING_HANDLED_KEY) === '1';
  try {
    await store.ensureLoaded();
    if (store.selectedPersona) {
      await store.loadDocument();
    }
    const landingPage = resolvePersonaLandingPage(store.document, store.selectedPersona?.id);
    const target = resolveLandingRedirect({ landingPage, alreadyHandled });
    window.sessionStorage.setItem(PERSONA_LANDING_HANDLED_KEY, '1');
    if (target) {
      await router.replace(target);
    } else {
      await router.replace({ name: 'home' });
    }
  } catch {
    window.sessionStorage.setItem(PERSONA_LANDING_HANDLED_KEY, '1');
    await router.replace({ name: 'home' });
  } finally {
    deciding.value = false;
  }
});
</script>

<template>
  <div v-if="deciding" data-testid="persona-landing-loading" />
</template>
