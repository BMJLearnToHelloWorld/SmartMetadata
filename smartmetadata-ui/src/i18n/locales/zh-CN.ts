/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

const zhCN = {
  product: {
    name: 'SmartMetadata',
    subtitle: '目录',
  },
  nav: {
    explore: '探索',
    lineage: '血缘',
    observability: '可观测性',
    testDefinitions: '测试定义',
    testCases: '测试用例',
    testSuites: '测试套件',
    incidents: '事故',
    alerts: '告警',
    governance: '治理',
    glossaries: '术语表',
    classifications: '分类',
    domains: '域',
    dataProducts: '数据产品',
    ingestion: '摄取',
    services: '服务',
    pipelines: '管道',
    collaboration: '协作',
    activity: '动态',
    tasks: '任务',
    announcements: '公告',
    admin: '管理',
    users: '用户',
    teams: '团队',
    roles: '角色',
    bots: '机器人',
    settings: '设置',
  },
  chrome: {
    searchPlaceholder: '搜索数据资产',
    logout: '退出登录',
    logoutFailed: '服务端退出失败；已清除本地会话',
    locale: '语言',
    localeEn: 'English',
    localeZh: '中文',
    signedIn: '已登录',
  },
  login: {
    title: 'SmartMetadata',
    lead: '通过服务端登录 API 登录。密码按 POST /api/v1/users/login 的要求在请求体中进行 Base64 编码。',
    email: '邮箱',
    emailRequired: '请输入邮箱',
    password: '密码',
    passwordRequired: '请输入密码',
    submit: '登录',
    failed: '登录失败',
    authConfigFailed: '认证方式查询失败（{error}）。因默认服务使用 basic 登录，仍显示密码表单。',
    ssoOnly: '此服务配置为 {provider} 认证，不支持用户名/密码登录。',
    ssoHelp:
      '控制台不会伪造 OIDC/SAML 浏览器回调或客户端密钥。请使用身份提供方签发的 JWT，或将服务重新配置为 basic/LDAP 登录。',
    authority: '授权端点：{value}',
    callback: '服务公布的回调 URL：{value}',
    authConfigMissing: '无法读取 GET /api/v1/system/config/auth',
  },
} as const;

export default zhCN;
