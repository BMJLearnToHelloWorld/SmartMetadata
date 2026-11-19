<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Bar menu (ported from official BarMenu.tsx at pin a3012259ca): 11 items
  in 4 groups. Tooltips are the raw command names verbatim (official
  `tooltip={item.name}`, :178) — not i18n labels. Buttons fire on
  mousedown + preventDefault so the editor keeps focus. Icons are the
  product icon set's equivalents of the official format glyphs.
-->
<script setup lang="ts">
import {
  BoldOutlined,
  CodeFilled,
  CodeOutlined,
  ItalicOutlined,
  LineOutlined,
  LinkOutlined,
  MessageOutlined,
  OrderedListOutlined,
  PictureOutlined,
  StrikethroughOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons-vue';
import type { Editor } from '@tiptap/vue-3';
import { Button, Divider, Tooltip } from 'ant-design-vue';
import { computed, onBeforeUnmount, onMounted, ref, type Component } from 'vue';
import { FileType } from './blockEditorConstants';

const props = defineProps<{
  editor: Editor;
  onLinkToggle?: () => void;
}>();

// Mirror useCustomEditor's force-update-on-transaction: active states must
// refresh as the selection moves.
const transactionTick = ref(0);
function bumpTick() {
  transactionTick.value += 1;
}
onMounted(() => {
  props.editor.on('transaction', bumpTick);
});
onBeforeUnmount(() => {
  props.editor.off('transaction', bumpTick);
});

interface FormatItem {
  name: string;
  icon: Component;
  command: () => void;
  isActive: () => boolean;
}

const formats = computed<FormatItem[][]>(() => [
  [
    {
      name: 'bold',
      icon: BoldOutlined,
      command: () => props.editor.chain().focus().toggleBold().run(),
      isActive: () => props.editor.isActive('bold'),
    },
    {
      name: 'italic',
      icon: ItalicOutlined,
      command: () => props.editor.chain().focus().toggleItalic().run(),
      isActive: () => props.editor.isActive('italic'),
    },
    {
      name: 'strike',
      icon: StrikethroughOutlined,
      command: () => props.editor.chain().focus().toggleStrike().run(),
      isActive: () => props.editor.isActive('strike'),
    },
  ],
  [
    {
      name: 'inline-code',
      icon: CodeOutlined,
      command: () => props.editor.chain().focus().toggleCode().run(),
      isActive: () => props.editor.isActive('code'),
    },
  ],
  [
    {
      name: 'unordered-list',
      icon: UnorderedListOutlined,
      command: () => props.editor.chain().focus().toggleBulletList().run(),
      isActive: () => props.editor.isActive('bulletList'),
    },
    {
      name: 'ordered-list',
      icon: OrderedListOutlined,
      command: () => props.editor.chain().focus().toggleOrderedList().run(),
      isActive: () => props.editor.isActive('orderedList'),
    },
  ],
  [
    {
      name: 'link',
      icon: LinkOutlined,
      command: () => {
        props.editor.chain().focus().setLink({ href: '' }).run();
        props.onLinkToggle?.();
      },
      isActive: () => props.editor.isActive('link'),
    },
    {
      name: 'image',
      icon: PictureOutlined,
      command: () => {
        const { state } = props.editor.view;
        const { selection } = state;

        // Get the current position
        const pos = selection.$anchor.pos;

        // Create a new selection at the current position
        props.editor.commands.setTextSelection(pos);

        // Insert a new line if we're at the end of a block
        if (
          selection.$anchor.parentOffset === selection.$anchor.parent.content.size
        ) {
          props.editor.commands.insertContent('\n');
        }

        // Now add the image
        props.editor
          .chain()
          .setFile({
            url: '',
            fileName: '',
            fileSize: null,
            mimeType: FileType.IMAGE,
            type: FileType.IMAGE,
            isImage: true,
          })
          .run();

        // Move cursor after the image
        props.editor.commands.setTextSelection(pos + 1);
      },
      isActive: () => props.editor.isActive('image'),
    },
    {
      name: 'code-block',
      icon: CodeFilled,
      command: () => props.editor.chain().focus().toggleCodeBlock().run(),
      isActive: () => props.editor.isActive('codeBlock'),
    },
    {
      name: 'block-quote',
      icon: MessageOutlined,
      command: () => props.editor.chain().focus().toggleBlockquote().run(),
      isActive: () => props.editor.isActive('blockquote'),
    },
    {
      name: 'horizontal-line',
      icon: LineOutlined,
      command: () => props.editor.chain().focus().setHorizontalRule().run(),
      isActive: () => false,
    },
  ],
]);

function handleMouseDown(event: MouseEvent, item: FormatItem) {
  // To prevent losing focus from editor
  // The mouseDown event fires before the click event and before focus changes,
  // so we can intercept it and prevent the default focus behavior.
  event.preventDefault();
  item.command();
}
</script>

<template>
  <div class="bar-menu-wrapper">
    <template v-for="(group, index) in formats" :key="`format-group-${index}`">
      <div class="bar-menu-group">
        <Tooltip v-for="item in group" :key="item.name" :title="item.name">
          <Button
            type="text"
            size="small"
            :class="{ 'bar-menu-active': transactionTick >= 0 && item.isActive() }"
            :data-format="item.name"
            @mousedown="handleMouseDown($event, item)"
          >
            <template #icon><component :is="item.icon" /></template>
          </Button>
        </Tooltip>
      </div>
      <Divider v-if="index !== formats.length - 1" type="vertical" />
    </template>
  </div>
</template>

<style>
.bar-menu-wrapper {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 16px;
  border-radius: 2px 2px 0 0;
  padding: 8px;
  border-bottom: 1px solid var(--sm-border-color);
  background: var(--sm-bg-container);
}
.bar-menu-group {
  display: flex;
  flex-direction: row;
  gap: 8px;
}
.bar-menu-wrapper .bar-menu-active {
  background: var(--sm-color-primary-bg);
}
</style>
