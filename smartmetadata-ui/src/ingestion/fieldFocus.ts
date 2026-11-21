/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { onUnmounted, ref, type Ref } from 'vue';
import { OPTIONAL_SCOPE_PROPERTIES, type GroupableSchema } from '@/ingestion/formSections';
import { startCase } from '@/utils/text';
import type { ServiceKind } from '@/types/ingestion';

/**
 * Port of official's field-focus machinery driving ServiceDocPanel
 * (useFieldFocusManagement, getFieldSchemaForId, and the focused-doc
 * resolution inside ServiceDocPanel.tsx), pin a3012259ca.
 *
 * Forms report focus as an RJSF-style field id (`root/hostPort`, or a
 * bare field name); the panel resolves the field name, its schema
 * `{title, description}`, and the section copy to show. The panel
 * fetches the connector markdown itself (pin's fetchRequirement, same
 * origin under `/locales/`); the field area prefers a valid field
 * section from that markdown and falls back to the parsed schema
 * title/description only when no usable field description exists
 * (Q-2 C′), with the no-markdown and missing-section states kept
 * distinct.
 */

export interface FieldFocusMeta {
  title?: string;
  description?: string;
  section?: 'connection' | 'authentication' | 'scope' | 'advanced';
}

export const FOCUS_DELAY_MS = 50;
export const BLUR_DELAY_MS = 100;

/**
 * Pin useFieldFocusManagement: focus/blur updates share one timer so a
 * blur immediately followed by a focus never leaves a stale timeout
 * blanking the panel afterwards.
 */
export function useFieldFocus(): {
  activeField: Ref<string>;
  activeFieldMeta: Ref<FieldFocusMeta | undefined>;
  handleFieldFocus: (fieldName: string, schemaMeta?: FieldFocusMeta) => void;
  handleFieldBlur: () => void;
  resetActiveField: (fieldName?: string) => void;
} {
  const activeField = ref('');
  const activeFieldMeta = ref<FieldFocusMeta | undefined>(undefined);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function handleFieldFocus(fieldName: string, schemaMeta?: FieldFocusMeta): void {
    if (!fieldName) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => {
      activeField.value = fieldName;
      activeFieldMeta.value = schemaMeta;
    }, FOCUS_DELAY_MS);
  }

  function handleFieldBlur(): void {
    clearTimeout(timer);
    timer = setTimeout(() => {
      activeField.value = '';
      activeFieldMeta.value = undefined;
    }, BLUR_DELAY_MS);
  }

  function resetActiveField(fieldName = ''): void {
    clearTimeout(timer);
    activeField.value = fieldName;
    activeFieldMeta.value = undefined;
  }

  onUnmounted(() => clearTimeout(timer));

  return { activeField, activeFieldMeta, handleFieldBlur, handleFieldFocus, resetActiveField };
}

function resolveChildFieldSchema(
  parent: Record<string, unknown>,
  fieldName: string,
): Record<string, unknown> | undefined {
  const props = parent.properties as Record<string, Record<string, unknown>> | undefined;
  if (props?.[fieldName]) {
    return props[fieldName];
  }
  for (const combiner of ['oneOf', 'anyOf', 'allOf'] as const) {
    const branches = parent[combiner] as Array<Record<string, unknown>> | undefined;
    for (const branch of branches ?? []) {
      const match = resolveChildFieldSchema(branch, fieldName);
      if (match) {
        return match;
      }
    }
  }
  return undefined;
}

/** Pin getFieldSchemaForId: resolves `{title, description}` for an RJSF field id. */
export function getFieldSchemaForId(
  schema: Record<string, unknown>,
  fieldId: string,
): { title?: string; description?: string } | undefined {
  const cleanId = fieldId.replace(/__(oneof|anyof|allof)_select$/, '');
  const parts = cleanId.split('/').filter((part) => part && part !== 'root');
  let current: Record<string, unknown> | undefined = schema;
  for (const part of parts) {
    current = resolveChildFieldSchema(current, part);
    if (!current) {
      return undefined;
    }
  }
  return {
    title: current.title as string | undefined,
    description: current.description as string | undefined,
  };
}

const AUTH_FIELD_NAMES = new Set([
  'authType',
  'password',
  'privateKey',
  'snowflakePrivatekeyPassphrase',
  'passphrase',
  'token',
  'apiKey',
  'secretKey',
  'clientSecret',
  'consumerSecret',
  'securityToken',
]);

const NESTED_FOCUS_FIELDS = new Set([
  'connectionOptions',
  'connectionArguments',
  'policyAgentConfig',
]);

const LINEAGE_FIELDS = new Set(['useAccessHistory', 'accessHistoryChunkSize']);
const IDENTITY_FIELD_NAMES = new Set(['serviceName', 'serviceDescription']);

const ENDS_WITH_NUMBER_REGEX = /\d+$/;
const ONEOF_ANYOF_ALLOF_REGEX = /(oneof|anyof|allof)/;

/**
 * Pin ServiceDocPanel.getActiveFieldName: a nested focus field wins over
 * its children; an id ending in a number (array item) resolves to the
 * first segment; a oneOf/anyOf/allOf select id resolves to its first
 * underscore part; otherwise the last path segment.
 */
export function getActiveFieldName(activeFieldValue?: string): string | undefined {
  if (!activeFieldValue) {
    return undefined;
  }
  const fieldNameArr = activeFieldValue.split('/');
  const nestedField = fieldNameArr.find((field) => NESTED_FOCUS_FIELDS.has(field));
  if (nestedField) {
    return nestedField;
  }
  if (ENDS_WITH_NUMBER_REGEX.test(activeFieldValue)) {
    return fieldNameArr[1];
  }
  const fieldName = fieldNameArr[fieldNameArr.length - 1] ?? '';
  if (ONEOF_ANYOF_ALLOF_REGEX.test(fieldName)) {
    return fieldName.split('_')[0];
  }
  return fieldName;
}

export type FocusedSection = 'connection' | 'authentication' | 'scope' | 'advanced' | 'identity';

/** Pin ServiceDocPanel.resolveFocusedSection (connection forms only, never workflows). */
export function resolveFocusedSection(
  fieldName: string | undefined,
  metaSection: FieldFocusMeta['section'],
  isWorkflow?: boolean,
): FocusedSection | undefined {
  if (!fieldName || isWorkflow) {
    return undefined;
  }
  if (IDENTITY_FIELD_NAMES.has(fieldName)) {
    return 'identity';
  }
  if (metaSection) {
    return metaSection;
  }
  if (AUTH_FIELD_NAMES.has(fieldName)) {
    return 'authentication';
  }
  if (LINEAGE_FIELDS.has(fieldName)) {
    return 'advanced';
  }
  if (OPTIONAL_SCOPE_PROPERTIES.has(fieldName)) {
    return 'scope';
  }
  return 'connection';
}

export const SECTION_DOC_COPY: Record<
  FocusedSection,
  { eyebrowKey: string; titleKey: string; descriptionKey: string }
> = {
  identity: {
    eyebrowKey: 'forms.docPanel.serviceName',
    titleKey: 'forms.docPanel.identityTitle',
    descriptionKey: 'forms.docPanel.identityDescription',
  },
  connection: {
    eyebrowKey: 'forms.sections.connection',
    titleKey: 'forms.docPanel.connectionTitle',
    descriptionKey: 'forms.docPanel.connectionDescription',
  },
  authentication: {
    eyebrowKey: 'forms.sections.authentication',
    titleKey: 'forms.docPanel.authenticationTitle',
    descriptionKey: 'forms.docPanel.authenticationDescription',
  },
  scope: {
    eyebrowKey: 'forms.sections.scopeOptions',
    titleKey: 'forms.docPanel.scopeTitle',
    descriptionKey: 'forms.docPanel.scopeDescription',
  },
  advanced: {
    eyebrowKey: 'forms.sections.advancedConfig',
    titleKey: 'forms.docPanel.advancedTitle',
    descriptionKey: 'forms.docPanel.advancedDescription',
  },
};

function getSectionEyebrowKey(
  fieldName: string | undefined,
  isWorkflow: boolean | undefined,
  metaSection: FieldFocusMeta['section'],
): string {
  if (metaSection) {
    return SECTION_DOC_COPY[metaSection].eyebrowKey;
  }
  if (fieldName && LINEAGE_FIELDS.has(fieldName)) {
    return SECTION_DOC_COPY.advanced.eyebrowKey;
  }
  if (fieldName && OPTIONAL_SCOPE_PROPERTIES.has(fieldName)) {
    return SECTION_DOC_COPY.scope.eyebrowKey;
  }
  if (isWorkflow) {
    return 'forms.docPanel.configuration';
  }
  return SECTION_DOC_COPY.connection.eyebrowKey;
}

// --- connector-markdown extraction (pin ServiceDocPanel) -------------------

function stripMarkdownScaffold(content: string): string {
  return content
    .replace(/^\$\$section\s*$/gm, '')
    .replace(/^\$\$\s*$/gm, '')
    .replace(/\s*\$\(id="[^"]+"\)/g, '')
    .trim();
}

function extractSectionById(content: string, fieldName: string): string {
  const section = content
    .split('$$section')
    .slice(1)
    .map((block) => `$$section${block}`)
    .find((block) => block.includes(`$(id="${fieldName}")`));
  return section?.trim() ?? '';
}

function extractHeadingSection(content: string, heading: string, level: number): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startIndex = content.search(new RegExp(`^#{${level}}\\s+${escaped}\\b`, 'm'));
  if (startIndex < 0) {
    return '';
  }
  const section = content.slice(startIndex);
  const nextHeadingIndex = section.slice(1).search(new RegExp(`\\n#{1,${level}}\\s`));
  return stripMarkdownScaffold(
    (nextHeadingIndex < 0 ? section : section.slice(0, nextHeadingIndex + 1)).trim(),
  );
}

function getFocusedFieldNames(fieldName?: string): string[] {
  if (!fieldName) {
    return [];
  }
  if (fieldName === 'authType') {
    return [
      'password',
      'privateKey',
      'snowflakePrivatekeyPassphrase',
      'token',
      'apiKey',
      'secretKey',
      'clientSecret',
      'consumerSecret',
      'securityToken',
    ];
  }
  return [fieldName];
}

/** Pin getFieldMarkdown: the `$$section` block(s) for the focused field, if any. */
export function getFieldMarkdown(markdownContent: string, fieldName?: string): string {
  if (!fieldName) {
    return '';
  }
  if (LINEAGE_FIELDS.has(fieldName)) {
    return extractHeadingSection(markdownContent, 'Usage & Lineage', 3);
  }
  return stripMarkdownScaffold(
    getFocusedFieldNames(fieldName)
      .map((name) => extractSectionById(markdownContent, name))
      .filter(Boolean)
      .join('\n\n'),
  );
}

export function getFocusedMarkdown(markdownContent: string, fieldName?: string): string {
  return getFieldMarkdown(markdownContent, fieldName) || markdownContent;
}

const DOC_SECTION_BLOCK_REGEX = /\$\$section\n([\s\S]*?)\n\$\$/g;
const DOC_MARKDOWN_MATCH_ID = /\$\(id="(.*?)"\)/;
const DOC_ADMONITION_TYPES = [
  'note',
  'warning',
  'danger',
  'info',
  'tip',
  'caution',
] as const;

export type DocSegment =
  | { kind: 'prose'; markdown: string }
  | { kind: 'section'; id: string; markdown: string }
  | { kind: 'admonition'; admonitionType: string; markdown: string };

function splitDocSections(markdown: string): DocSegment[] {
  const segments: DocSegment[] = [];
  const sectionRegex = new RegExp(
    DOC_SECTION_BLOCK_REGEX.source,
    DOC_SECTION_BLOCK_REGEX.flags,
  );
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = sectionRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        kind: 'prose',
        markdown: markdown.slice(lastIndex, match.index),
      });
    }
    const sectionContent = match[1];
    const idMatch = DOC_MARKDOWN_MATCH_ID.exec(sectionContent);
    const id = idMatch ? idMatch[1] : '';
    const cleanContent = sectionContent.replace(DOC_MARKDOWN_MATCH_ID, '').trim();
    segments.push({ kind: 'section', id, markdown: cleanContent });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    segments.push({ kind: 'prose', markdown: markdown.slice(lastIndex) });
  }

  return segments;
}

/**
 * Splits doc markdown into renderable segments (pin `processDocMarkdown`
 * shape in `utils/ServiceUtils.tsx`): admonition blocks first, then
 * `$$section` blocks with their `$(id="...")` markers removed and
 * trimmed. Returns segments instead of HTML because the product
 * markdown renderer escapes raw HTML: callers render each segment
 * through it inside the matching wrapper element. Admonition-in-section
 * nesting would diverge from pin's HTML output; no doc nests blocks
 * (verified: the SSO docs contain only `$$section` blocks), so the
 * boundary is unreachable here. Used by the shared ServiceDocPanel's
 * full-document mode (pin default, `focusedMode` unset).
 */
export function splitDocMarkdown(markdown: string): DocSegment[] {
  const admonitionRegex = new RegExp(
    `^\\$\\$(${DOC_ADMONITION_TYPES.join('|')})\\n([\\s\\S]*?)\\n\\$\\$`,
    'gm',
  );
  const segments: DocSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushProse = (text: string): void => {
    if (text) {
      segments.push(...splitDocSections(text));
    }
  };

  while ((match = admonitionRegex.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      pushProse(markdown.slice(lastIndex, match.index));
    }
    segments.push({
      kind: 'admonition',
      admonitionType: match[1],
      markdown: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < markdown.length) {
    pushProse(markdown.slice(lastIndex));
  }

  return segments;
}

/** Pin hasAuthMethodGuidance: the markdown documents both password and key-pair auth. */
export function hasAuthMethodGuidance(markdownContent: string): boolean {
  return Boolean(
    extractSectionById(markdownContent, 'password') &&
      extractSectionById(markdownContent, 'privateKey'),
  );
}

function extractRequirementsMarkdown(content: string): string {
  const startIndex = content.search(/^## Requirements\b/m);
  if (startIndex < 0) {
    return '';
  }
  const fromRequirements = content.slice(startIndex);
  const nextHeadingIndex = fromRequirements.slice(1).search(/\n##\s/);
  return (nextHeadingIndex < 0
    ? fromRequirements
    : fromRequirements.slice(0, nextHeadingIndex + 1)
  ).trim();
}

export interface RequirementLabels {
  autoClassification: string;
  lineage: string;
  metadata: string;
  profiler: string;
}

/** Pin extractFocusedRequirementsMarkdown: the Requirements body, relabelled per workflow. */
export function extractFocusedRequirementsMarkdown(
  content: string,
  labels: RequirementLabels,
): string {
  const body = extractRequirementsMarkdown(content)
    .replace(/^## Requirements\s*/m, '')
    .replace(/\s*\$\(id="[^"]+"\)/g, '')
    .trim();
  if (!body) {
    return '';
  }
  const firstSubHeadingIndex = body.search(/^###\s/m);
  const withMetadataHeading =
    firstSubHeadingIndex > 0
      ? [
          `### ${labels.metadata}`,
          body.slice(0, firstSubHeadingIndex).trim(),
          body.slice(firstSubHeadingIndex).trim(),
        ].join('\n\n')
      : body;
  return withMetadataHeading
    .replace(/^### Usage & Lineage\b/gm, `### ${labels.lineage}`)
    .replace(/^### Profiler & Data Quality\b/gm, `### ${labels.profiler}`)
    .replace(/^### Auto Classification\b/gm, `### ${labels.autoClassification}`)
    .trim();
}

function normalizeConnectorSlug(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/**
 * Pin getConnectorDocsUrl, returning the markdown's own URL: the fork
 * has no CONNECTORS_DOCS root constant to rebuild the link against, so
 * the original matched URL is kept (including its version segment)
 * and a markdown without a matching connector link yields no link
 * rather than an invented URL.
 */
export function getConnectorDocsUrl(markdownContent: string, serviceName: string): string {
  const matches = [
    ...markdownContent.matchAll(
      /https:\/\/docs\.open-metadata\.org\/(?:latest\/|v[\d.x]+\/)?connectors\/([^"'\)\s]+)/g,
    ),
  ];
  const normalizedServiceName = normalizeConnectorSlug(serviceName);
  const byService = matches.find(
    (match) =>
      normalizeConnectorSlug((match[1] ?? '').split('/').pop() ?? '') ===
      normalizedServiceName,
  );
  const firstNonWorkflow = matches.find((match) => !(match[1] ?? '').startsWith('ingestion/'));
  return byService?.[0] ?? firstNonWorkflow?.[0] ?? '';
}

function getMarkdownHeading(markdown: string): string | undefined {
  return markdown.match(/^#{1,6}\s+(.+)$/m)?.[1];
}

function stripLeadingMarkdownHeading(markdown: string): string {
  return markdown.replace(/^#{1,6}\s+.+\n?/m, '').trim();
}

/** Pin getServiceTypeDisplay: `X Service`, unless the type already ends in Service. */
export function getServiceTypeDisplay(serviceType: string, serviceLabel: string): string {
  return serviceType.endsWith('Service')
    ? startCase(serviceType)
    : `${startCase(serviceType)} ${serviceLabel}`;
}

/**
 * Pin `getServiceType` (`SERVICE_TYPE_MAP[category]`): the doc panel's
 * `serviceType` prop is the category word, not the connector type.
 * Fork-only kinds (`llm`, `mcp`) have no pin category; they fall back
 * to the kind's title-cased name.
 */
export function getDocPanelServiceType(kind: ServiceKind): string {
  const byKind: Partial<Record<ServiceKind, string>> = {
    database: 'Database',
    dashboard: 'Dashboard',
    messaging: 'Messaging',
    mlmodel: 'MlModel',
    metadata: 'Metadata',
    storage: 'Storage',
    pipeline: 'Pipeline',
    search: 'Search',
    api: 'Api',
    security: 'Security',
    drive: 'Drive',
  };
  return byKind[kind] ?? startCase(kind);
}

export interface FocusedDocDetails {
  eyebrow: string;
  title: string;
  description: string;
  markdown: string;
  showRequirements: boolean;
  showAuthGuidance: boolean;
  section?: FocusedSection;
  /**
   * C′ field-area fallback, set only in the section branch when the
   * markdown carries no usable section for the focused field. The
   * identity and workflow branches keep their original behavior and
   * never set this.
   */
  schemaFallback?: SchemaFieldFallback;
}

/**
 * C′: why the field area shows schema metadata instead of a doc
 * section. `no-markdown` means the fetch failed or returned nothing
 * usable (`!markdown`); `missing-section` means markdown loaded but
 * carries no section for the focused field (`!activeFieldMarkdown`).
 * The two are distinct states, never collapsed.
 */
export type SchemaFallbackReason = 'no-markdown' | 'missing-section';

export interface SchemaFieldFallback {
  title: string;
  description: string;
  reason: SchemaFallbackReason;
}

export type DocPanelTranslate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

/**
 * Pin buildSectionDocDetails + buildFieldDocDetails: with a resolved
 * section the panel shows section copy plus the field's markdown; with
 * no markdown at all it shows the schema title/description (or the
 * setup-guide default when nothing is focused). C′ extends the section
 * branch only: when the markdown has no usable section for the focused
 * field, the field area falls back to the parsed schema
 * title/description instead of rendering nothing; an empty schema
 * description yields the explicit generic message, never a faked
 * description.
 */
export function getFocusedDocDetails(
  activeFieldName: string | undefined,
  activeFieldMeta: FieldFocusMeta | undefined,
  markdownContent: string,
  isWorkflow: boolean | undefined,
  brandName: string,
  t: DocPanelTranslate,
): FocusedDocDetails {
  const activeFieldMarkdown = getFieldMarkdown(markdownContent, activeFieldName);
  const section = resolveFocusedSection(activeFieldName, activeFieldMeta?.section, isWorkflow);
  if (section) {
    const copy = SECTION_DOC_COPY[section];
    // Identity keeps pin's original branch: section copy alone, never a
    // field fallback. Every other section falls back to the schema
    // metadata only when no usable field section exists.
    const schemaFallback: SchemaFieldFallback | undefined =
      section !== 'identity' && activeFieldName && !activeFieldMarkdown
        ? {
            title: activeFieldMeta?.title || startCase(activeFieldName),
            description: activeFieldMeta?.description || t('forms.docPanel.docsDescription'),
            reason: markdownContent ? 'missing-section' : 'no-markdown',
          }
        : undefined;
    return {
      eyebrow: t(copy.eyebrowKey),
      title: t(copy.titleKey),
      description: t(copy.descriptionKey, { brandName }),
      markdown: section === 'identity' ? '' : activeFieldMarkdown,
      showRequirements: section === 'connection',
      showAuthGuidance:
        section === 'authentication' && hasAuthMethodGuidance(markdownContent),
      section,
      schemaFallback,
    };
  }

  const fieldTitle = getMarkdownHeading(activeFieldMarkdown);
  const fieldBody = stripLeadingMarkdownHeading(activeFieldMarkdown);
  if (activeFieldName && !activeFieldMarkdown) {
    return {
      eyebrow: t(getSectionEyebrowKey(activeFieldName, isWorkflow, activeFieldMeta?.section)),
      title: activeFieldMeta?.title ?? startCase(activeFieldName),
      description:
        activeFieldMeta?.description ?? t('forms.docPanel.docsDescription'),
      markdown: '',
      showRequirements: false,
      showAuthGuidance: false,
    };
  }
  const fallbackTitle = activeFieldName
    ? startCase(activeFieldName)
    : t('forms.docPanel.setupGuide');
  const hasFieldContent = Boolean(fieldBody || fieldTitle);
  return {
    eyebrow: t(getSectionEyebrowKey(activeFieldName, isWorkflow, activeFieldMeta?.section)),
    title: fieldTitle ?? fallbackTitle,
    description: hasFieldContent
      ? t('forms.docPanel.focusedFallbackDescription')
      : t('forms.docPanel.docsDescription'),
    markdown: fieldBody,
    showRequirements: !activeFieldName,
    showAuthGuidance: false,
  };
}

// --- connector-markdown fetch (pin ServiceDocPanel.fetchRequirement) -------

/** Pin fetchMarkdownFile: docs are same-origin static files under `/locales/`. */
export const DOC_LOCALES_BASE = '/locales/';

/** Pin getDocsServiceType: `Api` lives at `ApiEntity` in the docs tree. */
export function getDocsServiceType(serviceType: string): string {
  return serviceType === 'Api' ? 'ApiEntity' : serviceType;
}

const SUPPORTED_DOC_LOCALES = new Set([
  'en-US',
  'ko-KR',
  'fr-FR',
  'it-IT',
  'zh-CN',
  'zh-TW',
  'ja-JP',
  'pt-BR',
  'pt-PT',
  'es-ES',
  'gl-ES',
  'ru-RU',
  'de-DE',
  'he-HE',
  'nl-NL',
  'pr-PR',
  'th-TH',
  'mr-IN',
  'tr-TR',
  'ar-SA',
  'sv-SE',
]);

const DOC_LANGUAGE_MAP: Record<string, string> = {
  mr: 'mr-IN',
  en: 'en-US',
  ko: 'ko-KR',
  fr: 'fr-FR',
  it: 'it-IT',
  zh: 'zh-CN',
  ja: 'ja-JP',
  pt: 'pt-BR',
  es: 'es-ES',
  gl: 'gl-ES',
  ru: 'ru-RU',
  de: 'de-DE',
  he: 'he-HE',
  nl: 'nl-NL',
  pr: 'pr-PR',
  th: 'th-TH',
  tr: 'tr-TR',
  ar: 'ar-SA',
  sv: 'sv-SE',
};

/**
 * Pin getSupportedLanguage: a full supported tag wins, else the base
 * language maps, else English.
 */
export function getSupportedDocLanguage(language: string): string {
  if (SUPPORTED_DOC_LOCALES.has(language)) {
    return language;
  }
  return DOC_LANGUAGE_MAP[language.split('-')[0] ?? ''] ?? 'en-US';
}

export interface DocFilePaths {
  filePath: string;
  fallbackFilePath: string;
}

/**
 * Pin fetchRequirement path construction: a connector file at
 * `${language}/${serviceType}/${serviceName}.md`, or the workflow
 * variant at `${language}/${serviceType}/workflows/${workflowType}.md`;
 * the fallback is always the English file. Pin reads the raw locale
 * for the workflow path; fork locales are always full tags, so the
 * resolved language is identical either way.
 */
export function buildDocFilePaths(args: {
  language: string;
  serviceType: string;
  serviceName: string;
  isWorkflow?: boolean;
  workflowType?: string;
}): DocFilePaths {
  const docsType = getDocsServiceType(args.serviceType);
  if (args.isWorkflow && args.workflowType) {
    return {
      filePath: `${args.language}/${docsType}/workflows/${args.workflowType}.md`,
      fallbackFilePath: `en-US/${docsType}/workflows/${args.workflowType}.md`,
    };
  }
  return {
    filePath: `${args.language}/${docsType}/${args.serviceName}.md`,
    fallbackFilePath: `en-US/${docsType}/${args.serviceName}.md`,
  };
}

/** Pin's connector-link effect: the English connector file, read for its docs URL alone. */
export function buildConnectorDocFilePath(serviceType: string, serviceName: string): string {
  return `en-US/${getDocsServiceType(serviceType)}/${serviceName}.md`;
}

/**
 * Pin isUsableMarkdown: a missing file resolves as the SPA's
 * index.html rather than rejecting, so the content is validated
 * before it is kept.
 */
export function isUsableMarkdown(content: string): boolean {
  const trimmedContent = content.trimStart().toLowerCase();
  return (
    Boolean(trimmedContent) &&
    !trimmedContent.startsWith('<!--') &&
    !trimmedContent.startsWith('<!doctype') &&
    !trimmedContent.startsWith('<html')
  );
}

/** Pin getSettledMarkdown: only a fulfilled, usable response counts. */
export function getSettledMarkdown(result: PromiseSettledResult<string>): string {
  return result.status === 'fulfilled' && isUsableMarkdown(result.value) ? result.value : '';
}

export type DocTextFetcher = (filePath: string) => Promise<string>;

/**
 * Pin fetchMarkdownFile: a same-origin GET for `/locales/${filePath}`.
 * A non-2xx status rejects, as pin's axios client rejects it, so a
 * missing file never reaches the settled-value check as content.
 */
export async function fetchDocFileText(filePath: string): Promise<string> {
  const response = await fetch(`${DOC_LOCALES_BASE}${filePath}`, {
    headers: { Accept: 'text/markdown' },
  });
  if (!response.ok) {
    throw new Error(`Doc file not found: ${filePath}`);
  }
  return response.text();
}

/**
 * Pin fetchRequirement's settle logic: the requested language and the
 * English fallback are fetched concurrently and the first usable one
 * wins; for English the fallback names the same file, so no second
 * request is made.
 */
export async function fetchServiceDocMarkdown(
  fetcher: DocTextFetcher,
  paths: DocFilePaths,
  isEnglishLanguage: boolean,
): Promise<string> {
  const [translation, fallbackTranslation] = await Promise.allSettled([
    fetcher(paths.filePath),
    isEnglishLanguage
      ? Promise.reject(new Error('Fallback not needed for English locale'))
      : fetcher(paths.fallbackFilePath),
  ]);
  return getSettledMarkdown(translation) || getSettledMarkdown(fallbackTranslation);
}

export type { GroupableSchema };
