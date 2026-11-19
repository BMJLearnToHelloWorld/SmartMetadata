/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { message } from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  showSsoErrorToast,
  showSsoSuccessToast,
  showSsoWarningToast,
} from './ssoToasts';

describe('ssoToasts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows strings verbatim as errors with no explicit duration', () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    showSsoErrorToast('plain failure', 'fallback');
    expect(errorSpy).toHaveBeenCalledWith('plain failure');
  });

  it('shows the resolved message for ApiError-like failures', () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    showSsoErrorToast(
      { status: 500, body: JSON.stringify({ message: 'server said no' }) },
      'fallback',
    );
    expect(errorSpy).toHaveBeenCalledWith('server said no');
    showSsoErrorToast({ status: 500, body: JSON.stringify({}) }, 'fallback');
    expect(errorSpy).toHaveBeenCalledWith('fallback');
  });

  it('shows rule violations as warnings for five seconds', () => {
    const warningSpy = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    showSsoErrorToast(
      {
        status: 400,
        body: JSON.stringify({ message: 'violated', errorType: 'RULE_VIOLATION' }),
      },
      'fallback',
    );
    expect(warningSpy).toHaveBeenCalledWith('violated', 5);
  });

  it('suppresses 401 and 403-on-GET unless the message names a principal domain', () => {
    const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never);
    showSsoErrorToast({ status: 401, body: JSON.stringify({ message: 'no' }) }, 'fallback');
    showSsoErrorToast(
      { status: 403, body: JSON.stringify({ message: 'no' }) },
      'fallback',
      'GET',
    );
    expect(errorSpy).not.toHaveBeenCalled();
    showSsoErrorToast(
      { status: 403, body: JSON.stringify({ message: 'bad principal domain' }) },
      'fallback',
      'GET',
    );
    expect(errorSpy).toHaveBeenCalledWith('bad principal domain');
    showSsoErrorToast(
      { status: 403, body: JSON.stringify({ message: 'no' }) },
      'fallback',
      'PATCH',
    );
    expect(errorSpy).toHaveBeenCalledWith('no');
  });

  it('shows success for three seconds and warnings for five', () => {
    const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never);
    const warningSpy = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never);
    showSsoSuccessToast('saved');
    showSsoWarningToast('careful');
    expect(successSpy).toHaveBeenCalledWith('saved', 3);
    expect(warningSpy).toHaveBeenCalledWith('careful', 5);
  });
});
