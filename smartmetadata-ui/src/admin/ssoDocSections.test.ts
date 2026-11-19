/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import {
  createSsoDomClickHandler,
  createSsoDomFocusHandler,
  createSsoFormKeyDownHandler,
  extractSsoFieldName,
  resolveSsoActiveField,
  resolveSsoDocServiceName,
  splitSsoDocMarkdown,
  SSO_DOC_FIELD_MAPPINGS,
  SSO_PROVIDER_FILE_MAP,
} from './ssoDocSections';

describe('resolveSsoActiveField', () => {
  it('maps all 26 table entries exactly', () => {
    expect(Object.keys(SSO_DOC_FIELD_MAPPINGS)).toHaveLength(26);
    expect(resolveSsoActiveField('publicKeyUrls')).toBe('publicKey');
    expect(resolveSsoActiveField('tokenValidationAlgorithm')).toBe('tokenValidation');
    expect(resolveSsoActiveField('jwtPrincipalClaims')).toBe('principals');
    expect(resolveSsoActiveField('enableSelfSignup')).toBe('selfSignup');
    expect(resolveSsoActiveField('secret')).toBe('clientSecret');
    expect(resolveSsoActiveField('secretKey')).toBe('clientSecret');
    expect(resolveSsoActiveField('domain')).toBe('authority');
    expect(resolveSsoActiveField('redirectUrl')).toBe('callbackUrl');
    expect(resolveSsoActiveField('scopes')).toBe('scopes');
    expect(resolveSsoActiveField('clientType')).toBe('clientType');
  });

  it('takes the last path segment for exact matches', () => {
    expect(
      resolveSsoActiveField('root/authenticationConfiguration/secret'),
    ).toBe('clientSecret');
  });

  it('falls back to the first bidirectional substring hit in table order', () => {
    // 'clientIdSuffix' contains 'clientId' (table order: clientType first,
    // but 'clientType' is not a substring match here).
    expect(resolveSsoActiveField('clientIdSuffix')).toBe('clientId');
    // A key containing the field name: 'id' is contained in 'clientId'.
    expect(resolveSsoActiveField('id')).toBe('clientId');
  });

  it('returns the original value when nothing matches, and passes falsy through', () => {
    expect(resolveSsoActiveField('root/authenticationConfiguration/xyz')).toBe(
      'root/authenticationConfiguration/xyz',
    );
    expect(resolveSsoActiveField(undefined)).toBeUndefined();
    expect(resolveSsoActiveField('')).toBe('');
  });
});

describe('resolveSsoDocServiceName', () => {
  it('maps the 10 file-map keys and passes openmetadata through', () => {
    expect(Object.keys(SSO_PROVIDER_FILE_MAP)).toHaveLength(10);
    expect(resolveSsoDocServiceName('google')).toBe('googleSSOClientConfig');
    expect(resolveSsoDocServiceName('custom-oidc')).toBe('customOidcSSOClientConfig');
    expect(resolveSsoDocServiceName('aws-cognito')).toBe('awsCognitoSSOClientConfig');
    expect(resolveSsoDocServiceName('basic')).toBe('basic');
    expect(resolveSsoDocServiceName('general')).toBe('general');
    expect(resolveSsoDocServiceName('openmetadata')).toBe('openmetadata');
  });
});

describe('extractSsoFieldName', () => {
  it('extracts the last segment and applies the focus map', () => {
    expect(extractSsoFieldName('root/authenticationConfiguration/clientId')).toBe(
      'clientId',
    );
    expect(
      extractSsoFieldName('root/authenticationConfiguration/oidcConfiguration/secret'),
    ).toBe('clientSecret');
    expect(extractSsoFieldName('root/authenticationConfiguration/domain')).toBe(
      'authority',
    );
    expect(extractSsoFieldName('root/authenticationConfiguration/unknown')).toBe(
      'unknown',
    );
  });
});

describe('DOM focus/click handlers', () => {
  it('walks ancestors for the first id containing root', () => {
    document.body.innerHTML =
      '<div id="root/authenticationConfiguration/clientId"><span id="inner">x</span></div>';
    const setActiveField = vi.fn();
    const handler = createSsoDomFocusHandler(setActiveField);
    const span = document.getElementById('inner')!;
    handler(new FocusEvent('focusin', { bubbles: true }) as unknown as FocusEvent);
    // Dispatch through the target: re-fire with the span as target.
    const event = new FocusEvent('focusin', { bubbles: true });
    Object.defineProperty(event, 'target', { value: span });
    handler(event);
    expect(setActiveField).toHaveBeenCalledWith('clientId');
    document.body.innerHTML = '';
  });

  it('does nothing when no ancestor id contains root', () => {
    document.body.innerHTML = '<div id="plain"><span id="inner">x</span></div>';
    const setActiveField = vi.fn();
    const handler = createSsoDomClickHandler(setActiveField);
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', {
      value: document.getElementById('inner'),
    });
    handler(event);
    expect(setActiveField).not.toHaveBeenCalled();
    document.body.innerHTML = '';
  });
});

describe('form keydown handler', () => {
  it('blocks Enter in plain inputs but not in textareas or comboboxes', () => {
    const handler = createSsoFormKeyDownHandler();
    const input = document.createElement('input');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
    Object.defineProperty(event, 'target', { value: input });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    const stopPropagation = vi.spyOn(event, 'stopPropagation');
    handler(event);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();

    const textarea = document.createElement('textarea');
    const textEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    Object.defineProperty(textEvent, 'target', { value: textarea });
    const textPrevent = vi.spyOn(textEvent, 'preventDefault');
    handler(textEvent);
    expect(textPrevent).not.toHaveBeenCalled();

    const combo = document.createElement('div');
    combo.setAttribute('role', 'combobox');
    const comboInput = document.createElement('input');
    combo.appendChild(comboInput);
    document.body.appendChild(combo);
    const comboEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    Object.defineProperty(comboEvent, 'target', { value: comboInput });
    const comboPrevent = vi.spyOn(comboEvent, 'preventDefault');
    handler(comboEvent);
    expect(comboPrevent).not.toHaveBeenCalled();
    document.body.innerHTML = '';
  });
});

describe('splitSsoDocMarkdown', () => {
  it('splits sections with ids removed and content trimmed', () => {
    const segments = splitSsoDocMarkdown(
      '# Intro\n\n$$section\n$(id="clientId")\n\nContent one.\n$$\n\nBetween.\n\n$$section\n$(id="authority")\nContent two.\n$$\n',
    );
    expect(segments).toEqual([
      { kind: 'prose', markdown: '# Intro\n\n' },
      { kind: 'section', id: 'clientId', markdown: 'Content one.' },
      { kind: 'prose', markdown: '\n\nBetween.\n\n' },
      { kind: 'section', id: 'authority', markdown: 'Content two.' },
      { kind: 'prose', markdown: '\n' },
    ]);
  });

  it('uses an empty id when the marker is missing', () => {
    expect(
      splitSsoDocMarkdown('$$section\nNo marker here.\n$$'),
    ).toEqual([{ kind: 'section', id: '', markdown: 'No marker here.' }]);
  });

  it('returns plain prose unchanged when no blocks exist', () => {
    expect(splitSsoDocMarkdown('# Hello\n\nPlain text.')).toEqual([
      { kind: 'prose', markdown: '# Hello\n\nPlain text.' },
    ]);
    expect(splitSsoDocMarkdown('')).toEqual([]);
  });

  it('splits top-level admonition blocks with trimmed content', () => {
    const segments = splitSsoDocMarkdown(
      'Before.\n\n$$note\nBe careful.\n$$\n\nAfter.',
    );
    expect(segments).toEqual([
      { kind: 'prose', markdown: 'Before.\n\n' },
      { kind: 'admonition', admonitionType: 'note', markdown: 'Be careful.' },
      { kind: 'prose', markdown: '\n\nAfter.' },
    ]);
  });

  it('only matches known admonition types at line starts', () => {
    expect(
      splitSsoDocMarkdown('$$unknown\nNot an admonition.\n$$'),
    ).toEqual([
      { kind: 'prose', markdown: '$$unknown\nNot an admonition.\n$$' },
    ]);
  });
});
