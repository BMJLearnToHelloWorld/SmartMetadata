/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Entity-attachment context (Vue equivalent of official
 * `EntityAttachmentProvider` / `useEntityAttachment`).
 *
 * The editor reads the upload gates, the upload handler, the inline
 * error state and the NodeView-popover flag from this context, exactly
 * as BlockEditor reads them from the React provider. No provider exists
 * this batch, so the defaults below apply: both upload gates closed,
 * no upload handler, no error, no open popover. The upload line
 * provides a real context; until then paste/drop of files falls back
 * to the editor's default behavior (return false), matching official's
 * gates-closed behavior.
 */
import type { EditorView } from '@tiptap/pm/view';
import type { InjectionKey, Ref } from 'vue';

export interface EntityAttachmentContext {
  allowFileUpload: boolean;
  allowImageUpload: boolean;
  handleFileUpload?: (
    file: File,
    view: EditorView,
    pos: number,
    showInlineAlert?: boolean,
  ) => void;
  errorMessage?: string;
  handleErrorMessage?: (message: string | undefined) => void;
  isPopoverOpenRef?: Ref<boolean>;
}

export const entityAttachmentKey: InjectionKey<EntityAttachmentContext> =
  Symbol('entityAttachment');

export const DEFAULT_ENTITY_ATTACHMENT: EntityAttachmentContext = {
  allowFileUpload: false,
  allowImageUpload: false,
};
