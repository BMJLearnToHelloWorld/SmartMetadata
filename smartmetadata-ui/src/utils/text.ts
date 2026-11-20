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
 * Shared text helpers: the single home of `startCase`,
 * `getFormDisplayLabel` and `capitalize`.
 *
 * The pin renders these labels with lodash `startCase` (lodash 4.18.1,
 * `openmetadata-ui/.../package.json:157`); the product carries no lodash
 * dependency, so this module reimplements exactly the behaviour the pin
 * relies on. The word splitter is a verbatim port of lodash's `words`
 * dispatch (`words.js` / `_unicodeWords.js` / `_asciiWords.js` /
 * `_hasUnicodeWord.js`, MIT): strings containing a unicode word go
 * through the unicode word regex (which keeps CJK/Greek/Cyrillic/
 * Latin Extended-B letters, ligatures and emoji as words, and keeps
 * ordinal forms such as `1st` intact); plain ASCII strings go through
 * the ASCII word regex. It replaced the earlier ASCII-only
 * `WORD_PATTERN` (C group), which dropped every letter outside
 * ASCII + U+00C0–U+017F — a visible regression for non-Latin display
 * names (`王小明` rendered as `''`). See MAJOR1-BENCHMARK.md.
 *
 * Preprocessing follows lodash `createCompounder` verbatim:
 * `words(deburr(string).replace(reApos, ''))` — Latin letters are
 * deburred (mapping ported from lodash 4.18.1 `deburr`, MIT) and
 * apostrophes (ASCII and U+2019) are stripped before splitting, so
 * display names such as `o'brien` and `café` match lodash
 * (`Obrien`, `Cafe`). All-caps words keep their casing
 * (`FOO_BAR` -> `FOO BAR`, `XMLHttpRequest` -> `XML Http Request`).
 */

/**
 * Latin-1 Supplement + Latin Extended-A letters mapped to basic Latin
 * (lodash 4.18.1 `_deburrLetter` table, MIT). Characters outside this
 * table are either plain ASCII or handled by combining-mark stripping.
 */
const DEBURRED_LETTERS: Readonly<Record<string, string>> = {
  '\u00c0': 'A',
  '\u00c1': 'A',
  '\u00c2': 'A',
  '\u00c3': 'A',
  '\u00c4': 'A',
  '\u00c5': 'A',
  '\u00c6': 'Ae',
  '\u00c7': 'C',
  '\u00c8': 'E',
  '\u00c9': 'E',
  '\u00ca': 'E',
  '\u00cb': 'E',
  '\u00cc': 'I',
  '\u00cd': 'I',
  '\u00ce': 'I',
  '\u00cf': 'I',
  '\u00d0': 'D',
  '\u00d1': 'N',
  '\u00d2': 'O',
  '\u00d3': 'O',
  '\u00d4': 'O',
  '\u00d5': 'O',
  '\u00d6': 'O',
  '\u00d8': 'O',
  '\u00d9': 'U',
  '\u00da': 'U',
  '\u00db': 'U',
  '\u00dc': 'U',
  '\u00dd': 'Y',
  '\u00de': 'Th',
  '\u00df': 'ss',
  '\u00e0': 'a',
  '\u00e1': 'a',
  '\u00e2': 'a',
  '\u00e3': 'a',
  '\u00e4': 'a',
  '\u00e5': 'a',
  '\u00e6': 'ae',
  '\u00e7': 'c',
  '\u00e8': 'e',
  '\u00e9': 'e',
  '\u00ea': 'e',
  '\u00eb': 'e',
  '\u00ec': 'i',
  '\u00ed': 'i',
  '\u00ee': 'i',
  '\u00ef': 'i',
  '\u00f0': 'd',
  '\u00f1': 'n',
  '\u00f2': 'o',
  '\u00f3': 'o',
  '\u00f4': 'o',
  '\u00f5': 'o',
  '\u00f6': 'o',
  '\u00f8': 'o',
  '\u00f9': 'u',
  '\u00fa': 'u',
  '\u00fb': 'u',
  '\u00fc': 'u',
  '\u00fd': 'y',
  '\u00fe': 'th',
  '\u00ff': 'y',
  '\u0100': 'A',
  '\u0101': 'a',
  '\u0102': 'A',
  '\u0103': 'a',
  '\u0104': 'A',
  '\u0105': 'a',
  '\u0106': 'C',
  '\u0107': 'c',
  '\u0108': 'C',
  '\u0109': 'c',
  '\u010a': 'C',
  '\u010b': 'c',
  '\u010c': 'C',
  '\u010d': 'c',
  '\u010e': 'D',
  '\u010f': 'd',
  '\u0110': 'D',
  '\u0111': 'd',
  '\u0112': 'E',
  '\u0113': 'e',
  '\u0114': 'E',
  '\u0115': 'e',
  '\u0116': 'E',
  '\u0117': 'e',
  '\u0118': 'E',
  '\u0119': 'e',
  '\u011a': 'E',
  '\u011b': 'e',
  '\u011c': 'G',
  '\u011d': 'g',
  '\u011e': 'G',
  '\u011f': 'g',
  '\u0120': 'G',
  '\u0121': 'g',
  '\u0122': 'G',
  '\u0123': 'g',
  '\u0124': 'H',
  '\u0125': 'h',
  '\u0126': 'H',
  '\u0127': 'h',
  '\u0128': 'I',
  '\u0129': 'i',
  '\u012a': 'I',
  '\u012b': 'i',
  '\u012c': 'I',
  '\u012d': 'i',
  '\u012e': 'I',
  '\u012f': 'i',
  '\u0130': 'I',
  '\u0131': 'i',
  '\u0132': 'IJ',
  '\u0133': 'ij',
  '\u0134': 'J',
  '\u0135': 'j',
  '\u0136': 'K',
  '\u0137': 'k',
  '\u0138': 'k',
  '\u0139': 'L',
  '\u013a': 'l',
  '\u013b': 'L',
  '\u013c': 'l',
  '\u013d': 'L',
  '\u013e': 'l',
  '\u013f': 'L',
  '\u0140': 'l',
  '\u0141': 'L',
  '\u0142': 'l',
  '\u0143': 'N',
  '\u0144': 'n',
  '\u0145': 'N',
  '\u0146': 'n',
  '\u0147': 'N',
  '\u0148': 'n',
  '\u0149': "'n",
  '\u014a': 'N',
  '\u014b': 'n',
  '\u014c': 'O',
  '\u014d': 'o',
  '\u014e': 'O',
  '\u014f': 'o',
  '\u0150': 'O',
  '\u0151': 'o',
  '\u0152': 'Oe',
  '\u0153': 'oe',
  '\u0154': 'R',
  '\u0155': 'r',
  '\u0156': 'R',
  '\u0157': 'r',
  '\u0158': 'R',
  '\u0159': 'r',
  '\u015a': 'S',
  '\u015b': 's',
  '\u015c': 'S',
  '\u015d': 's',
  '\u015e': 'S',
  '\u015f': 's',
  '\u0160': 'S',
  '\u0161': 's',
  '\u0162': 'T',
  '\u0163': 't',
  '\u0164': 'T',
  '\u0165': 't',
  '\u0166': 'T',
  '\u0167': 't',
  '\u0168': 'U',
  '\u0169': 'u',
  '\u016a': 'U',
  '\u016b': 'u',
  '\u016c': 'U',
  '\u016d': 'u',
  '\u016e': 'U',
  '\u016f': 'u',
  '\u0170': 'U',
  '\u0171': 'u',
  '\u0172': 'U',
  '\u0173': 'u',
  '\u0174': 'W',
  '\u0175': 'w',
  '\u0176': 'Y',
  '\u0177': 'y',
  '\u0178': 'Y',
  '\u0179': 'Z',
  '\u017a': 'z',
  '\u017b': 'Z',
  '\u017c': 'z',
  '\u017d': 'Z',
  '\u017e': 'z',
  '\u017f': 's',
};

/** Latin Unicode letters (excluding mathematical operators). */
const RE_LATIN = /[\xc0-\xd6\xd8-\xf6\xf8-\xff\u0100-\u017f]/g;

/** Combining diacritical marks (including half marks and symbol marks). */
const RE_COMBO_MARK = /[\u0300-\u036f\ufe20-\ufe2f\u20d0-\u20ff]/g;

/** Lodash `deburr`: Latin letters to basic Latin, combining marks removed. */
function deburr(value: string): string {
  return value
    .replace(RE_LATIN, (ch) => DEBURRED_LETTERS[ch] ?? ch)
    .replace(RE_COMBO_MARK, '');
}

/** Apostrophes lodash `createCompounder` strips before splitting. */
const RE_APOS = /['\u2019]/g;

/**
 * Lodash `words` (4.18.1), ported verbatim from `words.js` /
 * `_unicodeWords.js` / `_asciiWords.js` / `_hasUnicodeWord.js` (MIT).
 * The character classes below are lodash's `rs*` fragments, renamed
 * unchanged; the composed `RE_UNICODE_WORD` is lodash's `reUnicodeWord`.
 * `String.match` with a global regex resets `lastIndex` per call, so the
 * module-level regexes are safe to reuse exactly as lodash reuses them.
 */

/** Used to compose unicode character classes. */
const RS_ASTRAL_RANGE = '\\ud800-\\udfff';
const RS_COMBO_MARKS_RANGE = '\\u0300-\\u036f';
const RS_COMBO_HALF_MARKS_RANGE = '\\ufe20-\\ufe2f';
const RS_COMBO_SYMBOLS_RANGE = '\\u20d0-\\u20ff';
const RS_COMBO_RANGE =
  RS_COMBO_MARKS_RANGE + RS_COMBO_HALF_MARKS_RANGE + RS_COMBO_SYMBOLS_RANGE;
const RS_DINGBAT_RANGE = '\\u2700-\\u27bf';
const RS_LOWER_RANGE = 'a-z\\xdf-\\xf6\\xf8-\\xff';
const RS_MATH_OP_RANGE = '\\xac\\xb1\\xd7\\xf7';
const RS_NON_CHAR_RANGE = '\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf';
const RS_PUNCTUATION_RANGE = '\\u2000-\\u206f';
const RS_SPACE_RANGE =
  ' \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000';
const RS_UPPER_RANGE = 'A-Z\\xc0-\\xd6\\xd8-\\xde';
const RS_VAR_RANGE = '\\ufe0e\\ufe0f';
const RS_BREAK_RANGE =
  RS_MATH_OP_RANGE + RS_NON_CHAR_RANGE + RS_PUNCTUATION_RANGE + RS_SPACE_RANGE;

/** Used to compose unicode capture groups. */
const RS_APOS = "['\\u2019]";
const RS_BREAK = '[' + RS_BREAK_RANGE + ']';
const RS_COMBO = '[' + RS_COMBO_RANGE + ']';
const RS_DIGITS = '\\d+';
const RS_DINGBAT = '[' + RS_DINGBAT_RANGE + ']';
const RS_LOWER = '[' + RS_LOWER_RANGE + ']';
const RS_MISC =
  '[^' +
  RS_ASTRAL_RANGE +
  RS_BREAK_RANGE +
  RS_DIGITS +
  RS_DINGBAT_RANGE +
  RS_LOWER_RANGE +
  RS_UPPER_RANGE +
  ']';
const RS_FITZ = '\\ud83c[\\udffb-\\udfff]';
const RS_MODIFIER = '(?:' + RS_COMBO + '|' + RS_FITZ + ')';
const RS_NON_ASTRAL = '[^' + RS_ASTRAL_RANGE + ']';
const RS_REGIONAL = '(?:\\ud83c[\\udde6-\\uddff]){2}';
const RS_SURR_PAIR = '[\\ud800-\\udbff][\\udc00-\\udfff]';
const RS_UPPER = '[' + RS_UPPER_RANGE + ']';
const RS_ZWJ = '\\u200d';
/** Lodash `_unicodeToArray` (4.18.1): a single astral code point. */
const RS_ASTRAL = '[' + RS_ASTRAL_RANGE + ']';

/** Used to compose unicode regexes. */
const RS_MISC_LOWER = '(?:' + RS_LOWER + '|' + RS_MISC + ')';
const RS_MISC_UPPER = '(?:' + RS_UPPER + '|' + RS_MISC + ')';
const RS_OPT_CONTR_LOWER =
  '(?:' + RS_APOS + '(?:d|ll|m|re|s|t|ve))?';
const RS_OPT_CONTR_UPPER =
  '(?:' + RS_APOS + '(?:D|LL|M|RE|S|T|VE))?';
const RS_OPT_MOD = RS_MODIFIER + '?';
const RS_OPT_VAR = '[' + RS_VAR_RANGE + ']?';
const RS_OPT_JOIN =
  '(?:' +
  RS_ZWJ +
  '(?:' +
  [RS_NON_ASTRAL, RS_REGIONAL, RS_SURR_PAIR].join('|') +
  ')' +
  RS_OPT_VAR +
  RS_OPT_MOD +
  ')*';
const RS_ORD_LOWER = '\\d*(?:1st|2nd|3rd|(?![123])\\dth)(?=\\b|[A-Z_])';
const RS_ORD_UPPER = '\\d*(?:1ST|2ND|3RD|(?![123])\\dTH)(?=\\b|[a-z_])';
const RS_SEQ = RS_OPT_VAR + RS_OPT_MOD + RS_OPT_JOIN;
const RS_EMOJI =
  '(?:' + [RS_DINGBAT, RS_REGIONAL, RS_SURR_PAIR].join('|') + ')' + RS_SEQ;

/** Lodash `_unicodeToArray` (4.18.1): one grapheme cluster. */
const RS_SYMBOL =
  '(?:' +
  [
    RS_NON_ASTRAL + RS_COMBO + '?',
    RS_COMBO,
    RS_REGIONAL,
    RS_SURR_PAIR,
    RS_ASTRAL,
  ].join('|') +
  ')';

/** Lodash `_unicodeToArray` (4.18.1): `reUnicode` — matches grapheme clusters, ZWJ sequences included. */
const RE_UNICODE = new RegExp(
  RS_FITZ + '(?=' + RS_FITZ + ')|' + RS_SYMBOL + RS_SEQ,
  'g',
);

/** Lodash `_hasUnicode` (4.18.1): ZWJ, astral points, combining marks or variation selectors. */
const RE_HAS_UNICODE = new RegExp(
  '[' + RS_ZWJ + RS_ASTRAL_RANGE + RS_COMBO_RANGE + RS_VAR_RANGE + ']',
);

/** Used to match complex or compound words. */
const RE_UNICODE_WORD = new RegExp(
  [
    RS_UPPER +
      '?' +
      RS_LOWER +
      '+' +
      RS_OPT_CONTR_LOWER +
      '(?=' +
      [RS_BREAK, RS_UPPER, '$'].join('|') +
      ')',
    RS_MISC_UPPER +
      '+' +
      RS_OPT_CONTR_UPPER +
      '(?=' +
      [RS_BREAK, RS_UPPER + RS_MISC_LOWER, '$'].join('|') +
      ')',
    RS_UPPER + '?' + RS_MISC_LOWER + '+' + RS_OPT_CONTR_LOWER,
    RS_UPPER + '+' + RS_OPT_CONTR_UPPER,
    RS_ORD_UPPER,
    RS_ORD_LOWER,
    RS_DIGITS,
    RS_EMOJI,
  ].join('|'),
  'g',
);

/** Used to detect strings that need a more robust regexp to match words. */
const RE_HAS_UNICODE_WORD =
  /[a-z][A-Z]|[A-Z]{2}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;

/** Used to match words composed of alphanumeric characters. */
const RE_ASCII_WORD = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;

/** Lodash `words`: split into words, unicode-aware when needed. */
function splitWords(value: string): string[] {
  return RE_HAS_UNICODE_WORD.test(value)
    ? value.match(RE_UNICODE_WORD) ?? []
    : value.match(RE_ASCII_WORD) ?? [];
}

/**
 * Lodash `stringToArray` (4.18.1, `_stringToArray.js` /
 * `_unicodeToArray.js` / `_asciiToArray.js`, MIT): split a string into
 * grapheme clusters — a ZWJ sequence (emoji + ZWJ + letter) stays one
 * symbol — falling back to per-code-unit split for plain strings.
 * `String.match` with a global regex resets `lastIndex` per call, so
 * the module-level regex is safe to reuse exactly as lodash reuses it.
 */
function stringToArray(value: string): string[] {
  return RE_HAS_UNICODE.test(value)
    ? value.match(RE_UNICODE) ?? []
    : value.split('');
}

/**
 * Lodash `upperFirst` (4.18.1, `_createCaseFirst.js`, MIT): the first
 * grapheme cluster is upper-cased as a whole — `stringToArray` splits
 * by grapheme cluster (ZWJ sequences included), so a cluster that
 * starts with a caseless symbol and continues with a letter (e.g.
 * `👋‍ﬂ`) upper-cases the letter inside the cluster (`👋‍FL`), and an
 * astral-plane lowercase letter (e.g. Deseret `𐐷` U+10437) upper-cases
 * correctly instead of being split into lone surrogates by
 * `charAt(0)`.
 */
function upperFirst(word: string): string {
  const strSymbols = RE_HAS_UNICODE.test(word)
    ? stringToArray(word)
    : undefined;
  const first = strSymbols ? strSymbols[0] : word.charAt(0);
  if (first === undefined) {
    return word;
  }
  const trailing = strSymbols ? strSymbols.slice(1).join('') : word.slice(1);
  return first.toUpperCase() + trailing;
}

/**
 * Lodash `capitalize` (4.18.1, `capitalize.js`, MIT): lower-case the whole
 * string, then `upperFirst` it — the first grapheme cluster is upper-cased
 * as a whole (see `upperFirst`), the rest lower-cased. Pin uses it after
 * `startCase` for workflow edge labels (`StraightEdge.tsx:85-87`) and for
 * services tabs (`ServicesPage.tsx:109`).
 */
export function capitalize(value: string): string {
  return upperFirst(value.toLowerCase());
}

/**
 * Lodash `startCase` (4.18.1): split on word boundaries, capitalize each
 * word's first letter, join with a single space. The rest of each word
 * keeps its casing (`CREATE` -> `CREATE`;
 * `storedProcedure` -> `Stored Procedure`). Non-Latin words are kept
 * whole (`王小明` -> `王小明`), ordinals stay intact (`1st` -> `1st`).
 */
export function startCase(value: string): string {
  const words = splitWords(deburr(value).replace(RE_APOS, ''));
  return words.map(upperFirst).join(' ');
}

const FORM_LABEL_ACRONYMS: Record<string, string> = {
  api: 'API',
  arn: 'ARN',
  aws: 'AWS',
  dbt: 'dbt',
  gcp: 'GCP',
  gcs: 'GCS',
  iam: 'IAM',
  id: 'ID',
  jdbc: 'JDBC',
  jwt: 'JWT',
  odbc: 'ODBC',
  oidc: 'OIDC',
  s3: 'S3',
  saml: 'SAML',
  sql: 'SQL',
  ssh: 'SSH',
  ssl: 'SSL',
  uri: 'URI',
  url: 'URL',
};

/** Official getFormDisplayLabel (formBuilderV1LabelUtils.ts). */
export function getFormDisplayLabel(value: string): string {
  const tokens = startCase(value).split(' ');
  const merged = tokens.reduce<string[]>((acc, token) => {
    const previous = acc[acc.length - 1];
    if (previous && /^[0-9]+$/.test(token) && /^[A-Z]{1,3}$/.test(previous)) {
      acc[acc.length - 1] = `${previous}${token}`;
      return acc;
    }
    acc.push(token);
    return acc;
  }, []);
  return merged
    .map((token) => FORM_LABEL_ACRONYMS[token.toLowerCase()] ?? token)
    .join(' ')
    .replace(/\bO Auth\b/g, 'OAuth')
    .replace(/\bOauth\b/g, 'OAuth');
}
