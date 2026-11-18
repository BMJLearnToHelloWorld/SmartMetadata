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
 * Vue port of official `hooks/useCodeMirrorEditor.ts` (:42-151): the
 * buffer, the extension set, and the rules for when an incoming `value`
 * may replace what the user is looking at.
 *
 * Framework adaptation: official drives `@uiw/react-codemirror`; there
 * is no official Vue binding, so this composable owns a CodeMirror 6
 * `EditorView` directly and reconfigures it through a `Compartment`.
 * The state machine itself is framework-free (`codeMirrorUtils.ts`) and
 * is unit-tested without a DOM; this composable only wires it to the
 * view, the focus/blur signals and the extension memo.
 *
 * Extension memo parity (hook :72-88): the set rebuilds when the mode
 * name/json flag, the content of the options bag (JSON key — call sites
 * pass inline literals), the readOnly prop, the extensions identity, or
 * the default options change.
 */
import { Annotation, Compartment, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import {
  bufferHandleBlur,
  bufferHandleChange,
  bufferReceiveExternal,
  createCodeMirrorBuffer,
  getCodeMirrorBaseExtensions,
  getCodeMirrorExtensions,
  getCodeMirrorLanguage,
  mergeOptions,
  resolveIsReadOnly,
  type CodeMirrorBufferState,
  type CodeMirrorOptions,
  type Mode,
} from '@/utils/codeMirrorUtils';

export interface UseCodeMirrorEditorOptions {
  value: () => unknown;
  autoFormat: () => boolean;
  mode: () => Mode;
  defaultOptions: () => CodeMirrorOptions;
  options: () => CodeMirrorOptions | undefined;
  readOnly: () => boolean | undefined;
  extensions: () => Extension[] | undefined;
  onChange: (value: string) => void;
  onFocus: () => void;
}

/** Marks transactions this composable dispatches itself, so the update listener never echoes them back. */
const externalApplyAnnotation = Annotation.define<boolean>();

export function useCodeMirrorEditor(opts: UseCodeMirrorEditorOptions) {
  const buffer: CodeMirrorBufferState = createCodeMirrorBuffer(
    opts.value(),
    opts.autoFormat(),
  );
  const internalValue: Ref<string> = ref(buffer.internalValue);
  const compartment = new Compartment();
  let view: EditorView | null = null;

  const buildExtensions = (): Extension[] => [
    ...getCodeMirrorBaseExtensions(),
    ...getCodeMirrorLanguage(opts.mode()),
    // The readOnly prop was accepted but never applied under CodeMirror 5;
    // the call sites that pass it (disabled forms, markdown code blocks) all
    // mean it. options.readOnly still wins when both are given.
    ...getCodeMirrorExtensions(mergeOptions(opts.defaultOptions(), opts.readOnly(), opts.options())),
    ...(opts.extensions() ?? []),
  ];

  const syncViewDoc = () => {
    if (view && view.state.doc.toString() !== buffer.internalValue) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: buffer.internalValue },
        annotations: [externalApplyAnnotation.of(true)],
      });
    }
  };

  const applyExternal = () => {
    const outcome = bufferReceiveExternal(
      buffer,
      opts.value(),
      opts.autoFormat(),
      resolveIsReadOnly(opts.options(), opts.readOnly(), opts.defaultOptions()),
      view?.hasFocus ?? false,
    );
    internalValue.value = buffer.internalValue;
    if (outcome === 'applied') {
      syncViewDoc();
    }
  };

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && !update.transactions.some((tr) => tr.annotation(externalApplyAnnotation))) {
      bufferHandleChange(buffer, update.state.doc.toString(), opts.autoFormat(), opts.onChange);
      internalValue.value = buffer.internalValue;
    }
    if (update.focusChanged) {
      if (update.view.hasFocus) {
        opts.onFocus();
      } else if (bufferHandleBlur(buffer)) {
        internalValue.value = buffer.internalValue;
        syncViewDoc();
      }
    }
  });

  const mount = (parent: HTMLElement) => {
    view?.destroy();
    view = new EditorView({
      doc: buffer.internalValue,
      extensions: [compartment.of(buildExtensions()), updateListener],
      parent,
    });
  };

  // Option and mode objects are almost always inline literals at the call
  // site, so compare by content — a new extension array reconfigures the
  // editor.
  watch(
    () => ({
      modeName: opts.mode().name,
      modeJson: opts.mode().json,
      optionsKey: JSON.stringify(opts.options() ?? {}),
      readOnly: opts.readOnly(),
      extensions: opts.extensions(),
      defaultOptions: opts.defaultOptions(),
    }),
    () => {
      view?.dispatch({ effects: compartment.reconfigure(buildExtensions()) });
    },
  );

  watch(
    () => [
      opts.value(),
      opts.autoFormat(),
      resolveIsReadOnly(opts.options(), opts.readOnly(), opts.defaultOptions()),
    ],
    applyExternal,
  );

  onBeforeUnmount(() => {
    view?.destroy();
    view = null;
  });

  return {
    internalValue,
    mount,
    getView: () => view,
  };
}
