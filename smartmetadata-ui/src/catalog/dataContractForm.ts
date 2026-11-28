/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official AddDataContract inherited-field filter, semanticRuleValidator,
 * quality off-page merge, SLA modelled-key merge, and JSONLogic helpers.
 */
import type {
  ContractColumn,
  ContractSLA,
  ContractSecurity,
  DataContract,
  EntityRefLike,
  SemanticsRule,
  TermsOfUse,
} from '@/api/dataContracts';

export function hasInheritedFlag(field: unknown): field is { inherited?: boolean } {
  return typeof field === 'object' && field !== null && 'inherited' in field;
}

export function isInheritedField(field: unknown): boolean {
  return hasInheritedFlag(field) && field.inherited === true;
}

export function resolveFilteredTermsOfUse(contract: DataContract): TermsOfUse | undefined {
  if (isInheritedField(contract.termsOfUse)) {
    return undefined;
  }
  if (typeof contract.termsOfUse === 'object' && contract.termsOfUse !== null) {
    return contract.termsOfUse;
  }
  if (typeof contract.termsOfUse === 'string') {
    return { content: contract.termsOfUse };
  }
  return undefined;
}

export function filterInheritedContract(contract: DataContract | undefined): DataContract | undefined {
  if (!contract) {
    return undefined;
  }
  const filteredSemantics = contract.semantics?.filter((rule) => !isInheritedField(rule));
  const filteredTermsOfUse = resolveFilteredTermsOfUse(contract);
  const { sla: _sla, security: _security, termsOfUse: _termsOfUse, semantics: _semantics, ...baseContract } = contract;
  const result: DataContract = { ...baseContract };
  if (filteredSemantics && filteredSemantics.length > 0) {
    result.semantics = filteredSemantics;
  }
  if (filteredTermsOfUse !== undefined) {
    result.termsOfUse = filteredTermsOfUse;
  }
  if (!isInheritedField(contract.security) && contract.security) {
    result.security = contract.security;
  }
  if (!isInheritedField(contract.sla) && contract.sla) {
    result.sla = contract.sla;
  }
  return result;
}

/** Official semanticRuleValidator: empty / "" / {} is invalid. */
export function semanticRuleValidator(value?: string): true | 'required' {
  if (!value || value === '""' || value === '{}') {
    return 'required';
  }
  return true;
}

export function isEmptySemanticRule(rule?: SemanticsRule): boolean {
  return !rule?.name || !rule.rule;
}

export function validSemantics(semantics?: SemanticsRule[]): SemanticsRule[] | undefined {
  const next = semantics?.filter((semantic) => Boolean(semantic.name) && Boolean(semantic.rule));
  return next && next.length > 0 ? next : undefined;
}

export function validSecurity(security?: ContractSecurity): ContractSecurity | undefined {
  if (!security) {
    return undefined;
  }
  return {
    ...security,
    policies: security.policies?.map((policy) => ({
      ...policy,
      rowFilters: policy.rowFilters?.filter(
        (filter) => Boolean(filter?.columnName) && Boolean(filter?.values && filter.values.length > 0),
      ),
    })),
  };
}

export type ModelledSLAKey =
  | 'availabilityTime'
  | 'timezone'
  | 'columnName'
  | 'maxLatency'
  | 'refreshFrequency'
  | 'retention';

export function toNonNegative(value?: string): number | undefined {
  if (value === undefined || value === '' || Number(value) < 0) {
    return undefined;
  }
  return Number(value);
}

export function parseAvailabilityTime(time?: string): { hour: number; minute: number } | undefined {
  const match = /^(\d{1,2}):(\d{2})/.exec((time ?? '').trim());
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return Number.isInteger(hour) && Number.isInteger(minute) ? { hour, minute } : undefined;
}

export function formatAvailabilityTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Official toContractSLA: start from the stored SLA so unmodeled or
 * unround-trippable values survive; a modelled key is removed only once
 * the user touched and cleared it.
 */
export function toContractSLA(
  modelled: Pick<ContractSLA, ModelledSLAKey>,
  storedSLA: ContractSLA,
  touched: Set<ModelledSLAKey>,
): ContractSLA {
  const sla: ContractSLA = { ...storedSLA };
  (Object.entries(modelled) as Array<[ModelledSLAKey, unknown]>).forEach(([key, value]) => {
    if (value !== undefined) {
      (sla as Record<string, unknown>)[key] = value;
    } else if (touched.has(key)) {
      delete (sla as Record<string, unknown>)[key];
    }
  });
  return sla;
}

export function hasOwnerRuleViolation(
  owners: Array<{ type?: string } > = [],
  { canAddMultipleUserOwners = true, canAddMultipleTeamOwner = true } = {},
): boolean {
  const teamCount = owners.filter((owner) => owner.type === 'team').length;
  const userCount = owners.length - teamCount;
  if (!canAddMultipleUserOwners && userCount > 1) {
    return true;
  }
  return !canAddMultipleTeamOwner && teamCount > 0 && owners.length > 1;
}

export function mergeQualityExpectations(
  selectedIds: string[],
  pageCases: Array<{ id: string; name: string; description?: string }>,
  storedRefsById: Map<string, EntityRefLike>,
): EntityRefLike[] {
  return selectedIds.map((id) => {
    const testCase = pageCases.find((item) => item.id === id);
    if (testCase) {
      return {
        id: testCase.id,
        name: testCase.name,
        description: testCase.description,
        type: 'testCase',
      };
    }
    return storedRefsById.get(id) ?? { id, type: 'testCase' };
  });
}

export function termsOfUseContent(terms?: TermsOfUse | string): string | undefined {
  if (!terms) {
    return undefined;
  }
  if (typeof terms === 'string') {
    return terms;
  }
  const content = terms.content;
  return !content || content === '<p></p>' ? undefined : content;
}

export function pruneEmptyChildren(columns: ContractColumn[]): ContractColumn[] {
  return columns.map((column) => {
    const children = column.children?.length ? pruneEmptyChildren(column.children) : undefined;
    return { ...column, children: children && children.length > 0 ? children : undefined };
  });
}

export function flattenColumns(columns: ContractColumn[]): ContractColumn[] {
  const result: ContractColumn[] = [];
  for (const column of columns) {
    result.push(column);
    if (column.children?.length) {
      result.push(...flattenColumns(column.children));
    }
  }
  return result;
}
