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
 * CodeMirror shared plumbing (01 §3.2/§3.5, Q5).
 *
 * Ported from official `utils/CodeMirror.utils.ts`,
 * `utils/SchemaEditor.utils.ts`, `interface/codemirror.interface.ts`,
 * `enums/codemirror.enum.ts`, `hooks/useCodeMirrorEditor.ts` (state
 * machine) and `hooks/useClipBoard.ts` (copy chain) at pin a3012259ca.
 * Line anchors are recorded in the batch benchmark log.
 *
 * Language batching (Q1): this batch locks only the JSON/JS language
 * packs. `getCodeMirrorLanguage` returns no language extension for
 * SQL/Python/YAML/CLike/SPARQL yet — the same plain-text rendering
 * official gives an unknown mode — and the dynamic-import branches for
 * those modes arrive with their consumers. The component keeps the
 * language set in its own compartment so a future loader only touches
 * that compartment.
 */
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExtension,
} from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

export const JSON_TAB_SIZE = 2;

export enum CSMode {
  JAVASCRIPT = 'javascript',
  SQL = 'sql',
  SPARQL = 'application/sparql-query',
  PYTHON = 'python',
  CLIKE = 'clike',
  YAML = 'yaml',
}

/** The language the editor highlights with. `json` narrows CSMode.JAVASCRIPT. */
export interface Mode {
  name: CSMode;
  json?: boolean;
}

/**
 * The editor option bag accepted by SmCodeEditor.
 *
 * These keys are the CodeMirror 5 option names that call sites already pass;
 * they are kept as-is and translated to CodeMirror 6 extensions by
 * `getCodeMirrorExtensions`.
 *
 * Keys with no CodeMirror 6 equivalent (`gutters`, `theme`, `scrollbarStyle`)
 * are accepted and ignored — gutters are implied by the extensions that render
 * them, and theming and scrollbars are CSS. The ignore is documented here,
 * not silent.
 */
export interface CodeMirrorOptions {
  lineNumbers?: boolean;
  lineWrapping?: boolean;
  styleActiveLine?: boolean;
  matchBrackets?: boolean;
  autoCloseBrackets?: boolean;
  foldGutter?: boolean;
  placeholder?: string;
  /**
   * `'nocursor'` is the CodeMirror 5 spelling for read-only *and* not
   * focusable, which several read-only viewers pass.
   */
  readOnly?: boolean | 'nocursor';
  tabSize?: number;
  indentUnit?: number;
  indentWithTabs?: boolean;
  /** CodeMirror 5 only, ignored. */
  gutters?: string[];
  /** CodeMirror 5 only, ignored. */
  theme?: string;
  /**
   * CodeMirror 5 only, ignored. Hiding the scrollbars is CSS in CodeMirror 6
   * (`.cm-scroller`).
   */
  scrollbarStyle?: string;
}

export function getJSONFromString(data: string): unknown {
  try {
    // Format string if possible and return valid JSON
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export function getSchemaEditorValue(value: unknown, autoFormat = true): string {
  if (typeof value === 'string') {
    if (autoFormat) {
      const parsedJson = getJSONFromString(value);

      return parsedJson ? JSON.stringify(parsedJson, null, JSON_TAB_SIZE) : value;
    } else {
      return value;
    }
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, null, JSON_TAB_SIZE);
  }

  return '';
}

/** Variant default tables, verbatim (SchemaEditor.tsx:27-38 / CodeEditor.tsx:27-38). */
export const SCHEMA_DEFAULT_OPTIONS: CodeMirrorOptions = {
  tabSize: JSON_TAB_SIZE,
  indentUnit: JSON_TAB_SIZE,
  indentWithTabs: false,
  lineNumbers: true,
  lineWrapping: true,
  styleActiveLine: true,
  matchBrackets: true,
  autoCloseBrackets: true,
  foldGutter: true,
  readOnly: false,
};

export const CODE_DEFAULT_OPTIONS: CodeMirrorOptions = {
  tabSize: JSON_TAB_SIZE,
  indentUnit: JSON_TAB_SIZE,
  indentWithTabs: false,
  lineNumbers: false,
  lineWrapping: false,
  styleActiveLine: true,
  matchBrackets: true,
  autoCloseBrackets: true,
  foldGutter: true,
  readOnly: false,
};

// options.readOnly wins over the prop, which wins over the component default —
// the same precedence the extension bag below is built with. CodeMirror 5's
// 'nocursor' spelling is read-only too, hence the truthiness test.
export function resolveIsReadOnly(
  options: CodeMirrorOptions | undefined,
  readOnly: boolean | undefined,
  defaultOptions: CodeMirrorOptions,
): boolean {
  return Boolean(options?.readOnly ?? readOnly ?? defaultOptions.readOnly);
}

/** The merged bag the extension translation is built from (hook :79-83). */
export function mergeOptions(
  defaultOptions: CodeMirrorOptions,
  readOnly: boolean | undefined,
  options: CodeMirrorOptions | undefined,
): CodeMirrorOptions {
  return {
    ...defaultOptions,
    ...(readOnly === undefined ? {} : { readOnly }),
    ...options,
  };
}

/**
 * Translate the `mode` prop (CodeMirror 5 shape) to a CodeMirror 6 language
 * extension.
 *
 * An unknown mode name yields no language extension — the same plain-text
 * rendering CodeMirror 5 gave for a mode whose script was never loaded.
 * SQL/Python/YAML/CLike/SPARQL branches are deferred to their consumers
 * (Q1 batching); they currently take the same no-extension path.
 */
export function getCodeMirrorLanguage(mode?: Mode): Extension[] {
  switch (mode?.name) {
    case CSMode.JAVASCRIPT:
      // CodeMirror 5 highlighted JSON with the javascript mode plus `json: true`.
      return mode.json ? [json()] : [javascript()];
    default:
      return [];
  }
}

type BooleanCodeMirrorOption =
  | 'lineNumbers'
  | 'lineWrapping'
  | 'styleActiveLine'
  | 'matchBrackets'
  | 'autoCloseBrackets'
  | 'foldGutter'
  | 'readOnly';

/**
 * CodeMirror 5 boolean option -> the CodeMirror 6 extensions that replace it.
 *
 * `readOnly` rejects edits but keeps the editor focusable, the way CodeMirror 5
 * behaved: keyboard users can still move through the text and copy it. Only
 * v5's `'nocursor'` spelling also takes it out of the tab order, and it is
 * handled separately below.
 */
const BOOLEAN_OPTION_EXTENSIONS: Array<[BooleanCodeMirrorOption, () => Extension[]]> = [
  ['lineNumbers', () => [lineNumbers()]],
  ['lineWrapping', () => [EditorView.lineWrapping]],
  ['styleActiveLine', () => [highlightActiveLine(), highlightActiveLineGutter()]],
  ['matchBrackets', () => [bracketMatching()]],
  ['autoCloseBrackets', () => [closeBrackets()]],
  ['foldGutter', () => [foldGutter()]],
  ['readOnly', () => [EditorState.readOnly.of(true)]],
];

/** CodeMirror 5's `readOnly: 'nocursor'`: read-only and not focusable. */
const NO_CURSOR = 'nocursor';

/**
 * Translate the CodeMirror 5 option bag call sites already pass into the
 * equivalent CodeMirror 6 extensions.
 *
 * Only options actually used in the codebase are mapped; anything else is
 * ignored rather than throwing, so an option added by a future call site
 * degrades to "no effect" instead of a runtime error.
 */
export function getCodeMirrorExtensions(options: CodeMirrorOptions = {}): Extension[] {
  const extensions = BOOLEAN_OPTION_EXTENSIONS.filter(
    ([option]) => options[option],
  ).flatMap(([, buildExtensions]) => buildExtensions());

  if (options.readOnly === NO_CURSOR) {
    extensions.push(EditorView.editable.of(false));
  }

  if (options.placeholder) {
    extensions.push(placeholderExtension(options.placeholder));
  }

  if (options.tabSize !== undefined) {
    extensions.push(EditorState.tabSize.of(options.tabSize));
  }

  if (options.indentUnit !== undefined) {
    extensions.push(
      indentUnit.of(options.indentWithTabs ? '\t' : ' '.repeat(options.indentUnit)),
    );
  }

  return extensions;
}

/**
 * Syntax hues as CSS variables, defined for both themes in the component
 * stylesheet. The tag groups mirror the CodeMirror 5 token classes they replace.
 */
const THEMED_HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--cm-token-keyword)' },
  {
    tag: [t.definition(t.variableName), t.standard(t.variableName)],
    color: 'var(--cm-token-def)',
  },
  { tag: [t.propertyName, t.variableName], color: 'var(--cm-token-property)' },
  {
    tag: [t.number, t.atom, t.bool, t.attributeName],
    color: 'var(--cm-token-number)',
  },
  { tag: [t.string, t.special(t.string)], color: 'var(--cm-token-string)' },
  { tag: [t.typeName, t.className], color: 'var(--cm-token-type)' },
  { tag: [t.operator, t.meta], color: 'var(--cm-token-operator)' },
  { tag: t.comment, color: 'var(--cm-token-comment)', fontStyle: 'italic' },
  { tag: t.invalid, color: 'var(--cm-token-error)' },
]);

/**
 * Dark-mode surface tweaks. Framework adaptation: official keys these off
 * the `.dark-mode` class; the product keys dark mode off
 * `:root[data-theme='dark']`, so the selectors use the attribute form.
 * The rules themselves (transparent gutter, hover-tint active line) are
 * the official ones.
 */
const DARK_EDITOR_THEME = EditorView.theme({
  "[data-theme='dark'] & .cm-gutters": {
    backgroundColor: 'transparent',
  },
  "[data-theme='dark'] & .cm-activeLine": {
    backgroundColor: 'var(--sm-menu-hover-bg)',
  },
  "[data-theme='dark'] & .cm-activeLineGutter": {
    backgroundColor: 'var(--sm-menu-hover-bg)',
  },
});

/**
 * The editor behaviour that is not driven by an option: undo history, the
 * default key bindings, selection and drop cursors, and syntax colouring.
 *
 * This replaces `basicSetup`, which cannot be used here — it would force on
 * line numbers, folding, active-line highlighting, search and autocompletion
 * regardless of what the call site asked for, and would fight
 * `getCodeMirrorExtensions`.
 *
 * Tab is deliberately left unbound so it keeps moving focus out of the editor;
 * `indentWithTab` would trap keyboard users inside it.
 */
export function getCodeMirrorBaseExtensions(): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    // Token colours come from CSS variables so one style serves both themes —
    // CodeMirror 6 generates its own opaque class names, so the v5 approach of
    // restyling `.cm-keyword` & co. from a `.dark-mode` block cannot work.
    // defaultHighlightStyle stays underneath for tags this style does not name.
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    syntaxHighlighting(THEMED_HIGHLIGHT_STYLE),
    DARK_EDITOR_THEME,
    keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
  ];
}

// ---------------------------------------------------------------------------
// Buffer state machine (useCodeMirrorEditor.ts:53-142, framework-free).
//
// The buffer and the parent value may briefly disagree — that is the
// official semantic, not a bug: "Vue's v-model naturally syncs" must not
// be used to simplify it away.
// ---------------------------------------------------------------------------

export interface CodeMirrorBufferState {
  internalValue: string;
  /** The last value editor and parent agreed on, whether emitted or taken in. */
  lastSynced: string;
  /** An external value that arrived mid-edit, applied once the editor blurs. */
  pendingExternal: string | null;
}

export function createCodeMirrorBuffer(
  value: unknown,
  autoFormat: boolean,
): CodeMirrorBufferState {
  const internalValue = getSchemaEditorValue(value, autoFormat);
  return { internalValue, lastSynced: internalValue, pendingExternal: null };
}

/**
 * A user edit (hook :90-104): clears any pending external value, leaves
 * the buffer exactly as typed, records the formatted value as synced,
 * and emits the formatted value.
 */
export function bufferHandleChange(
  state: CodeMirrorBufferState,
  doc: string,
  autoFormat: boolean,
  emit: (value: string) => void,
): void {
  // A fresh edit supersedes an external value that was waiting for blur;
  // otherwise blur would overwrite what was just typed.
  state.pendingExternal = null;
  // The buffer is left exactly as typed; only what the parent receives is
  // formatted. Reformatting the buffer mid-edit is what used to move the
  // caret after an auto-closed bracket.
  state.internalValue = doc;
  const nextValue = getSchemaEditorValue(doc, autoFormat);
  state.lastSynced = nextValue;
  emit(nextValue);
}

/** Taking an external value in makes it the agreed value (hook :109-113). */
function applyExternalValue(state: CodeMirrorBufferState, nextValue: string): void {
  state.lastSynced = nextValue;
  state.pendingExternal = null;
  state.internalValue = nextValue;
}

/** Blur applies a pending external value, if any (hook :115-119). */
export function bufferHandleBlur(state: CodeMirrorBufferState): boolean {
  if (state.pendingExternal !== null) {
    applyExternalValue(state, state.pendingExternal);
    return true;
  }
  return false;
}

export type ExternalValueOutcome = 'echo' | 'pended' | 'applied';

/**
 * An incoming `value` (hook :121-142). Returns what happened so the caller
 * can sync the view only when the buffer actually changed.
 */
export function bufferReceiveExternal(
  state: CodeMirrorBufferState,
  value: unknown,
  autoFormat: boolean,
  isReadOnly: boolean,
  hasFocus: boolean,
): ExternalValueOutcome {
  const nextValue = getSchemaEditorValue(value, autoFormat);

  if (nextValue === state.lastSynced) {
    // The parent is back on the value the editor is already synced with, so a
    // deferred update from an intermediate value is obsolete: applying it on
    // blur would put the editor out of sync with the parent.
    state.pendingExternal = null;
    return 'echo';
  }

  // A read-only editor stays focusable but has no edit to protect, so it takes
  // the update straight away rather than waiting for blur.
  if (!isReadOnly && hasFocus) {
    state.pendingExternal = nextValue;
    return 'pended';
  }

  applyExternalValue(state, nextValue);
  return 'applied';
}

// ---------------------------------------------------------------------------
// Clipboard (useClipBoard.ts:20-99, timer state lives in the component).
// ---------------------------------------------------------------------------

/**
 * Fallback method for copying text to clipboard using document.execCommand.
 * This works in older browsers and doesn't require HTTPS.
 */
export function fallbackCopyTextToClipboard(text: string): boolean {
  const textArea = document.createElement('textarea');
  textArea.value = text;

  // Avoid scrolling to bottom
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';

  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    return successful;
  } catch {
    document.body.removeChild(textArea);

    return false;
  }
}

/** The modern-API-first copy chain: secure context → writeText, else fallback, else retry fallback on failure. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    let success = false;
    if (navigator.clipboard && window.isSecureContext) {
      // Try modern clipboard API first
      await navigator.clipboard.writeText(text);
      success = true;
    } else {
      // Fallback for older browsers or non-HTTPS contexts
      success = fallbackCopyTextToClipboard(text);
    }

    return success;
  } catch {
    // If modern API fails, try fallback
    try {
      return fallbackCopyTextToClipboard(text);
    } catch {
      return false;
    }
  }
}

/** Copied-state reset delay (useClipBoard default timeout). */
export const COPY_RESET_TIMEOUT_MS = 1500;
