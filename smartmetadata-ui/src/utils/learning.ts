/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 *
 * Official learning.utils (opensInNewTab, openUrlInNewTab,
 * getDurationUnitLabelKey) plus VideoPlayer getEmbedUrl.
 */
import { getSafeHttpUrl } from '@/catalog/safeHttpUrl';

const READ_TIME_RESOURCE_TYPES = new Set(['Article', 'Link', 'PDF']);

export function opensInNewTab(resourceType: string): boolean {
  return resourceType === 'Link';
}

export function getDurationUnitLabelKey(resourceType: string): string {
  return READ_TIME_RESOURCE_TYPES.has(resourceType) ? 'label.min-read' : 'label.min-watch';
}

export function openUrlInNewTab(url: string): void {
  const safeUrl = getSafeHttpUrl(url);
  if (safeUrl) {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  }
}

const YOUTUBE_HOSTNAMES = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];
const VIMEO_HOSTNAMES = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];

function buildYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${window.location.origin}`;
}

function getYouTubeEmbedUrl(parsedUrl: URL, originalUrl: string): string {
  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === 'youtu.be') {
    const videoId = parsedUrl.pathname.split('/').filter(Boolean)[0] || '';
    return videoId ? buildYouTubeEmbedUrl(videoId) : originalUrl;
  }
  if (parsedUrl.pathname.startsWith('/watch')) {
    const videoId = parsedUrl.searchParams.get('v') || '';
    return videoId ? buildYouTubeEmbedUrl(videoId) : originalUrl;
  }
  if (parsedUrl.pathname.startsWith('/embed/')) {
    return originalUrl;
  }
  return originalUrl;
}

function getVimeoEmbedUrl(parsedUrl: URL, originalUrl: string): string {
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  const videoId = pathParts[pathParts.length - 1] || '';
  return videoId ? `https://player.vimeo.com/video/${videoId}` : originalUrl;
}

/** Official VideoPlayer getEmbedUrl: URL must already be getSafeHttpUrl-accepted. */
export function getEmbedUrl(url: string): string {
  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname.toLowerCase();
  if (YOUTUBE_HOSTNAMES.includes(hostname)) {
    return getYouTubeEmbedUrl(parsedUrl, url);
  }
  if (VIMEO_HOSTNAMES.includes(hostname)) {
    return getVimeoEmbedUrl(parsedUrl, url);
  }
  return url;
}
