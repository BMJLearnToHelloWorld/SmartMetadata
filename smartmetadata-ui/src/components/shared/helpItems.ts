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
 * Items with an internal route navigate to it; items with neither a
 * link nor a route render as disabled (no such item remains: tour now routes)
 * residual items rather than dead links.
 */
export interface HelpItem {
  key: 'tour' | 'docs' | 'api' | 'slack' | 'version';
  labelKey: string;
  href?: string;
  external?: boolean;
  routeName?: string;
  residualKey?: string;
}

export const HELP_DOCS_URL = 'https://docs.open-metadata.org/';
export const HELP_SLACK_URL = 'https://slack.open-metadata.org';
export const HELP_RELEASE_URL_TEMPLATE = 'https://open-metadata.org/product-updates#{{currentVersion}}';

export function helpItems(version?: string): HelpItem[] {
  return [
    { key: 'tour', labelKey: 'chrome.helpTour', routeName: 'tour' },
    { key: 'docs', labelKey: 'chrome.helpDocs', href: HELP_DOCS_URL, external: true },
    // B5-5: the API reference is an internal route now, not a residual.
    { key: 'api', labelKey: 'chrome.helpApi', routeName: 'docs' },
    { key: 'slack', labelKey: 'chrome.helpSlack', href: HELP_SLACK_URL, external: true },
    {
      key: 'version',
      labelKey: 'chrome.helpVersion',
      href: HELP_RELEASE_URL_TEMPLATE.replace('{{currentVersion}}', version ?? ''),
      external: true,
    },
  ];
}
