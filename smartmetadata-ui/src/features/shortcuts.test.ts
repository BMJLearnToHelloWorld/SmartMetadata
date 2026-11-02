/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  handleGlobalShortcut,
  handleKeyboardActivation,
  isCommandKey,
  isMacPlatform,
  SHORTCUTS,
} from './shortcuts';

describe('shortcuts', () => {
  it('exposes exactly the evidenced shortcut table', () => {
    expect(SHORTCUTS.map((item) => item.id)).toEqual(['focus-search']);
  });

  it('takes meta on mac and ctrl elsewhere', () => {
    expect(isCommandKey({ metaKey: true, ctrlKey: false }, true)).toBe(true);
    expect(isCommandKey({ metaKey: true, ctrlKey: false }, false)).toBe(false);
    expect(isCommandKey({ metaKey: false, ctrlKey: true }, false)).toBe(true);
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('Win32')).toBe(false);
  });

  it('activates on Enter/Space only, with the onlyIfSelf guard', () => {
    const callback = vi.fn();
    const handler = handleKeyboardActivation(callback, true);
    const target = {};
    handler({ key: 'Enter', target, currentTarget: target, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    handler({ key: ' ', target, currentTarget: {}, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    handler({ key: 'a', target, currentTarget: target, preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('focuses search on mod+K, navigates when no search input exists, ignores typing', () => {
    const focus = vi.fn(() => true);
    const goToSearch = vi.fn();
    const event = { key: 'k', metaKey: false, ctrlKey: true, target: document.body };
    expect(handleGlobalShortcut(event, false, focus, goToSearch)).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(goToSearch).not.toHaveBeenCalled();

    const focusMiss = vi.fn(() => false);
    expect(handleGlobalShortcut(event, false, focusMiss, goToSearch)).toBe(true);
    expect(goToSearch).toHaveBeenCalledTimes(1);

    const input = document.createElement('input');
    expect(handleGlobalShortcut({ ...event, target: input }, false, focus, goToSearch)).toBe(false);
  });
});
