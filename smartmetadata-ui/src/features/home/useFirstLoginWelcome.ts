/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, ref, watch } from 'vue';
import { patchUser } from '@/api/users';
import { useAuthStore } from '@/stores/auth';
import { useTourStore } from '@/stores/tour';
import { useWelcomeStore } from '@/stores/welcome';

/**
 * Whether the home route should show the first-login welcome screen,
 * ported from the official framework (openmetadata-ui
 * `hooks/useFirstLoginWelcome.ts`): once per user (tracked on the
 * user as `isFirstTimeUser`, so it holds across browsers), only while
 * `isWelcomeVisible` is on, and never on the tour, where it would
 * hide the step targets. Leaving the route dismisses it — the hook
 * lives in the home view, so unmount dismisses it.
 *
 * The legacy per-browser list of users who saw the welcome screen is
 * read so a user it covers is recorded on the server instead of being
 * shown it again, including users the 2.1.0 migration had no login or
 * activity time for.
 *
 * One Vue adaptation: pin clears `isFirstTimeUser` on the local user
 * in the same mount effect that decides to show the welcome, and
 * React's async state update lets the welcome render first. Here the
 * server flag is latched into `firstTimeSeen` the moment it is
 * observed, so the local clear cannot un-show a welcome that was
 * already decided.
 */

// The legacy per-browser list key (official LOGGED_IN_USER_STORAGE_KEY).
export const LOGGED_IN_USER_STORAGE_KEY = 'loggedInUsers';

function isSeenInThisBrowser(userName: string): boolean {
  if (!userName) {
    return false;
  }
  return (window.localStorage.getItem(LOGGED_IN_USER_STORAGE_KEY) ?? '')
    .split(',')
    .includes(userName);
}

export function useFirstLoginWelcome() {
  const auth = useAuthStore();
  const welcome = useWelcomeStore();
  const tour = useTourStore();

  const firstTimeSeen = ref(false);
  const dismissed = ref(false);
  const marked = ref(false);

  async function markReturningUser(): Promise<void> {
    const user = auth.user;
    if (!user?.isFirstTimeUser || marked.value) {
      return;
    }
    marked.value = true;
    auth.user = { ...user, isFirstTimeUser: false };
    try {
      if (user.id) {
        await patchUser(user.id, [{ op: 'add', path: '/isFirstTimeUser', value: false }]);
      }
    } catch {
      // Not worth an error toast: the worst case is the welcome screen
      // showing once more on the user's next visit.
    }
  }

  watch(
    () => auth.user?.isFirstTimeUser,
    (isFirstTimeUser) => {
      if (isFirstTimeUser === true) {
        firstTimeSeen.value = true;
        void markReturningUser();
      }
    },
    { immediate: true },
  );

  const showWelcome = computed(
    () =>
      firstTimeSeen.value &&
      !isSeenInThisBrowser(auth.user?.name ?? '') &&
      welcome.isWelcomeVisible &&
      !tour.active &&
      !dismissed.value,
  );

  function closeWelcome(): void {
    dismissed.value = true;
  }

  return { showWelcome, closeWelcome };
}
