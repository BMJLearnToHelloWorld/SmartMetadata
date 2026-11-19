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
 * SAML IdP metadata XML parsing, ported verbatim from pin
 * `utils/SSOUtils.ts` (`parseSamlMetadataXml`). Uses the browser's
 * built-in DOMParser; throws with pin's exact messages on all four
 * failure shapes.
 */

export const SSO_MAX_XML_SIZE = 1 * 1024 * 1024;

export interface SsoSamlIdpMetadata {
  entityId: string;
  ssoLoginUrl: string;
  idpX509Certificate: string;
}

const SAML_MD_NS = 'urn:oasis:names:tc:SAML:2.0:metadata';
const XMLDSIG_NS = 'http://www.w3.org/2000/09/xmldsig#';
const SAML_REDIRECT_BINDING =
  'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect';
const SAML_POST_BINDING = 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST';

function resolveSsoLoginUrl(
  ssoServices: HTMLCollectionOf<Element>,
): string | null {
  let fallback: string | null = null;

  for (const ssoService of ssoServices) {
    const binding = ssoService.getAttribute('Binding') ?? '';
    const location = ssoService.getAttribute('Location');

    if (binding === SAML_REDIRECT_BINDING && location) {
      return location;
    }
    if (!fallback && binding === SAML_POST_BINDING && location) {
      fallback = location;
    }
  }

  return fallback;
}

function resolveX509Certificate(
  keyDescriptors: HTMLCollectionOf<Element>,
): string | undefined {
  let fallback: string | undefined;

  for (const keyDescriptor of keyDescriptors) {
    const use = keyDescriptor.getAttribute('use');
    const x509 = keyDescriptor.getElementsByTagNameNS(
      XMLDSIG_NS,
      'X509Certificate',
    )[0];

    if (use === 'signing' && x509?.textContent) {
      return x509.textContent.replaceAll(/\s+/g, '');
    }
    if (!use && !fallback && x509?.textContent) {
      fallback = x509.textContent.replaceAll(/\s+/g, '');
    }
  }

  return fallback;
}

export function parseSsoSamlMetadataXml(xmlString: string): SsoSamlIdpMetadata {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid XML: the file could not be parsed.');
  }

  const entityId = doc
    .getElementsByTagNameNS(SAML_MD_NS, 'EntityDescriptor')[0]
    ?.getAttribute('entityID');

  if (!entityId) {
    throw new Error(
      'Invalid metadata: missing entityID on EntityDescriptor element.',
    );
  }

  const ssoLoginUrl = resolveSsoLoginUrl(
    doc.getElementsByTagNameNS(SAML_MD_NS, 'SingleSignOnService'),
  );

  if (!ssoLoginUrl) {
    throw new Error(
      'Invalid metadata: no SingleSignOnService element with a Location attribute found.',
    );
  }

  const certText = resolveX509Certificate(
    doc.getElementsByTagNameNS(SAML_MD_NS, 'KeyDescriptor'),
  );

  if (!certText) {
    throw new Error(
      'Invalid metadata: no X509Certificate found. A signing certificate is required.',
    );
  }

  return {
    entityId,
    ssoLoginUrl,
    idpX509Certificate: `-----BEGIN CERTIFICATE-----\n${certText}\n-----END CERTIFICATE-----`,
  };
}
