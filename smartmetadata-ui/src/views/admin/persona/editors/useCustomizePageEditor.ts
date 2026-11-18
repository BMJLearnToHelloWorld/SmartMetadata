// useCustomizePageEditor.ts — shared save/reset/dirty/leave behavior for
// the C-4 page editors (details, Domain, DataProduct, Glossary, marketplace).
//
// Official shape (CustomizeDetailsPage / CustomizableDomainPage /
// CustomizableDataProductPage / CustomiseGlossaryTermDetailPage /
// CustomizableDataMarketplacePage): disableSave from the page-class
// dirty predicate against getPage(currentPageType) with a {pageType}
// placeholder when absent; handleSave passes currentPage ?? {pageType}
// and lets failures propagate (NavigationBlocker onConfirm); the
// header-button path surfaces failures as a toast instead.

import { computed, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { message } from 'ant-design-vue';
import type { PersonaPage } from '@/types/persona';
import { placeholderPage } from './customizeTypes';
import { useSaveLeaveGuard } from './useSaveLeaveGuard';

export interface CustomizePageEditor {
  saving: Ref<boolean>;
  disableSave: Ref<boolean>;
  /** Save; rejects on failure (leave-guard path). */
  save: () => Promise<void>;
  /** Header-button save; surfaces failure as a toast. */
  saveFromButton: () => Promise<void>;
  /** Reset (delete-page semantics); surfaces failure as a toast. */
  resetFromButton: () => Promise<void>;
  guard: ReturnType<typeof useSaveLeaveGuard>;
}

export function useCustomizePageEditor(options: {
  currentPageType: string;
  currentPage: Ref<PersonaPage | null>;
  originalPage: Ref<PersonaPage | null>;
  /** True when the two pages are the same (dirty predicate per page class). */
  isSamePage: (original: PersonaPage, edited: PersonaPage) => boolean;
  onSaveLayout: (newPage?: PersonaPage) => Promise<void>;
}): CustomizePageEditor {
  const { t } = useI18n();
  const saving = ref(false);

  const original = computed(
    () => options.originalPage.value ?? placeholderPage(options.currentPageType),
  );
  const edited = computed(
    () => options.currentPage.value ?? placeholderPage(options.currentPageType),
  );
  const disableSave = computed(
    () => !options.currentPageType || options.isSamePage(original.value, edited.value),
  );

  async function save(): Promise<void> {
    saving.value = true;
    try {
      await options.onSaveLayout(
        options.currentPage.value ?? placeholderPage(options.currentPageType),
      );
    } finally {
      saving.value = false;
    }
  }

  async function saveFromButton(): Promise<void> {
    try {
      await save();
    } catch {
      message.error(t('persona.saveFailed'));
    }
  }

  async function resetFromButton(): Promise<void> {
    try {
      await options.onSaveLayout();
    } catch {
      message.error(t('persona.saveFailed'));
    }
  }

  const guard = useSaveLeaveGuard({
    isDirty: () => !disableSave.value,
    onSaveAndLeave: save,
  });

  return { saving, disableSave, save, saveFromButton, resetFromButton, guard };
}
