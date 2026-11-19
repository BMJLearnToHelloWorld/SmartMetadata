<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Button, Empty, Spin, message } from 'ant-design-vue';
import CustomizeMyData from '@/features/home/CustomizeMyData.vue';
import { DEFAULT_HEADER_BG_COLOR, resolveLandingPageHeaderColor } from '@/features/home/landingHeaderColor';
import { emptyPersonaDocument, savePersonaDocument } from '@/api/docStore';
import { getPersonaByName } from '@/api/persona';
import { usePersonaStore } from '@/stores/persona';
import {
  getPersonaPage,
  normalizePersonaDocument,
  updatePersonPreferences,
  updatePersonaAppLayout,
  updatePersonaDocumentPage,
} from '@/views/admin/personaPage';
import AppLayoutEditor, {
  type AppLayoutPreferences,
} from '@/views/admin/persona/AppLayoutEditor.vue';
import DataMarketplaceEditor from '@/views/admin/persona/editors/DataMarketplaceEditor.vue';
import DataProductPageEditor from '@/views/admin/persona/editors/DataProductPageEditor.vue';
import DetailsPageEditor from '@/views/admin/persona/editors/DetailsPageEditor.vue';
import DomainPageEditor from '@/views/admin/persona/editors/DomainPageEditor.vue';
import GlossaryPageEditor from '@/views/admin/persona/editors/GlossaryPageEditor.vue';
import NavigationEditor from '@/views/admin/persona/editors/NavigationEditor.vue';
import { DETAILS_PAGE_TYPES } from '@/views/admin/persona/editors/customizePageData';
import type { NavigationItem } from '@/views/admin/persona/editors/navigationUtils';
import type {
  Persona,
  PersonaAppLayoutPreferences,
  PersonaDocument,
  PersonaPage,
} from '@/types/persona';

/**
 * The customize-page route shell, ported from the official S1
 * `CustomizablePage` (`U/pages/CustomizablePage/CustomizablePage.tsx`).
 *
 * Dispatch is the official renderers table: an explicit map plus the
 * `DETAILS_PAGE_TYPES` loop fill, looked up with a safe `Map` read
 * (the `getOwnHandler` equivalent — an unknown, inherited, or
 * prototype key resolves to nothing and renders the empty
 * placeholder). The `homepage` alias maps to the same LandingPage
 * editor at this layer only; page lookup, save, and reset all use
 * the raw `pageFqn`, never normalized. `askCollateSidebar` has an
 * explicit table entry rendering the same empty placeholder as
 * unknown values: its editor is not built, pending the R-C4-SIDEBAR
 * product scope ruling.
 *
 * Loading follows the official order — persona first, then the
 * document — without touching the globally selected persona. A 404
 * yields the in-memory empty template; any other document failure
 * only toasts and leaves the document null, so the save callbacks
 * early-return. Initialization runs once on mount; there is no
 * route-parameter listener, as official initializes with an empty
 * dependency array.
 *
 * The page editors are controlled components (no customize slice
 * exists in the persona store): `currentPage` is the stored page
 * overlaid with the editor's in-flight edits, `originalPage` is
 * always the stored page, and `updateCurrentPage` only echoes edits
 * back. Saving re-derives both from the saved document, mirroring
 * the official store's `setDocument` recompute.
 *
 * Save follows the official four callbacks, including their toast /
 * throw asymmetries: all four toast success and error (the parent
 * owns every toast; the editors toast nothing — official
 * CustomizablePage.tsx handlers and the PersonaAppLayoutPage
 * comment that `onSave` has already shown the error toast). The
 * page, navigation, and header-colour callbacks swallow failures;
 * the app-layout callback throws (the leave guard's Save-and-leave
 * depends on the rejection).
 */
type CustomizePageRendererKind =
  | 'navigation'
  | 'app-layout'
  | 'landing'
  | 'marketplace'
  | 'domain'
  | 'data-product'
  | 'glossary'
  | 'details'
  | 'sidebar-pending';

const CUSTOMIZE_PAGE_RENDERERS = new Map<string, CustomizePageRendererKind>([
  ['navigation', 'navigation'],
  ['app-layout', 'app-layout'],
  // Editor not built — pending the R-C4-SIDEBAR product scope ruling.
  // Renders the same empty placeholder as unknown values; it must not
  // render a wrong editor or collapse into another branch.
  ['askCollateSidebar', 'sidebar-pending'],
  ['LandingPage', 'landing'],
  ['homepage', 'landing'],
  ['DataMarketplace', 'marketplace'],
  ['Domain', 'domain'],
  ['DataProduct', 'data-product'],
  ['Glossary', 'glossary'],
  ['GlossaryTerm', 'glossary'],
]);

for (const type of DETAILS_PAGE_TYPES) {
  CUSTOMIZE_PAGE_RENDERERS.set(type, 'details');
}

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const personaStore = usePersonaStore();

const fqn = computed(() => String(route.params.fqn ?? ''));
const pageFqn = computed(() => String(route.params.pageFqn ?? ''));
const rendererKind = computed(() => CUSTOMIZE_PAGE_RENDERERS.get(pageFqn.value));

const loading = ref(true);
const persona = ref<Persona | null>(null);
const documentRef = ref<PersonaDocument | null>(null);

/** In-flight page edits, keyed by the pageFqn they belong to. */
const editedPage = ref<{ pageFqn: string; page: PersonaPage } | null>(null);

const currentPage = computed<PersonaPage | null>(() => {
  if (editedPage.value && editedPage.value.pageFqn === pageFqn.value) {
    return editedPage.value.page;
  }
  return getPersonaPage(documentRef.value, pageFqn.value) ?? null;
});

const originalPage = computed<PersonaPage | null>(
  () => getPersonaPage(documentRef.value, pageFqn.value) ?? null,
);

const initialPageData = computed(() => getPersonaPage(documentRef.value, pageFqn.value));

const initialColor = computed(
  () =>
    resolveLandingPageHeaderColor(
      persona.value?.id,
      documentRef.value?.data.personPreferences,
      undefined,
    ) ?? DEFAULT_HEADER_BG_COLOR,
);

/**
 * The stored navigation value as the navigation editor reads it: an
 * array passes through, anything else reads as absent (the editor
 * loads the default tree for null/missing input). A non-array stored
 * value must not reach the editor, whose tree builders assume an
 * array.
 */
const navigationItems = computed<NavigationItem[] | undefined>(() => {
  const navigation = documentRef.value?.data.navigation;
  return Array.isArray(navigation) ? (navigation as NavigationItem[]) : undefined;
});

/**
 * The document the app-layout editor reads its persisted preferences
 * from. Its prop requires a document even when the page-level
 * document is null (non-404 load failure); the empty template reads
 * as "no preferences", and the save callback still guards on the
 * page-level document, so this fallback can never be written.
 */
const editorDocument = computed<PersonaDocument>(
  () =>
    documentRef.value ??
    emptyPersonaDocument(persona.value?.name ?? fqn.value, persona.value?.fullyQualifiedName ?? fqn.value),
);

function updateCurrentPage(page: PersonaPage): void {
  editedPage.value = { pageFqn: pageFqn.value, page };
}

function syncSavedDocument(saved: PersonaDocument): void {
  const normalized = normalizePersonaDocument(saved);
  documentRef.value = normalized;
  editedPage.value = null;
  personaStore.syncSavedDocument(saved);
}

function operationLabels(doc: PersonaDocument): { operation: string; operating: string } {
  const wasCreate = !doc.id;
  return {
    operation: wasCreate ? t('home.created') : t('home.updated'),
    operating: wasCreate ? t('home.creating') : t('home.updating'),
  };
}

async function handlePageCustomizeSave(newPage?: PersonaPage): Promise<void> {
  const doc = documentRef.value;
  if (!doc) {
    return;
  }
  const updated = updatePersonaDocumentPage(doc, pageFqn.value, newPage);
  if (updated === doc) {
    return;
  }
  const { operation, operating } = operationLabels(doc);
  try {
    const saved = await savePersonaDocument(doc, (draft) => {
      draft.data.pages = updated.data.pages;
    });
    syncSavedDocument(saved);
    message.success(t('server.pageLayoutOperationSuccess', { operation }));
  } catch {
    message.error(t('server.pageLayoutOperationError', { operation: operating }));
  }
}

async function handleNavigationSave(navigationList: NavigationItem[]): Promise<void> {
  const doc = documentRef.value;
  if (!doc) {
    return;
  }
  const { operation, operating } = operationLabels(doc);
  try {
    const saved = await savePersonaDocument(doc, (draft) => {
      draft.data.navigation = navigationList;
    });
    syncSavedDocument(saved);
    message.success(t('server.pageLayoutOperationSuccess', { operation }));
  } catch {
    // Per §6A C-ENTRY-1 ruling (a), the C-4 spec §3.3 callback-2 row
    // and §7.1 acceptance row claiming a throw on failure are errata:
    // official handleNavigationSave (CustomizablePage.tsx:308-351)
    // only toasts in catch with no rethrow — of the four callbacks,
    // only callback 4 (handleAppLayoutSave) throws. This
    // implementation matches official. Consequence: on navigation
    // save failure NavigationBlocker still lets navigation proceed
    // and the edits are lost, which is the pin's actual behavior.
    message.error(t('server.pageLayoutOperationError', { operation: operating }));
  }
}

async function handleBackgroundColorUpdate(nextColor?: string): Promise<void> {
  const doc = documentRef.value;
  const currentPersona = persona.value;
  if (!doc || !currentPersona) {
    return;
  }
  const { operation, operating } = operationLabels(doc);
  try {
    const saved = await savePersonaDocument(doc, (draft) => {
      draft.data.personPreferences = updatePersonPreferences(
        draft.data.personPreferences ?? [],
        { id: currentPersona.id, name: currentPersona.name },
        nextColor,
        { documentId: doc.id },
      );
    });
    syncSavedDocument(saved);
    message.success(t('server.pageLayoutOperationSuccess', { operation }));
  } catch {
    message.error(t('server.pageLayoutOperationError', { operation: operating }));
  }
}

async function handleAppLayoutSave(preferences: AppLayoutPreferences): Promise<void> {
  const doc = documentRef.value;
  const currentPersona = persona.value;
  if (!doc || !currentPersona) {
    return;
  }
  const { operation, operating } = operationLabels(doc);
  try {
    const saved = await savePersonaDocument(doc, (draft) => {
      draft.data.personaPreferences = updatePersonaAppLayout(
        draft.data.personaPreferences ?? [],
        { id: currentPersona.id, name: currentPersona.name },
        {
          appMode: preferences.appMode,
          defaultLandingPage: preferences.defaultLandingPage,
          defaultViewModes:
            preferences.defaultViewModes as PersonaAppLayoutPreferences['defaultViewModes'],
        },
      );
    });
    syncSavedDocument(saved);
    message.success(t('server.pageLayoutOperationSuccess', { operation }));
  } catch (error) {
    message.error(t('server.pageLayoutOperationError', { operation: operating }));
    // NavigationBlocker's "Save and leave" only stays on the page
    // when the save rejects; swallowing it here would navigate away
    // and drop the edits (official comment, CustomizablePage.tsx).
    throw error;
  }
}

onMounted(async () => {
  let found: Persona;
  try {
    found = await getPersonaByName(fqn.value);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('home.customizePageLoadFailed'));
    loading.value = false;
    return;
  }
  persona.value = found;
  try {
    documentRef.value =
      (await personaStore.loadDocumentForPersona(found)) ??
      emptyPersonaDocument(found.name, found.fullyQualifiedName);
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('home.customizePageLoadFailed'));
    documentRef.value = null;
  }
  loading.value = false;
});

function goToSettings(): void {
  void router.push({ name: 'admin-settings-persona' });
}

function goToPersonaDetail(): void {
  void router.push({ name: 'admin-settings-persona-detail', params: { fqn: fqn.value } });
}
</script>

<template>
  <div class="customize-page" data-testid="customize-page">
    <Spin v-if="loading" :spinning="true" data-testid="customize-page-loading">
      <div class="customize-page__loading" />
    </Spin>
    <Empty
      v-else-if="!persona"
      :description="t('home.customizePagePersonaMissing')"
      data-testid="customize-page-error"
    >
      <Button type="primary" data-testid="customize-page-back-settings" @click="goToSettings">
        {{ t('persona.backToPersona') }}
      </Button>
    </Empty>
    <NavigationEditor
      v-else-if="rendererKind === 'navigation'"
      :key="`${fqn}:${pageFqn}`"
      :persona="persona"
      :navigation="navigationItems"
      :on-save="handleNavigationSave"
      @close="goToPersonaDetail"
    />
    <AppLayoutEditor
      v-else-if="rendererKind === 'app-layout'"
      :key="`${fqn}:${pageFqn}`"
      :persona="persona"
      :document="editorDocument"
      :on-save="handleAppLayoutSave"
    />
    <CustomizeMyData
      v-else-if="rendererKind === 'landing'"
      :key="`${fqn}:${pageFqn}`"
      :persona-name="persona.name"
      :persona-fqn="persona.fullyQualifiedName"
      :page-fqn="pageFqn"
      :initial-page-data="initialPageData"
      :background-color="initialColor"
      :on-save-layout="handlePageCustomizeSave"
      :on-background-color-update="handleBackgroundColorUpdate"
      :on-exit="goToPersonaDetail"
    />
    <DataMarketplaceEditor
      v-else-if="rendererKind === 'marketplace'"
      :key="`${fqn}:${pageFqn}`"
      :persona-name="persona.name"
      :current-page="currentPage"
      :current-page-type="pageFqn"
      :original-page="originalPage"
      :on-update-current-page="updateCurrentPage"
      :on-save-layout="handlePageCustomizeSave"
      @close="goToPersonaDetail"
    />
    <DomainPageEditor
      v-else-if="rendererKind === 'domain'"
      :key="`${fqn}:${pageFqn}`"
      :persona-name="persona.name"
      :current-page="currentPage"
      :current-page-type="pageFqn"
      :original-page="originalPage"
      :on-update-current-page="updateCurrentPage"
      :on-save-layout="handlePageCustomizeSave"
      @close="goToPersonaDetail"
    />
    <DataProductPageEditor
      v-else-if="rendererKind === 'data-product'"
      :key="`${fqn}:${pageFqn}`"
      :persona-name="persona.name"
      :current-page="currentPage"
      :current-page-type="pageFqn"
      :original-page="originalPage"
      :on-update-current-page="updateCurrentPage"
      :on-save-layout="handlePageCustomizeSave"
      @close="goToPersonaDetail"
    />
    <GlossaryPageEditor
      v-else-if="rendererKind === 'glossary'"
      :key="`${fqn}:${pageFqn}`"
      :persona-name="persona.name"
      :current-page="currentPage"
      :current-page-type="pageFqn"
      :original-page="originalPage"
      :is-glossary="pageFqn === 'Glossary'"
      :on-update-current-page="updateCurrentPage"
      :on-save-layout="handlePageCustomizeSave"
      @close="goToPersonaDetail"
    />
    <DetailsPageEditor
      v-else-if="rendererKind === 'details'"
      :key="`${fqn}:${pageFqn}`"
      :persona-name="persona.name"
      :current-page="currentPage"
      :current-page-type="pageFqn"
      :original-page="originalPage"
      :on-update-current-page="updateCurrentPage"
      :on-save-layout="handlePageCustomizeSave"
      @close="goToPersonaDetail"
    />
    <div v-else class="customize-page__placeholder">
      <Empty
        :description="t('home.customizePageUnsupported', { page: pageFqn })"
        data-testid="no-data-placeholder"
      />
    </div>
  </div>
</template>

<style scoped>
.customize-page {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--sm-home-canvas);
}
.customize-page__loading {
  height: 320px;
}
.customize-page__placeholder {
  min-height: 240px;
}
</style>
