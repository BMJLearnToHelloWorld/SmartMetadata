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
 * Doc-panel mappings, field-name extraction, focus linkage and markdown
 * section splitting, ported from pin
 * `components/SettingsSso/SSODocPanel/SSODocPanel.constants.ts`,
 * `components/SettingsSso/SSODocPanel/SSODocPanel.tsx`
 * (`resolveActiveField`), `utils/SSOUtils.ts` (`extractFieldName`,
 * `createDOMFocusHandler`, `createDOMClickHandler`,
 * `createFormKeyDownHandler`), `utils/ServiceUtils.tsx`
 * (`processDocMarkdown`) and `constants/regex.constants.ts`.
 *
 * Section splitting mirrors `processDocMarkdown` in two phases
 * (admonitions first, then sections) and returns segments instead of HTML,
 * because the product markdown renderer escapes raw HTML: the component
 * renders each segment through it inside the matching wrapper element.
 * Admonition-in-section nesting would diverge from pin's HTML output;
 * no SSO doc nests blocks (verified: the 8 SSO docs contain only
 * `$$section` blocks), so the boundary is unreachable here.
 */

export const SSO_DOC_FIELD_MAPPINGS: Readonly<Record<string, string>> = {
  clientType: 'clientType',
  clientId: 'clientId',
  callbackUrl: 'callbackUrl',
  redirectUrl: 'callbackUrl',
  publicKeyUrls: 'publicKey',
  publicKey: 'publicKey',
  tokenValidationAlgorithm: 'tokenValidation',
  authority: 'authority',
  domain: 'authority',
  jwtPrincipalClaims: 'principals',
  jwtPrincipalClaimsMapping: 'jwtPrincipalClaimsMapping',
  principalDomain: 'principalDomain',
  enforcePrincipalDomain: 'enforcePrincipalDomain',
  adminPrincipals: 'adminPrincipals',
  allowedDomains: 'allowedDomains',
  enableSelfSignup: 'selfSignup',
  secret: 'clientSecret',
  clientSecret: 'clientSecret',
  secretKey: 'clientSecret',
  scopes: 'scopes',
  providerName: 'providerName',
  emailClaim: 'emailClaim',
  displayNameClaim: 'displayNameClaim',
  adminEmails: 'adminEmails',
  allowedEmailDomains: 'allowedEmailDomains',
  botDomain: 'botDomain',
};

export const SSO_PROVIDER_FILE_MAP: Readonly<Record<string, string>> = {
  google: 'googleSSOClientConfig',
  azure: 'azureSSOClientConfig',
  okta: 'oktaSSOClientConfig',
  auth0: 'auth0SSOClientConfig',
  saml: 'samlSSOClientConfig',
  ldap: 'ldapSSOClientConfig',
  'custom-oidc': 'customOidcSSOClientConfig',
  'aws-cognito': 'awsCognitoSSOClientConfig',
  basic: 'basic',
  general: 'general',
};

/** Maps a provider key to its doc file stem; unknown keys pass through. */
export function resolveSsoDocServiceName(serviceName: string): string {
  return SSO_PROVIDER_FILE_MAP[serviceName] ?? serviceName;
}

/**
 * Resolves an SSO schema field name to its documentation `data-id`:
 * exact match on the last `/` segment, else the first bidirectional
 * case-insensitive substring hit in table order, else the original value.
 */
export function resolveSsoActiveField(
  activeField?: string,
): string | undefined {
  if (!activeField) {
    return activeField;
  }

  const parts = activeField.split('/');
  const fieldName = parts[parts.length - 1] ?? '';
  const lowerFieldName = fieldName.toLowerCase();

  if (SSO_DOC_FIELD_MAPPINGS[fieldName]) {
    return SSO_DOC_FIELD_MAPPINGS[fieldName];
  }

  for (const [key, value] of Object.entries(SSO_DOC_FIELD_MAPPINGS)) {
    if (
      lowerFieldName.includes(key.toLowerCase()) ||
      key.toLowerCase().includes(lowerFieldName)
    ) {
      return value;
    }
  }

  return activeField;
}

const SSO_FOCUS_FIELD_MAPPINGS: Readonly<Record<string, string>> = {
  clientSecret: 'clientSecret',
  secret: 'clientSecret',
  authority: 'authority',
  domain: 'authority',
  callbackUrl: 'callbackUrl',
  enableSelfSignup: 'enableSelfSignup',
  scopes: 'scopes',
  secretKey: 'clientSecret',
  oidcConfiguration: 'oidcConfiguration',
  samlConfiguration: 'samlConfiguration',
  ldapConfiguration: 'ldapConfiguration',
  providerName: 'providerName',
};

/** Extracts the doc field name from an RJSF field id (`root/.../leaf`). */
export function extractSsoFieldName(fieldId: string): string {
  const parts = fieldId.split('/');
  const lastPart = parts.at(-1) ?? '';
  return SSO_FOCUS_FIELD_MAPPINGS[lastPart] || lastPart;
}

function createSsoDomFieldHandler(
  setActiveField: (field: string) => void,
): (event: FocusEvent | MouseEvent) => void {
  return (event: FocusEvent | MouseEvent): void => {
    const target = event.target as HTMLElement;
    let element: HTMLElement | null = target;
    while (element && element !== document.body) {
      if (element.id?.includes('root')) {
        setActiveField(extractSsoFieldName(element.id));
        break;
      }
      element = element.parentElement;
    }
  };
}

export const createSsoDomFocusHandler = createSsoDomFieldHandler;
export const createSsoDomClickHandler = createSsoDomFieldHandler;

/**
 * Prevents Enter in text inputs from submitting the form (which would
 * drop array-field tags); combobox inputs and textareas are exempt.
 */
export function createSsoFormKeyDownHandler(): (
  event: KeyboardEvent,
) => void {
  return (event: KeyboardEvent) => {
    if (
      event.key === 'Enter' &&
      event.target &&
      (event.target as HTMLElement).tagName !== 'TEXTAREA'
    ) {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT') {
        const isInSelectTags = target.closest('[role="combobox"]');
        if (!isInSelectTags) {
          event.preventDefault();
          event.stopPropagation();
        }
      }
    }
  };
}

const SSO_SECTION_BLOCK_REGEX = /\$\$section\n([\s\S]*?)\n\$\$/g;
const SSO_MARKDOWN_MATCH_ID = /\$\(id="(.*?)"\)/;
const SSO_ADMONITION_TYPES = [
  'note',
  'warning',
  'danger',
  'info',
  'tip',
  'caution',
] as const;

export type SsoDocSegment =
  | { kind: 'prose'; markdown: string }
  | { kind: 'section'; id: string; markdown: string }
  | { kind: 'admonition'; admonitionType: string; markdown: string };

function splitSsoSections(markdown: string): SsoDocSegment[] {
  const segments: SsoDocSegment[] = [];
  const sectionRegex = new RegExp(
    SSO_SECTION_BLOCK_REGEX.source,
    SSO_SECTION_BLOCK_REGEX.flags,
  );
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        kind: 'prose',
        markdown: markdown.slice(lastIndex, match.index),
      });
    }
    const sectionContent = match[1];
    const idMatch = SSO_MARKDOWN_MATCH_ID.exec(sectionContent);
    const id = idMatch ? idMatch[1] : '';
    const cleanContent = sectionContent.replace(SSO_MARKDOWN_MATCH_ID, '').trim();
    segments.push({ kind: 'section', id, markdown: cleanContent });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    segments.push({ kind: 'prose', markdown: markdown.slice(lastIndex) });
  }

  return segments;
}

/**
 * Splits doc markdown into renderable segments (pin `processDocMarkdown`
 * shape): admonition blocks first, then `$$section` blocks with their
 * `$(id="...")` markers removed and trimmed.
 */
export function splitSsoDocMarkdown(markdown: string): SsoDocSegment[] {
  const admonitionRegex = new RegExp(
    `^\\$\\$(${SSO_ADMONITION_TYPES.join('|')})\\n([\\s\\S]*?)\\n\\$\\$`,
    'gm',
  );
  const segments: SsoDocSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushProse = (text: string): void => {
    if (text) {
      segments.push(...splitSsoSections(text));
    }
  };

  while ((match = admonitionRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      pushProse(markdown.slice(lastIndex, match.index));
    }
    segments.push({
      kind: 'admonition',
      admonitionType: match[1],
      markdown: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    pushProse(markdown.slice(lastIndex));
  }

  return segments;
}
