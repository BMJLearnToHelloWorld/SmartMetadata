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
 * Help menu items, mirroring the official HELP_ITEMS structure
 * (constants/Navbar.constants.ts): tour, docs, API, Slack, version.
 * External URLs are the official constants (URL.constants.ts).
 * Tour and API are internal routes this console does not have, so
 * they render as disabled residual items rather than dead links.
 */
export interface HelpItem {
  key: 'tour' | 'docs' | 'api' | 'slack' | 'version';
  labelKey: string;
  href?: string;
  external?: boolean;
  residualKey?: string;
}

export const HELP_DOCS_URL = 'https://docs.open-metadata.org/';
export const HELP_SLACK_URL = 'https://slack.open-metadata.org';
export const HELP_RELEASE_URL_TEMPLATE = 'https://open-metadata.org/product-updates#{{currentVersion}}';

export function helpItems(version?: string): HelpItem[] {
  return [
    { key: 'tour', labelKey: 'chrome.helpTour', residualKey: 'chrome.helpTourResidual' },
    { key: 'docs', labelKey: 'chrome.helpDocs', href: HELP_DOCS_URL, external: true },
    { key: 'api', labelKey: 'chrome.helpApi', residualKey: 'chrome.helpApiResidual' },
    { key: 'slack', labelKey: 'chrome.helpSlack', href: HELP_SLACK_URL, external: true },
    {
      key: 'version',
      labelKey: 'chrome.helpVersion',
      href: HELP_RELEASE_URL_TEMPLATE.replace('{{currentVersion}}', version ?? ''),
      external: true,
    },
  ];
}
