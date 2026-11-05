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
 * Governance / test-case version paths, mirroring the official
 * utils/RouterUtils.ts builders (getDomainVersionsPath,
 * getGlossaryVersionsPath, getGlossaryTermsVersionsPath,
 * getClassificationVersionsPath, getTestCaseVersionPath) and the
 * official constants (DOMAIN_VERSION, GLOSSARY_VERSION,
 * GLOSSARY_TERMS_VERSION[_TAB], TAG_VERSION, TEST_CASE_VERSION
 * [_WITH_TAB], all containing :version).
 *
 * One product-side deviation, recorded not hidden: official builders
 * take the domain / classification / test-case FQN and the glossary /
 * term id, while the product detail routes are all :id routes, so
 * these builders take the same :id the detail page already carries.
 * The :version segment and the snapshot semantics are the official
 * ones; the identifier is the product detail route's own.
 *
 * Route names are listed for the parent merge (router/index.ts is
 * merged by hand, not edited by this group):
 *  governance-domain-version, governance-glossary-version,
 *  governance-term-version, governance-term-version-tab,
 *  governance-classification-version, quality-test-case-version,
 *  quality-test-case-version-tab.
 */
export type GovernanceVersionKind = 'domain' | 'glossary' | 'term' | 'classification' | 'testCase';

export function getDomainVersionPath(id: string, version: string): string {
  return `/governance/domains/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`;
}

export function getGlossaryVersionPath(id: string, version: string): string {
  return `/governance/glossaries/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`;
}

export function getGlossaryTermVersionPath(id: string, version: string, tab?: string): string {
  const base = `/governance/terms/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`;
  return tab ? `${base}/${encodeURIComponent(tab)}` : base;
}

export function getClassificationVersionPath(id: string, version: string): string {
  return `/governance/classifications/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`;
}

export function getTestCaseVersionPath(id: string, version: string, tab?: string): string {
  const base = `/quality/test-cases/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`;
  return tab ? `${base}/${encodeURIComponent(tab)}` : base;
}

export function getGovernanceVersionPath(kind: GovernanceVersionKind, id: string, version: string, tab?: string): string {
  switch (kind) {
    case 'domain':
      return getDomainVersionPath(id, version);
    case 'glossary':
      return getGlossaryVersionPath(id, version);
    case 'term':
      return getGlossaryTermVersionPath(id, version, tab);
    case 'classification':
      return getClassificationVersionPath(id, version);
    case 'testCase':
      return getTestCaseVersionPath(id, version, tab);
  }
}

export function getGovernanceDetailPath(kind: GovernanceVersionKind, id: string): string {
  switch (kind) {
    case 'domain':
      return `/governance/domains/${encodeURIComponent(id)}`;
    case 'glossary':
      return `/governance/glossaries/${encodeURIComponent(id)}`;
    case 'term':
      return `/governance/terms/${encodeURIComponent(id)}`;
    case 'classification':
      return `/governance/classifications/${encodeURIComponent(id)}`;
    case 'testCase':
      return `/quality/test-cases/${encodeURIComponent(id)}`;
  }
}
