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
import { getSanitizeContent } from './sanitizeContent';

describe('getSanitizeContent', () => {
  it('strips event handlers and script tags', () => {
    expect(getSanitizeContent('<p onclick="evil()">x</p>')).toBe('<p>x</p>');
    expect(getSanitizeContent('<p>x</p><script>alert(1)</script>')).toBe('<p>x</p>');
    expect(getSanitizeContent('<img src="x" onerror="evil()">')).toBe('<img src="x">');
  });

  it('preserves entity links verbatim, including $ in values', () => {
    const link = '<#E::user::john$doe|[John $](https://example.com/users/john)>';
    expect(getSanitizeContent(`<p>${link}</p>`)).toBe(`<p>${link}</p>`);
  });

  it('preserves multiple entity links in order', () => {
    const a = '<#E::user::a|[A](/users/a)>';
    const b = '<#E::team::b|[B](/settings/members/teams/b)>';
    expect(getSanitizeContent(`<p>${a} and ${b}</p>`)).toBe(`<p>${a} and ${b}</p>`);
  });

  it('allowlist the math-equation tag and its attributes', () => {
    const out = getSanitizeContent(
      '<block-math-equation math_equation="x^2" isediting="true"></block-math-equation>',
    );
    expect(out).toContain('block-math-equation');
    expect(out).toContain('math_equation="x^2"');
  });

  it('does not let nested payloads bypass via the math-equation tag', () => {
    const out = getSanitizeContent(
      '<block-math-equation><img src="x" onerror="evil()"></block-math-equation>',
    );
    expect(out).not.toContain('onerror');
  });

  it('survives placeholder-shaped user text', () => {
    const shaped = '__OM_ENTITY_LINK_abc_0__';
    expect(getSanitizeContent(`<p>${shaped}</p>`)).toContain(shaped);
  });
});
