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
import type { SearchExplanation } from '@/types/api';
import {
  buildRankingDetails,
  formatScoreValue,
  rankingStagesFromMatchedQueries,
  scoreReasonsFromExplanation,
  signalBoostsFromExplanation,
} from './rankingDetails';

function explanation(
  description: string,
  value: number,
  details: SearchExplanation[] = [],
): SearchExplanation {
  return { value, description, details };
}

describe('formatScoreValue', () => {
  it('uses two decimals at ten and above, four below', () => {
    expect(formatScoreValue(12.345678)).toBe('12.35');
    expect(formatScoreValue(9.123456)).toBe('9.1235');
    expect(formatScoreValue(10)).toBe('10.00');
  });
});

describe('rankingStagesFromMatchedQueries', () => {
  it('maps ranking: stage names to their label and description keys', () => {
    expect(rankingStagesFromMatchedQueries(['ranking:exactName', 'ranking:closeName'])).toEqual([
      {
        name: 'exactName',
        labelKey: 'explore.rankingExactName',
        descriptionKey: 'explore.rankingExactNameExplanation',
      },
      {
        name: 'closeName',
        labelKey: 'explore.rankingCloseName',
        descriptionKey: 'explore.rankingCloseNameExplanation',
      },
    ]);
  });

  it('ignores non-ranking queries, dedupes stages, and falls back to the generic description', () => {
    expect(
      rankingStagesFromMatchedQueries(['other', 'ranking:weirdStage', 'ranking:weirdStage']),
    ).toEqual([
      { name: 'weirdStage', descriptionKey: 'explore.rankingGenericStage' },
    ]);
  });

  it('returns no stages without matched queries', () => {
    expect(rankingStagesFromMatchedQueries(undefined)).toEqual([]);
    expect(rankingStagesFromMatchedQueries([])).toEqual([]);
  });
});

describe('scoreReasonsFromExplanation', () => {
  it('reads weight and ConstantScore matches and skips the deleted field', () => {
    const reasons = scoreReasonsFromExplanation(
      explanation('sum of', 5, [
        explanation('weight(displayName.keyword:orders in 0)', 3),
        explanation('ConstantScore(tier.tagFQN:Tier.Tier1 in 0)', 2),
        explanation('weight(deleted:false in 0)', 4),
        explanation('unreadable subtree', 9),
      ]),
    );
    expect(reasons).toEqual([
      { description: 'displayName: orders', value: 3 },
      { description: 'tier.tagFQN: Tier.Tier1', value: 2 },
    ]);
  });

  it('sorts by value desc, dedupes descriptions, and caps at four', () => {
    const details = Array.from({ length: 6 }, (_, index) =>
      explanation(`weight(field${index}.keyword:value${index} in 0)`, index + 1),
    );
    details.push(explanation('weight(field1.keyword:value1 in 0)', 99));
    const reasons = scoreReasonsFromExplanation(explanation('sum of', 100, details));
    expect(reasons).toHaveLength(4);
    expect(reasons[0]).toEqual({ description: 'field1: value1', value: 99 });
    expect(reasons.map((reason) => reason.description)).toEqual([
      'field1: value1',
      'field5: value5',
      'field4: value4',
      'field3: value3',
    ]);
  });

  it('returns no reasons without an explanation', () => {
    expect(scoreReasonsFromExplanation(undefined)).toEqual([]);
  });
});

describe('signalBoostsFromExplanation', () => {
  it('splits lexical vs signal under a sum combiner and labels field functions', () => {
    const boosts = signalBoostsFromExplanation(
      explanation('sum of', 12, [
        explanation('weight(name:orders in 0)', 7),
        explanation('function score, score mode: multiply', 5, [
          explanation(
            "field value function: none(doc['usageSummary.weeklyStats.count'].value?:0.0 * factor=0.005)",
            3,
          ),
          explanation(
            "field value function: none(doc['totalVotes'].value?:0.0 * factor=0.005)",
            2,
          ),
        ]),
      ]),
      'Baseline',
    );
    expect(boosts).toMatchObject({
      total: 5,
      rawTotal: 5,
      lexicalScore: 7,
      isCapped: false,
      maxBoost: undefined,
    });
    expect(boosts?.contributions).toEqual([
      { label: 'usageSummary.weeklyStats.count', value: 3 },
      { label: 'totalVotes', value: 2 },
    ]);
  });

  it('reports the max_boost cap when the function score is capped', () => {
    const boosts = signalBoostsFromExplanation(
      explanation('sum of', 20, [
        explanation('weight(name:orders in 0)', 10),
        explanation('min of', 10, [
          explanation('function score, score mode: multiply', 15, [
            explanation("field value function: doc['totalVotes']", 15),
          ]),
          explanation('maxBoost', 10),
        ]),
      ]),
      'Baseline',
    );
    expect(boosts).toMatchObject({ total: 10, rawTotal: 15, isCapped: true, maxBoost: 10 });
  });

  it('names the match_all weight Baseline and returns undefined without a function score', () => {
    const boosts = signalBoostsFromExplanation(
      explanation('sum of', 5, [
        explanation('function score, score mode: multiply', 5, [
          explanation('weight(match_all in 0)', 5),
        ]),
      ]),
      'Baseline',
    );
    expect(boosts?.contributions).toEqual([{ label: 'Baseline', value: 5 }]);
    expect(signalBoostsFromExplanation(explanation('weight(name:x in 0)', 1), 'Baseline')).toBeUndefined();
    expect(signalBoostsFromExplanation(undefined, 'Baseline')).toBeUndefined();
  });
});

describe('buildRankingDetails', () => {
  it('returns null with no stages and no score', () => {
    expect(buildRankingDetails({}, 'Baseline')).toBeNull();
  });

  it('returns the section when a score is present even without stages', () => {
    const details = buildRankingDetails({ score: 4.5 }, 'Baseline');
    expect(details).toMatchObject({ score: 4.5, stages: [], reasons: [], boosts: undefined });
  });
});
