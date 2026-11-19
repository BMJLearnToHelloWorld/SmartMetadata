/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { Component } from 'vue';

/**
 * Shared types and helpers for the PAT-EMPTY placeholder cluster
 * (sections 00 D6). Official sources (392b3efd object tree):
 * - core-components empty-placeholder-shell.tsx (shell, icon box,
 *   action/feature types) and empty-placeholder.tsx (variant switch);
 * - components/common/EmptyPlaceholder/EmptyPlaceholder.utils.ts
 *   (resolveSingleAction) and EmptyPlaceholder.interface.ts.
 *
 * Vue adaptations, all behavior-preserving:
 * - `label`/`title`/`description` are strings; rich content travels
 *   through slots (icon/title/description/footer) on the components.
 * - Icons are Vue components (or the `icon` slot); the official
 *   component-vs-element distinction collapses to one rendering path.
 * - `testId` is the action's `data-testid` (official spreads the
 *   `'data-testid'` key onto the button; a data object carries it as a
 *   named field here).
 * - Feature `action` renders the feature title as a small button; the
 *   official FeaturesPlaceholder maps title → <Button> before passing
 *   features down, which has no Vue equivalent through a string prop,
 *   so the base renders the button when `action` is present.
 */
export interface EmptyPlaceholderAction {
  key: string;
  id?: string;
  label: string;
  testId?: string;
  onPress?: () => void;
  disabled?: boolean;
  /** 'primary' renders a primary button; anything else renders default. */
  color?: 'primary' | 'default';
  size?: 'small' | 'middle' | 'large';
}

export interface EmptyPlaceholderFeature {
  key: string;
  icon: Component;
  title: string;
  description?: string;
  /** Extra classes for the icon container (e.g. to override its size). */
  iconClassName?: string;
  /** Renders the feature's title as a button that runs this action. */
  action?: {
    onPress?: () => void;
    testId?: string;
    disabled?: boolean;
  };
}

/** Shell props shared by the base component and every variant wrapper. */
export interface EmptyPlaceholderShellPropsInput {
  actions?: EmptyPlaceholderAction[];
  width?: number | string;
  /** Vertical gap between content items, in 4px units (default 5 = 20px). */
  gap?: number;
  className?: string;
  /** Root `data-testid`; the base defaults it to 'empty-placeholder'. */
  testId?: string;
}

export interface EmptyPlaceholderContentPropsInput extends EmptyPlaceholderShellPropsInput {
  icon?: Component;
  title?: string;
  description?: string;
}

/**
 * Returns `actions` when the caller supplied a non-empty array,
 * otherwise builds a single primary action from `handler`. When
 * neither is present the placeholder renders without a button. `id`,
 * when provided, is applied to the generated button as its DOM id;
 * `testId`, when provided, as its `data-testid`.
 * (EmptyPlaceholder.utils.ts:23-47, verbatim semantics.)
 */
export const resolveSingleAction = (
  actions: EmptyPlaceholderAction[] | undefined,
  handler: (() => void) | undefined,
  key: string,
  label: string,
  id?: string,
  testId?: string
): EmptyPlaceholderAction[] | undefined => {
  let resolvedActions = actions;

  if ((!resolvedActions || resolvedActions.length === 0) && handler) {
    resolvedActions = [
      {
        key,
        id,
        label,
        color: 'primary',
        onPress: handler,
        ...(testId ? { testId } : {}),
      },
    ];
  }

  return resolvedActions;
};

export interface TransElementParts {
  before: string;
  inner: string;
  after: string;
}

/**
 * Splits a rendered Trans-style message on its first `<0>...</0>`
 * element, the Vue rendering of official Transi18next `renderElement`
 * (raw-`t()` call sites use this helper; the two `<i18n-t>` call sites
 * use named slots instead). Returns null when the
 * message carries no element tags; callers then render the whole
 * message as plain text. The `<0>` coupling is the same one official
 * has: the message template owns the tags, the component owns the
 * wrapping element.
 */
export function splitTransElement(rendered: string): TransElementParts | null {
  const open = rendered.indexOf('<0>');
  if (open === -1) {
    return null;
  }
  const close = rendered.indexOf('</0>', open + 3);
  if (close === -1) {
    return null;
  }
  return {
    before: rendered.slice(0, open),
    inner: rendered.slice(open + 3, close),
    after: rendered.slice(close + 4),
  };
}
