/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { PersonaPreferences } from '@/types/persona';

/**
 * Landing-page header colour, ported from the official framework
 * (openmetadata-ui `components/MyData/HomeLandingPage/landingPageHeaderColor.ts`
 * + `constants/Mydata.constants.ts`).
 *
 * The colour is written by the customize page into the document's
 * `personPreferences` (the current user's own choice for the persona)
 * and resolved own-choice-first, then the persona admin's
 * `personaPreferences`. It is previewed in the editor modal only:
 * pin has NO production home-page consumer for it, so stage D does
 * not tint the home header (R-G11D-1).
 *
 * ADR:2026-11-10-my-data-customize-page-drag
 */

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// The header keeps its default card's dark text, so a chosen colour is
// laid on as a wash rather than a fill: at these alphas even the darkest
// swatch the Header Theme picker offers stays light enough over the
// card's own surface for the title to keep its contrast, in light and
// dark mode alike. The angle and stop positions follow the default
// gradient so a tinted header reads as the same card in another colour.
const TINT_START_ALPHA = 0.08;
const TINT_END_ALPHA = 0.2;

/** Official default header background (the un-customised gradient). */
export const DEFAULT_HEADER_BG_COLOR =
  'linear-gradient(221.19deg, #0017E4 -17.4%, #3793FF 112.31%)';

/** Official header background swatches, in picker order. */
export const headerBackgroundColors: Array<{ label: string; color: string }> = [
  { label: 'Gray', color: '#535862' },
  { label: 'Green', color: '#099250' },
  { label: 'Blue', color: '#1570EF' },
  { label: 'Indigo', color: '#444CE7' },
  { label: 'Purple', color: '#6938EF' },
  { label: 'Fuchsia', color: '#BA24D5' },
  { label: 'Pink', color: '#DD2590' },
  { label: 'Orange', color: '#E04F16' },
];

function findHeaderColor(
  preferences: PersonaPreferences[] | undefined,
  personaId: string | undefined,
): string | undefined {
  return preferences?.find((preference) => preference.personaId === personaId)
    ?.landingPageSettings?.headerColor;
}

/**
 * The header colour saved for a persona: the user's own choice first,
 * then the one the persona's admin set in the customize page.
 */
export function resolveLandingPageHeaderColor(
  personaId: string | undefined,
  userPreferences: PersonaPreferences[] | undefined,
  personaPreferences: PersonaPreferences[] | undefined,
): string | undefined {
  return personaId
    ? findHeaderColor(userPreferences, personaId) ??
        findHeaderColor(personaPreferences, personaId)
    : undefined;
}

function toRgba(hex: string, alpha: number): string {
  const digits = hex.slice(1);
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  const [r, g, b] = [0, 2, 4].map((at) => Number.parseInt(full.slice(at, at + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Inline background for a header tinted with a saved colour, or
 * `undefined` to keep the default gradient.
 *
 * Only a plain hex colour is honoured. The picker only offers those;
 * anything else is the legacy default — a full `linear-gradient(...)`
 * written for the old saturated header — and means "not customised".
 */
export function getLandingPageHeaderTintStyle(
  color: string | undefined,
): { backgroundImage: string } | undefined {
  return color && HEX_COLOR.test(color)
    ? {
        backgroundImage: `linear-gradient(89deg, ${toRgba(
          color,
          TINT_START_ALPHA,
        )} -2.31%, ${toRgba(color, TINT_END_ALPHA)} 102.64%)`,
      }
    : undefined;
}
