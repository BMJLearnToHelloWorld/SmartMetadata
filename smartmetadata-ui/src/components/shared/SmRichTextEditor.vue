<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Shared rich-text editor (ported from official
  `components/common/RichTextEditor/RichTextEditor.tsx` +
  `components/BlockEditor/BlockEditor.tsx` at pin a3012259ca, bar-menu
  mode only).

  Q6(a) focus contract (t367): the ONLY focus wiring is the editor
  `onFocus` callback, emitted as the zero-arg `focus` event. No DOM
  focus/blur listeners are attached anywhere in this component, so a
  focus notification can neither duplicate nor fire without a real
  editor focus. Default: no autofocus.

  Held this batch (Q7, see blockEditorExtensions.ts): slash menu,
  utility group, MathEquation, LinkPopup (hence unlink), BubbleMenu,
  TableMenu, BlockMenu, the upload popover, the inline Banner, and the
  RTL direction effect (the product has no RTL locale). The link modal
  (add/edit) IS implemented; paste/drop branching is verbatim with the
  upload gates closed by default via the attachment context.
-->
<script setup lang="ts">
import { EditorContent, useEditor, type Editor } from '@tiptap/vue-3';
import { EditorState } from '@tiptap/pm/state';
import {
  inject,
  onBeforeUnmount,
  ref,
  watch,
  type CSSProperties,
} from 'vue';
import BarMenu from './BarMenu.vue';
import {
  EDITOR_OPTIONS,
  FileType,
  TEXT_TYPES,
  type ExtensionOptions,
} from './blockEditorConstants';
import { getBlockEditorExtensions } from './blockEditorExtensions';
import {
  DEFAULT_ENTITY_ATTACHMENT,
  entityAttachmentKey,
} from './entityAttachmentContext';
import LinkModal, { type LinkData } from './LinkModal.vue';
import {
  formatClientContent,
  formatServerContent,
  formatValueBasedOnContent,
  prepareEditorContent,
} from '@/utils/richTextUtils';

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    autofocus?: boolean;
    initialValue?: string;
    readonly?: boolean;
    className?: string;
    style?: string | CSSProperties;
    placeHolder?: string;
    extensionOptions?: ExtensionOptions;
    showMenu?: boolean;
  }>(),
  {
    autofocus: false,
    initialValue: '',
    readonly: false,
    showMenu: true,
  },
);

const emit = defineEmits<{
  (e: 'focus'): void;
  (e: 'text-change', value: string): void;
}>();

const attachment = inject(entityAttachmentKey, DEFAULT_ENTITY_ATTACHMENT);
const wrapperRef = ref<HTMLDivElement | null>(null);

const editor = useEditor({
  ...EDITOR_OPTIONS,
  // Born read-only when it is a viewer: an editable editor whose content
  // lands with the cursor after "@name" opens the mention popup, and the
  // later setEditable(false) never closes it, leaving it pinned top-left.
  editable: !props.readonly,
  extensions: getBlockEditorExtensions(props.extensionOptions),
  onUpdate({ editor: updatedEditor }) {
    attachment.handleErrorMessage?.(undefined);
    const htmlContent = updatedEditor.getHTML();
    const backendFormat = formatServerContent(htmlContent);
    emit('text-change', formatValueBasedOnContent(backendFormat));
  },
  onFocus() {
    // Q6(a): the sole focus notification path — editor callback only.
    emit('focus');
  },
  editorProps: {
    attributes: {
      class: 'om-block-editor',
      ...(props.autofocus ? { autofocus: 'true' } : {}),
    },
    handleDOMEvents: {
      paste: (view, event) => {
        const items = Array.from(
          (event as ClipboardEvent).clipboardData?.items || [],
        );
        // Check if the paste contains text types
        const hasText = items.some(
          (item) => item.kind === 'string' && TEXT_TYPES.includes(item.type),
        );
        // Allow paste if either image or file upload is enabled or if the paste contains text types
        if ((!attachment.allowImageUpload && !attachment.allowFileUpload) || hasText) {
          return false;
        }

        const files = items
          .filter((item) => item.kind === FileType.FILE)
          .map((item) => item.getAsFile())
          .filter(Boolean) as File[];

        if (!files.length) {
          return false;
        }

        event.preventDefault();
        const pos = view.state.selection.from;
        attachment.handleFileUpload?.(files[0], view, pos, true);

        return true;
      },
    },
  },
  autofocus: props.autofocus,
});

// Port of BlockEditorUtils.setEditorContent (:156-180): the string half
// is prepareEditorContent; the state rebuild below is verbatim.
function setEditorContent(target: Editor, newContent: string) {
  const htmlString = prepareEditorContent(newContent);
  target.commands.setContent(htmlString);

  // Update the editor state to reflect the new content
  const newEditorState = EditorState.create({
    doc: target.state.doc,
    plugins: target.state.plugins,
    schema: target.state.schema,
    selection: target.state.selection,
    storedMarks: target.state.storedMarks,
  });
  target.view.updateState(newEditorState);
}

let contentTimer: ReturnType<typeof setTimeout> | undefined;
let editableTimer: ReturnType<typeof setTimeout> | undefined;

function clearTimers() {
  if (contentTimer !== undefined) {
    clearTimeout(contentTimer);
    contentTimer = undefined;
  }
  if (editableTimer !== undefined) {
    clearTimeout(editableTimer);
    editableTimer = undefined;
  }
}
onBeforeUnmount(clearTimers);

// Content effect (BlockEditor.tsx:205-249).
watch(
  [() => props.initialValue, editor],
  ([content, currentEditor]) => {
    if (contentTimer !== undefined) {
      clearTimeout(contentTimer);
      contentTimer = undefined;
    }
    if (!currentEditor || currentEditor.isDestroyed || content === undefined) {
      return;
    }

    const htmlContent = formatClientContent(content);

    // Skip re-applying content that is already in the editor (e.g. the
    // autosave round-trip echoing back the same description). Calling
    // setContent unconditionally forces a full document replace, which
    // tears down NodeViews and resets Suggestion-plugin state, closing
    // any open popover or the slash-command menu with no user action.
    if (
      formatServerContent(currentEditor.getHTML()) ===
      formatServerContent(htmlContent)
    ) {
      return;
    }

    // Never replace editor content while the slash-command popup or a
    // NodeView-hosted popover is open. Both guards are inert this batch
    // (slash menu and upload popover held); the popover ref is read so
    // the upload line's provider takes effect without touching this
    // component.
    if (attachment.isPopoverOpenRef?.value) {
      return;
    }

    // We use setTimeout to avoid any flushSync console errors as
    // mentioned here https://github.com/ueberdosis/tiptap/issues/3764#issuecomment-1546854730
    // The editor is destroyed on unmount, so a timer left pending past this
    // effect would call updateState on a torn-down ProseMirror view.
    contentTimer = setTimeout(() => {
      if (!currentEditor.isDestroyed) {
        setEditorContent(currentEditor, htmlContent);
      }
    });
  },
  { immediate: true },
);

// Editable effect (BlockEditor.tsx:251-270).
watch(
  [() => props.readonly, editor],
  ([readonly, currentEditor]) => {
    if (editableTimer !== undefined) {
      clearTimeout(editableTimer);
      editableTimer = undefined;
    }
    const editable = !readonly;
    if (
      !currentEditor ||
      currentEditor.isDestroyed ||
      currentEditor.isEditable === editable
    ) {
      return;
    }

    editableTimer = setTimeout(() => {
      if (!currentEditor.isDestroyed) {
        currentEditor.setEditable(editable);
      }
    });
  },
  { immediate: true },
);

// Drag and drop (BlockEditor.tsx:137-203). The drag-over class target is
// scoped to this component's own editable element instead of a global
// document query, so two editors on one page cannot steal each other's
// drag state; the visible behavior is identical.
const PROSEMIRROR_EDITABLE_SELECTOR = '.ProseMirror[contenteditable="true"]';

function editorElement(): HTMLElement | null {
  return wrapperRef.value?.querySelector(PROSEMIRROR_EDITABLE_SELECTOR) ?? null;
}

function handleDragEnter(event: DragEvent) {
  if (!attachment.allowImageUpload && !attachment.allowFileUpload) {
    return;
  }

  attachment.handleErrorMessage?.(undefined);
  const { items } = event.dataTransfer ?? { items: [] };
  const hasFiles = Array.from(items).some((item) => item.kind === FileType.FILE);

  if (hasFiles) {
    editorElement()?.classList.add('drag-over');
  }
}

function handleDragLeave(event: DragEvent) {
  const element = editorElement();
  // Only remove class if we're leaving the editor area
  if (element && !element.contains(event.relatedTarget as Node)) {
    element.classList.remove('drag-over');
  }
}

function handleDrop(event: DragEvent) {
  if (
    (!attachment.allowImageUpload && !attachment.allowFileUpload) ||
    !editor.value?.view
  ) {
    return;
  }

  event.preventDefault();

  editorElement()?.classList.remove('drag-over');

  const { files, items } = event.dataTransfer ?? { files: [], items: [] };

  // Only handle file drops, let BlockAndDragDrop handle block moves
  if (!files?.length || items[0]?.type === FileType.TEXT_HTML) {
    return;
  }

  const coordinates = editor.value.view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  });

  if (coordinates) {
    attachment.handleFileUpload?.(files[0], editor.value.view, coordinates.pos, true);
  }
}

// Link slots (EditorSlots.tsx:38-104, modal half only; LinkPopup held).
// Modal data is snapshotted at toggle time: the link under the cursor is
// selection state, not reactive state, so a cached computed would go stale.
const isLinkModalOpen = ref(false);
const linkData = ref<LinkData>({ href: '' });

function handleLinkToggle() {
  if (!isLinkModalOpen.value) {
    const href = editor.value?.getAttributes('link').href ?? '';
    linkData.value = { href };
  }
  isLinkModalOpen.value = !isLinkModalOpen.value;
}

function handleLinkSave(values: LinkData) {
  const currentEditor = editor.value;
  if (!currentEditor) {
    return;
  }
  // Op is read at save time, exactly as EditorSlots.tsx:194-199. Via the
  // bar menu it is always 'add' (the menu's setLink({href: ''}) blanks
  // the stored mark first); 'edit' becomes reachable when the LinkPopup
  // line lands and toggles the modal without setLink.
  const op = currentEditor.getAttributes('link').href ? 'edit' : 'add';
  // set the link
  if (op === 'edit') {
    currentEditor
      .chain()
      .focus()
      .extendMarkRange('link')
      .updateAttributes('link', {
        href: values.href,
      })
      .run();
  }

  if (op === 'add') {
    const { from, to } = currentEditor.state.selection;
    const hasSelectedText = from !== to;

    if (hasSelectedText) {
      currentEditor.chain().focus().setLink({ href: values.href }).run();
    } else {
      // setLink on an empty selection only sets a stored mark and renders
      // nothing, so insert the href as the link text to get a visible link.
      currentEditor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: values.href,
          marks: [{ type: 'link', attrs: { href: values.href } }],
        })
        .run();
    }
  }

  // move cursor at the end
  currentEditor.chain().selectTextblockEnd().run();

  // close the modal
  handleLinkToggle();
}

defineExpose({
  getEditorContent(): string {
    const htmlContent = editor.value?.getHTML() ?? '';
    const backendFormat = formatServerContent(htmlContent);

    return formatValueBasedOnContent(backendFormat);
  },
  clearEditorContent() {
    if (editor.value) {
      setEditorContent(editor.value, '');
    }
  },
  setEditorContent(content: string) {
    if (editor.value) {
      setEditorContent(editor.value, content);
    }
  },
  editor,
});
</script>

<template>
  <!--
    placeHolder lands here as a dead attribute, mirroring official's
    `placeholder={placeholder}` on @tiptap/react's EditorContent, which
    the React binding never consumes. Visible placeholder text comes
    only from the Placeholder extension's own function.
  -->
  <div :class="className" :style="style" data-testid="editor" :placeholder="placeHolder">
    <div
      id="block-editor-wrapper"
      ref="wrapperRef"
      class="block-editor-wrapper block-editor-wrapper--bar-menu"
      role="presentation"
      @dragenter="handleDragEnter"
      @dragleave="handleDragLeave"
      @dragover.prevent
      @drop="handleDrop"
    >
      <BarMenu v-if="showMenu && editor" :editor="editor" :on-link-toggle="handleLinkToggle" />
      <EditorContent :editor="editor" />
      <LinkModal
        v-if="isLinkModalOpen"
        :is-open="isLinkModalOpen"
        :data="linkData"
        @save="handleLinkSave"
        @cancel="handleLinkToggle"
      />
    </div>
  </div>
</template>

<style>
/*
 * ProseMirror base rules (required: no global tiptap stylesheet is
 * loaded in the product) + structural port of block-editor.less.
 * Official variables map to product --sm-* tokens; spacing/typography
 * literals are the official token values.
 */
.block-editor-wrapper .ProseMirror {
  position: relative;
  word-wrap: break-word;
  white-space: pre-wrap;
  white-space: break-spaces;
  -webkit-font-variant-ligatures: none;
  font-variant-ligatures: none;
  font-feature-settings: 'liga' 0;
  outline: none;
}
.block-editor-wrapper .ProseMirror pre {
  white-space: pre-wrap;
}
.block-editor-wrapper .ProseMirror li {
  position: relative;
}
.block-editor-wrapper .ProseMirror-hideselection *::selection {
  background: transparent;
}
.block-editor-wrapper .ProseMirror-hideselection *::-moz-selection {
  background: transparent;
}
.block-editor-wrapper .ProseMirror-selectednode {
  outline: 2px solid var(--sm-color-primary-bg-hover);
}
.block-editor-wrapper .ProseMirror-gapcursor {
  display: none;
  pointer-events: none;
  position: absolute;
}
.block-editor-wrapper .ProseMirror-gapcursor:after {
  content: '';
  display: block;
  position: absolute;
  top: -2px;
  width: 20px;
  border-top: 1px solid var(--sm-text-primary);
  animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
}
@keyframes ProseMirror-cursor-blink {
  to {
    visibility: hidden;
  }
}
.block-editor-wrapper .ProseMirror-focused .ProseMirror-gapcursor {
  display: block;
}
.block-editor-wrapper .om-block-editor > p:last-child {
  /* this is to have enough space after last node, referred from the reference editor */
  padding-bottom: 30vh;
}
.block-editor-wrapper .om-block-editor > .tableWrapper {
  width: 100%;
  overflow-x: auto;
}
/* show placeholder when editor is in focused mode */
.block-editor-wrapper .tiptap.ProseMirror-focused .is-node-empty.has-focus::before {
  color: var(--sm-text-quaternary);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}
.block-editor-wrapper .tiptap.ProseMirror-focused .om-table-header .is-node-empty.has-focus::before,
.block-editor-wrapper .tiptap.ProseMirror-focused .om-table-row .is-node-empty.has-focus::before {
  color: inherit;
  content: none;
  float: inherit;
  height: 0;
  pointer-events: inherit;
}
.block-editor-wrapper .tiptap.ProseMirror {
  font-size: 14px;
}
.block-editor-wrapper .tiptap.ProseMirror h1,
.block-editor-wrapper .tiptap.ProseMirror h2,
.block-editor-wrapper .tiptap.ProseMirror h3,
.block-editor-wrapper .tiptap.ProseMirror h4,
.block-editor-wrapper .tiptap.ProseMirror h5,
.block-editor-wrapper .tiptap.ProseMirror h6 {
  margin: 0 !important;
  border: none;
  padding: 24px 0 0 0;
  color: var(--sm-text-primary);
}
.block-editor-wrapper .tiptap.ProseMirror h1 {
  font-size: 30px;
  line-height: 48px;
  font-weight: 600;
}
.block-editor-wrapper .tiptap.ProseMirror h2 {
  font-size: 20px;
  line-height: 32px;
  font-weight: 600;
}
.block-editor-wrapper .tiptap.ProseMirror h3 {
  font-size: 18px;
  font-weight: 600;
}
.block-editor-wrapper .tiptap.ProseMirror h4 {
  font-size: 16px;
  font-weight: 600;
}
.block-editor-wrapper .tiptap.ProseMirror h5 {
  font-size: 14px;
  font-weight: 600;
}
.block-editor-wrapper .tiptap.ProseMirror a {
  color: var(--sm-color-primary);
  text-decoration: none;
  line-height: 24px;
}
.block-editor-wrapper .tiptap.ProseMirror a:hover {
  text-decoration: underline;
}
.block-editor-wrapper .tiptap.ProseMirror table {
  border-collapse: collapse;
  width: 100%;
  table-layout: auto;
  text-align: left;
  margin-top: 2em;
  margin-bottom: 2em;
}
.block-editor-wrapper .tiptap.ProseMirror th,
.block-editor-wrapper .tiptap.ProseMirror td {
  border: 1px solid var(--sm-border-color);
  margin: 0;
  min-width: 200px;
  padding: 8px;
}
.block-editor-wrapper .tiptap.ProseMirror th {
  background: var(--sm-content-bg);
  color: var(--sm-text-primary);
  font-weight: 500;
}
.block-editor-wrapper .tiptap.ProseMirror .tableWrapper *::selection {
  color: #fff;
  background-color: var(--sm-color-primary);
}
.block-editor-wrapper .tiptap.ProseMirror .tableWrapper *::-moz-selection {
  color: #fff;
  background-color: var(--sm-color-primary);
}
.block-editor-wrapper .tiptap.ProseMirror blockquote {
  border-left: 4px solid var(--sm-border-color);
}
.block-editor-wrapper .tiptap.ProseMirror strong {
  font-weight: 700;
}
.block-editor-wrapper .tiptap.ProseMirror code {
  white-space: break-spaces;
  background: var(--sm-content-bg);
  color: var(--sm-text-primary);
}
.block-editor-wrapper .tiptap.ProseMirror pre {
  margin: 0;
  padding: 0;
  background: transparent;
  margin-top: 16px;
}
.block-editor-wrapper .tiptap.ProseMirror pre code {
  display: block;
  padding: 15px;
  overflow: auto;
  border-radius: 12px;
  border-bottom: 2px solid var(--sm-border-color);
}
.block-editor-wrapper .tiptap.ProseMirror img {
  border-radius: 8px;
  margin-top: 10px;
  max-width: 100%;
  display: block;
}
.block-editor-wrapper .tiptap.ProseMirror p {
  margin-top: 10px;
  margin-bottom: 0;
  word-break: break-word;
  line-height: 20px;
}
.block-editor-wrapper .tiptap.ProseMirror p:first-child {
  margin-top: 0;
}
.block-editor-wrapper .tiptap.ProseMirror p:last-child {
  margin-bottom: 0;
}
.block-editor-wrapper .tiptap.ProseMirror ol li::before,
.block-editor-wrapper .tiptap.ProseMirror ul li::before {
  content: none;
}
.block-editor-wrapper .tiptap.ProseMirror li.om-task-item {
  display: flex;
  gap: 4px;
  line-height: 1.5;
}
.block-editor-wrapper .tiptap.ProseMirror li.om-task-item > label > input {
  cursor: pointer;
  height: 16px;
  width: 16px;
}
.block-editor-wrapper .tiptap.ProseMirror.drag-over {
  position: relative;
}
.block-editor-wrapper .tiptap.ProseMirror.drag-over::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 2px dashed var(--sm-color-primary);
  border-radius: 8px;
  pointer-events: none;
}
.block-editor-wrapper .tiptap.ProseMirror.drag-over * {
  cursor: copy;
}
.block-editor-wrapper .tiptap.ProseMirror.is-dragging * {
  cursor: grabbing;
}
.block-editor-wrapper--bar-menu {
  background: var(--sm-bg-container);
  border: 1px solid var(--sm-border-color);
  border-radius: var(--sm-border-radius);
}
.block-editor-wrapper--bar-menu:focus-within {
  border-color: var(--sm-color-primary);
}
.block-editor-wrapper--bar-menu .om-drag-handle,
.block-editor-wrapper--bar-menu .om-block-handle {
  display: none;
}
.block-editor-wrapper--bar-menu .om-block-editor {
  max-height: 300px;
  overflow: auto;
  padding-left: 24px;
  padding-right: 24px;
  padding-top: 8px;
}
.block-editor-wrapper--bar-menu .om-block-editor:focus-visible {
  outline: none;
}
/* if contenteditable is false, remove padding-bottom from last p tag */
.block-editor-wrapper .om-block-editor[contenteditable='false'] > p:last-child {
  padding-bottom: 0;
}
</style>
