<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Vue port of official components/common/ProfilePicture/ProfilePicture.tsx:158-221.

  The picture fetch is permission-gated (hasViewPermissions(USER) =
  ViewBasic || ViewAll, utils/PermissionsUtils.ts:160-165) through the
  product permission store, which caches per resource, so N avatars
  share one /permissions/user request. While the permission resolves,
  no fetch fires. The core Avatar is rendered with antd Avatar at the
  core pixel sizes; the outlined hue classes and the contrast edge are
  reproduced with the --avatar-hue variable and an inset ring (visual
  adaptation: antd Avatar has no contrastBorder/colorVariant props).
  The `height` prop is declared but never rendered, matching the
  official Props declaration, which the component never destructures.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { TeamOutlined } from '@ant-design/icons-vue';
import { permissionFlags } from '@/api/permissions';
import { usePermissionStore } from '@/stores/permissions';
import {
  AVATAR_INITIALS_FONT_PX,
  AVATAR_SIZE_PX,
  getAvatarEdge,
  getAvatarStyle,
  getRandomColor,
  resolveAvatarSize,
  SMALL_LOADER_SIZES,
  type CoreAvatarSize,
} from './profilePictureUtils';
import { useUserProfile } from './useUserProfile';

const props = withDefaults(
  defineProps<{
    name?: string;
    displayName?: string;
    size?: CoreAvatarSize;
    /** @deprecated Pass a defined `size` instead. */
    width?: string;
    className?: string;
    height?: string;
    isTeam?: boolean;
    avatarType?: 'solid' | 'outlined';
    matchRingToFill?: boolean;
    borderless?: boolean;
  }>(),
  {
    className: '',
    isTeam: false,
    avatarType: 'outlined',
    matchRingToFill: false,
    borderless: false,
  }
);

const permissionStore = usePermissionStore();
const viewUserPermission = ref(false);

onMounted(() => {
  void permissionStore
    .getResourcePermission('user')
    .then((ops) => {
      viewUserPermission.value = permissionFlags(ops).hasViewAccess;
    })
    .catch(() => {
      viewUserPermission.value = false;
    });
});

const avatarName = computed(() => props.displayName ?? props.name ?? '');
const avatarSize = computed(() => resolveAvatarSize(props.size, props.width));
const randomColor = computed(() => getRandomColor(avatarName.value));
const isSolid = computed(() => props.avatarType === 'solid');

const { profilePic, isLoading } = useUserProfile({
  permission: () => viewUserPermission.value,
  name: () => props.name ?? '',
  isTeam: props.isTeam,
});

const isLoadingWithoutUrl = computed(() => isLoading.value && !profilePic.value);
const edge = computed(() => getAvatarEdge(isSolid.value, props.borderless, props.matchRingToFill));

const avatarStyle = computed(() => ({
  ...getAvatarStyle(isSolid.value, randomColor.value.hue, randomColor.value.color),
  width: `${AVATAR_SIZE_PX[avatarSize.value]}px`,
  height: `${AVATAR_SIZE_PX[avatarSize.value]}px`,
  lineHeight: `${AVATAR_SIZE_PX[avatarSize.value]}px`,
  fontSize: `${AVATAR_INITIALS_FONT_PX[avatarSize.value]}px`,
}));

const avatarClasses = computed(() => [
  'sm-profile-picture',
  !isSolid.value && 'sm-profile-picture--outlined',
  !isSolid.value && edge.value.matchRingToFill && 'sm-profile-picture--matched-ring',
  edge.value.contrastBorder && 'sm-profile-picture--contrast',
  props.className,
]);

const loaderSize = computed(() => (SMALL_LOADER_SIZES.includes(avatarSize.value) ? 'small' : 'default'));
</script>

<template>
  <a-avatar
    v-if="isTeam"
    :class="['sm-profile-picture sm-profile-picture--team', className]"
    :style="{
      width: `${AVATAR_SIZE_PX[avatarSize]}px`,
      height: `${AVATAR_SIZE_PX[avatarSize]}px`,
      lineHeight: `${AVATAR_SIZE_PX[avatarSize]}px`,
      backgroundColor: 'transparent',
    }"
    data-testid="profile-avatar"
  >
    <template #icon><TeamOutlined /></template>
  </a-avatar>
  <a-avatar
    v-else
    :class="avatarClasses"
    :style="avatarStyle"
    :src="profilePic || undefined"
    data-testid="profile-avatar"
  >
    <a-spin
      v-if="isLoadingWithoutUrl"
      :size="loaderSize"
      :class="{ 'sm-profile-picture__loader--white': isSolid }"
    />
    <template v-else>{{ randomColor.character }}</template>
  </a-avatar>
</template>

<style scoped>
/* The outlined avatar is a pale 92%-light tint, which glares on a dark
   surface, and inline styles cannot change with the theme. So the hue
   travels as a CSS variable and these rules pick the lightness per
   theme: light reproduces the original HSL exactly, dark uses a deep
   tint with a light glyph. Dark also draws the ring in the fill's hue. */
.sm-profile-picture--outlined {
  background-color: hsl(var(--avatar-hue) 100% 92%);
  color: hsl(var(--avatar-hue) 70% 40%);
}
:root[data-theme='dark'] .sm-profile-picture--outlined {
  background-color: hsl(var(--avatar-hue) 40% 22%);
  color: hsl(var(--avatar-hue) 85% 78%);
  border-color: hsl(var(--avatar-hue) 45% 38%);
}
.sm-profile-picture--matched-ring {
  border-color: hsl(var(--avatar-hue) 70% 80%);
}
.sm-profile-picture--contrast {
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 8%);
}
.sm-profile-picture--team {
  color: var(--sm-text-secondary);
}
.sm-profile-picture__loader--white :deep(.ant-spin-dot-item) {
  background-color: var(--sm-bg-container);
}
</style>
