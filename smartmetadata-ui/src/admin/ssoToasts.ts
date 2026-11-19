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
import { resolveSsoErrorDetails } from './ssoValidation';

/**
 * Toast appliers over the pin resolution rules (`ToastUtils` defaults:
 * success 3000ms, warning/info 5000ms, error with no explicit timeout).
 * Durations are seconds in antd. Suppressed errors (401, or 403 on GET,
 * without a principal-domain message) show nothing.
 */
export function showSsoErrorToast(
  error: unknown,
  fallbackText: string,
  method?: string,
): void {
  const resolution = resolveSsoErrorDetails(error, fallbackText, method);
  if (resolution.suppressed) {
    return;
  }
  if (resolution.kind === 'warning') {
    message.warning(resolution.message, 5);
  } else {
    message.error(resolution.message);
  }
}

export function showSsoSuccessToast(text: string): void {
  message.success(text, 3);
}

export function showSsoWarningToast(text: string): void {
  message.warning(text, 5);
}
