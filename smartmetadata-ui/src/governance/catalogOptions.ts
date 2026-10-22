/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { listClassifications } from '@/api/classifications';
import { listDomains } from '@/api/domains';
import { listGlossaries } from '@/api/glossaries';
import { listGlossaryTerms } from '@/api/glossaryTerms';
import { listTags } from '@/api/tags';
import { listTeams } from '@/api/teams';
import { listUsers } from '@/api/users';
import type { AdminTeam, AdminUser } from '@/types/admin';
import type { AssetTagOption, Domain } from '@/types/governance';

export interface OwnerOption {
  key: string;
  id: string;
  type: 'user' | 'team';
  label: string;
}

export interface GovernanceCatalog {
  owners: OwnerOption[];
  tags: AssetTagOption[];
  domains: Domain[];
}

export function ownerKey(id: string, type: string): string {
  return `${type}:${id}`;
}

export function parseOwnerKey(key: string): { id: string; type: string } | null {
  const index = key.indexOf(':');
  if (index <= 0) {
    return null;
  }
  const type = key.slice(0, index);
  const id = key.slice(index + 1);
  if (!id || (type !== 'user' && type !== 'team')) {
    return null;
  }
  return { id, type };
}

function ownerLabel(item: AdminUser | AdminTeam): string {
  return item.displayName || item.name;
}

export async function loadGovernanceCatalog(): Promise<GovernanceCatalog> {
  const [users, teams, classifications, glossaries, domains] = await Promise.all([
    listUsers({ limit: 100 }).catch(() => ({ data: [] as AdminUser[] })),
    listTeams({ limit: 100 }).catch(() => ({ data: [] as AdminTeam[] })),
    listClassifications({ limit: 100 }).catch(() => ({ data: [] })),
    listGlossaries({ limit: 100 }).catch(() => ({ data: [] })),
    listDomains({ limit: 100 }).catch(() => ({ data: [] as Domain[] })),
  ]);

  const owners: OwnerOption[] = [
    ...users.data
      .filter((user) => user.id)
      .map((user) => ({
        key: ownerKey(user.id, 'user'),
        id: user.id,
        type: 'user' as const,
        label: `${ownerLabel(user)} (user)`,
      })),
    ...teams.data
      .filter((team) => team.id)
      .map((team) => ({
        key: ownerKey(team.id, 'team'),
        id: team.id,
        type: 'team' as const,
        label: `${ownerLabel(team)} (team)`,
      })),
  ];

  const classificationTags = await Promise.all(
    classifications.data.map((classification) =>
      listTags({ parent: classification.fullyQualifiedName || classification.name, limit: 100 }).catch(
        () => ({ data: [] }),
      ),
    ),
  );
  const glossaryTerms = await Promise.all(
    glossaries.data
      .filter((glossary) => glossary.id)
      .map((glossary) => listGlossaryTerms({ glossary: glossary.id, limit: 100 }).catch(() => ({ data: [] }))),
  );

  const tags: AssetTagOption[] = [
    ...classificationTags.flatMap((page) =>
      page.data
        .filter((tag) => tag.fullyQualifiedName || tag.name)
        .map((tag) => ({
          tagFQN: tag.fullyQualifiedName || tag.name,
          name: tag.displayName || tag.name,
          source: 'Classification' as const,
        })),
    ),
    ...glossaryTerms.flatMap((page) =>
      page.data
        .filter((term) => term.fullyQualifiedName || term.name)
        .map((term) => ({
          tagFQN: term.fullyQualifiedName || term.name,
          name: term.displayName || term.name,
          source: 'Glossary' as const,
        })),
    ),
  ];

  return { owners, tags, domains: domains.data };
}
