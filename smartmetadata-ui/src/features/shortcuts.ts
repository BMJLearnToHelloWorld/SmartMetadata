/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Keyboard shortcuts, Stage 9.
 *
 * The official snapshot's only keyboard utility is
 * `utils/KeyboardUtil.ts`: Keys { K, ESC }, isCommandKeyPress (mac
 * takes metaKey, otherwise ctrlKey), and handleKeyboardActivation
 * (Enter/Space on non-native clickable elements). No global shortcut
 * registry, command palette, or help page was found in the snapshot,
 * so none is invented here. The data table below therefore contains
 * exactly one handled shortcut — mod+K to focus global search, the
 * only use the official K + command-key pair evidences — plus the
 * activation helper. Escape is documented, not handled: Ant
 * Modal/Dropdown/Select already close on Escape, and a second handler
 * would double-handle it.
 */

export const SHORTCUTS = [
  { id: 'focus-search', key: 'k', commandKey: true, labelKey: 'shortcuts.focusSearch' },
] as const;

export type ShortcutId = (typeof SHORTCUTS)[number]['id'];

/** Mirrors official isCommandKeyPress: mac uses meta, everything else ctrl. */
export function isCommandKey(event: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey'>, isMac: boolean): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

export function isMacPlatform(platform: string | undefined): boolean {
  return typeof platform === 'string' && /mac/i.test(platform);
}

/**
 * Mirrors official handleKeyboardActivation: runs the callback on Enter
 * or Space (preventing default scroll/submit); with onlyIfSelf, ignores
 * keydowns bubbled up from nested interactive children.
 */
export function handleKeyboardActivation(
  callback: () => void,
  onlyIfSelf = false,
): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    if (onlyIfSelf && event.target !== event.currentTarget) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      callback();
    }
  };
}

/**
 * Global keydown handler for the focus-search shortcut. Returns true
 * when it handled the event (caller may preventDefault on that basis).
 * `focusSearchInput` and `goToSearch` are injected so the table stays
 * pure and testable without a DOM shell.
 */
export function handleGlobalShortcut(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'target'>,
  isMac: boolean,
  focusSearchInput: () => boolean,
  goToSearch: () => void,
): boolean {
  if (event.key.toLowerCase() !== 'k' || !isCommandKey(event, isMac)) {
    return false;
  }
  const target = event.target as HTMLElement | null;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
    return false;
  }
  if (!focusSearchInput()) {
    goToSearch();
  }
  return true;
}
