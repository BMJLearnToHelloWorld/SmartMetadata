/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Avatar color, image-resolution, and size helpers ported from the official
 * tree. Anchors (392b3efd object tree):
 * - getFirstAlphanumeric / getRandomColor:
 *   openmetadata-ui/.../utils/ColorUtils.ts:20-47
 * - ImageQuality / getImageWithResolutionAndFallback:
 *   openmetadata-ui/.../utils/ProfilerUtils.ts:41-100
 * - getUserWithImage: openmetadata-ui/.../utils/UserDataUtils.ts:86-105
 * - WIDTH_TO_SIZE / resolveAvatarSize / outlined classes / edge:
 *   openmetadata-ui/.../components/common/ProfilePicture/ProfilePicture.tsx:32-129
 * - Avatar pixel sizes: openmetadata-ui-core-components/.../components/base/
 *   avatar/avatar.tsx:68-104 (tw:size-4/6/8/10/12/14/16).
 */

export const getFirstAlphanumeric = (name: string): string => {
  /**
   * \p{L} → matches any kind of letter from any language (Latin, Cyrillic, Chinese, etc.).
   * \p{N} → matches any kind of numeric digit (Arabic-Indic, Roman numerals, etc.).
   * u flag → required for Unicode property escapes to work.
   */
  const match = name.match(/[\p{L}\p{N}]/u);

  return match ? match[0].toLowerCase() : name.charAt(0).toLowerCase();
};

export const getRandomColor = (name: string) => {
  const firstAlphabet = getFirstAlphanumeric(name);
  // Convert the user's name to a numeric value
  let nameValue = 0;
  for (let i = 0; i < name.length; i++) {
    nameValue += name.charCodeAt(i) * 8;
  }

  // Generate a random hue based on the name value
  const hue = nameValue % 360;

  return {
    hue,
    color: `hsl(${hue}, 70%, 40%)`,
    backgroundColor: `hsl(${hue}, 100%, 92%)`,
    borderColor: `hsl(${hue}, 70%, 80%)`,
    character: firstAlphabet.toUpperCase(),
  };
};

export enum ImageQuality {
  '1x' = '1x',
  '1.5x' = '1.5x',
  '2x' = '2x',
  '3x' = '3x',
  '4x' = '4x',
  '5x' = '5x',
  '6x' = '6x',
}

export interface ImageList {
  image?: string;
  image24?: string;
  image32?: string;
  image48?: string;
  image72?: string;
  image192?: string;
  image512?: string;
}

/*
 * It's having fallback mechanism, so if you ask for 2x
 * It will try to find `2x` first if not found
 * Then it will try for `1.5x` if not found
 * Then it will try for `1x` or return `undefined` if not found
 */
const computeImageFallbacks = (imageList?: ImageList) => {
  const { image, image24, image32, image48, image72, image192, image512 } =
    imageList || {};

  const fallbackFrom24 = image24 || image;
  const fallbackFrom32 = image32 || fallbackFrom24;
  const fallbackFrom48 = image48 || fallbackFrom32;
  const fallbackFrom72 = image72 || fallbackFrom48;
  const fallbackFrom192 = image192 || fallbackFrom72;
  const fallbackFrom512 = image512 || fallbackFrom192;

  return {
    image,
    fallbackFrom24,
    fallbackFrom32,
    fallbackFrom48,
    fallbackFrom72,
    fallbackFrom192,
    fallbackFrom512,
  };
};

export const getImageWithResolutionAndFallback = (
  quality: ImageQuality,
  imageList?: ImageList
): string | undefined => {
  const {
    image,
    fallbackFrom24,
    fallbackFrom32,
    fallbackFrom48,
    fallbackFrom72,
    fallbackFrom192,
    fallbackFrom512,
  } = computeImageFallbacks(imageList);

  // Each quality resolves to its own fallback chain (e.g. 4x falls back
  // through 72->48->32->24->base), computed above; anything not in the map
  // (including 1x) returns the base image.
  const qualityToImage: Partial<Record<ImageQuality, string | undefined>> = {
    [ImageQuality['1.5x']]: fallbackFrom24,
    [ImageQuality['2x']]: fallbackFrom32,
    [ImageQuality['3x']]: fallbackFrom48,
    [ImageQuality['4x']]: fallbackFrom72,
    [ImageQuality['5x']]: fallbackFrom192,
    [ImageQuality['6x']]: fallbackFrom512,
  };

  return qualityToImage[quality] ?? image;
};

/**
 * Official getUserWithImage returns the user unchanged except for bots
 * without a profile image, where it injects the brand bot logo
 * (userClassBase.getBotLogo). The product has no bot-logo source, so the
 * bot branch is held: bots without an image keep their initials avatar.
 * RESIDUAL: bot-logo injection needs a product bot-logo asset/mechanism;
 * do not invent one here.
 */
export function getUserWithImage<T extends { profile?: { images?: ImageList }; isBot?: boolean }>(
  user: T
): T {
  const profile =
    getImageWithResolutionAndFallback(ImageQuality['6x'], user.profile?.images) ?? '';

  if (!profile && user.isBot) {
    // Held: no product equivalent of userClassBase.getBotLogo(user.name).
    return user;
  }

  return user;
}

export type CoreAvatarSize = 'xxs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

// Maps numeric pixel width to the closest core-components Avatar size.
const WIDTH_TO_SIZE: Partial<Record<number, CoreAvatarSize>> = {
  16: 'xxs',
  18: 'xxs',
  20: 'xs',
  24: 'xs',
  28: 'xs',
  32: 'sm',
  36: 'sm',
  40: 'md',
  48: 'lg',
  56: 'xl',
  64: '2xl',
  80: '2xl',
};

export const SMALL_LOADER_SIZES: CoreAvatarSize[] = ['xxs', 'xs'];

// Resolve the effective Avatar size: prefer the defined `size`, otherwise map
// the legacy numeric `width` to the nearest defined size (default `sm`).
export function resolveAvatarSize(
  size: CoreAvatarSize | undefined,
  width: string | undefined
): CoreAvatarSize {
  if (size) {
    return size;
  }

  return WIDTH_TO_SIZE[parseInt(width ?? '') || 36] ?? 'sm';
}

/** Core Avatar root sizes in pixels (tw:size-4/6/8/10/12/14/16). */
export const AVATAR_SIZE_PX: Record<CoreAvatarSize, number> = {
  xxs: 16,
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 56,
  '2xl': 64,
};

/** Core Avatar initials font sizes in pixels. */
export const AVATAR_INITIALS_FONT_PX: Record<CoreAvatarSize, number> = {
  xxs: 8,
  xs: 10,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 20,
  '2xl': 24,
};

export function getAvatarStyle(
  isSolid: boolean,
  hue: number,
  color: string
): Record<string, string | number> {
  return isSolid
    ? { backgroundColor: color, color: '#fff' }
    : { '--avatar-hue': hue };
}

// How the avatar is edged. The outlined look draws a contrast outline and a
// tinted border; a borderless avatar takes the neutral variant, which has no
// border, while its fill and text colors still come from the hue classes.
export function getAvatarEdge(
  isSolid: boolean,
  borderless: boolean,
  matchRingToFill: boolean
) {
  return {
    colorVariant: borderless ? ('neutral' as const) : undefined,
    contrastBorder: !isSolid && !borderless,
    matchRingToFill: matchRingToFill && !borderless,
  };
}

/** Official TERM_ADMIN (constants.ts:92): the Admin role chip label. */
export const TERM_ADMIN = 'Admin';

/** Official getEntityName (utils/EntityNameUtils.ts:27-32). */
export function getEntityName(
  entity?: { displayName?: string; name?: string } | null
): string {
  return entity?.displayName || entity?.name || '';
}
