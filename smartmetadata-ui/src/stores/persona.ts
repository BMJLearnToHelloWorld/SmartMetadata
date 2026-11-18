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
import { ApiError } from '@/api/client';
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
    // No reset semantics: the document slot is nulled and then
    // reloaded for the new selection, never reset to a template.
    document.value = null;
    documentLoaded.value = false;
    await loadDocument();
  }

  /**
   * Page-level document load, decoupled from the global selection
   * (C-4 §3.2③): fetches and normalizes the document for the given
   * persona without switching the globally selected persona, without
   * touching the persisted selection, and without writing the shared
   * document slot. The customize page owns its page-level document
   * state; this loader only supplies it.
   *
   * Returns null only when there is no document yet (404) or the
   * persona has no FQN (disabled-query guard, as official
   * `personaDocFqn`): the caller then uses the in-memory empty
   * template. Any other failure throws, so the caller can toast and
   * keep its document null (C-4 §3.2④: non-404 means toast only, no
   * document value, and save callbacks early-return) instead of
   * mistaking a failed read for "no customizations".
   */
  async function loadDocumentForPersona(
    persona: { fullyQualifiedName?: string | null } | null | undefined,
  ): Promise<PersonaDocument | null> {
    const fqn = personaDocFqn(persona?.fullyQualifiedName ?? null);
    if (!fqn) {
      return null;
    }
    try {
      return normalizePersonaDocument(await getDocumentByFqn(fqn));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * U-09 save synchronization, the product equivalent of the
   * official `syncSavedDocument` query-cache write: the normalized
   * saved document is written to the shared slot so consumers of the
   * selected persona (home, marketplace, landing redirect) see the
   * new customization without a reload. The write is guarded by FQN:
   * it applies only when the saved document is the selected
   * persona's document. A save for any other persona leaves the
   * shared slot alone — selecting that persona later refetches its
   * document — so a page-level save can never corrupt the global
   * selection's document. The product has no query-key cache; this
   * guarded single-slot write is the equivalent mechanism, and the
   * save callback's own local ref remains the page-level state.
   */
  function syncSavedDocument(saved: PersonaDocument): void {
    const selected = selectedPersona.value;
    if (!selected) {
      return;
    }
    if (saved.fullyQualifiedName !== personaDocFqn(selected.fullyQualifiedName)) {
      return;
    }
    document.value = normalizePersonaDocument(saved);
    documentLoaded.value = true;
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
    } catch (error) {
      // A missing document is not an error: the persona simply has no
      // customizations yet, as official treats the 404 as empty. Other
      // failures also leave no document rather than a stale one — but
      // unlike a 404 they are logged, so a failing DocStore read is
      // visible instead of silently looking like "no customizations".
      if (!(error instanceof ApiError && error.status === 404)) {
        console.error('Failed to load persona document', error);
      }
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
    loadDocumentForPersona,
    syncSavedDocument,
  };
});
