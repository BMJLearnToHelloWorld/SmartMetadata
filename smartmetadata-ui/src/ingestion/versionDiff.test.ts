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
import type { ChangeDescription } from '@/api/entities';
import {
  diffWords,
  diffWordsWithSpace,
  getCommonDiffsFromVersionData,
  getCommonExtraInfoForVersionDetails,
  getDiffByFieldName,
  getDiffValue,
  getEntityVersionTags,
  getSummary,
  getTextDiff,
  getUpdatedExtensionDiffFields,
  isTextDiffResult,
  getTierLabel,
  isMajorVersion,
  isMajorVersionForEntry,
  getColumnsDataWithVersionChanges,
  getConstraintChanges,
  type VersionColumn,
  partitionVersionTimeline,
  toDiffableText,
  type TranslateFn,
} from './versionDiff';

const translate: TranslateFn = (key, params) => {
  const messages: Record<string, string> = {
    'settings.services.summary.columnPlural': 'columns',
    'settings.services.summary.tagPlural': 'tags',
    'settings.services.summary.approved': 'Approved',
    'settings.services.summary.archived': 'Archived',
    'settings.services.summary.deprecated': 'Deprecated',
    'settings.services.summary.draft': 'Draft',
    'settings.services.summary.inReview': 'In Review',
    'settings.services.summary.rejected': 'Rejected',
    'settings.services.summary.unprocessed': 'Unprocessed',
    'settings.services.summary.glossaryTermStatus': 'Glossary term status: {status}',
    'settings.services.summary.statusChangedTo': 'Status changed to {status}',
    'settings.services.summary.hasBeenActionType': 'has been {actionType}',
    'settings.services.summary.dataAssetHasBeenActionType': 'Data asset has been {actionType}',
    'settings.services.summary.deletedLowercase': 'deleted',
    'settings.services.summary.restoredLowercase': 'restored',
    'settings.services.summary.added': 'Added',
    'settings.services.summary.addedLowercase': 'added',
    'settings.services.summary.edited': 'Edited',
    'settings.services.summary.updatedLowercase': 'updated',
    'settings.services.summary.removed': 'Removed',
    'settings.services.summary.bulkImportCompleted': 'Bulk import completed',
  };
  let text = messages[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
};

describe('diffWords / diffWordsWithSpace', () => {
  it('diffs words with added/removed/normal parts', () => {
    expect(diffWords('net sales', 'gross sales')).toEqual([
      { value: 'net', added: undefined, removed: true },
      { value: 'gross', added: true, removed: undefined },
      { value: ' sales', added: undefined, removed: undefined },
    ]);
  });

  it('ignores whitespace-only differences in diffWords', () => {
    expect(diffWords('hello  world', 'hello world')).toEqual([
      { value: 'hello  world', added: undefined, removed: undefined },
    ]);
  });

  it('treats whitespace as significant in diffWordsWithSpace', () => {
    const parts = diffWordsWithSpace('hello  world', 'hello world');
    expect(parts.some((part) => part.removed)).toBe(true);
    expect(parts.some((part) => part.added)).toBe(true);
  });

  it('returns no parts for identical text', () => {
    expect(diffWords('same text', 'same text')).toEqual([
      { value: 'same text', added: undefined, removed: undefined },
    ]);
    expect(diffWords('', '')).toEqual([]);
  });
});

describe('toDiffableText', () => {
  it('reads editor HTML as plain text, one line per block', () => {
    expect(toDiffableText('<p>Seed metric <strong>updated</strong> &#61; x</p>')).toBe(
      'Seed metric updated = x',
    );
    expect(toDiffableText('<p>First</p><p>Second</p>')).toBe('First\nSecond');
  });

  it('keeps angle-bracket plain text verbatim', () => {
    expect(toDiffableText('array<string>')).toBe('array<string>');
    expect(toDiffableText('Returns Map<String, Long> per <region>')).toBe(
      'Returns Map<String, Long> per <region>',
    );
  });
});

describe('getTextDiff', () => {
  it('diffs readable text of rich-text descriptions', () => {
    const result = getTextDiff('Seed metric', '<p>Seed metric <strong>updated</strong> &#61; x</p>');
    expect(result.type).toBe('diff');
    if (result.type === 'diff') {
      expect(result.parts.some((part) => part.added && part.value.includes('updated'))).toBe(true);
      expect(result.parts.map((part) => part.value).join('')).toContain('=');
      expect(result.parts.map((part) => part.value).join('')).not.toContain('<p>');
    }
  });

  it('returns the new text verbatim for inline images', () => {
    expect(getTextDiff('old', 'new data:image/png;base64,xx')).toEqual({
      type: 'plain',
      text: 'new data:image/png;base64,xx',
    });
  });

  it('returns the fallback when both sides are empty', () => {
    expect(getTextDiff('', '', 'latest')).toEqual({ type: 'plain', text: 'latest' });
    expect(getTextDiff('', '')).toEqual({ type: 'plain', text: '' });
  });

  it('diffs plain text word by word', () => {
    const result = getTextDiff('net sales', 'gross sales');
    expect(result.type).toBe('diff');
    if (result.type === 'diff') {
      expect(result.parts.some((part) => part.removed)).toBe(true);
      expect(result.parts.some((part) => part.added)).toBe(true);
      expect(result.parts.some((part) => !part.added && !part.removed)).toBe(true);
    }
  });
});

describe('getDiffValue', () => {
  it('marks unchanged parts removed, matching the pin quirk', () => {
    expect(getDiffValue('Tier1', 'Tier2')).toEqual([
      { value: 'Tier1', added: undefined, removed: true },
      { value: 'Tier2', added: true, removed: undefined },
    ]);
    expect(getDiffValue('same', 'same')).toEqual([
      { value: 'same', added: undefined, removed: true },
    ]);
  });
});

describe('getDiffByFieldName', () => {
  const change: ChangeDescription = {
    fieldsUpdated: [
      { field: 'displayName', oldValue: 'a', newValue: 'b' },
      { field: 'owners', oldValue: '[]', newValue: '[]' },
    ],
    fieldsAdded: [{ field: 'tags', newValue: '[]' }],
  };

  it('matches exactly when requested', () => {
    expect(getDiffByFieldName('displayName', change, true).updated?.field).toBe('displayName');
    expect(getDiffByFieldName('display', change, true).updated).toBeUndefined();
  });

  it('matches by inclusion otherwise', () => {
    expect(getDiffByFieldName('display', change).updated?.field).toBe('displayName');
    expect(getDiffByFieldName('owners', change).updated?.field).toBe('owners');
  });
});

describe('getEntityVersionTags', () => {
  it('flags added/removed tags, dedupes by tagFQN, and strips tier', () => {
    const change: ChangeDescription = {
      fieldsUpdated: [
        {
          field: 'tags',
          oldValue: JSON.stringify([{ tagFQN: 'PII.Sensitive' }, { tagFQN: 'Tier.Tier1' }]),
          newValue: JSON.stringify([{ tagFQN: 'PII.Sensitive' }, { tagFQN: 'Custom.A' }]),
        },
      ],
    };
    const tags = getEntityVersionTags(
      [{ tagFQN: 'PII.Sensitive' }, { tagFQN: 'Custom.A' }],
      change,
    );
    expect(tags.map((tag) => tag.tagFQN)).toEqual(['PII.Sensitive', 'Custom.A']);
    expect(tags.find((tag) => tag.tagFQN === 'Custom.A')?.added).toBe(true);
    expect(tags.find((tag) => tag.tagFQN === 'PII.Sensitive')?.added).toBeUndefined();
    expect(tags.find((tag) => tag.tagFQN === 'PII.Sensitive')?.removed).toBeUndefined();
    expect(tags.some((tag) => tag.tagFQN.startsWith('Tier.'))).toBe(false);
  });

  it('keeps removed tags that no longer exist in the current version', () => {
    const change: ChangeDescription = {
      fieldsUpdated: [
        {
          field: 'tags',
          oldValue: JSON.stringify([{ tagFQN: 'Old.Tag' }]),
          newValue: JSON.stringify([]),
        },
      ],
    };
    const tags = getEntityVersionTags([], change);
    expect(tags).toEqual([{ tagFQN: 'Old.Tag', removed: true }]);
  });

  it('accepts already-parsed arrays for tag field values', () => {
    const change: ChangeDescription = {
      fieldsUpdated: [
        {
          field: 'tags',
          oldValue: [{ tagFQN: 'PII.Sensitive' }],
          newValue: [{ tagFQN: 'PII.Sensitive' }, { tagFQN: 'Custom.A' }],
        },
      ],
    };
    const tags = getEntityVersionTags(
      [{ tagFQN: 'PII.Sensitive' }, { tagFQN: 'Custom.A' }],
      change,
    );
    expect(tags.map((tag) => tag.tagFQN)).toEqual(['PII.Sensitive', 'Custom.A']);
    expect(tags.find((tag) => tag.tagFQN === 'Custom.A')?.added).toBe(true);
  });
});

describe('getTierLabel', () => {
  it('prefers displayName, else the FQN second segment', () => {
    expect(getTierLabel({ tagFQN: 'Tier.Tier1', displayName: 'Tier 1' })).toBe('Tier 1');
    expect(getTierLabel({ tagFQN: 'Tier.Tier1' })).toBe('Tier1');
    expect(getTierLabel(undefined)).toBe('');
  });
});

describe('getCommonExtraInfoForVersionDetails', () => {
  it('merges owners with added/removed labels and diffs the tier', () => {
    const change: ChangeDescription = {
      fieldsUpdated: [
        {
          field: 'owners',
          oldValue: JSON.stringify([{ id: 'u1', name: 'alice' }]),
          newValue: JSON.stringify([{ id: 'u2', name: 'bob' }]),
        },
        {
          field: 'tags',
          oldValue: JSON.stringify([{ tagFQN: 'Tier.Tier1' }]),
          newValue: JSON.stringify([{ tagFQN: 'Tier.Tier2' }]),
        },
      ],
    };
    const info = getCommonExtraInfoForVersionDetails(
      change,
      [{ id: 'u2', name: 'bob' }],
      { tagFQN: 'Tier.Tier2' },
      [],
    );
    expect(info.ownerDisplayName.get('bob')?.change).toBe('added');
    expect(info.ownerDisplayName.get('alice')?.change).toBe('removed');
    expect(info.tierDisplayName.type).toBe('diff');
  });

  it('falls back to the current tier label without a tags diff', () => {
    const info = getCommonExtraInfoForVersionDetails({}, [], { tagFQN: 'Tier.Tier1' }, []);
    expect(info.tierDisplayName).toEqual({ type: 'plain', text: 'Tier1' });
  });

  it('accepts already-parsed arrays for owner field values', () => {
    const change: ChangeDescription = {
      fieldsUpdated: [
        {
          field: 'owners',
          oldValue: [{ id: 'u1', name: 'alice' }],
          newValue: [{ id: 'u2', name: 'bob' }],
        },
      ],
    };
    const info = getCommonExtraInfoForVersionDetails(
      change,
      [{ id: 'u2', name: 'bob' }],
      undefined,
      [],
    );
    expect(info.ownerDisplayName.get('bob')?.change).toBe('added');
    expect(info.ownerDisplayName.get('alice')?.change).toBe('removed');
  });
});

describe('getCommonDiffsFromVersionData', () => {
  it('diffs displayName and description against the fallback', () => {
    const diffs = getCommonDiffsFromVersionData(
      { displayName: 'New Name', description: 'New desc', tags: [] },
      { fieldsUpdated: [{ field: 'displayName', oldValue: 'Old Name', newValue: 'New Name' }] },
    );
    expect(diffs.displayName.type).toBe('diff');
    expect(diffs.description).toEqual({ type: 'plain', text: 'New desc' });
  });
});

describe('isMajorVersion', () => {
  it('detects a +1 major bump and rejects NaN', () => {
    expect(isMajorVersion('0.1', '1.1')).toBe(true);
    expect(isMajorVersion('0.1', '0.2')).toBe(false);
    expect(isMajorVersion('NaN', '1.1')).toBe(false);
    expect(isMajorVersionForEntry('1.1', '0.1')).toBe(true);
    expect(isMajorVersionForEntry('0.2', '0.1')).toBe(false);
    expect(isMajorVersionForEntry('0.2', undefined)).toBe(false);
  });
});

describe('getSummary', () => {
  it('renders added/updated/deleted paragraphs with field names', () => {
    const paragraphs = getSummary(
      {
        changeDescription: {
          fieldsAdded: [{ field: 'tags', newValue: JSON.stringify([{ tagFQN: 'A.B' }]) }],
          fieldsUpdated: [{ field: 'description', oldValue: 'a', newValue: 'b' }],
          fieldsDeleted: [{ field: 'owners', oldValue: '[]' }],
        },
      },
      translate,
    );
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toContain('tags A.B');
    expect(paragraphs[0]).toContain('has been added');
    expect(paragraphs[1]).toContain('description');
    expect(paragraphs[1]).toContain('has been updated');
    expect(paragraphs[2]).toContain('owners');
    expect(paragraphs[2]).toContain('has been deleted');
  });

  it('formats tag summaries from already-parsed arrays', () => {
    const paragraphs = getSummary(
      {
        changeDescription: {
          fieldsAdded: [{ field: 'tags', newValue: [{ tagFQN: 'A.B' }] }],
        },
      },
      translate,
    );
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]).toContain('tags A.B');
    expect(paragraphs[0]).toContain('has been added');
  });

  it('renders the deleted/restored paragraph for the deleted field', () => {
    const paragraphs = getSummary(
      { changeDescription: { fieldsUpdated: [{ field: 'deleted', newValue: 'true' }] } },
      translate,
    );
    expect(paragraphs).toEqual(['Data asset has been deleted']);
    const restored = getSummary(
      { changeDescription: { fieldsUpdated: [{ field: 'deleted', newValue: '' }] } },
      translate,
    );
    expect(restored).toEqual(['Data asset has been restored']);
  });

  it('reads an entityStatus change as the status moved to', () => {
    const paragraphs = getSummary(
      {
        changeDescription: {
          fieldsUpdated: [{ field: 'entityStatus', oldValue: 'Draft', newValue: 'Approved' }],
        },
      },
      translate,
    );
    expect(paragraphs[0]).toContain('Status changed to Approved');
    expect(paragraphs[0]).not.toContain('entityStatus');
  });

  it('renders the bulk-import completion text for a bulkImport field', () => {
    const paragraphs = getSummary(
      {
        changeDescription: {
          fieldsUpdated: [{ field: 'bulkImport', newValue: JSON.stringify({ rows: 3 }) }],
        },
      },
      translate,
    );
    expect(paragraphs).toEqual(['Bulk import completed']);
  });

  it('returns no paragraphs without changes', () => {
    expect(getSummary({ changeDescription: undefined }, translate)).toEqual([]);
  });
});

describe('partitionVersionTimeline', () => {
  const versions = [1, 2, 3, 4, 5];

  it('never truncates for -1, 0, or undefined', () => {
    expect(partitionVersionTimeline(versions, -1)).toEqual({ visible: versions, hidden: [] });
    expect(partitionVersionTimeline(versions, 0)).toEqual({ visible: versions, hidden: [] });
    expect(partitionVersionTimeline(versions, undefined)).toEqual({ visible: versions, hidden: [] });
  });

  it('truncates only past the limit for positive maxVersions', () => {
    expect(partitionVersionTimeline(versions, 3)).toEqual({ visible: [1, 2, 3], hidden: [4, 5] });
    expect(partitionVersionTimeline(versions, 9)).toEqual({ visible: versions, hidden: [] });
  });
});

describe('getColumnsDataWithVersionChanges', () => {
  it('marks added, deleted, and updated column fields from official changeDescription', () => {
    const columns: VersionColumn[] = [
      { name: 'id', description: 'identifier', dataTypeDisplay: 'int', tags: [] },
      { name: 'email', description: 'mail', dataTypeDisplay: 'string', tags: [] },
    ];
    const changeDescription = {
      fieldsAdded: [
        { field: 'columns', newValue: JSON.stringify([{ name: 'email', description: 'mail', dataTypeDisplay: 'string' }]) },
      ],
      fieldsDeleted: [
        { field: 'columns', oldValue: JSON.stringify([{ name: 'legacy', description: 'old', dataTypeDisplay: 'string' }]) },
      ],
      fieldsUpdated: [
        { field: 'columns.id.description', oldValue: 'id', newValue: 'identifier' },
      ],
    };
    const result = getColumnsDataWithVersionChanges(changeDescription, columns);
    expect(result.some((column) => column.name === 'legacy')).toBe(true);
    const id = result.find((column) => column.name === 'id');
    expect(id?.descriptionDiff).toBeTruthy();
  });
});

describe('getConstraintChanges', () => {
  it('includes added and updated diffs in addedConstraintDiffs', () => {
    const changeDescription = {
      fieldsAdded: [{ field: 'constraint', newValue: 'PRIMARY_KEY' }],
      fieldsUpdated: [{ field: 'constraint.id', oldValue: 'NULL', newValue: 'UNIQUE' }],
      fieldsDeleted: [{ field: 'constraint', oldValue: 'FOREIGN_KEY' }],
    };
    const result = getConstraintChanges(changeDescription, 'constraint');
    expect(result.addedConstraintDiffs).toHaveLength(2);
    expect(result.deletedConstraintDiffs).toHaveLength(2);
  });
});

describe('getUpdatedExtensionDiffFields', () => {
  it('replaces the updated extension field with a word-level text diff', () => {
    const result = getUpdatedExtensionDiffFields(
      { extension: { owner: 'Platform', kept: 'yes' } },
      {
        updated: { field: 'extension.owner', oldValue: 'Platform', newValue: 'Data Platform' },
      },
    );
    expect(result.extensionObject?.kept).toBe('yes');
    expect(isTextDiffResult(result.extensionObject?.owner)).toBe(true);
    const diff = result.extensionObject?.owner;
    if (!isTextDiffResult(diff) || diff.type !== 'diff') {
      throw new Error('expected a word diff');
    }
    expect(diff.parts.some((part) => part.added && part.value.includes('Data'))).toBe(true);
  });

  it('returns an empty extension object when the updated name has no property segment', () => {
    expect(
      getUpdatedExtensionDiffFields(
        { extension: { owner: 'Platform' } },
        { updated: { field: 'extension', oldValue: 'a', newValue: 'b' } },
      ),
    ).toEqual({ extensionObject: {} });
  });
});
