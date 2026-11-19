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
 * File attachment node (ported from official
 * `components/BlockEditor/Extensions/File/FileNode.ts` and
 * `FileNode.interface.ts` at pin a3012259ca).
 *
 * The Vue NodeView (`FileNodeView.vue`) is render-only this batch (Q7):
 * placeholder / image / file-chip / media-player branches, the upload
 * overlay and the delete control. The upload popover (embed/upload
 * tabs, resize), the authenticated-blob media fetch (viewport-gated),
 * and the authenticated file download belong to the upload/media line;
 * the download handler arrives through the injection key below and
 * defaults to a no-op until that line provides it.
 */
import { mergeAttributes, Node } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import type { InjectionKey } from 'vue';
import { FileType } from './blockEditorConstants';
import FileNodeView from './FileNodeView.vue';

export interface FileNodeAttrs {
  url: string;
  fileName: string;
  fileSize: number | null;
  mimeType: string;
  type: FileType;
  isUploading?: boolean;
  uploadProgress?: number;
  tempFile?: File;
  isImage?: boolean;
  alt?: string;
}

export interface FileNodeOptions {
  HTMLAttributes: Record<string, unknown>;
  allowedTypes?: FileType[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileAttachment: {
      setFile: (attrs: FileNodeAttrs) => ReturnType;
    };
  }
}

/**
 * Download seam for the media line. The official view fetches an
 * authenticated blob and triggers the download; until the media line
 * provides that handler, file clicks are no-ops (render-only batch).
 */
export const fileAttachmentDownloadKey: InjectionKey<(fileName?: string) => void> =
  Symbol('fileAttachmentDownload');

export function bytesToSize(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) {
    return `${bytes} ${sizes[0]}`;
  } else if (bytes < 0) {
    return `N/A`;
  } else {
    const i = Number.parseInt(Math.floor(Math.log(bytes) / Math.log(1024)).toString(), 10);
    if (i === 0) {
      return `${bytes} ${sizes[i]}`;
    } else {
      return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`;
    }
  }
}

const FileNode = Node.create<FileNodeOptions>({
  name: 'fileAttachment',
  group: 'block',
  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      url: { default: '' },
      fileName: { default: '' },
      fileSize: { default: null },
      mimeType: { default: '' },
      isUploading: { default: false },
      uploadProgress: { default: 0 },
      tempFile: { default: null },
      isImage: { default: false },
      alt: { default: null },
      diffState: {
        default: null,
        parseHTML: (el) =>
          el instanceof HTMLElement ? el.getAttribute('data-diff-state') : null,
        renderHTML: (attrs) => (attrs.diffState ? { 'data-diff-state': attrs.diffState } : {}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="file-attachment"]',
        getAttrs: (element) => {
          if (!(element instanceof HTMLElement)) {
            return false;
          }

          const url = element.getAttribute('data-url') || '';
          const fileName = element.getAttribute('data-filename') || '';
          const fileSize = element.getAttribute('data-filesize');
          const mimeType = element.getAttribute('data-mimetype') || '';
          const isUploading = element.getAttribute('data-uploading') === 'true';
          const uploadProgress = element.getAttribute('data-upload-progress');
          const tempFile = element.getAttribute('data-temp-file');
          const isImage = element.getAttribute('data-is-image') === 'true';
          const alt = element.getAttribute('data-alt');

          return {
            url,
            fileName,
            fileSize: fileSize ? parseInt(fileSize) : null,
            mimeType,
            isUploading,
            uploadProgress: uploadProgress ? parseInt(uploadProgress) : 0,
            tempFile: tempFile ? JSON.parse(tempFile) : null,
            isImage,
            alt,
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    const attrs = node.attrs as FileNodeAttrs;
    const baseAttrs = {
      'data-type': 'file-attachment',
      'data-url': attrs.url,
      'data-filename': attrs.fileName,
      'data-filesize': attrs.fileSize?.toString(),
      'data-mimetype': attrs.mimeType,
      'data-uploading': attrs.isUploading?.toString(),
      'data-upload-progress': attrs.uploadProgress?.toString(),
      'data-temp-file': attrs.tempFile ? JSON.stringify(attrs.tempFile) : null,
      'data-is-image': attrs.isImage?.toString(),
      'data-alt': attrs.alt,
    };

    return ['div', mergeAttributes(this.options.HTMLAttributes, baseAttrs)];
  },

  addNodeView() {
    return VueNodeViewRenderer(FileNodeView);
  },

  addCommands() {
    return {
      setFile:
        (attrs: FileNodeAttrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});

export default FileNode;
