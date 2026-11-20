/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import {
  buildConnectorDocFilePath,
  buildDocFilePaths,
  extractFocusedRequirementsMarkdown,
  fetchServiceDocMarkdown,
  getActiveFieldName,
  getConnectorDocsUrl,
  getDocsServiceType,
  getFieldMarkdown,
  getFieldSchemaForId,
  getFocusedDocDetails,
  getDocPanelServiceType,
  getServiceTypeDisplay,
  getSettledMarkdown,
  getSupportedDocLanguage,
  hasAuthMethodGuidance,
  isUsableMarkdown,
  resolveFocusedSection,
  splitDocMarkdown,
  useFieldFocus,
  type DocFilePaths,
  type DocPanelTranslate,
} from './fieldFocus';

const SCHEMA = {
  properties: {
    hostPort: { title: 'Host and Port', description: 'The host and port.' },
    authType: {
      oneOf: [
        { properties: { password: { title: 'Password', description: 'The password.' } } },
        { properties: { token: { title: 'Token' } } },
      ],
    },
  },
};

describe('getFieldSchemaForId (pin ServiceConnectionUtils)', () => {
  it('resolves root and nested titles/descriptions, including oneOf branches', () => {
    expect(getFieldSchemaForId(SCHEMA, 'root/hostPort')).toEqual({
      title: 'Host and Port',
      description: 'The host and port.',
    });
    expect(getFieldSchemaForId(SCHEMA, 'root/authType/password')).toEqual({
      title: 'Password',
      description: 'The password.',
    });
    expect(getFieldSchemaForId(SCHEMA, 'root/authType__oneof_select')).toEqual({
      title: undefined,
      description: undefined,
    });
    expect(getFieldSchemaForId(SCHEMA, 'root/nope')).toBeUndefined();
  });
});

describe('getActiveFieldName (pin ServiceDocPanel)', () => {
  it('parses RJSF ids: nested fields win, array items resolve to the parent, selects to the base', () => {
    expect(getActiveFieldName('root/hostPort')).toBe('hostPort');
    expect(getActiveFieldName('root/connectionOptions/foo')).toBe('connectionOptions');
    expect(getActiveFieldName('root/items/0')).toBe('items');
    expect(getActiveFieldName('root/authType__oneof_select')).toBe('authType');
    expect(getActiveFieldName('')).toBeUndefined();
    expect(getActiveFieldName()).toBeUndefined();
  });
});

describe('resolveFocusedSection (pin ServiceDocPanel)', () => {
  it('resolves identity, meta section, auth, lineage and scope in pin precedence', () => {
    expect(resolveFocusedSection('serviceName', undefined, false)).toBe('identity');
    expect(resolveFocusedSection('hostPort', 'advanced', false)).toBe('advanced');
    expect(resolveFocusedSection('password', undefined, false)).toBe('authentication');
    expect(resolveFocusedSection('useAccessHistory', undefined, false)).toBe('advanced');
    expect(resolveFocusedSection('databaseName', undefined, false)).toBe('scope');
    expect(resolveFocusedSection('hostPort', undefined, false)).toBe('connection');
    expect(resolveFocusedSection('hostPort', undefined, true)).toBeUndefined();
    expect(resolveFocusedSection(undefined, undefined, false)).toBeUndefined();
  });
});

const MARKDOWN = [
  '# Mysql',
  '$$section',
  '## Host and Port $(id="hostPort")',
  'How to reach the host.',
  '$$section',
  '## Password $(id="password")',
  'Password docs.',
  '$$section',
  '## Private Key $(id="privateKey")',
  'Key docs.',
  '## Requirements',
  'Base requirement.',
  '### Usage & Lineage',
  'Lineage requirement.',
  '### Auto Classification',
  'AC requirement.',
  '## Configuration',
  'Trailing.',
].join('\n');

describe('markdown extraction (pin ServiceDocPanel)', () => {
  it('extracts the focused field section and strips the scaffold', () => {
    expect(getFieldMarkdown(MARKDOWN, 'hostPort')).toBe(
      '## Host and Port\nHow to reach the host.',
    );
    expect(getFieldMarkdown(MARKDOWN, 'authType')).toContain('Password docs.');
    expect(getFieldMarkdown(MARKDOWN, 'authType')).toContain('Key docs.');
    expect(getFieldMarkdown(MARKDOWN, 'missing')).toBe('');
  });

  it('detects dual auth guidance only when both sections exist', () => {
    expect(hasAuthMethodGuidance(MARKDOWN)).toBe(true);
    expect(hasAuthMethodGuidance('$$section\n## Password $(id="password")\nX')).toBe(false);
  });

  it('extracts and relabels the requirements body', () => {
    expect(
      extractFocusedRequirementsMarkdown(MARKDOWN, {
        autoClassification: 'Auto Classification',
        lineage: 'Lineage',
        metadata: 'Metadata',
        profiler: 'Profiler',
      }),
    ).toBe(
      '### Metadata\n\nBase requirement.\n\n### Lineage\nLineage requirement.\n### Auto Classification\nAC requirement.',
    );
    expect(
      extractFocusedRequirementsMarkdown('no requirements here', {
        autoClassification: 'AC',
        lineage: 'L',
        metadata: 'M',
        profiler: 'P',
      }),
    ).toBe('');
  });

  it('picks the connector docs URL for the service, never a workflow doc', () => {
    const content = [
      'See https://docs.open-metadata.org/latest/connectors/ingestion/workflows/metadata',
      'and https://docs.open-metadata.org/latest/connectors/database/mysql for setup.',
    ].join('\n');
    expect(getConnectorDocsUrl(content, 'Mysql')).toBe(
      'https://docs.open-metadata.org/latest/connectors/database/mysql',
    );
    expect(getConnectorDocsUrl('no links', 'Mysql')).toBe('');
  });

  it('displays the service type with a Service suffix unless already present', () => {
    expect(getServiceTypeDisplay('Mysql', 'Service')).toBe('Mysql Service');
    expect(getServiceTypeDisplay('DatabaseService', 'Service')).toBe('Database Service');
  });

  it('maps service kinds to pin SERVICE_TYPE_MAP words (L-1)', () => {
    expect(getDocPanelServiceType('database')).toBe('Database');
    expect(getDocPanelServiceType('dashboard')).toBe('Dashboard');
    expect(getDocPanelServiceType('messaging')).toBe('Messaging');
    expect(getDocPanelServiceType('mlmodel')).toBe('MlModel');
    expect(getDocPanelServiceType('metadata')).toBe('Metadata');
    expect(getDocPanelServiceType('storage')).toBe('Storage');
    expect(getDocPanelServiceType('pipeline')).toBe('Pipeline');
    expect(getDocPanelServiceType('search')).toBe('Search');
    expect(getDocPanelServiceType('api')).toBe('Api');
    expect(getDocPanelServiceType('security')).toBe('Security');
    expect(getDocPanelServiceType('drive')).toBe('Drive');
  });

  it('falls back to a capitalized kind for fork-only kinds', () => {
    expect(getDocPanelServiceType('llm')).toBe('Llm');
    expect(getDocPanelServiceType('mcp')).toBe('Mcp');
  });
});

describe('getFocusedDocDetails (pin ServiceDocPanel)', () => {
  const t: DocPanelTranslate = (key, params) =>
    params ? `${key}:${JSON.stringify(params)}` : key;

  it('shows section copy for a focused connection field', () => {
    const details = getFocusedDocDetails('hostPort', undefined, '', false, 'iSmart', t);
    expect(details.section).toBe('connection');
    expect(details.eyebrow).toBe('forms.sections.connection');
    expect(details.title).toBe('forms.docPanel.connectionTitle');
    expect(details.description).toBe(
      'forms.docPanel.connectionDescription:{"brandName":"iSmart"}',
    );
    expect(details.showRequirements).toBe(true);
  });

  it('falls back to schema metadata when no markdown exists (workflow)', () => {
    const details = getFocusedDocDetails(
      'threads',
      { title: 'Number of Threads', description: 'Thread count.' },
      '',
      true,
      'iSmart',
      t,
    );
    expect(details.section).toBeUndefined();
    expect(details.title).toBe('Number of Threads');
    expect(details.description).toBe('Thread count.');
    expect(details.eyebrow).toBe('forms.docPanel.configuration');
    expect(details.showRequirements).toBe(false);
  });

  it('falls back to the start-cased field name and docs description without meta', () => {
    const details = getFocusedDocDetails('threads', undefined, '', true, 'iSmart', t);
    expect(details.title).toBe('Threads');
    expect(details.description).toBe('forms.docPanel.docsDescription');
  });

  it('shows the setup-guide default with nothing focused', () => {
    const details = getFocusedDocDetails(undefined, undefined, '', false, 'iSmart', t);
    expect(details.title).toBe('forms.docPanel.setupGuide');
    expect(details.description).toBe('forms.docPanel.docsDescription');
    expect(details.showRequirements).toBe(true);
  });

  it('shows auth guidance only for the authentication section with dual markdown', () => {
    const details = getFocusedDocDetails('password', undefined, MARKDOWN, false, 'iSmart', t);
    expect(details.section).toBe('authentication');
    expect(details.showAuthGuidance).toBe(true);
    const noMarkdown = getFocusedDocDetails('password', undefined, '', false, 'iSmart', t);
    expect(noMarkdown.showAuthGuidance).toBe(false);
  });
});

describe('useFieldFocus (pin useFieldFocusManagement)', () => {
  it('debounces focus/blur through one shared timer', async () => {
    vi.useFakeTimers();
    try {
      let exposed: ReturnType<typeof useFieldFocus> | undefined;
      const Probe = defineComponent({
        setup() {
          exposed = useFieldFocus();
          return () => h('div');
        },
      });
      const wrapper = mount(Probe);
      exposed!.handleFieldFocus('root/hostPort', { title: 'Host' });
      expect(exposed!.activeField.value).toBe('');
      await vi.advanceTimersByTimeAsync(50);
      expect(exposed!.activeField.value).toBe('root/hostPort');
      expect(exposed!.activeFieldMeta.value).toEqual({ title: 'Host' });
      // A blur immediately followed by a focus must not blank the panel.
      exposed!.handleFieldBlur();
      exposed!.handleFieldFocus('root/username', { title: 'User' });
      await vi.advanceTimersByTimeAsync(150);
      expect(exposed!.activeField.value).toBe('root/username');
      exposed!.handleFieldBlur();
      await vi.advanceTimersByTimeAsync(100);
      expect(exposed!.activeField.value).toBe('');
      expect(exposed!.activeFieldMeta.value).toBeUndefined();
      exposed!.resetActiveField('root/scheme');
      expect(exposed!.activeField.value).toBe('root/scheme');
      wrapper.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('doc fetch paths (pin ServiceDocPanel.fetchRequirement)', () => {
  it('files Api connectors under ApiEntity, everything else under its own type', () => {
    expect(getDocsServiceType('Api')).toBe('ApiEntity');
    expect(getDocsServiceType('Database')).toBe('Database');
    expect(getDocsServiceType('MlModel')).toBe('MlModel');
  });

  it('resolves full supported tags, base languages, and unknown languages to English', () => {
    expect(getSupportedDocLanguage('en-US')).toBe('en-US');
    expect(getSupportedDocLanguage('zh-CN')).toBe('zh-CN');
    expect(getSupportedDocLanguage('zh')).toBe('zh-CN');
    expect(getSupportedDocLanguage('en')).toBe('en-US');
    expect(getSupportedDocLanguage('pt')).toBe('pt-BR');
    expect(getSupportedDocLanguage('xx')).toBe('en-US');
    expect(getSupportedDocLanguage('xx-YY')).toBe('en-US');
  });

  it('builds connector paths with the English fallback', () => {
    expect(
      buildDocFilePaths({
        language: 'zh-CN',
        serviceType: 'Database',
        serviceName: 'Mysql',
      }),
    ).toEqual({
      filePath: 'zh-CN/Database/Mysql.md',
      fallbackFilePath: 'en-US/Database/Mysql.md',
    });
    expect(
      buildDocFilePaths({
        language: 'en-US',
        serviceType: 'Api',
        serviceName: 'Rest',
      }),
    ).toEqual({
      filePath: 'en-US/ApiEntity/Rest.md',
      fallbackFilePath: 'en-US/ApiEntity/Rest.md',
    });
  });

  it('builds the workflow variant path for agent forms', () => {
    expect(
      buildDocFilePaths({
        language: 'zh-CN',
        serviceType: 'Database',
        serviceName: 'Mysql',
        isWorkflow: true,
        workflowType: 'profiler',
      }),
    ).toEqual({
      filePath: 'zh-CN/Database/workflows/profiler.md',
      fallbackFilePath: 'en-US/Database/workflows/profiler.md',
    });
    // Without a workflow type the workflow branch does not apply (pin guards on both).
    expect(
      buildDocFilePaths({
        language: 'en-US',
        serviceType: 'Database',
        serviceName: 'Mysql',
        isWorkflow: true,
      }),
    ).toEqual({
      filePath: 'en-US/Database/Mysql.md',
      fallbackFilePath: 'en-US/Database/Mysql.md',
    });
  });

  it('builds the English connector path used for the workflow docs link', () => {
    expect(buildConnectorDocFilePath('Database', 'Mysql')).toBe('en-US/Database/Mysql.md');
    expect(buildConnectorDocFilePath('Api', 'Rest')).toBe('en-US/ApiEntity/Rest.md');
  });
});

describe('usable-markdown guard (pin isUsableMarkdown / getSettledMarkdown)', () => {
  it('rejects empty content and SPA-fallback HTML', () => {
    expect(isUsableMarkdown('')).toBe(false);
    expect(isUsableMarkdown('  \n ')).toBe(false);
    expect(isUsableMarkdown('<!doctype html><html></html>')).toBe(false);
    expect(isUsableMarkdown('<html><body>index</body></html>')).toBe(false);
    expect(isUsableMarkdown('<!-- comment -->')).toBe(false);
    expect(isUsableMarkdown('  <!doctype html>')).toBe(false);
    expect(isUsableMarkdown('# Mysql\n\nDocs.')).toBe(true);
    expect(isUsableMarkdown('\n# Mysql')).toBe(true);
  });

  it('keeps only fulfilled, usable settled values', () => {
    expect(
      getSettledMarkdown({ status: 'fulfilled', value: '# Mysql' }),
    ).toBe('# Mysql');
    expect(
      getSettledMarkdown({ status: 'fulfilled', value: '<!doctype html>' }),
    ).toBe('');
    expect(getSettledMarkdown({ status: 'rejected', reason: new Error('404') })).toBe('');
  });
});

describe('fetchServiceDocMarkdown (pin fetchRequirement settle logic)', () => {
  const PATHS: DocFilePaths = {
    filePath: 'zh-CN/Database/Mysql.md',
    fallbackFilePath: 'en-US/Database/Mysql.md',
  };

  function recordingFetcher(responses: Record<string, string | Error>) {
    const calls: string[] = [];
    const fetcher = async (path: string): Promise<string> => {
      calls.push(path);
      const response = responses[path];
      if (response instanceof Error) {
        throw response;
      }
      if (response === undefined) {
        throw new Error(`no response for ${path}`);
      }
      return response;
    };
    return { calls, fetcher };
  }

  it('prefers the requested language when usable', async () => {
    const { calls, fetcher } = recordingFetcher({
      'zh-CN/Database/Mysql.md': '# MySQL ZH',
      'en-US/Database/Mysql.md': '# MySQL EN',
    });
    await expect(fetchServiceDocMarkdown(fetcher, PATHS, false)).resolves.toBe('# MySQL ZH');
    expect(calls).toEqual(['zh-CN/Database/Mysql.md', 'en-US/Database/Mysql.md']);
  });

  it('falls back to English when the requested language resolves as SPA HTML', async () => {
    const { fetcher } = recordingFetcher({
      'zh-CN/Database/Mysql.md': '<!doctype html><html></html>',
      'en-US/Database/Mysql.md': '# MySQL EN',
    });
    await expect(fetchServiceDocMarkdown(fetcher, PATHS, false)).resolves.toBe('# MySQL EN');
  });

  it('falls back to English when the requested language rejects', async () => {
    const { fetcher } = recordingFetcher({
      'zh-CN/Database/Mysql.md': new Error('404'),
      'en-US/Database/Mysql.md': '# MySQL EN',
    });
    await expect(fetchServiceDocMarkdown(fetcher, PATHS, false)).resolves.toBe('# MySQL EN');
  });

  it('yields empty markdown when both requests fail', async () => {
    const { fetcher } = recordingFetcher({
      'zh-CN/Database/Mysql.md': new Error('404'),
      'en-US/Database/Mysql.md': new Error('404'),
    });
    await expect(fetchServiceDocMarkdown(fetcher, PATHS, false)).resolves.toBe('');
  });

  it('makes no second request for English', async () => {
    const { calls, fetcher } = recordingFetcher({
      'en-US/Database/Mysql.md': '# MySQL EN',
    });
    const englishPaths: DocFilePaths = {
      filePath: 'en-US/Database/Mysql.md',
      fallbackFilePath: 'en-US/Database/Mysql.md',
    };
    await expect(fetchServiceDocMarkdown(fetcher, englishPaths, true)).resolves.toBe(
      '# MySQL EN',
    );
    expect(calls).toEqual(['en-US/Database/Mysql.md']);
  });
});

describe('getFocusedDocDetails C′ field-area fallback', () => {
  const t: DocPanelTranslate = (key, params) =>
    params ? `${key}:${JSON.stringify(params)}` : key;
  const NO_SECTION_MARKDOWN = ['# Mysql', '## Requirements', 'Base requirement.'].join('\n');

  it('prefers a valid field section over the schema metadata', () => {
    const details = getFocusedDocDetails(
      'hostPort',
      { title: 'Host and Port', description: 'The host.' },
      MARKDOWN,
      false,
      'iSmart',
      t,
    );
    expect(details.markdown).toContain('How to reach the host.');
    expect(details.schemaFallback).toBeUndefined();
  });

  it('falls back to schema metadata with a missing-section reason when the doc lacks the section', () => {
    const details = getFocusedDocDetails(
      'hostPort',
      { title: 'Host and Port', description: 'The host.' },
      NO_SECTION_MARKDOWN,
      false,
      'iSmart',
      t,
    );
    expect(details.markdown).toBe('');
    expect(details.schemaFallback).toEqual({
      title: 'Host and Port',
      description: 'The host.',
      reason: 'missing-section',
    });
    // Requirements still render from the loaded markdown.
    expect(details.showRequirements).toBe(true);
  });

  it('falls back to schema metadata with a no-markdown reason when the fetch failed', () => {
    const details = getFocusedDocDetails(
      'hostPort',
      { title: 'Host and Port', description: 'The host.' },
      '',
      false,
      'iSmart',
      t,
    );
    expect(details.schemaFallback).toEqual({
      title: 'Host and Port',
      description: 'The host.',
      reason: 'no-markdown',
    });
  });

  it('uses the explicit generic fallback for an empty schema description, never a faked one', () => {
    const details = getFocusedDocDetails(
      'hostPort',
      { title: 'Host and Port', description: '' },
      '',
      false,
      'iSmart',
      t,
    );
    expect(details.schemaFallback).toEqual({
      title: 'Host and Port',
      description: 'forms.docPanel.docsDescription',
      reason: 'no-markdown',
    });
  });

  it('uses the start-cased field name and generic fallback without any schema metadata', () => {
    const details = getFocusedDocDetails('hostPort', undefined, '', false, 'iSmart', t);
    expect(details.schemaFallback).toEqual({
      title: 'Host Port',
      description: 'forms.docPanel.docsDescription',
      reason: 'no-markdown',
    });
  });

  it('keeps the identity branch original: no field fallback even without markdown', () => {
    const details = getFocusedDocDetails(
      'serviceName',
      { title: 'Service Name', description: 'The name.' },
      '',
      false,
      'iSmart',
      t,
    );
    expect(details.section).toBe('identity');
    expect(details.markdown).toBe('');
    expect(details.schemaFallback).toBeUndefined();
  });

  it('keeps the workflow branch original: schema metadata in title/description, no field fallback', () => {
    const details = getFocusedDocDetails(
      'threads',
      { title: 'Number of Threads', description: 'Thread count.' },
      NO_SECTION_MARKDOWN,
      true,
      'iSmart',
      t,
    );
    expect(details.section).toBeUndefined();
    expect(details.title).toBe('Number of Threads');
    expect(details.description).toBe('Thread count.');
    expect(details.schemaFallback).toBeUndefined();
  });

  it('shows the workflow field section when the workflow doc carries it', () => {
    const workflowMarkdown = [
      '# Metadata',
      '$$section',
      '## Threads $(id="threads")',
      'Thread docs.',
    ].join('\n');
    const details = getFocusedDocDetails(
      'threads',
      { title: 'Number of Threads', description: 'Thread count.' },
      workflowMarkdown,
      true,
      'iSmart',
      t,
    );
    expect(details.title).toBe('Threads');
    expect(details.markdown).toBe('Thread docs.');
    expect(details.schemaFallback).toBeUndefined();
  });
});

describe('splitDocMarkdown (pin ServiceUtils.processDocMarkdown shape)', () => {
  it('splits sections with ids removed and content trimmed', () => {
    const segments = splitDocMarkdown(
      '# Intro\n\n$$section\n$(id="clientId")\n\nContent one.\n$$\n\nBetween.\n\n$$section\n$(id="authority")\nContent two.\n$$\n',
    );
    expect(segments).toEqual([
      { kind: 'prose', markdown: '# Intro\n\n' },
      { kind: 'section', id: 'clientId', markdown: 'Content one.' },
      { kind: 'prose', markdown: '\n\nBetween.\n\n' },
      { kind: 'section', id: 'authority', markdown: 'Content two.' },
      { kind: 'prose', markdown: '\n' },
    ]);
  });

  it('uses an empty id when the marker is missing', () => {
    expect(
      splitDocMarkdown('$$section\nNo marker here.\n$$'),
    ).toEqual([{ kind: 'section', id: '', markdown: 'No marker here.' }]);
  });

  it('returns plain prose unchanged when no blocks exist', () => {
    expect(splitDocMarkdown('# Hello\n\nPlain text.')).toEqual([
      { kind: 'prose', markdown: '# Hello\n\nPlain text.' },
    ]);
    expect(splitDocMarkdown('')).toEqual([]);
  });

  it('splits top-level admonition blocks with trimmed content', () => {
    const segments = splitDocMarkdown(
      'Before.\n\n$$note\nBe careful.\n$$\n\nAfter.',
    );
    expect(segments).toEqual([
      { kind: 'prose', markdown: 'Before.\n\n' },
      { kind: 'admonition', admonitionType: 'note', markdown: 'Be careful.' },
      { kind: 'prose', markdown: '\n\nAfter.' },
    ]);
  });

  it('only matches known admonition types at line starts', () => {
    expect(
      splitDocMarkdown('$$unknown\nNot an admonition.\n$$'),
    ).toEqual([
      { kind: 'prose', markdown: '$$unknown\nNot an admonition.\n$$' },
    ]);
  });
});
