<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { Alert, Button, Card, Form, Input, Select, Typography } from 'ant-design-vue';
import { listTeams } from '@/api/teams';
import { createUser } from '@/api/users';
import { requiredField } from '@/features/crud/formRules';
import { useAuthStore } from '@/stores/auth';
import type { AdminTeam } from '@/types/admin';

/**
 * SSO complete-profile page, mirroring official SignUpPage
 * (pages/SignUp/SignUpPage.tsx): it exists only for the store's newUser
 * (set when an IdP login's profile lookup 404s with self-signup enabled).
 * A direct visit with no newUser redirects to sign-in, exactly as the
 * official page navigates to SIGNIN without newUser.
 *
 * Fields mirror the official form minus picture: displayName is required,
 * email is disabled and prefilled, name is a hidden required value (the
 * official page derives it from IdP claims via getNameFromUserData; the
 * product only carries the email, so the local part is the default),
 * teams are selected and submitted as ids. The basic self-registration
 * page (/signup) is a separate line and is untouched by this page.
 */
const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const { t } = useI18n();

const form = reactive({ displayName: '', teamIds: [] as string[] });
const teams = ref<AdminTeam[]>([]);
const submitting = ref(false);
const errorMessage = ref('');

const email = auth.newUser?.email ?? '';
const derivedName = auth.newUser?.name || email.split('@')[0] || '';

async function loadTeams(): Promise<void> {
  try {
    teams.value = (await listTeams({ limit: 100 })).data;
  } catch {
    teams.value = [];
  }
}

async function onSubmit(): Promise<void> {
  errorMessage.value = '';
  submitting.value = true;
  try {
    await createUser({
      name: derivedName,
      email,
      displayName: form.displayName.trim(),
      teams: form.teamIds.length ? form.teamIds : undefined,
    });
    auth.clearNewUser();
    try {
      await auth.refreshUser();
    } catch {
      // The account now exists; profile load failure must not block entry.
    }
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/my-data';
    await router.replace(redirect);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.ssoSignUpFailed');
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  if (!auth.newUser) {
    await router.replace({ name: 'login' });
    return;
  }
  await loadTeams();
});
</script>

<template>
  <div class="auth-page">
    <Card class="auth-page__card">
      <Typography.Title :level="3">{{ t('auth.ssoSignUpTitle') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('auth.ssoSignUpLead') }}</Typography.Paragraph>
      <Alert
        v-if="errorMessage"
        data-testid="sso-signup-error"
        type="error"
        show-icon
        :message="errorMessage"
        class="auth-page__alert"
      />
      <Form v-if="auth.newUser" layout="vertical" :model="form" @finish="onSubmit">
        <Form.Item
          :label="t('auth.fullName')"
          name="displayName"
          :rules="requiredField(t, t('auth.fullName'))"
        >
          <Input v-model:value="form.displayName" data-testid="sso-signup-full-name" autocomplete="name" />
        </Form.Item>
        <Form.Item :label="t('auth.email')" name="email">
          <Input :value="email" data-testid="sso-signup-email" disabled autocomplete="username" />
        </Form.Item>
        <Form.Item :label="t('auth.selectTeams')" name="teamIds">
          <Select
            v-model:value="form.teamIds"
            mode="multiple"
            data-testid="sso-signup-teams"
            :placeholder="t('auth.selectTeams')"
          >
            <Select.Option v-for="team in teams" :key="team.id" :value="team.id">
              {{ team.displayName || team.name }}
            </Select.Option>
          </Select>
        </Form.Item>
        <Button type="primary" html-type="submit" block :loading="submitting" data-testid="sso-signup-submit">
          {{ t('auth.ssoSignUpSubmit') }}
        </Button>
        <Button type="link" block @click="router.push({ name: 'login' })">{{ t('auth.backToLogin') }}</Button>
      </Form>
    </Card>
  </div>
</template>

<style scoped>
.auth-page {
  min-height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}
.auth-page__card {
  width: 100%;
  max-width: 480px;
}
.auth-page__alert {
  margin-bottom: 16px;
}
</style>
