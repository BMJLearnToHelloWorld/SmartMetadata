/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { Modal } from 'ant-design-vue';

export type ConfirmDeleteOptions = {
  title: string;
  content: string;
  okText: string;
  cancelText: string;
  /**
   * P-18: async delete run while the confirm stays open. When provided,
   * Modal.confirm's onOk returns the promise, so antd shows the confirm
   * button loading and keeps the modal open until it settles; a
   * rejection keeps it open (retry or cancel), a resolution closes it.
   */
  onOk?: () => Promise<void>;
};

/**
 * Tight ant Modal.confirm for delete. No Dialog compound — stay on antdv.
 */
export function confirmDelete(options: ConfirmDeleteOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      title: options.title,
      content: options.content,
      okText: options.okText,
      cancelText: options.cancelText,
      okType: 'danger',
      okButtonProps: { danger: true, type: 'primary' },
      autoFocusButton: 'cancel',
      centered: false,
      wrapClassName: 'sm-confirm-delete',
      onOk() {
        if (!options.onOk) {
          resolve(true);
          return;
        }
        return options.onOk().then(() => {
          resolve(true);
        });
      },
      onCancel() {
        resolve(false);
      },
    });
  });
}
