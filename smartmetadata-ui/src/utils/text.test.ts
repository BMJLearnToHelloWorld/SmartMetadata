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
import { capitalize, getFormDisplayLabel, startCase } from './text';

/**
 * Differential vectors locked against lodash 4.18.1 (the pin's version):
 * every expectation below is the lodash oracle value, verified by direct
 * probe (STARTCASE-BENCHMARK.md §9). All-caps words keep their casing —
 * that is lodash behaviour, not a bug (`FOO_BAR` -> `FOO BAR`).
 */
describe('startCase (lodash 4.18.1)', () => {
  it.each([
    ['foo_bar', 'Foo Bar'],
    ['FOO_BAR', 'FOO BAR'],
    ['storedProcedure', 'Stored Procedure'],
    ['GChat', 'G Chat'],
    ['ABCDef', 'ABC Def'],
    ['mlmodels', 'Mlmodels'],
    ['apiCollections', 'Api Collections'],
    ['oAuth2', 'O Auth 2'],
    ['s3Bucket', 'S 3 Bucket'],
    ['XMLHttpRequest', 'XML Http Request'],
    ['x509Certificate', 'X 509 Certificate'],
    ['hostPort', 'Host Port'],
    ['apiKey', 'Api Key'],
    ['oidcClientId', 'Oidc Client Id'],
    ['supportsMetadataExtraction', 'Supports Metadata Extraction'],
    ['dataAssets', 'Data Assets'],
    ['partialSuccess', 'Partial Success'],
    ['databaseSchema', 'Database Schema'],
    ['connection_options', 'Connection Options'],
    ['maxResponseChars', 'Max Response Chars'],
    ['baseUrl', 'Base Url'],
    ['FOO', 'FOO'],
    ['', ''],
    ['bot', 'Bot'],
    ['database', 'Database'],
    ['includes', 'Includes'],
    ['myPage', 'My Page'],
    ['JOHN DOE', 'JOHN DOE'],
    ['john doe', 'John Doe'],
    ['alice.admin', 'Alice Admin'],
  ])('renders %j as %j', (input, expected) => {
    expect(startCase(input)).toBe(expected);
  });

  it.each([
    // SSO field names (migrated from the deleted `ssoStartCase`,
    // ssoProviders.test.ts): pin renders these labels with plain lodash
    // `startCase` (SsoConfigurationFormArrayFieldTemplate.tsx:224,236,
    // SsoRolesSelectField.tsx:122,128, formPureUtils.ts:31,36).
    ['publicKeyUrls', 'Public Key Urls'],
    ['additionalTrustedRedirectUris', 'Additional Trusted Redirect Uris'],
    ['jwtPrincipalClaims', 'Jwt Principal Claims'],
    ['jwtPrincipalClaimsMapping', 'Jwt Principal Claims Mapping'],
    ['adminPrincipals', 'Admin Principals'],
    ['adminEmails', 'Admin Emails'],
    ['allowedEmailDomains', 'Allowed Email Domains'],
    ['botPrincipals', 'Bot Principals'],
    ['testPrincipals', 'Test Principals'],
    ['allowedEmailRegistrationDomains', 'Allowed Email Registration Domains'],
    ['allowedDomains', 'Allowed Domains'],
    ['acceptableHostNames', 'Acceptable Host Names'],
    ['samlDisplayNameAttributes', 'Saml Display Name Attributes'],
    ['scope', 'Scope'],
    ['authReassignRoles', 'Auth Reassign Roles'],
    ['providerName', 'Provider Name'],
    ['provider', 'Provider'],
    [
      '.authenticationConfiguration.sessionExpiry',
      'Authentication Configuration Session Expiry',
    ],
    [
      '.authenticationConfiguration.maxActiveSessionsPerUser',
      'Authentication Configuration Max Active Sessions Per User',
    ],
    [
      '.authenticationConfiguration.oidcConfiguration.tokenValidity',
      'Authentication Configuration Oidc Configuration Token Validity',
    ],
    [
      '.authenticationConfiguration.samlConfiguration.security.tokenValidity',
      'Authentication Configuration Saml Configuration Security Token Validity',
    ],
    ['', ''],
  ])('renders SSO field name %j as %j', (input, expected) => {
    expect(startCase(input)).toBe(expected);
  });

  it('matches lodash on the supplementary probe set', () => {
    expect(startCase('__FOO_BAR__')).toBe('FOO BAR');
    expect(startCase('--FOO-BAR--')).toBe('FOO BAR');
    expect(startCase('DBT S3 Config')).toBe('DBT S 3 Config');
    expect(startCase('oAuthToken')).toBe('O Auth Token');
    expect(startCase('oauth2Config')).toBe('Oauth 2 Config');
    expect(startCase('s3Config')).toBe('S 3 Config');
    expect(startCase('dashboard')).toBe('Dashboard');
    expect(startCase('table')).toBe('Table');
    expect(startCase('mlmodel')).toBe('Mlmodel');
    expect(startCase('create-user')).toBe('Create User');
    expect(startCase('ABCd')).toBe('AB Cd');
    expect(startCase('FOOBar')).toBe('FOO Bar');
    expect(startCase('HTTPServer')).toBe('HTTP Server');
    expect(startCase('fooBARbaz')).toBe('Foo BA Rbaz');
    expect(startCase('SCREAMING_SNAKE')).toBe('SCREAMING SNAKE');
  });

  it('deburrs and strips apostrophes like lodash createCompounder', () => {
    expect(startCase("o'brien")).toBe('Obrien');
    expect(startCase('o\u2019brien')).toBe('Obrien');
    expect(startCase('l\u2019amour')).toBe('Lamour');
    expect(startCase('rock\u2019n\u2019roll')).toBe('Rocknroll');
    expect(startCase('café')).toBe('Cafe');
    expect(startCase('naïve')).toBe('Naive');
    expect(startCase('résumé')).toBe('Resume');
    expect(startCase('Üser')).toBe('User');
    expect(startCase('Æsop')).toBe('Aesop');
    expect(startCase('Ångström')).toBe('Angstrom');
    expect(startCase('éclair')).toBe('Eclair');
  });

  it('keeps Latin ligatures like lodash (Major-1 fix, was a known residual)', () => {
    // Lodash keeps the U+FB01 ligature as one word (`FIsh`); the previous
    // ASCII word pattern dropped it (`Sh`). The unicode word regex port
    // closes this residual.
    expect(startCase('ﬁsh')).toBe('FIsh');
    expect(startCase('ﬂag')).toBe('FLag');
    expect(startCase('ﬀ')).toBe('FF');
    expect(startCase('ﬀer')).toBe('FFer');
  });

  it('keeps non-Latin display names whole (Major-1 regression)', () => {
    // The previous ASCII word pattern returned '' for these, so the two
    // greeting headers fell back to generic copy. Lodash keeps them.
    expect(startCase('王小明')).toBe('王小明');
    expect(startCase('张三')).toBe('张三');
    expect(startCase('Αλέξανδρος')).toBe('Αλέξανδρος');
    expect(startCase('Αλέξανδρος Papadopoulos')).toBe(
      'Αλέξανδρος Papadopoulos',
    );
    expect(startCase('Иван')).toBe('Иван');
    expect(startCase('Иван Петров')).toBe('Иван Петров');
    expect(startCase('Σωκράτης')).toBe('Σωκράτης');
    expect(startCase('王小明 john doe')).toBe('王小明 John Doe');
    expect(startCase('JOHN DOE 王小明')).toBe('JOHN DOE 王小明');
  });

  it('keeps Latin Extended-B letters like lodash (Major-1)', () => {
    expect(startCase('ẞ')).toBe('ẞ');
    expect(startCase('Ǆeněk')).toBe('Ǆenek');
    expect(startCase('Ǎ')).toBe('Ǎ');
    expect(startCase('ǎ')).toBe('Ǎ');
    expect(startCase('ǅeněk')).toBe('Ǆenek');
    expect(startCase('ǆeněk')).toBe('Ǆenek');
  });

  it('keeps ordinal forms intact like lodash (Major-1)', () => {
    expect(startCase('1st')).toBe('1st');
    expect(startCase('2nd')).toBe('2nd');
    expect(startCase('3rd')).toBe('3rd');
    expect(startCase('4th')).toBe('4th');
    expect(startCase('21st')).toBe('21st');
    expect(startCase('1st place')).toBe('1st Place');
    expect(startCase('2nd edition')).toBe('2nd Edition');
    // `111th` is not an ordinal for lodash (`(?![123])` guard): digits
    // and `Th` split.
    expect(startCase('111th')).toBe('111 Th');
    expect(startCase('þ1st')).toBe('Th 1st');
  });

  it('keeps emoji words and upper-cases astral letters like lodash', () => {
    expect(startCase('hello 👋 world')).toBe('Hello 👋 World');
    expect(startCase('𐐷')).toBe('𐐏');
  });

  it('upper-cases letters inside ZWJ grapheme clusters like lodash (Major-1 fixup)', () => {
    // Lodash `upperFirst` (`createCaseFirst` + `stringToArray`) upper-cases
    // the whole first grapheme cluster, so a letter joined to an emoji by
    // ZWJ is capitalised; a code-point split left it lowercase.
    expect(startCase('👋‍ﬂ')).toBe('👋‍FL');
    expect(startCase('🇺🇸‍a')).toBe('🇺🇸‍A');
    expect(startCase('👋‍a')).toBe('👋‍A');
    expect(startCase('❤️‍a')).toBe('❤️‍A');
    expect(startCase('🏽‍a')).toBe('🏽‍A');
    expect(startCase('👋‍é')).toBe('👋‍E');
    // `ß` deburrs to `ss` before splitting; the cluster's `s` is upper-cased.
    expect(startCase('🏽‍ß')).toBe('🏽‍S S');
    expect(startCase('👋‍ß')).toBe('👋‍S S');
    expect(startCase('🇺🇸‍ß')).toBe('🇺🇸‍S S');
    // A pure ZWJ emoji sequence has no letter and is unchanged.
    expect(startCase('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
    expect(startCase('👋‍ﬂ 👋‍a')).toBe('👋‍FL 👋‍A');
    expect(startCase('x 👋‍ﬂ')).toBe('X 👋‍FL');
  });
});

describe('getFormDisplayLabel (official formBuilderV1LabelUtils)', () => {
  it('applies the acronym map and letter-number merging for display labels', () => {
    expect(getFormDisplayLabel('baseUrl')).toBe('Base URL');
    expect(getFormDisplayLabel('maxResponseChars')).toBe('Max Response Chars');
    expect(getFormDisplayLabel('s3Config')).toBe('S3 Config');
    expect(getFormDisplayLabel('oauth2Config')).toBe('OAuth 2 Config');
    expect(getFormDisplayLabel('apiKey')).toBe('API Key');
    expect(getFormDisplayLabel('oAuthToken')).toBe('OAuth Token');
    expect(getFormDisplayLabel('oauthConfig')).toBe('OAuth Config');
    expect(getFormDisplayLabel('dbtConfigSource')).toBe('dbt Config Source');
    expect(getFormDisplayLabel('DBT Cloud Config')).toBe('dbt Cloud Config');
    expect(getFormDisplayLabel('DBT S3 Config')).toBe('dbt S3 Config');
  });

  it('keeps all-caps words per lodash (pin parity, not the old D behaviour)', () => {
    expect(getFormDisplayLabel('FOO_BAR')).toBe('FOO BAR');
    expect(getFormDisplayLabel('XMLHttpRequest')).toBe('XML Http Request');
    expect(getFormDisplayLabel('FOO')).toBe('FOO');
    expect(getFormDisplayLabel('x509Certificate')).toBe('X509 Certificate');
    expect(getFormDisplayLabel('hostPort')).toBe('Host Port');
    expect(getFormDisplayLabel('supportsMetadataExtraction')).toBe(
      'Supports Metadata Extraction',
    );
    expect(getFormDisplayLabel('connection_options')).toBe(
      'Connection Options',
    );
    expect(getFormDisplayLabel('')).toBe('');
  });
});

describe('capitalize (lodash 4.18.1)', () => {
  it('capitalizes with the rest lowercased', () => {
    // Vectors moved from accessText.test.ts (same expectations; the
    // definition now lives here, `accessText.ts` is deleted).
    expect(capitalize('allow')).toBe('Allow');
    expect(capitalize('DENY')).toBe('Deny');
    expect(capitalize('')).toBe('');
    expect(capitalize('TRUE')).toBe('True');
    expect(capitalize('API')).toBe('Api');
    expect(capitalize('Obrien')).toBe('Obrien');
  });

  it('upper-cases an astral first letter like lodash upperFirst', () => {
    // The old `charAt(0)` spelling could not upper-case a lone surrogate;
    // `upperFirst` splits by grapheme cluster (see `startCase` above).
    expect(capitalize('𐐷')).toBe('𐐏');
  });
});

describe('workflow edge labels (pin StraightEdge.tsx:85-87)', () => {
  // Pin: `startCase(label).split(' ').map(capitalize).join(' ')`.
  // `WorkflowStraightEdge.vue` transcribes this formula; these vectors lock
  // the composed behaviour at the shared helpers (no component test exists
  // for the edge label itself).
  const formatEdgeLabel = (label: string): string =>
    startCase(label).split(' ').map(capitalize).join(' ');

  it.each([
    ['TRUE', 'True'],
    ['FALSE', 'False'],
    ['approve', 'Approve'],
    ['reject', 'Reject'],
    ['highQuality', 'High Quality'],
    ['needsImprovement', 'Needs Improvement'],
    ['GOLD', 'Gold'],
    ['APIReady', 'Api Ready'],
    ["o'brien", 'Obrien'],
    ['王小明', '王小明'],
    ['DBT S3 Config', 'Dbt S 3 Config'],
    ['1st', '1st'],
  ])('formats edge label %j as %j', (input, expected) => {
    expect(formatEdgeLabel(input)).toBe(expected);
  });
});
