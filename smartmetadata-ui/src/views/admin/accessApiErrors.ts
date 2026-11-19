/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ApiError } from '@/api/client';

/**
 * Official error-text extraction (utils/StringUtils.ts:233-253
 * `getErrorText`, utils/APIUtils.ts:160-175 `getIsErrorMatch`): a string
 * error is itself; otherwise the response body's `message`, then
 * `responseMessage`, then the body itself when it is a string, then the
 * fallback. The product equivalent reads the `ApiError` body, whose raw
 * text is the response payload `apiRequest` captured before throwing.
 * `ApiError.message` is NOT consulted: it already folds in
 * `readErrorMessage`'s own fallback, which would mask the caller's.
 */
function extractErrorText(error: unknown): string | undefined {
  if (typeof error === 'string') {
    return error || undefined;
  }
  if (error instanceof ApiError) {
    const body = error.body;
    if (!body) {
      return undefined;
    }
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === 'string') {
        return parsed || undefined;
      }
      if (parsed !== null && typeof parsed === 'object') {
        const record = parsed as { message?: unknown; responseMessage?: unknown };
        if (typeof record.message === 'string' && record.message) {
          return record.message;
        }
        if (typeof record.responseMessage === 'string' && record.responseMessage) {
          return record.responseMessage;
        }
      }
      // A JSON body with no message field carries no server message;
      // the raw body is not a readable message either, so fall through.
      return undefined;
    } catch {
      // Non-JSON body: the body itself is the response data string.
      return body;
    }
  }
  if (error instanceof Error) {
    return error.message || undefined;
  }
  return undefined;
}

/** Pin `getErrorText`: server text first, caller fallback otherwise. */
export function getErrorText(error: unknown, fallbackText: string): string {
  return extractErrorText(error) ?? fallbackText;
}

/** Pin `getIsErrorMatch` for the `already exists` key (constants.ts:478): case-sensitive `includes`. */
export function isAlreadyExistsError(error: unknown): boolean {
  const text = extractErrorText(error);
  return text !== undefined && text.includes('already exists');
}
