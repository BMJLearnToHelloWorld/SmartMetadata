/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { indentUnit } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, expect, it, vi } from 'vitest';
import {
  CODE_DEFAULT_OPTIONS,
  CSMode,
  SCHEMA_DEFAULT_OPTIONS,
  bufferHandleBlur,
  bufferHandleChange,
  bufferReceiveExternal,
  copyTextToClipboard,
  createCodeMirrorBuffer,
  fallbackCopyTextToClipboard,
  getCodeMirrorExtensions,
  getCodeMirrorLanguage,
  getSchemaEditorValue,
  mergeOptions,
  resolveIsReadOnly,
} from './codeMirrorUtils';

describe('getSchemaEditorValue', () => {
  it('pretty-prints parsed JSON when autoFormat is on', () => {
    expect(getSchemaEditorValue('{"a":1}', true)).toBe('{\n  "a": 1\n}');
    expect(getSchemaEditorValue('{"a":1}', false)).toBe('{"a":1}');
  });

  it('returns legal JSON scalars verbatim (falsy parse results)', () => {
    // The truthiness test on the parsed value: 0/false/null/"" parse fine
    // but are falsy, so the raw string comes back.
    expect(getSchemaEditorValue('0', true)).toBe('0');
    expect(getSchemaEditorValue('false', true)).toBe('false');
    expect(getSchemaEditorValue('null', true)).toBe('null');
    expect(getSchemaEditorValue('""', true)).toBe('""');
  });

  it('returns invalid JSON verbatim', () => {
    expect(getSchemaEditorValue('{not json', true)).toBe('{not json');
    expect(getSchemaEditorValue('hello', true)).toBe('hello');
  });

  it('stringifies objects regardless of autoFormat, including null', () => {
    expect(getSchemaEditorValue({ a: 1 }, false)).toBe('{\n  "a": 1\n}');
    expect(getSchemaEditorValue(null, true)).toBe('null');
    expect(getSchemaEditorValue([1, 2], true)).toBe('[\n  1,\n  2\n]');
  });

  it('returns empty for non-string non-object values', () => {
    expect(getSchemaEditorValue(42, true)).toBe('');
    expect(getSchemaEditorValue(undefined, true)).toBe('');
    expect(getSchemaEditorValue(true, true)).toBe('');
  });
});

describe('variant defaults', () => {
  it('differs only in lineNumbers and lineWrapping', () => {
    expect(SCHEMA_DEFAULT_OPTIONS.lineNumbers).toBe(true);
    expect(SCHEMA_DEFAULT_OPTIONS.lineWrapping).toBe(true);
    expect(CODE_DEFAULT_OPTIONS.lineNumbers).toBe(false);
    expect(CODE_DEFAULT_OPTIONS.lineWrapping).toBe(false);
    const { lineNumbers: _s1, lineWrapping: _s2, ...schemaRest } = SCHEMA_DEFAULT_OPTIONS;
    const { lineNumbers: _c1, lineWrapping: _c2, ...codeRest } = CODE_DEFAULT_OPTIONS;
    expect(schemaRest).toEqual(codeRest);
  });
});

describe('resolveIsReadOnly', () => {
  it('applies the options > prop > default precedence with truthiness', () => {
    expect(resolveIsReadOnly({ readOnly: true }, false, SCHEMA_DEFAULT_OPTIONS)).toBe(true);
    expect(resolveIsReadOnly({ readOnly: false }, true, SCHEMA_DEFAULT_OPTIONS)).toBe(false);
    expect(resolveIsReadOnly({ readOnly: 'nocursor' }, false, SCHEMA_DEFAULT_OPTIONS)).toBe(true);
    expect(resolveIsReadOnly({}, true, SCHEMA_DEFAULT_OPTIONS)).toBe(true);
    expect(resolveIsReadOnly(undefined, undefined, SCHEMA_DEFAULT_OPTIONS)).toBe(false);
    expect(resolveIsReadOnly(undefined, undefined, { readOnly: true })).toBe(true);
  });
});

describe('mergeOptions', () => {
  it('merges default, prop readOnly and options in order', () => {
    expect(mergeOptions(SCHEMA_DEFAULT_OPTIONS, true, { lineNumbers: false })).toMatchObject({
      lineNumbers: false,
      readOnly: true,
      tabSize: 2,
    });
    expect(mergeOptions(SCHEMA_DEFAULT_OPTIONS, true, { readOnly: false })).toMatchObject({
      readOnly: false,
    });
    expect(mergeOptions(SCHEMA_DEFAULT_OPTIONS, undefined, {})).toMatchObject({
      readOnly: false,
    });
  });
});

describe('getCodeMirrorLanguage', () => {
  it('resolves JSON and JS, nothing else this batch', () => {
    expect(getCodeMirrorLanguage({ name: CSMode.JAVASCRIPT, json: true })).toHaveLength(1);
    expect(getCodeMirrorLanguage({ name: CSMode.JAVASCRIPT })).toHaveLength(1);
    expect(getCodeMirrorLanguage({ name: CSMode.SQL })).toHaveLength(0);
    expect(getCodeMirrorLanguage({ name: CSMode.PYTHON })).toHaveLength(0);
    expect(getCodeMirrorLanguage({ name: CSMode.YAML })).toHaveLength(0);
    expect(getCodeMirrorLanguage({ name: CSMode.CLIKE })).toHaveLength(0);
    expect(getCodeMirrorLanguage({ name: CSMode.SPARQL })).toHaveLength(0);
    expect(getCodeMirrorLanguage(undefined)).toHaveLength(0);
    expect(getCodeMirrorLanguage({ name: 'bogus' as CSMode })).toHaveLength(0);
  });
});

describe('getCodeMirrorExtensions', () => {
  it('maps readOnly to the readOnly facet and nocursor to non-editable', () => {
    const readOnlyState = EditorState.create({
      extensions: getCodeMirrorExtensions({ readOnly: true }),
    });
    expect(readOnlyState.facet(EditorState.readOnly)).toBe(true);
    expect(readOnlyState.facet(EditorView.editable)).toBe(true);

    const noCursorState = EditorState.create({
      extensions: getCodeMirrorExtensions({ readOnly: 'nocursor' }),
    });
    expect(noCursorState.facet(EditorState.readOnly)).toBe(true);
    expect(noCursorState.facet(EditorView.editable)).toBe(false);
  });

  it('maps tabSize and indentUnit, honoring indentWithTabs', () => {
    const state = EditorState.create({
      extensions: getCodeMirrorExtensions({ tabSize: 4, indentUnit: 4 }),
    });
    expect(state.facet(EditorState.tabSize)).toBe(4);
    expect(state.facet(indentUnit)).toBe('    ');

    const tabbed = EditorState.create({
      extensions: getCodeMirrorExtensions({ indentUnit: 2, indentWithTabs: true }),
    });
    expect(tabbed.facet(indentUnit)).toBe('\t');
  });

  it('ignores CodeMirror 5-only keys without throwing', () => {
    expect(() =>
      getCodeMirrorExtensions({ gutters: ['x'], theme: 'y', scrollbarStyle: 'z' }),
    ).not.toThrow();
  });
});

describe('buffer state machine', () => {
  it('initializes from the formatted value', () => {
    const state = createCodeMirrorBuffer('{"a":1}', true);
    expect(state).toEqual({
      internalValue: '{\n  "a": 1\n}',
      lastSynced: '{\n  "a": 1\n}',
      pendingExternal: null,
    });
  });

  it('handleChange keeps the buffer verbatim and emits formatted', () => {
    const state = createCodeMirrorBuffer('', true);
    const emit = vi.fn();
    bufferHandleChange(state, '{"a":1', true, emit);
    expect(state.internalValue).toBe('{"a":1');
    expect(state.lastSynced).toBe('{"a":1');
    expect(emit).toHaveBeenCalledWith('{"a":1');
    bufferHandleChange(state, '{"a":1}', true, emit);
    expect(state.internalValue).toBe('{"a":1}');
    expect(emit).toHaveBeenLastCalledWith('{\n  "a": 1\n}');
  });

  it('handleChange clears a pending external value', () => {
    const state = createCodeMirrorBuffer('A', false);
    bufferReceiveExternal(state, 'B', false, false, true);
    expect(state.pendingExternal).toBe('B');
    bufferHandleChange(state, 'A!', false, vi.fn());
    expect(state.pendingExternal).toBeNull();
  });

  it('echo values clear pending without touching the buffer', () => {
    const state = createCodeMirrorBuffer('A', false);
    bufferReceiveExternal(state, 'B', false, false, true);
    const outcome = bufferReceiveExternal(state, 'A', false, false, true);
    expect(outcome).toBe('echo');
    expect(state.pendingExternal).toBeNull();
    expect(state.internalValue).toBe('A');
  });

  it('handles the A -> B -> A round trip: B applied, A applied on the way back', () => {
    const state = createCodeMirrorBuffer('A', false);
    expect(bufferReceiveExternal(state, 'B', false, false, false)).toBe('applied');
    expect(state.internalValue).toBe('B');
    expect(bufferReceiveExternal(state, 'A', false, false, false)).toBe('applied');
    expect(state.internalValue).toBe('A');
  });

  it('piles an external value while focused and applies it on blur', () => {
    const state = createCodeMirrorBuffer('A', false);
    expect(bufferReceiveExternal(state, 'B', false, false, true)).toBe('pended');
    expect(state.internalValue).toBe('A');
    expect(bufferHandleBlur(state)).toBe(true);
    expect(state.internalValue).toBe('B');
    expect(state.pendingExternal).toBeNull();
    expect(bufferHandleBlur(state)).toBe(false);
  });

  it('applies immediately when read-only even while focused', () => {
    const state = createCodeMirrorBuffer('A', false);
    expect(bufferReceiveExternal(state, 'B', false, true, true)).toBe('applied');
    expect(state.internalValue).toBe('B');
  });

  it('applies immediately when unfocused', () => {
    const state = createCodeMirrorBuffer('A', false);
    expect(bufferReceiveExternal(state, 'B', false, false, false)).toBe('applied');
  });
});

describe('clipboard', () => {
  it('uses the modern API in a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand when the modern API fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;
    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('falls back to execCommand outside a secure context', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand;
    await expect(copyTextToClipboard('hello')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('reports failure when both paths fail and cleans up the textarea', async () => {
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);
    const before = document.body.querySelectorAll('textarea').length;
    await expect(copyTextToClipboard('hello')).resolves.toBe(false);
    expect(document.body.querySelectorAll('textarea').length).toBe(before);
    expect(fallbackCopyTextToClipboard('x')).toBe(false);
  });
});
