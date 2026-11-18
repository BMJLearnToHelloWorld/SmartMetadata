/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isHttpUrl,
  isSsoTestLoginPopup,
  SSO_TEST_LOGIN_STORE_PREFIX,
} from './ssoTestLoginPopup';

describe('isHttpUrl', () => {
  it.each([
    ['https://idp.example/authorize', true],
    ['http://localhost:8080/callback', true],
    ['HTTP://idp.example/authorize', true],
    ['javascript:alert(1)', false],
    [' JavaScript:alert(1)', false],
    ['data:text/html,<script>alert(1)</script>', false],
    ['ftp://idp.example/file', false],
    ['/relative/callback', false],
    ['idp.example/authorize', false],
    ['', false],
    [undefined, false],
  ])('%s -> %s', (url, expected) => {
    expect(isHttpUrl(url)).toBe(expected);
  });
});

describe('isSsoTestLoginPopup', () => {
  function setOpener(opener: unknown): void {
    Object.defineProperty(window, 'opener', { value: opener, configurable: true });
  }

  function setUrl(url: string): void {
    window.history.replaceState(null, '', url);
  }

  beforeEach(() => {
    localStorage.clear();
    setOpener(null);
    setUrl('/');
  });

  afterEach(() => {
    localStorage.clear();
    setOpener(null);
    setUrl('/');
    vi.restoreAllMocks();
  });

  it('matches a popup whose hash state exists in the test login store', () => {
    setOpener({});
    localStorage.setItem(`${SSO_TEST_LOGIN_STORE_PREFIX}state-1`, '{"id":"state-1"}');
    setUrl('/callback#state=state-1&id_token=abc');
    expect(isSsoTestLoginPopup()).toBe(true);
  });

  it('matches a popup whose query state exists in the test login store', () => {
    setOpener({});
    localStorage.setItem(`${SSO_TEST_LOGIN_STORE_PREFIX}state-2`, '{"id":"state-2"}');
    setUrl('/callback?code=abc&state=state-2');
    expect(isSsoTestLoginPopup()).toBe(true);
  });

  it('rejects a window without an opener even with a matching state', () => {
    localStorage.setItem(`${SSO_TEST_LOGIN_STORE_PREFIX}state-1`, '{"id":"state-1"}');
    setUrl('/callback#state=state-1');
    expect(isSsoTestLoginPopup()).toBe(false);
  });

  it('rejects a popup whose state is not in the test login store', () => {
    setOpener({});
    setUrl('/callback#state=unknown-state');
    expect(isSsoTestLoginPopup()).toBe(false);
  });

  it('rejects a window whose opener is itself', () => {
    setOpener(window);
    localStorage.setItem(`${SSO_TEST_LOGIN_STORE_PREFIX}state-1`, '{"id":"state-1"}');
    setUrl('/callback#state=state-1');
    expect(isSsoTestLoginPopup()).toBe(false);
  });

  it('rejects a popup with no state at all', () => {
    setOpener({});
    setUrl('/callback');
    expect(isSsoTestLoginPopup()).toBe(false);
  });

  it('fails closed when storage throws', () => {
    setOpener({});
    setUrl('/callback#state=state-1');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    expect(isSsoTestLoginPopup()).toBe(false);
  });
});
