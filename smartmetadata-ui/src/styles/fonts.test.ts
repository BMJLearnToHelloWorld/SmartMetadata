/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const fontsCss = readFileSync(join(here, 'fonts.css'), 'utf8');
const mainTs = readFileSync(join(here, '../main.ts'), 'utf8');
const packageJson = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

describe('variable webfonts (R8)', () => {
  it('registers Inter variable under Inter and Geist Mono variable under Geist Mono', () => {
    expect(fontsCss).toContain("font-family: 'Inter'");
    expect(fontsCss).toContain("font-family: 'Geist Mono'");
    expect(fontsCss).toContain('font-weight: 100 900');
    expect(fontsCss).toContain('font-display: swap');
    expect(fontsCss).toContain('inter-latin-wght-normal.woff2');
    expect(fontsCss).toContain('geist-mono-latin-wght-normal.woff2');
  });

  it('loads the font files from the installed fontsource packages wired in main.ts', () => {
    expect(mainTs).toContain("import './styles/fonts.css'");
    expect(packageJson.dependencies['@fontsource-variable/inter']).toBe('^5.3.0');
    expect(packageJson.dependencies['@fontsource-variable/geist-mono']).toBe('^5.3.0');
    for (const file of [
      'inter-latin-wght-normal.woff2',
      'inter-cyrillic-ext-wght-normal.woff2',
      'geist-mono-latin-wght-normal.woff2',
      'geist-mono-latin-ext-wght-normal.woff2',
    ]) {
      const pkg = file.startsWith('geist')
        ? '@fontsource-variable/geist-mono'
        : '@fontsource-variable/inter';
      expect(
        existsSync(join(here, '../../node_modules', pkg, 'files', file)),
      ).toBe(true);
    }
  });
});
