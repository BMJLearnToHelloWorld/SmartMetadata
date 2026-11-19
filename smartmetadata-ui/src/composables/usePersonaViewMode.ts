/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, type ComputedRef } from 'vue';
import { usePersonaStore } from '@/stores/persona';
import type { PageViewMode, ViewModePage } from '@/types/persona';
import { resolvePersonaViewMode } from '@/views/admin/personaPage';

/**
 * The view `page` opens in for the selected persona — the product
 * equivalent of the official `usePersonaViewMode`
 * (`hooks/platform/usePersonaViewMode.ts:18-24`): the persona document
 * + selected persona id feed the shared `resolvePersonaViewMode`,
 * which falls back to Table for a stored view the page doesn't offer.
 * Call sites keep a local override (`selectedView`) and render
 * `selectedView ?? personaView`, exactly as the official pages do.
 */
export function usePersonaViewMode(page: ViewModePage): ComputedRef<PageViewMode> {
  const persona = usePersonaStore();
  return computed(() =>
    resolvePersonaViewMode(persona.document, persona.selectedPersonaId ?? undefined, page),
  );
}
