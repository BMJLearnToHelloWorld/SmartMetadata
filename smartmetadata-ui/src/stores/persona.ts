/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getDocumentByFqn, personaDocFqn } from '@/api/docStore';
import { listPersonas } from '@/api/persona';
import { normalizePersonaDocument } from '@/views/admin/personaPage';
import { useAuthStore } from '@/stores/auth';
import type { Persona, PersonaDocument } from '@/types/persona';

/**
 * Selected-persona slice, mirroring the official useApplicationStore
 * selectedPersona + usePersonaDocument pair: the selection is
 * persisted locally (like the domain scope), initialized from the
 * user's defaultPersona when nothing is stored, and validated against
 * the live list — a stored id that no longer exists falls back to
 * the default persona, never to a stale selection.
 */
export const PERSONA_STORAGE_KEY = 'sm.persona.v1';

export const usePersonaStore = defineStore('persona', () => {
  const personas = ref<Persona[]>([]);
  const selectedPersonaId = ref<string | null>(null);
  const document = ref<PersonaDocument | null>(null);
  const loading = ref(false);
  const loaded = ref(false);
  const documentLoading = ref(false);
  const documentLoaded = ref(false);

  const selectedPersona = computed(
    () => personas.value.find((item) => item.id === selectedPersonaId.value) ?? null,
  );

  function hydrate(): void {
    const stored = window.localStorage.getItem(PERSONA_STORAGE_KEY);
    selectedPersonaId.value = stored ? stored : null;
  }

  function persist(): void {
    if (selectedPersonaId.value) {
      window.localStorage.setItem(PERSONA_STORAGE_KEY, selectedPersonaId.value);
    } else {
      window.localStorage.removeItem(PERSONA_STORAGE_KEY);
    }
  }

  async function ensureLoaded(): Promise<void> {
    if (loaded.value) {
      return;
    }
    loading.value = true;
    try {
      hydrate();
      const page = await listPersonas({ limit: 100 });
      personas.value = page.data;
      const auth = useAuthStore();
      const fallbackId = auth.user?.defaultPersona?.id ?? null;
      if (
        selectedPersonaId.value &&
        !personas.value.some((item) => item.id === selectedPersonaId.value)
      ) {
        selectedPersonaId.value = null;
      }
      if (!selectedPersonaId.value && fallbackId) {
        selectedPersonaId.value = personas.value.some((item) => item.id === fallbackId)
          ? fallbackId
          : null;
      }
      persist();
    } catch {
      personas.value = [];
    } finally {
      loading.value = false;
      loaded.value = true;
    }
  }

  async function selectPersona(id: string | null): Promise<void> {
    selectedPersonaId.value = id;
    persist();
    document.value = null;
    documentLoaded.value = false;
    await loadDocument();
  }

  async function loadDocument(): Promise<void> {
    const persona = selectedPersona.value;
    if (!persona) {
      document.value = null;
      documentLoaded.value = true;
      return;
    }
    const fqn = personaDocFqn(persona.fullyQualifiedName);
    if (!fqn) {
      document.value = null;
      documentLoaded.value = true;
      return;
    }
    documentLoading.value = true;
    try {
      document.value = normalizePersonaDocument(await getDocumentByFqn(fqn));
    } catch {
      // A missing document is not an error: the persona simply has no
      // customizations yet, as official treats the 404 as empty. Other
      // failures also leave no document rather than a stale one.
      document.value = null;
    } finally {
      documentLoading.value = false;
      documentLoaded.value = true;
    }
  }

  return {
    personas,
    selectedPersonaId,
    selectedPersona,
    document,
    loading,
    loaded,
    documentLoading,
    documentLoaded,
    hydrate,
    ensureLoaded,
    selectPersona,
    loadDocument,
  };
});
