/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  decodeCredentialText,
  DEFAULT_CREDENTIAL_FILE_MAX_SIZE,
  getReadableFileSize,
  NonTextCredentialError,
  readCredentialText,
  validateCredentialFile,
} from './credentialFiles';

describe('getReadableFileSize (pin file-upload)', () => {
  it('floors to the largest fitting unit', () => {
    expect(getReadableFileSize(0)).toBe('0 KB');
    expect(getReadableFileSize(512)).toBe('512 B');
    expect(getReadableFileSize(1536)).toBe('1 KB');
    expect(getReadableFileSize(DEFAULT_CREDENTIAL_FILE_MAX_SIZE)).toBe('1 MB');
  });
});

describe('decodeCredentialText (pin credential-file-input)', () => {
  it('decodes UTF-8 text and rejects invalid UTF-8 and NUL bytes', () => {
    const text = '-----BEGIN CERTIFICATE-----\nabc\n';
    expect(decodeCredentialText(new TextEncoder().encode(text).buffer)).toBe(text);
    expect(() => decodeCredentialText(new Uint8Array([0xff, 0xfe]).buffer)).toThrow(
      NonTextCredentialError,
    );
    expect(() =>
      decodeCredentialText(new Uint8Array([0x61, 0x00, 0x62]).buffer),
    ).toThrow(NonTextCredentialError);
  });
});

describe('readCredentialText', () => {
  it('reads a file as UTF-8 text and rejects binary content', async () => {
    const textFile = new File(['cert-content'], 'cert.pem', { type: 'text/plain' });
    await expect(readCredentialText(textFile)).resolves.toBe('cert-content');
    const binaryFile = new File([new Uint8Array([0xff, 0xfe])], 'key.der');
    await expect(readCredentialText(binaryFile)).rejects.toBeInstanceOf(
      NonTextCredentialError,
    );
  });
});

describe('validateCredentialFile', () => {
  it('rejects unaccepted extensions before reading, then oversize files', () => {
    expect(
      validateCredentialFile({ name: 'key.der', size: 10 }, ['.pem', '.crt'], 1024),
    ).toBe('unacceptedType');
    expect(
      validateCredentialFile({ name: 'key.PEM', size: 10 }, ['.pem'], 1024),
    ).toBeNull();
    expect(
      validateCredentialFile({ name: 'key.pem', size: 2048 }, ['.pem'], 1024),
    ).toBe('sizeLimit');
    expect(validateCredentialFile({ name: 'key.pem', size: 10 }, undefined, 1024)).toBeNull();
    expect(validateCredentialFile({ name: 'key.pem', size: 10 }, [], 1024)).toBeNull();
  });
});
