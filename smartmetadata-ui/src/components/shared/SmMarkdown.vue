<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';

/**
 * Product-wide markdown renderer (A10 selection, shared with A4 rich-text
 * diffs). Deliberately dependency-free: no `marked`/`dompurify` is added
 * to package.json, so there is no new bundle cost and no new supply
 * surface for the parent to adjudicate. The trade is a bounded subset —
 * headings, bold/italic, inline + fenced code, links, lists, quotes and
 * rules — which covers the short prose descriptions the server returns
 * (e.g. marketplace app descriptions). Raw HTML in the source is always
 * escaped first, so server-supplied text can never inject markup; only
 * tags this renderer itself emits reach v-html. If a future surface
 * needs full GFM (tables, images, footnotes), extend this one component
 * rather than adding a second renderer elsewhere.
 */
const props = withDefaults(
  defineProps<{
    markdown?: string;
    testId?: string;
  }>(),
  { markdown: '', testId: 'sm-markdown' },
);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (/^(https?:|mailto:)/i.test(href)) {
    return escapeHtml(href);
  }
  if (href.startsWith('/') || href.startsWith('#')) {
    return escapeHtml(href);
  }
  return null;
}

function renderInline(escaped: string): string {
  let out = escaped;
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_match, text: string, href: string) => {
      const safe = safeHref(href);
      return safe
        ? `<a href="${safe}" rel="noopener noreferrer" target="_blank">${text}</a>`
        : text;
    },
  );
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');
  return out;
}

function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listItems: string[] | null = null;
  let listTag = 'ul';
  let inCode = false;
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (listItems) {
      blocks.push(
        `<${listTag}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${listTag}>`,
      );
      listItems = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine;
    if (inCode) {
      if (line.trim().startsWith('```')) {
        blocks.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        codeLines.push(escapeHtml(line));
      }
      continue;
    }
    if (line.trim().startsWith('```')) {
      flushParagraph();
      flushList();
      inCode = true;
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(escapeHtml(heading[2].trim()))}</h${level}>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      flushParagraph();
      flushList();
      blocks.push('<hr />');
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      blocks.push(`<blockquote>${renderInline(escapeHtml(quote[1]))}</blockquote>`);
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(line.trim());
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line.trim());
    if (unordered || ordered) {
      flushParagraph();
      const tag = unordered ? 'ul' : 'ol';
      if (!listItems || listTag !== tag) {
        flushList();
        listItems = [];
        listTag = tag;
      }
      listItems.push(escapeHtml((unordered ?? ordered)![1]));
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }
    flushList();
    paragraph.push(escapeHtml(line.trim()));
  }
  if (inCode) {
    blocks.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
  }
  flushParagraph();
  flushList();
  return blocks.join('\n');
}

const html = computed(() => renderMarkdown(props.markdown ?? ''));
</script>

<template>
  <div class="sm-markdown" :data-testid="testId" v-html="html" />
</template>

<style scoped>
.sm-markdown :deep(p) {
  margin: 0 0 8px;
}
.sm-markdown :deep(p:last-child) {
  margin-bottom: 0;
}
.sm-markdown :deep(pre) {
  padding: 8px 12px;
  overflow-x: auto;
  background: var(--sm-bg-subtle, #f5f5f5);
  border-radius: 4px;
}
.sm-markdown :deep(code) {
  font-family: var(--sm-font-mono, monospace);
}
</style>
