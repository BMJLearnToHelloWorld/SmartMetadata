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
import {
  AVATAR_INITIALS_FONT_PX,
  AVATAR_SIZE_PX,
  getAvatarEdge,
  getAvatarStyle,
  getEntityName,
  getFirstAlphanumeric,
  getImageWithResolutionAndFallback,
  getRandomColor,
  getUserWithImage,
  ImageQuality,
  resolveAvatarSize,
  SMALL_LOADER_SIZES,
} from './profilePictureUtils';

describe('getFirstAlphanumeric', () => {
  it('returns the first letter lowercased', () => {
    expect(getFirstAlphanumeric('Alice')).toBe('a');
    expect(getFirstAlphanumeric('Ωmega')).toBe('ω');
    expect(getFirstAlphanumeric(' 张三')).toBe('张');
  });

  it('returns the first digit when it comes first', () => {
    expect(getFirstAlphanumeric('123abc')).toBe('1');
  });

  it('falls back to the first char when nothing matches', () => {
    expect(getFirstAlphanumeric('!!!')).toBe('!');
    expect(getFirstAlphanumeric('')).toBe('');
  });
});

describe('getRandomColor', () => {
  it('derives a deterministic hue from the name', () => {
    // A(65)+l(108)+i(105)+c(99)+e(101) = 478; 478*8 = 3824; 3824 % 360 = 224.
    const color = getRandomColor('Alice');
    expect(color.hue).toBe(224);
    expect(color.color).toBe('hsl(224, 70%, 40%)');
    expect(color.backgroundColor).toBe('hsl(224, 100%, 92%)');
    expect(color.borderColor).toBe('hsl(224, 70%, 80%)');
    expect(color.character).toBe('A');
  });

  it('handles an empty name', () => {
    const color = getRandomColor('');
    expect(color.hue).toBe(0);
    expect(color.character).toBe('');
  });
});

describe('getImageWithResolutionAndFallback', () => {
  const full = {
    image: 'base',
    image24: '24',
    image32: '32',
    image48: '48',
    image72: '72',
    image192: '192',
    image512: '512',
  };

  it('resolves each quality to its own fallback chain', () => {
    expect(getImageWithResolutionAndFallback(ImageQuality['6x'], full)).toBe('512');
    expect(getImageWithResolutionAndFallback(ImageQuality['4x'], full)).toBe('72');
    expect(getImageWithResolutionAndFallback(ImageQuality['2x'], full)).toBe('32');
  });

  it('falls back down the chain when resolutions are missing', () => {
    expect(getImageWithResolutionAndFallback(ImageQuality['6x'], { image: 'base', image72: '72' })).toBe('72');
    expect(getImageWithResolutionAndFallback(ImageQuality['2x'], { image: 'base' })).toBe('base');
  });

  it('returns the base image for 1x and for an absent list', () => {
    expect(getImageWithResolutionAndFallback(ImageQuality['1x'], full)).toBe('base');
    expect(getImageWithResolutionAndFallback(ImageQuality['6x'], undefined)).toBeUndefined();
    expect(getImageWithResolutionAndFallback(ImageQuality['6x'], {})).toBeUndefined();
  });
});

describe('getUserWithImage', () => {
  it('returns non-bot users unchanged', () => {
    const user = { profile: { images: { image: 'x' } }, isBot: false };
    expect(getUserWithImage(user)).toBe(user);
  });

  it('returns bots without an image unchanged (bot-logo branch held)', () => {
    const bot = { profile: undefined, isBot: true };
    expect(getUserWithImage(bot)).toBe(bot);
  });
});

describe('resolveAvatarSize', () => {
  it('prefers the explicit size', () => {
    expect(resolveAvatarSize('lg', '24')).toBe('lg');
  });

  it('maps legacy widths, defaulting to sm', () => {
    expect(resolveAvatarSize(undefined, '24')).toBe('xs');
    expect(resolveAvatarSize(undefined, '36')).toBe('sm');
    expect(resolveAvatarSize(undefined, undefined)).toBe('sm');
    expect(resolveAvatarSize(undefined, '99')).toBe('sm');
    expect(resolveAvatarSize(undefined, 'abc')).toBe('sm');
    expect(resolveAvatarSize(undefined, '80')).toBe('2xl');
  });
});

describe('avatar size tables', () => {
  it('maps sizes to core pixel values', () => {
    expect(AVATAR_SIZE_PX.xxs).toBe(16);
    expect(AVATAR_SIZE_PX.xs).toBe(24);
    expect(AVATAR_SIZE_PX.sm).toBe(32);
    expect(AVATAR_SIZE_PX.md).toBe(40);
    expect(AVATAR_SIZE_PX['2xl']).toBe(64);
    expect(AVATAR_INITIALS_FONT_PX.xxs).toBe(8);
    expect(AVATAR_INITIALS_FONT_PX['2xl']).toBe(24);
    expect(SMALL_LOADER_SIZES).toEqual(['xxs', 'xs']);
  });
});

describe('getAvatarStyle / getAvatarEdge', () => {
  it('solid avatars take the fill color and white text', () => {
    expect(getAvatarStyle(true, 224, 'hsl(224, 70%, 40%)')).toEqual({
      backgroundColor: 'hsl(224, 70%, 40%)',
      color: '#fff',
    });
  });

  it('outlined avatars carry the hue as a CSS variable', () => {
    expect(getAvatarStyle(false, 224, 'hsl(224, 70%, 40%)')).toEqual({ '--avatar-hue': 224 });
  });

  it('edges follow the solid/borderless/matchRing matrix', () => {
    expect(getAvatarEdge(false, false, true)).toEqual({
      colorVariant: undefined,
      contrastBorder: true,
      matchRingToFill: true,
    });
    expect(getAvatarEdge(false, true, true)).toEqual({
      colorVariant: 'neutral',
      contrastBorder: false,
      matchRingToFill: false,
    });
    expect(getAvatarEdge(true, false, true)).toEqual({
      colorVariant: undefined,
      contrastBorder: false,
      matchRingToFill: true,
    });
  });
});

describe('getEntityName', () => {
  it('prefers displayName, then name, then empty', () => {
    expect(getEntityName({ displayName: 'D', name: 'n' })).toBe('D');
    expect(getEntityName({ name: 'n' })).toBe('n');
    expect(getEntityName(undefined)).toBe('');
    expect(getEntityName(null)).toBe('');
  });
});
