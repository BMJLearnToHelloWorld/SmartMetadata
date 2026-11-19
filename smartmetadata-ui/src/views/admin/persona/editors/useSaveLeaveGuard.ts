// useSaveLeaveGuard.ts — NavigationBlocker equivalent with Save-and-leave.
//
// Wraps the product's useNavigationGuard (official NavigationBlocker
// port) with the save-vs-discard distinction official
// CustomizablePageHeader carries: the leave modal offers Save-and-leave
// (runs the editor's save; a save failure keeps the user on the page,
// matching official PersonaAppLayoutPage's rejecting handleSave) and
// Discard (leaves without saving).

import { ref } from 'vue';
import { useNavigationGuard } from '@/composables/useNavigationGuard';

export interface SaveLeaveGuard {
  showLeaveModal: ReturnType<typeof useNavigationGuard>['showModal'];
  saveAndLeave: () => Promise<void>;
  discardAndLeave: () => Promise<void>;
  cancelLeave: () => void;
}

export function useSaveLeaveGuard(options: {
  isDirty: () => boolean;
  onSaveAndLeave: () => Promise<void>;
}): SaveLeaveGuard {
  const leaveAction = ref<'save' | 'discard'>('discard');
  const guard = useNavigationGuard({
    enabled: () => options.isDirty(),
    onConfirm: async () => {
      if (leaveAction.value === 'save') {
        await options.onSaveAndLeave();
      }
    },
  });

  async function saveAndLeave(): Promise<void> {
    leaveAction.value = 'save';
    await guard.confirmLeave();
  }

  async function discardAndLeave(): Promise<void> {
    leaveAction.value = 'discard';
    await guard.confirmLeave();
  }

  return {
    showLeaveModal: guard.showModal,
    saveAndLeave,
    discardAndLeave,
    cancelLeave: guard.cancelLeave,
  };
}
