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
import type { AuditLogEntry } from '@/api/auditLogs';
import {
  extractEntityInfo,
  formatChangeValue,
  getAuditLogDisplayInfo,
  getAuditLogEntityLink,
  getAuditLogHeaderUserLink,
  getChangeDetails,
  getFieldLabel,
  getTextFromHtmlString,
  getTypedEntityLink,
  getUserEntityLink,
  isDescriptionField,
  isLinkableField,
  isUserField,
  parseChangeValue,
  renderChangeValueModel,
  resolveEntityType,
} from './auditLogFeed';

const pinT = (key: string) =>
  (
    {
      'label.added-lowercase': 'added',
      'label.updated-lowercase': 'updated',
      'label.removed-lowercase': 'removed',
      'label.field': 'Field',
    } as Record<string, string>
  )[key] ?? key;

describe('auditLogFeed value formatting', () => {
  it('parses only strings that yield truthy JSON values', () => {
    expect(parseChangeValue('{"a":1}')).toEqual({ a: 1 });
    expect(parseChangeValue('[1,2]')).toEqual([1, 2]);
    expect(parseChangeValue('0')).toBe('0');
    expect(parseChangeValue('null')).toBe('null');
    expect(parseChangeValue('""')).toBe('""');
    expect(parseChangeValue('plain')).toBe('plain');
    expect(parseChangeValue(42)).toBe(42);
    expect(parseChangeValue(null)).toBe(null);
    expect(parseChangeValue(undefined)).toBe(undefined);
  });

  it('strips HTML tags and trims', () => {
    expect(getTextFromHtmlString('<p>Hello <b>World</b></p>')).toBe('Hello World');
    expect(getTextFromHtmlString('')).toBe('');
    expect(getTextFromHtmlString(undefined)).toBe('');
  });

  it('formats values the pin way', () => {
    expect(formatChangeValue(null)).toBe('');
    expect(formatChangeValue(['a', '', 'b'])).toBe('a, b');
    expect(formatChangeValue('<p>Hi</p>')).toBe('Hi');
    expect(formatChangeValue('<p></p>')).toBe('<p></p>');
    expect(formatChangeValue({ displayName: 'D', name: 'N' })).toBe('D');
    expect(formatChangeValue({ name: 'N' })).toBe('N');
    expect(formatChangeValue({ x: 1 })).toBe('{"x":1}');
    expect(formatChangeValue(5)).toBe('5');
    expect(formatChangeValue(true)).toBe('true');
    expect(formatChangeValue('["x","y"]')).toBe('x, y');
  });

  it('extracts entities with the FQN precedence chain', () => {
    expect(
      extractEntityInfo([
        { fullyQualifiedName: 'a.b', tagFQN: 't', name: 'n', displayName: 'D', id: 'e1' },
        { tagFQN: 'tag.x', name: 'x' },
        { fqn: 'f.q', name: 'q' },
        { name: 'bare' },
        'skip-me',
        42,
        { displayName: 'NoFqn' },
      ]),
    ).toEqual([
      { fqn: 'a.b', name: 'n', displayName: 'D', id: 'e1' },
      { fqn: 'tag.x', name: 'x', displayName: undefined, id: undefined },
      { fqn: 'f.q', name: 'q', displayName: undefined, id: undefined },
      { fqn: 'bare', name: 'bare', displayName: undefined, id: undefined },
    ]);
    expect(extractEntityInfo('{"fullyQualifiedName":"s.t","name":"t"}')).toEqual([
      { fqn: 's.t', name: 't', displayName: undefined, id: undefined },
    ]);
    expect(extractEntityInfo(null)).toEqual([]);
    expect(extractEntityInfo('[{"fullyQualifiedName":"a.b"}]')).toEqual([
      { fqn: 'a.b', name: 'b', displayName: undefined, id: undefined },
    ]);
  });

  it('labels fields by their last segment', () => {
    expect(getFieldLabel('a.b.cC')).toBe('C C');
    expect(getFieldLabel('description')).toBe('Description');
    expect(getFieldLabel(undefined)).toBe('');
    expect(getFieldLabel('')).toBe('');
  });

  it('matches linkable, user and description fields case-insensitively', () => {
    expect(isLinkableField('Tags')).toBe(true);
    expect(isLinkableField('a.owner')).toBe(true);
    expect(isLinkableField('owners')).toBe(false);
    expect(isLinkableField('domain')).toBe(true);
    expect(isLinkableField(undefined)).toBe(false);
    expect(isUserField('REVIEWERS')).toBe(true);
    expect(isUserField('teams')).toBe(false);
    expect(isDescriptionField('description')).toBe(true);
    expect(isDescriptionField('columns.description')).toBe(true);
    expect(isDescriptionField('descriptions')).toBe(false);
  });
});

describe('auditLogFeed change details', () => {
  it('returns no node for falsy values', () => {
    expect(renderChangeValueModel('tags', null, 'k')).toBe(null);
    expect(renderChangeValueModel('tags', '', 'k')).toBe(null);
    expect(renderChangeValueModel('tags', 0, 'k')).toBe(null);
  });

  it('links team and user field entities, with avatars for user fields', () => {
    const teams = renderChangeValueModel(
      'teams',
      [{ fullyQualifiedName: 'Eng', name: 'Eng' }],
      'added-teams',
    );
    expect(teams).toEqual({
      kind: 'segments',
      segments: [
        {
          key: 'added-teams-0-Eng',
          text: 'Eng',
          to: { name: 'admin-team', params: { id: 'Eng' } },
        },
      ],
    });
    const owner = renderChangeValueModel(
      'owner',
      { fullyQualifiedName: 'alice', name: 'alice', displayName: 'Alice' },
      'added-owner',
    );
    expect(owner).toEqual({
      kind: 'segments',
      segments: [
        {
          key: 'added-owner-0-alice',
          text: 'Alice',
          to: { name: 'admin-user', params: { id: 'alice' } },
          avatar: { name: 'alice', displayName: 'Alice' },
        },
      ],
    });
  });

  it('renders tag and domain entities as plain text without a path constructor', () => {
    const tags = renderChangeValueModel(
      'tags',
      [{ tagFQN: 'PII.Sensitive', name: 'Sensitive' }],
      'added-tags',
    );
    expect(tags).toEqual({
      kind: 'segments',
      segments: [{ key: 'added-tags-0-PII.Sensitive', text: 'Sensitive' }],
    });
  });

  it('falls back to the plain value when no entities are carried', () => {
    expect(renderChangeValueModel('teams', 'plain text', 'k')).toEqual({
      kind: 'segments',
      segments: [{ key: 'k-plain', text: 'plain text' }],
    });
    expect(renderChangeValueModel('teams', [], 'k')).toEqual({
      kind: 'segments',
      segments: [{ key: 'k-text', text: '' }],
    });
  });

  it('renders description fields as markdown, raw when the value is a string', () => {
    expect(renderChangeValueModel('description', '**bold**', 'k')).toEqual({
      kind: 'markdown',
      markdown: '**bold**',
    });
    expect(renderChangeValueModel('description', { name: 'N' }, 'k')).toEqual({
      kind: 'markdown',
      markdown: 'N',
    });
  });

  it('builds added/updated/deleted details and excludes the deleted field', () => {
    const details = getChangeDetails(
      {
        fieldsAdded: [{ name: 'tags', newValue: [{ tagFQN: 'T', name: 'T' }] }],
        fieldsUpdated: [
          { name: 'description', oldValue: 'old', newValue: 'new' },
          { name: 'deleted', oldValue: false, newValue: true },
          { name: 'owner', newValue: { name: 'bob' } },
        ],
        fieldsDeleted: [{ name: 'displayName', oldValue: 'Old' }],
      },
      pinT,
    );
    expect(details.map((detail) => detail.key)).toEqual([
      'added-tags',
      'updated-description',
      'updated-owner',
      'deleted-displayName',
    ]);
    expect(details[0]).toMatchObject({ actionLabel: 'Added', fieldLabel: 'Tags' });
    expect(details[1]).toMatchObject({ actionLabel: 'Updated', fieldLabel: 'Description' });
    expect(details[1]!.oldValue).toEqual({ kind: 'markdown', markdown: 'old' });
    expect(details[1]!.newValue).toEqual({ kind: 'markdown', markdown: 'new' });
    expect(details[2]!.oldValue).toBe(null);
    expect(details[2]!.newValue).toMatchObject({ kind: 'segments' });
    expect(details[3]).toMatchObject({ actionLabel: 'Removed', fieldLabel: 'Display Name' });
  });

  it('falls back to the field label when the field has no name', () => {
    const details = getChangeDetails({ fieldsAdded: [{ newValue: 'x' }] }, pinT);
    expect(details[0]!.fieldLabel).toBe('Field');
    const missingKey = getChangeDetails({ fieldsAdded: [{ newValue: 'x' }] }, (key) => key);
    expect(missingKey[0]!.fieldLabel).toBe('field');
  });

  it('returns no details without a change description', () => {
    expect(getChangeDetails(undefined, pinT)).toEqual([]);
  });
});

describe('auditLogFeed display info and links', () => {
  it('resolves entity types case-insensitively', () => {
    expect(resolveEntityType('TABLE')).toBe('table');
    expect(resolveEntityType('apiCollection')).toBe('apiCollection');
    expect(resolveEntityType('APICOLLECTION')).toBe('apiCollection');
    expect(resolveEntityType('eventsubscription')).toBe('eventSubscription');
    expect(resolveEntityType('nope')).toBe(undefined);
    expect(resolveEntityType(undefined)).toBe(undefined);
  });

  it('builds display info with the pin fallback chains', () => {
    const log: AuditLogEntry = {
      eventType: 'entityCreated',
      changeEvent: {
        entityType: 'table',
        entity: { name: 'tbl', fullyQualifiedName: 'svc.db.tbl' },
      },
    };
    const info = getAuditLogDisplayInfo(log, 'System');
    expect(info).toMatchObject({
      userName: 'System',
      eventType: 'Entity Created',
      entityType: 'table',
      entityFQN: 'svc.db.tbl',
      entityLabel: 'tbl',
      normalizedType: 'table',
    });
    const withUser = getAuditLogDisplayInfo({ ...log, userName: 'alice' }, 'System');
    expect(withUser.userName).toBe('alice');
    const fqnOnly = getAuditLogDisplayInfo(
      { entityFQN: 'svc.db.tbl', entityId: 'e9' },
      'System',
    );
    expect(fqnOnly.entityLabel).toBe('tbl');
    const idOnly = getAuditLogDisplayInfo({ entityId: 'e9' }, 'System');
    expect(idOnly.entityLabel).toBe('e9');
  });

  it('links typed entities through current routes', () => {
    expect(getTypedEntityLink('svc.db.tbl', 'table', 'tbl')).toEqual({
      kind: 'link',
      to: { name: 'asset', params: { entityType: 'table', fqn: 'svc.db.tbl' } },
      label: 'tbl',
    });
    expect(getTypedEntityLink('RoleA', 'role', undefined)).toEqual({
      kind: 'link',
      to: { name: 'admin-role', params: { fqn: 'RoleA' } },
      label: 'RoleA',
    });
    expect(getTypedEntityLink('PolA', 'policy', undefined)).toEqual({
      kind: 'link',
      to: { name: 'admin-policy', params: { fqn: 'PolA' } },
      label: 'PolA',
    });
    expect(getTypedEntityLink('Eng', 'team', undefined)).toEqual({
      kind: 'link',
      to: { name: 'admin-team', params: { id: 'Eng' } },
      label: 'Eng',
    });
    expect(getTypedEntityLink('PersonaA', 'persona', undefined)).toEqual({
      kind: 'link',
      to: { name: 'admin-settings-persona-detail', params: { fqn: 'PersonaA' } },
      label: 'PersonaA',
    });
    expect(getTypedEntityLink('KpiA', 'kpi', undefined)).toEqual({
      kind: 'link',
      to: { name: 'insights-kpi-detail', params: { fqn: 'KpiA' } },
      label: 'KpiA',
    });
    expect(getTypedEntityLink('Sub', 'eventSubscription', undefined, 'sub1')).toEqual({
      kind: 'link',
      to: { name: 'observability-alert', params: { fqn: 'sub1' } },
      label: 'Sub',
    });
    expect(getTypedEntityLink('Sub', 'eventSubscription', undefined)).toBe(null);
    expect(getTypedEntityLink('Svc', 'databaseService', undefined)).toBe(null);
    expect(getTypedEntityLink(undefined, 'table', undefined)).toBe(null);
    expect(getTypedEntityLink('svc.db.tbl', undefined, undefined)).toBe(null);
  });

  it('prefers the user link for user entities', () => {
    const log: AuditLogEntry = {
      userName: 'admin',
      entityType: 'user',
      changeEvent: { entity: { name: 'bob', displayName: 'Bob' } },
    };
    const info = getAuditLogDisplayInfo(log, 'System');
    expect(getAuditLogEntityLink(log, info)).toEqual({
      kind: 'link',
      to: { name: 'admin-user', params: { id: 'bob' } },
      label: 'Bob',
    });
    expect(getUserEntityLink({ userName: 'admin' }, undefined)).toEqual({
      kind: 'link',
      to: { name: 'admin-user', params: { id: 'admin' } },
      label: 'admin',
    });
    expect(getUserEntityLink({}, undefined)).toBe(null);
  });

  it('falls back to plain text with the pin label chain', () => {
    const log: AuditLogEntry = { entityType: 'databaseService', entityFQN: 'svc' };
    const info = getAuditLogDisplayInfo(log, 'System');
    expect(getAuditLogEntityLink(log, info)).toEqual({ kind: 'text', label: 'svc' });
    expect(getAuditLogEntityLink({}, getAuditLogDisplayInfo({}, 'System'))).toEqual({
      kind: 'text',
      label: '--',
    });
  });

  it('links the header actor only when a userName is present', () => {
    const linked = getAuditLogDisplayInfo({ userName: 'alice' }, 'System');
    expect(getAuditLogHeaderUserLink({ userName: 'alice' }, linked)).toEqual({
      kind: 'link',
      to: { name: 'admin-user', params: { id: 'alice' } },
      label: 'alice',
    });
    const system = getAuditLogDisplayInfo({}, 'System');
    expect(getAuditLogHeaderUserLink({}, system)).toEqual({ kind: 'text', label: 'System' });
  });
});
