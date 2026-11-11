/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
/**
 * Port of official `utils/StringUtils.ts` (`generateUUID`,
 * `replaceAllSpacialCharWith_`) and `utils/ServicePureUtils.ts`
 * (`getIngestionName`).
 *
 * Official names a new ingestion pipeline with a UUID (`name`), never with
 * a human string: the human name is `displayName`, defaulted by
 * `getIngestionName`. Six pipeline types get an 8-random-character suffix;
 * the rest are `${service}_${type}`. Service names have their special
 * characters replaced with `_` only in the suffixed form (the plain form
 * keeps the service name verbatim, as official does).
 */
import type { PipelineType } from '@/types/ingestion';

export function replaceCallback(character: string): string {
  // Generate a random number between 0 and 15.
  const randomNumber = crypto.getRandomValues(new Uint8Array(1))[0] & 0xf;

  // If the character in the UUID template is 'x', use the random number.
  // Otherwise, use the random number ANDed with 0x3 (which gives a number
  // between 0 and 3) ORed with 0x8 (which sets the high bit, ensuring a
  // number between 8 and 11).
  const uuidCharacter = character === 'x' ? randomNumber : (randomNumber & 0x3) | 0x8;

  // Convert the number to a hexadecimal string and return it.
  return uuidCharacter.toString(16);
}

/**
 * @description Generate a UUID (Universally Unique Identifier)
 * @returns A UUID string
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replaceAll(/[xy]/g, replaceCallback);
}

export function replaceAllSpacialCharWith_(text: string): string {
  return text.replaceAll(/[&/\\#, +()$~%.'":*?<>{}]/g, '_');
}

/** crypto-random-string({ length: 8, type: 'alphanumeric' }) equivalent. */
export function randomAlphanumeric(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('');
}

/**
 * Official `getIngestionName(serviceData.name, pipelineType)`:
 * metadata / profiler / lineage / dbt / application / TestSuite get
 * `${service}_${type}_${8 random chars}`; every other type gets
 * `${service}_${type}`.
 */
export function getIngestionName(serviceName: string, type: PipelineType): string {
  if (
    [
      'profiler',
      'metadata',
      'lineage',
      'dbt',
      'application',
      'TestSuite',
    ].includes(type)
  ) {
    return `${replaceAllSpacialCharWith_(serviceName)}_${type}_${randomAlphanumeric(8)}`;
  }
  return `${serviceName}_${type}`;
}
