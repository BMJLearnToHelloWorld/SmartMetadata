/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const PACKAGE_ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SRC_ROOT = join(PACKAGE_ROOT, 'src');

const BANNED = [
  'openmetadata-mcp',
  'org.openmetadata.mcp',
  '@openmetadata/mcp',
  'openmetadata/mcp',
];

function walk(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(path);
    }
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('CCL MCP boundary', () => {
  it('does not import or depend on official openmetadata-mcp', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      name?: string;
    };
    const depNames = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
      pkg.name ?? '',
    ];
    expect(depNames).not.toContain('openmetadata-mcp');
    expect(depNames.some((name) => name.includes('openmetadata-mcp') && name !== 'smartmetadata-mcp')).toBe(
      false,
    );

    const hits: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const text = readFileSync(file, 'utf8');
      for (const marker of BANNED) {
        if (text.includes(marker)) {
          hits.push(`${relative(PACKAGE_ROOT, file)}: ${marker}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });

  it('ships an Apache-2.0 LICENSE', () => {
    const license = readFileSync(join(PACKAGE_ROOT, 'LICENSE'), 'utf8');
    expect(license).toContain('Apache License');
    expect(license.toLowerCase()).not.toContain('collate community license');
  });
});
