/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

const enUS = {
  product: {
    name: 'SmartMetadata',
    subtitle: 'Catalog',
  },
  nav: {
    explore: 'Explore',
    lineage: 'Lineage',
    observability: 'Observability',
    testDefinitions: 'Test definitions',
    testCases: 'Test cases',
    testSuites: 'Test suites',
    incidents: 'Incidents',
    alerts: 'Alerts',
    governance: 'Governance',
    glossaries: 'Glossaries',
    classifications: 'Classifications',
    domains: 'Domains',
    dataProducts: 'Data products',
    ingestion: 'Ingestion',
    services: 'Services',
    pipelines: 'Pipelines',
    collaboration: 'Collaboration',
    activity: 'Activity',
    tasks: 'Tasks',
    announcements: 'Announcements',
    admin: 'Admin',
    users: 'Users',
    teams: 'Teams',
    roles: 'Roles',
    bots: 'Bots',
    settings: 'Settings',
  },
  chrome: {
    searchPlaceholder: 'Search data assets',
    logout: 'Log out',
    logoutFailed: 'Server logout failed; local session cleared',
    locale: 'Language',
    localeEn: 'English',
    localeZh: '中文',
    signedIn: 'Signed in',
  },
  login: {
    title: 'SmartMetadata',
    lead: 'Sign in against the server login API. The password is Base64-encoded in the request body as required by POST /api/v1/users/login.',
    email: 'Email',
    emailRequired: 'Email is required',
    password: 'Password',
    passwordRequired: 'Password is required',
    submit: 'Sign in',
    failed: 'Login failed',
    authConfigFailed:
      'Auth provider lookup failed ({error}). Showing the password form because stock servers use basic login.',
    ssoOnly: 'This server is configured for {provider} authentication. Username/password login is not available.',
    ssoHelp:
      'The console does not invent an OIDC/SAML browser callback or client secret. Use a JWT from your identity provider, or reconfigure the server for basic/LDAP login.',
    authority: 'Authority: {value}',
    callback: 'Callback URL advertised by the server: {value}',
    authConfigMissing: 'Could not read GET /api/v1/system/config/auth',
  },
} as const;

export default enUS;
