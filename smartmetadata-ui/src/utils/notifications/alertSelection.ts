/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type {
  AlertCapabilities,
  AlertConditionCapability,
  AlertFilteringInput,
  AlertSelectionSupport,
  AlertSourceCapability,
  ArgumentsInput,
} from '@/types/notifications';
import type {
  AlertType,
  EventSubscriptionFilterRule,
  SourceKind,
} from '@/types/quality';
import { type TranslateFn } from './alertUtils';
import { startCase } from '@/utils/text';

/**
 * Selection support logic, ported from pin utils/Alerts/AlertSelectionUtil.ts
 * and utils/EntityNameUtils.ts (getEntityNameLabel). The server answers
 * what a selection supports; the form never decides the combining rules
 * itself.
 */

/** Capabilities cache key (useAlertCapabilities.ts:54-58). */
export function capabilitiesKeyOf(
  alertType: AlertType,
  sources: string[],
  input?: AlertFilteringInput,
): string {
  return JSON.stringify([alertType, [...sources].sort(), input ?? {}]);
}

/**
 * getEntityNameLabel (EntityNameUtils.ts:47-124): the translated label
 * for an entity type name, falling back to startCase. Note the verbatim
 * quirks: `alert` maps to the PLURAL label, `kpi` to label.kpi, and the
 * THREAD key is uppercase.
 */
export function getEntityNameLabel(entityName: string | undefined, t: TranslateFn): string {
  const entityNameLabels: Record<string, string> = {
    table: t('label.table'),
    topic: t('label.topic'),
    pipeline: t('label.pipeline'),
    container: t('label.container'),
    dashboard: t('label.dashboard'),
    testCase: t('label.test-case'),
    testSuite: t('label.test-suite'),
    dataContract: t('label.data-contract'),
    ingestionPipeline: t('label.ingestion-pipeline'),
    all: t('label.all'),
    announcement: t('label.announcement'),
    chart: t('label.chart'),
    conversation: t('label.conversation'),
    dashboardDataModel: t('label.data-model'),
    databaseSchema: t('label.database-schema'),
    databaseService: t('label.entity-service', { entity: t('label.database') }),
    dashboardService: t('label.entity-service', { entity: t('label.dashboard') }),
    messagingService: t('label.entity-service', { entity: t('label.messaging') }),
    mlmodelService: t('label.entity-service', { entity: t('label.ml-model') }),
    pipelineService: t('label.entity-service', { entity: t('label.pipeline') }),
    storageService: t('label.entity-service', { entity: t('label.storage') }),
    searchService: t('label.entity-service', { entity: t('label.search') }),
    metadataService: t('label.entity-service', { entity: t('label.metadata') }),
    driveService: t('label.entity-service', { entity: t('label.drive') }),
    glossary: t('label.glossary'),
    glossaryTerm: t('label.glossary-term'),
    tag: t('label.tag'),
    tagCategory: t('label.classification'),
    user: t('label.user'),
    domain: t('label.domain'),
    dataProduct: t('label.data-product'),
    storedProcedure: t('label.stored-procedure'),
    searchIndex: t('label.search-index'),
    task: t('label.task'),
    mlmodel: t('label.ml-model'),
    location: t('label.location'),
    database: t('label.database'),
    alert: t('label.alert-plural'),
    query: t('label.query'),
    THREAD: t('label.thread'),
    app: t('label.application'),
    apiCollection: t('label.api-collection'),
    apiEndpoint: t('label.api-endpoint'),
    apiService: t('label.api-service'),
    eventsubscription: t('label.event-subscription'),
    kpi: t('label.kpi'),
    metric: t('label.metric'),
    page: t('label.article'),
    directory: t('label.directory'),
    file: t('label.file'),
    spreadsheet: t('label.spreadsheet'),
    worksheet: t('label.worksheet'),
    tableColumn: t('label.column'),
  };
  return (entityName !== undefined ? entityNameLabels[entityName] : undefined) || startCase(entityName ?? '');
}

// A trigger applies only to the sources that support it, so with several sources it says which.
function labelledWithItsSources(
  trigger: AlertConditionCapability,
  t: TranslateFn,
): EventSubscriptionFilterRule {
  const rule = trigger.condition;
  const sources = trigger.sources.map((source) => getEntityNameLabel(source, t)).join(', ');
  return { ...rule, displayName: `${rule.displayName ?? rule.name} (${sources})` };
}

/**
 * getSelectionSupport (AlertSelectionUtil.ts:63-98). No sources: only
 * recipientCategories (from the empty-selection answer, if any). No
 * answer, or an answer for no sources: nothing. A stale answer (given
 * for other sources): only section visibility, nothing choosable. A
 * matching answer: the full support.
 */
export function getSelectionSupport(args: {
  sources?: string[];
  selection?: AlertCapabilities;
  answeredFor?: string[];
  t: TranslateFn;
}): AlertSelectionSupport {
  const { selection, answeredFor = [], t } = args;
  const sources = args.sources ?? [];
  const selected = [...new Set(sources)];
  if (selected.length === 0) {
    return { recipientCategories: selection?.recipientCategories };
  }
  if (!selection || answeredFor.length === 0) {
    return {};
  }
  const shown: AlertSelectionSupport = {
    recipientCategories: selection.recipientCategories,
    hasFilters: (selection.filters?.length ?? 0) > 0,
    hasTriggers: (selection.triggers?.length ?? 0) > 0,
  };
  const sortedAnswered = [...new Set(answeredFor)].sort();
  const sortedSelected = [...selected].sort();
  if (
    sortedAnswered.length !== sortedSelected.length ||
    sortedAnswered.some((name, index) => name !== sortedSelected[index])
  ) {
    return shown;
  }
  return {
    ...shown,
    supportedFilters: selection.filters.map((filter) => filter.condition),
    // With one source every trigger is its own, and saying so would only be noise.
    supportedTriggers: selection.triggers.map((trigger) =>
      selected.length > 1 ? labelledWithItsSources(trigger, t) : trigger.condition,
    ),
    containerEntities: selection.containerEntities,
    supportedEventTypes: selection.eventTypes,
  };
}

/**
 * shouldShowRuleSection (AlertSelectionUtil.ts:105-115). With no source
 * chosen the section shows, empty. Once the server has said whether the
 * sources support any rule of that kind, it shows when they do. Until
 * then it shows only for rules the alert already holds.
 */
export function shouldShowRuleSection(
  sources: string[],
  hasRules: boolean | undefined,
  chosenRules: unknown[] | undefined,
): boolean {
  if (sources.length === 0) {
    return true;
  }
  return hasRules === undefined ? (chosenRules?.length ?? 0) > 0 : hasRules;
}

/**
 * getAlertSourceChanges (AlertSelectionUtil.ts:123-133): choosing other
 * sources restarts filters/triggers (the new sources may not support
 * them) and restarts destinations only when a source is taken away.
 * Rules stored without selections stay listed.
 */
export function getAlertSourceChanges(
  next: string[],
  previous: string[],
  hasRulesWithoutSelections = false,
): { resources: string[]; input?: AlertFilteringInput; destinations?: [] } {
  return {
    resources: next,
    ...(hasRulesWithoutSelections ? {} : { input: {} }),
    ...(previous.some((source) => !next.includes(source)) ? { destinations: [] as [] } : {}),
  };
}

export interface SourceOption {
  name: string;
  disabled: boolean;
  reason?: string;
  warning?: string;
  kind: SourceKind;
}

/**
 * getSourceOptions (AlertSelectionUtil.ts:149-165). When the latest
 * answer failed, the previously known sources are offered as they are.
 * Disabled iff unselected and canJoin is false; the reason shows only
 * then; the warning shows only for selected sources.
 */
export function getSourceOptions(
  selected: string[],
  selection?: AlertCapabilities,
  knownSources: AlertSourceCapability[] = [],
): SourceOption[] {
  return (selection?.sources ?? knownSources).map((about) => {
    const isSelected = selected.includes(about.name);
    const canJoin = about.canJoin !== false;
    return {
      name: about.name,
      disabled: !isSelected && !canJoin,
      reason: isSelected || canJoin ? undefined : about.reason,
      warning: isSelected ? about.warning : undefined,
      kind: about.kind,
    };
  });
}

const KINDS_IN_ORDER: SourceKind[] = ['all', 'entity', 'activity'];

/** groupSourcesByKind (AlertSelectionUtil.ts:170-176): All, Entity, Activity; empty groups dropped. */
export function groupSourcesByKind<T extends { kind: SourceKind }>(
  sources: T[],
): Array<{ kind: SourceKind; sources: T[] }> {
  return KINDS_IN_ORDER.map((kind) => ({
    kind,
    sources: sources.filter((source) => source.kind === kind),
  })).filter((group) => group.sources.length > 0);
}

/** getSourceKindLabel (AlertSelectionUtil.ts:178-187). */
export function getSourceKindLabel(kind: SourceKind, t: TranslateFn): string {
  switch (kind) {
    case 'all':
      return t('label.all-entity', { entity: t('label.event-plural') });
    case 'activity':
      return t('label.data-collaboration');
    default:
      return t('label.data-asset-plural');
  }
}

interface ChosenInTheForm {
  name?: string;
  effect?: string;
  arguments?: Array<{ name?: string; input?: string[] }>;
}

function onlyWhatIsFilledIn(chosen?: ChosenInTheForm[]): ArgumentsInput[] {
  return (chosen ?? [])
    .filter((row) => Boolean(row?.name))
    .map((row) => ({
      name: row.name,
      effect: row.effect as ArgumentsInput['effect'],
      arguments: (row.arguments ?? [])
        .filter((argument) => argument?.name && (argument.input?.length ?? 0) > 0)
        .map((argument) => ({ name: argument.name, input: argument.input })),
    }));
}

/**
 * toCapabilitiesInput (AlertSelectionUtil.ts:210-217): what has been
 * chosen so far, as the server reads it. A row with no name yet is
 * dropped — the server would refuse the whole question because of it.
 */
export function toCapabilitiesInput(input?: {
  filters?: ChosenInTheForm[];
  actions?: ChosenInTheForm[];
}): AlertFilteringInput {
  return {
    filters: onlyWhatIsFilledIn(input?.filters),
    actions: onlyWhatIsFilledIn(input?.actions),
  };
}

/**
 * Entity-type to search-index mapping (SearchClassBase.ts:132-176 over
 * entity.enum.ts values). Every entry is the identity except
 * mlmodelService, whose index is mlModelService.
 */
export const ENTITY_TYPE_SEARCH_INDEX_MAPPING: Record<string, string> = {
  all: 'all',
  table: 'table',
  chart: 'chart',
  pipeline: 'pipeline',
  dashboard: 'dashboard',
  mlmodel: 'mlmodel',
  topic: 'topic',
  container: 'container',
  tag: 'tag',
  glossaryTerm: 'glossaryTerm',
  storedProcedure: 'storedProcedure',
  dashboardDataModel: 'dashboardDataModel',
  searchIndex: 'searchIndex',
  databaseService: 'databaseService',
  messagingService: 'messagingService',
  dashboardService: 'dashboardService',
  pipelineService: 'pipelineService',
  mlmodelService: 'mlModelService',
  storageService: 'storageService',
  searchService: 'searchService',
  domain: 'domain',
  dataProduct: 'dataProduct',
  database: 'database',
  databaseSchema: 'databaseSchema',
  user: 'user',
  team: 'team',
  testCase: 'testCase',
  testSuite: 'testSuite',
  glossary: 'glossary',
  ingestionPipeline: 'ingestionPipeline',
  dataContract: 'dataContract',
  apiService: 'apiService',
  apiCollection: 'apiCollection',
  apiEndpoint: 'apiEndpoint',
  metric: 'metric',
  directory: 'directory',
  file: 'file',
  spreadsheet: 'spreadsheet',
  worksheet: 'worksheet',
  tableColumn: 'tableColumn',
  page: 'page',
};

/**
 * getFqnSearchIndexes (AlertsUtil.tsx:159-176): the source indexes plus
 * the container-entity indexes, so a parent FQN can scope to its
 * descendants. The `all` index spans every entity, so ancestor indexes
 * are redundant there and it short-circuits alone.
 */
export function getFqnSearchIndexes(
  selectedTrigger: string | string[],
  containerEntities: string[] = [],
): string[] {
  const sources = [selectedTrigger].flat();
  if (sources.some((source) => ENTITY_TYPE_SEARCH_INDEX_MAPPING[source] === 'all')) {
    return ['all'];
  }
  return [
    ...new Set(
      [...sources, ...containerEntities]
        .map((type) => ENTITY_TYPE_SEARCH_INDEX_MAPPING[type])
        .filter((index): index is string => Boolean(index)),
    ),
  ];
}

/** UUID_REGEX (regex.constants.ts:66-67). */
export const UUID_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
