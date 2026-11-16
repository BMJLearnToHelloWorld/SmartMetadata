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
 * Port of official's credential-file reading and validation
 * (ui-core-components credential-file-input utils + constants, and
 * CredentialFileField.utils), pin a3012259ca.
 *
 * A credential file is read in the browser and its text becomes the
 * field value — nothing is uploaded anywhere. Decoding is strict:
 * `File.text()` is lenient and would turn a DER/PKCS#12 payload into
 * replacement characters saved as the secret, so a fatal UTF-8 decode
 * plus a NUL scan rejects binary payloads here instead.
 */

export const DEFAULT_CREDENTIAL_FILE_MAX_SIZE = 1024 * 1024;

export type CredentialFileErrorKind = 'binary' | 'sizeLimit' | 'unacceptedType' | 'unreadable';

/** Thrown when a file decodes to something other than UTF-8 text. */
export class NonTextCredentialError extends Error {}

/** Pin getReadableFileSize (file-upload): floored units, `0 KB` for empty. */
export function getReadableFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 KB';
  }
  const suffixes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${Math.floor(bytes / Math.pow(1024, index))} ${suffixes[index]}`;
}

export function decodeCredentialText(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new NonTextCredentialError('Credential file is not UTF-8 text');
  }
  if (text.includes('\u0000')) {
    throw new NonTextCredentialError('Credential file contains NUL bytes');
  }
  return text;
}

/**
 * Pin readCredentialText: FileReader rather than Blob.arrayBuffer()
 * because jsdom implements the former and not the latter, and this
 * path has to stay reachable from tests.
 */
export function readCredentialText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
    reader.onload = () => {
      try {
        resolve(decodeCredentialText(reader.result as ArrayBuffer));
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Pin drop-zone validation order: the extension allow-list and the
 * size limit reject before any read is attempted.
 */
export function validateCredentialFile(
  file: { name: string; size: number },
  acceptedFileTypes: string[] | undefined,
  maxSize: number,
): CredentialFileErrorKind | null {
  if (acceptedFileTypes && acceptedFileTypes.length > 0) {
    const lowerName = file.name.toLowerCase();
    const accepted = acceptedFileTypes.some((type) =>
      lowerName.endsWith(type.toLowerCase()),
    );
    if (!accepted) {
      return 'unacceptedType';
    }
  }
  if (file.size > maxSize) {
    return 'sizeLimit';
  }
  return null;
}

export const CREDENTIAL_FILE_ERROR_KEYS: Record<CredentialFileErrorKind, string> = {
  binary: 'forms.credentialFile.notText',
  sizeLimit: 'forms.credentialFile.sizeExceeded',
  unacceptedType: 'forms.credentialFile.invalidFormat',
  unreadable: 'forms.credentialFile.unreadable',
};
