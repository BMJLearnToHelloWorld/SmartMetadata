import { describe, expect, it, vi } from 'vitest';
import {
  DURATION_ITEMS,
  PAGE_IDS,
  RESOURCE_TYPE_VALUES,
  formatCardDate,
  formatDuration,
  formatTableDate,
  getDurationUnitLabelKey,
  getEmbedUrl,
  getSafeHttpUrl,
  openUrlInNewTab,
  opensInNewTab,
  parseDuration,
} from './learningConstants';

describe('learningConstants', () => {
  it('parses durations to seconds', () => {
    expect(parseDuration('1 min')).toBe(60);
    expect(parseDuration('2 mins')).toBe(120);
    expect(parseDuration('10 mins')).toBe(600);
    expect(parseDuration('30 mins')).toBe(1800);
  });

  it('exposes duration items whose ids are seconds', () => {
    expect(DURATION_ITEMS.map((item) => item.id)).toEqual([
      '60',
      '120',
      '180',
      '300',
      '600',
      '900',
      '1800',
    ]);
    expect(DURATION_ITEMS[3]?.label).toBe('5 mins');
  });

  it('keeps the official form type values (Article is not a form option)', () => {
    expect(RESOURCE_TYPE_VALUES).toEqual(['Video', 'Storylane', 'Link', 'PDF']);
  });

  it('keeps all 49 context page ids in the official order', () => {
    expect(PAGE_IDS).toHaveLength(49);
    expect(PAGE_IDS[0]).toEqual({ value: 'domain', label: 'Domain' });
    expect(PAGE_IDS.find((page) => page.value === 'table')).toEqual({
      value: 'table',
      label: 'Table',
    });
    expect(PAGE_IDS[PAGE_IDS.length - 1]).toEqual({ value: 'settings', label: 'Settings' });
  });

  it('accepts only absolute http(s) urls as safe', () => {
    expect(getSafeHttpUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(getSafeHttpUrl('http://example.com/a')).toBe('http://example.com/a');
    expect(getSafeHttpUrl('ftp://example.com/a')).toBeUndefined();
    expect(getSafeHttpUrl('/relative/path')).toBeUndefined();
    expect(getSafeHttpUrl('not a url')).toBeUndefined();
    expect(getSafeHttpUrl(undefined)).toBeUndefined();
  });

  it('opens only Link resources in a new tab', () => {
    expect(opensInNewTab('Link')).toBe(true);
    expect(opensInNewTab('Video')).toBe(false);
    expect(opensInNewTab('Storylane')).toBe(false);
    expect(opensInNewTab('Article')).toBe(false);
    expect(opensInNewTab('PDF')).toBe(false);
  });

  it('opens safe urls with noopener/noreferrer and ignores unsafe ones', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    openUrlInNewTab('https://example.com/a');
    expect(openSpy).toHaveBeenCalledWith(
      'https://example.com/a',
      '_blank',
      'noopener,noreferrer',
    );
    openUrlInNewTab('javascript:alert(1)');
    expect(openSpy).toHaveBeenCalledTimes(1);
    openSpy.mockRestore();
  });

  it('derives embed urls for YouTube and Vimeo', () => {
    const origin = window.location.origin;
    expect(getEmbedUrl('https://www.youtube.com/watch?v=abc123')).toBe(
      `https://www.youtube.com/embed/abc123?enablejsapi=1&origin=${origin}`,
    );
    expect(getEmbedUrl('https://youtu.be/abc123')).toBe(
      `https://www.youtube.com/embed/abc123?enablejsapi=1&origin=${origin}`,
    );
    expect(getEmbedUrl('https://www.youtube.com/embed/abc123')).toBe(
      'https://www.youtube.com/embed/abc123',
    );
    expect(getEmbedUrl('https://vimeo.com/123456')).toBe(
      'https://player.vimeo.com/video/123456',
    );
    expect(getEmbedUrl('https://example.com/video.mp4')).toBe(
      'https://example.com/video.mp4',
    );
  });

  it('formats durations with the type-specific unit label', () => {
    expect(getDurationUnitLabelKey('Article')).toBe('settings.learning.minRead');
    expect(getDurationUnitLabelKey('Link')).toBe('settings.learning.minRead');
    expect(getDurationUnitLabelKey('PDF')).toBe('settings.learning.minRead');
    expect(getDurationUnitLabelKey('Video')).toBe('settings.learning.minWatch');
    expect(formatDuration(300, 'min watch')).toBe('5 min watch');
    expect(formatDuration(90, 'min read')).toBe('1 min read');
    expect(formatDuration(undefined, 'min watch')).toBeNull();
  });

  it('formats dates in the official luxon shapes', () => {
    // 2026-11-18 12:00 UTC.
    const timestamp = Date.UTC(2026, 10, 18, 12, 0, 0);
    expect(formatTableDate(timestamp)).toBe('Nov 18, 2026');
    expect(formatCardDate(timestamp)).toBe('Nov 18, 2026');
    expect(formatTableDate(undefined)).toBeNull();
    expect(formatCardDate(undefined)).toBeNull();
  });
});
