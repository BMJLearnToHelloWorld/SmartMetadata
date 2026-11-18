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
import { parseSsoSamlMetadataXml, SSO_MAX_XML_SIZE } from './ssoSamlXml';

const MD = 'urn:oasis:names:tc:SAML:2.0:metadata';
const DS = 'http://www.w3.org/2000/09/xmldsig#';
const REDIRECT = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect';
const POST = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST';

function metadataXml(parts: {
  entityId?: string;
  services?: string;
  keys?: string;
}): string {
  return (
    `<EntityDescriptor xmlns="${MD}" xmlns:ds="${DS}"` +
    (parts.entityId === undefined ? '' : ` entityID="${parts.entityId}"`) +
    '><IDPSSODescriptor>' +
    (parts.services ?? '') +
    (parts.keys ?? '') +
    '</IDPSSODescriptor></EntityDescriptor>'
  );
}

const SIGNING_KEY =
  '<KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data>' +
  '<ds:X509Certificate>MIID\nAB CD\tEF</ds:X509Certificate>' +
  '</ds:X509Data></ds:KeyInfo></KeyDescriptor>';

describe('parseSsoSamlMetadataXml', () => {
  it('extracts entityId, SSO URL and a PEM-wrapped whitespace-stripped cert', () => {
    const parsed = parseSsoSamlMetadataXml(
      metadataXml({
        entityId: 'https://idp.example.com/entity',
        services: `<SingleSignOnService Binding="${REDIRECT}" Location="https://idp.example.com/sso"/>`,
        keys: SIGNING_KEY,
      }),
    );
    expect(parsed).toEqual({
      entityId: 'https://idp.example.com/entity',
      ssoLoginUrl: 'https://idp.example.com/sso',
      idpX509Certificate:
        '-----BEGIN CERTIFICATE-----\nMIIDABCDEF\n-----END CERTIFICATE-----',
    });
  });

  it('prefers HTTP-Redirect over HTTP-POST regardless of order', () => {
    const parsed = parseSsoSamlMetadataXml(
      metadataXml({
        entityId: 'e',
        services:
          `<SingleSignOnService Binding="${POST}" Location="https://post.example.com"/>` +
          `<SingleSignOnService Binding="${REDIRECT}" Location="https://redirect.example.com"/>`,
        keys: SIGNING_KEY,
      }),
    );
    expect(parsed.ssoLoginUrl).toBe('https://redirect.example.com');

    const fallback = parseSsoSamlMetadataXml(
      metadataXml({
        entityId: 'e',
        services: `<SingleSignOnService Binding="${POST}" Location="https://post.example.com"/>`,
        keys: SIGNING_KEY,
      }),
    );
    expect(fallback.ssoLoginUrl).toBe('https://post.example.com');
  });

  it('skips services without a Location and unknown bindings', () => {
    const parsed = parseSsoSamlMetadataXml(
      metadataXml({
        entityId: 'e',
        services:
          `<SingleSignOnService Binding="${REDIRECT}"/>` +
          `<SingleSignOnService Binding="urn:unknown" Location="https://unknown.example.com"/>` +
          `<SingleSignOnService Binding="${POST}" Location="https://post.example.com"/>`,
        keys: SIGNING_KEY,
      }),
    );
    expect(parsed.ssoLoginUrl).toBe('https://post.example.com');
  });

  it('prefers the signing cert and falls back to a use-less descriptor', () => {
    const noUseKey =
      '<KeyDescriptor><ds:KeyInfo><ds:X509Data>' +
      '<ds:X509Certificate>NOUSECERT</ds:X509Certificate>' +
      '</ds:X509Data></ds:KeyInfo></KeyDescriptor>';
    const encryptionKey =
      '<KeyDescriptor use="encryption"><ds:KeyInfo><ds:X509Data>' +
      '<ds:X509Certificate>ENCCERT</ds:X509Certificate>' +
      '</ds:X509Data></ds:KeyInfo></KeyDescriptor>';
    const parsed = parseSsoSamlMetadataXml(
      metadataXml({
        entityId: 'e',
        services: `<SingleSignOnService Binding="${REDIRECT}" Location="https://sso"/>`,
        keys: encryptionKey + noUseKey + SIGNING_KEY,
      }),
    );
    expect(parsed.idpX509Certificate).toContain('MIIDABCDEF');

    const fallback = parseSsoSamlMetadataXml(
      metadataXml({
        entityId: 'e',
        services: `<SingleSignOnService Binding="${REDIRECT}" Location="https://sso"/>`,
        keys: encryptionKey + noUseKey,
      }),
    );
    expect(fallback.idpX509Certificate).toContain('NOUSECERT');
  });

  it('throws the exact messages for all four failure shapes', () => {
    expect(() => parseSsoSamlMetadataXml('<broken')).toThrow(
      'Invalid XML: the file could not be parsed.',
    );
    expect(() =>
      parseSsoSamlMetadataXml(
        metadataXml({
          services: `<SingleSignOnService Binding="${REDIRECT}" Location="https://sso"/>`,
          keys: SIGNING_KEY,
        }),
      ),
    ).toThrow(
      'Invalid metadata: missing entityID on EntityDescriptor element.',
    );
    expect(() =>
      parseSsoSamlMetadataXml(
        metadataXml({ entityId: 'e', keys: SIGNING_KEY }),
      ),
    ).toThrow(
      'Invalid metadata: no SingleSignOnService element with a Location attribute found.',
    );
    expect(() =>
      parseSsoSamlMetadataXml(
        metadataXml({
          entityId: 'e',
          services: `<SingleSignOnService Binding="${REDIRECT}" Location="https://sso"/>`,
        }),
      ),
    ).toThrow(
      'Invalid metadata: no X509Certificate found. A signing certificate is required.',
    );
  });

  it('caps uploads at 1 MB', () => {
    expect(SSO_MAX_XML_SIZE).toBe(1048576);
  });
});
