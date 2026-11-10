/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Curated-assets rule, ported from the official framework
 * (openmetadata-ui `utils/curatedRule.ts`).
 *
 * ADR:2026-11-08-my-data-curated-assets
 */

export interface CuratedRuleClause {
  /** i18n key naming the field, e.g. `label.tier`. */
  labelKey: string;
  /** Search keyword field the clause filters on. */
  termKey: string;
  /** Raw value as stored in the index, e.g. `Tier.Tier1`. */
  termValue: string;
  /** What the chip shows for the value — the tag's leaf, not its FQN. */
  displayValue: string;
}

export type CuratedRule = CuratedRuleClause[];

/**
 * The rule the card filters by when its layout entry carries no saved config.
 *
 * An admin who opens `CuratedAssetsModal` from the persona editor saves an
 * advanced filter onto the widget's entry, and that wins (see
 * `CuratedAssetsSource`). This is the out-of-the-box rule for a widget
 * nobody has configured yet — the chips and the query are both derived from it.
 */
export const DEFAULT_CURATED_RULE: CuratedRule = [
  {
    displayValue: 'Tier1',
    labelKey: 'label.tier',
    termKey: 'tier.tagFQN',
    termValue: 'Tier.Tier1',
  },
  {
    displayValue: 'Gold',
    labelKey: 'label.certification',
    termKey: 'certification.tagLabel.tagFQN',
    termValue: 'Certification.Gold',
  },
];

/** Every clause must match, so the rule reads as an AND across its chips. */
export function buildCuratedQueryFilter(rule: CuratedRule): Record<string, unknown> {
  return {
    query: {
      bool: {
        must: rule.map((clause) => ({
          term: { [clause.termKey]: clause.termValue },
        })),
      },
    },
  };
}

/** One clause as a phrase, e.g. "Tier is Tier1" — one key, so a locale owns the word order. */
export function describeCuratedClause(
  clause: CuratedRuleClause,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  return t('message.field-is-value', {
    field: t(clause.labelKey),
    value: clause.displayValue,
  });
}

/**
 * The whole rule as one phrase — "Tier is Tier1 and Certification is Gold" —
 * joined by `Intl.ListFormat`, so the conjunction and the comma rules come
 * from the reader's locale rather than a hardcoded `', '`.
 */
export function describeCuratedRule(
  rule: CuratedRule,
  t: (key: string, params?: Record<string, unknown>) => string,
  language: string,
): string {
  return new Intl.ListFormat(language, { style: 'long', type: 'conjunction' }).format(
    rule.map((clause) => describeCuratedClause(clause, t)),
  );
}
