/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePersonaStore } from '@/stores/persona';
import type { PersonaDocument } from '@/types/persona';
import { usePersonaViewMode } from './usePersonaViewMode';

function documentWithViewMode(
  personaId: string,
  viewMode: string,
): PersonaDocument {
  return {
    name: 'persona.doc',
    fullyQualifiedName: 'persona.Analyst',
    entityType: 'document',
    data: {
      personaPreferences: [
        {
          personaId,
          defaultViewModes: { learningResources: viewMode },
        },
      ],
    },
  } as unknown as PersonaDocument;
}

describe('usePersonaViewMode (L8)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('opens the page in the persona stored view', () => {
    const store = usePersonaStore();
    store.selectedPersonaId = 'p1';
    store.document = documentWithViewMode('p1', 'card');
    expect(usePersonaViewMode('learningResources').value).toBe('card');
  });

  it('falls back to Table with no document, no persona, or no stored view', () => {
    const store = usePersonaStore();
    expect(usePersonaViewMode('learningResources').value).toBe('table');
    store.selectedPersonaId = 'p1';
    expect(usePersonaViewMode('learningResources').value).toBe('table');
    store.document = documentWithViewMode('p2', 'card');
    expect(usePersonaViewMode('learningResources').value).toBe('table');
  });

  it('falls back to Table for a stored view the page does not offer', () => {
    const store = usePersonaStore();
    store.selectedPersonaId = 'p1';
    store.document = documentWithViewMode('p1', 'tree');
    expect(usePersonaViewMode('learningResources').value).toBe('table');
  });

  it('reacts when the selected persona or its document changes', () => {
    const store = usePersonaStore();
    store.selectedPersonaId = 'p1';
    store.document = documentWithViewMode('p1', 'card');
    const view = usePersonaViewMode('learningResources');
    expect(view.value).toBe('card');
    store.document = documentWithViewMode('p1', 'table');
    expect(view.value).toBe('table');
  });
});
