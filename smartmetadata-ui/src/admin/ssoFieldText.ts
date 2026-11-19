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
 * English-string-keyed Chinese map for the pin hard-coded SSO constants
 * (field titles, placeholders, help texts from `constants/SSO.constant.ts`)
 * and the JSON-schema titles used as label fallbacks.
 *
 * English renders the pin constant verbatim; Chinese renders the faithful
 * translation. Strings cited in design §2.9 use that table's wording; the
 * rest are faithful translations in the same style. `{brandName}` is the
 * only interpolated placeholder (pin interpolates the brand name into the
 * `authRolesMapping` help); `{botDomain}` in the `botDomain` help is a
 * literal part of the pin string and is never substituted.
 *
 * Group titles are absent on purpose: pin never renders them (see
 * `ssoUiSchema.ts`), so the §2.9 group-title rows have no rendering surface.
 */
export const SSO_FIELD_TEXT_ZH: Readonly<Record<string, string>> = {
  // ---- ui:titles (COMMON_UI_FIELDS / provider schemas / title tables) ----
  'Client ID': '客户端 ID',
  'Client Secret': '客户端密钥',
  'OIDC Client ID': 'OIDC 客户端 ID',
  'OIDC Client Secret': 'OIDC 客户端密钥',
  'OIDC Request Scopes': 'OIDC 请求作用域',
  'OIDC Discovery URI': 'OIDC 发现 URI',
  'OIDC Callback URL': 'OIDC 回调 URL',
  'OIDC Server URL': 'OIDC 服务器 URL',
  'OIDC Tenant': 'OIDC 租户',
  'OIDC Configuration': 'OIDC 配置',
  'OIDC IDP Type': 'OIDC 身份提供商类型',
  'OIDC Use Nonce': 'OIDC 使用 Nonce',
  'OIDC Preferred JWS Algorithm': 'OIDC 首选 JWS 算法',
  'OIDC Response Type': 'OIDC 响应类型',
  'OIDC Disable PKCE': 'OIDC 禁用 PKCE',
  'OIDC Max Clock Skew': 'OIDC 最大时钟偏差',
  'OIDC Client Authentication Method': 'OIDC 客户端身份验证方法',
  'OIDC Custom Parameters': 'OIDC 自定义参数',
  'OIDC Max Age': 'OIDC 最大期限',
  'OIDC Prompt': 'OIDC 提示',
  'OIDC Session Expiry': 'OIDC 会话过期时间',
  Authority: '颁发机构',
  'Callback URL': '回调 URL',
  'Public Key URLs': '公钥 URL',
  'LDAP Configuration': 'LDAP 配置',
  'LDAP Host': 'LDAP 主机',
  'LDAP Port': 'LDAP 端口',
  'Admin Principal DN': '管理员主体 DN',
  'Admin Password': '管理员密码',
  'User Base DN': '用户基础 DN',
  'Group Base DN': '组基础 DN',
  'Enable SSL': '启用 SSL',
  'Max Pool Size': '最大连接池大小',
  'Full DN Required': '需要完整 DN',
  'Admin Role Name': '管理员角色名称',
  'All Attribute Name': '全部属性名称',
  'Mail Attribute Name': '邮件属性名称',
  'Group Attribute Name': '组属性名称',
  'Group Attribute Value': '组属性值',
  'Group Member Attribute Name': '组成员属性名称',
  'Recursive Group Membership': '递归组成员资格',
  'Auth Roles Mapping': '身份验证角色映射',
  'Auth Reassign Roles': '身份验证重新分配角色',
  'Trust Store Config Type': '信任库配置类型',
  'Trust Store Configuration': '信任库配置',
  'Custom Trust Store Settings (Use when Trust Store Config Type = CustomTrustStore)':
    '自定义信任库设置（当信任库配置类型 = CustomTrustStore 时使用）',
  'Trust Store File Path': '信任库文件路径',
  'Trust Store Password': '信任库密码',
  'Trust Store Format': '信任库格式',
  'Verify Hostname': '验证主机名',
  'Check Certificate Validity': '检查证书有效期',
  'Hostname Settings (Use when Trust Store Config Type = HostName)':
    '主机名设置（当信任库配置类型 = HostName 时使用）',
  'Allow Wildcards': '允许通配符',
  'Acceptable Host Names': '可接受的主机名',
  'Trust All Settings (Use when Trust Store Config Type = TrustAll)':
    '信任全部设置（当信任库配置类型 = TrustAll 时使用）',
  'JVM Default Settings (Use when Trust Store Config Type = JVMDefault)':
    'JVM 默认设置（当信任库配置类型 = JVMDefault 时使用）',
  'SAML Configuration': 'SAML 配置',
  'Debug Mode': '调试模式',
  'Identity Provider (IdP)': '身份提供商 (IdP)',
  'IdP Entity ID': 'IdP 实体 ID',
  'IdP SSO Login URL': 'IdP SSO 登录 URL',
  'IdP X.509 Certificate': 'IdP X.509 证书',
  'Name ID Format': '名称 ID 格式',
  'Service Provider (SP)': '服务提供商 (SP)',
  'SP Entity ID': 'SP 实体 ID',
  'Assertion Consumer Service URL': '断言消费服务 URL',
  'SP X.509 Certificate': 'SP X.509 证书',
  'SP Private Key': 'SP 私钥',
  'Security Configuration': '安全配置',
  'Strict Mode': '严格模式',
  'Token Validity (seconds)': '令牌有效期（秒）',
  'Want Assertions Signed': '要求断言签名',
  'Want Messages Signed': '要求消息签名',
  'Send Signed Auth Request': '发送已签名的身份验证请求',
  Provider: '提供商',
  'Provider Name': '提供商名称',
  'Token Validation Algorithm': '令牌验证算法',
  'JWT Principal Claims': 'JWT 主体声明',
  'JWT Principal Claims Mapping': 'JWT 主体声明映射',
  'Enable Self Signup': '启用自助注册',
  'Enable Auto Redirect': '启用自动重定向',
  'Email Claim': '电子邮件声明',
  'Display Name Claim': '显示名称声明',
  'Client Type': '客户端类型',
  'Admin Principals': '管理员主体',
  'Bot Principals': '机器人主体',
  'Principal Domain': '主体域',
  'Enforce Principal Domain': '强制主体域',
  'Enable Secure Socket Connection': '启用安全套接字连接',
  'Use Roles From Provider': '使用提供商角色',
  'Allowed Email Registration Domains': '允许的电子邮件注册域',
  'Admin Emails': '管理员电子邮件',
  'Allowed Email Domains': '允许的电子邮件域',
  'Bot Domain': '机器人域',

  // ---- schema titles used as label fallbacks (no ui:title exists) ----
  'Response Type': '响应类型',
  'Additional Trusted Redirect URIs': '其他受信任的重定向 URI',
  'Jwt Principal Claims': 'Jwt 主体声明',
  'Jwt Principal Claims Mapping': 'Jwt 主体声明映射',
  'Jwt Team Claim Mapping': 'Jwt 团队声明映射',
  'Enable Self Sign Up': '启用自助注册',
  TruststoreConfig: 'TruststoreConfig',
  CustomTrustManagerConfig: 'CustomTrustManagerConfig',
  HostNameConfig: 'HostNameConfig',
  JVMDefaultConfig: 'JVMDefaultConfig',
  TrustAllConfig: 'TrustAllConfig',
  'Saml Configuration': 'Saml 配置',
  'Oidc Configuration': 'Oidc 配置',
  'Session Expiry': '会话过期时间',
  'Max Active Sessions Per User': '每用户最大活动会话数',
  'Class Name': '类名',
  'Container Request Filter': '容器请求过滤器',
  'Test Principals': '测试主体',
  'Allowed Domains': '允许的域',
  'Enable Enforce Principal Domain': '启用强制主体域',
  'Enable Secure Socket Connection.': '启用安全套接字连接。',
  'Use Roles from Provider': '使用提供商角色',
  'Default OAuth Role': '默认 OAuth 角色',

  // ---- placeholders ----
  'e.g. 123456890-abcdef.apps.googleusercontent.com':
    '例如 123456890-abcdef.apps.googleusercontent.com',
  'Enter your client secret': '输入你的客户端密钥',
  'Enter your OIDC client secret': '输入你的 OIDC 客户端密钥',
  'Enter scope (e.g. openid, email, profile) and press ENTER':
    '输入作用域（例如 openid、email、profile）并按 ENTER',
  'e.g. https://accounts.google.com/.well-known/openid_configuration':
    '例如 https://accounts.google.com/.well-known/openid_configuration',
  'e.g. https://myapp.com/callback': '例如 https://myapp.com/callback',
  'e.g. https://your-domain.auth0.com': '例如 https://your-domain.auth0.com',
  'e.g. your-tenant-id': '例如 your-tenant-id',
  'e.g. https://accounts.google.com': '例如 https://accounts.google.com',
  'Enter value (e.g. https://www.googleapis.com/oauth2/v3/certs) and press ENTER':
    '输入值（例如 https://www.googleapis.com/oauth2/v3/certs）并按 ENTER',
  'e.g. ldap.example.com': '例如 ldap.example.com',
  'e.g. 389 or 636': '例如 389 或 636',
  'e.g. cn=admin,dc=example,dc=com': '例如 cn=admin,dc=example,dc=com',
  'Enter LDAP admin password': '输入 LDAP 管理员密码',
  'e.g. ou=users,dc=example,dc=com': '例如 ou=users,dc=example,dc=com',
  'e.g. ou=groups,dc=example,dc=com': '例如 ou=groups,dc=example,dc=com',
  'Select roles to reassign to users on every login': '选择每次登录时重新分配给用户的角色',
  '/opt/openmetadata/certs/ldap-truststore.jks':
    '/opt/openmetadata/certs/ldap-truststore.jks',
  JKS: 'JKS',
  'https://accounts.google.com/.well-known/openid-configuration':
    'https://accounts.google.com/.well-known/openid-configuration',
  'Default: 604800': '默认值：604800',
  'https://accounts.google.com': 'https://accounts.google.com',
  'e.g. My Company SSO': '例如 My Company SSO',
  'Enter value (e.g. email, sub, name) and press ENTER':
    '输入值（例如 email、sub、name）并按 ENTER',
  'Enter mappings (e.g. username:preferred_username, email:email). Both username and email are required.':
    '输入映射（例如 username:preferred_username, email:email）。username 和 email 均为必填项。',
  'e.g. email': '例如 email',
  'e.g. name': '例如 name',
  'Enter value (e.g. admin@example.com, security@example.com) and press ENTER':
    '输入值（例如 admin@example.com、security@example.com）并按 ENTER',
  'Enter value (e.g. ingestion-bot@example.com) and press ENTER':
    '输入值（例如 ingestion-bot@example.com）并按 ENTER',
  'Enter domain (e.g. example.com) and press ENTER. Use "all" to allow all domains.':
    '输入域（例如 example.com）并按 ENTER。使用 "all" 允许所有域。',
  'Enter email (e.g. admin@company.com) and press ENTER':
    '输入电子邮件（例如 admin@company.com）并按 ENTER',
  'Enter domain (e.g. company.com) and press ENTER':
    '输入域（例如 company.com）并按 ENTER',
  'e.g. openmetadata.org': '例如 openmetadata.org',

  // ---- help texts (design §2.9 wording where cited) ----
  '⚠️ CRITICAL: Incorrect claims will lock out ALL users including admins! Order matters - first matching claim is used. These claims must exist in JWT tokens from your provider. Default values work for most configurations.':
    '⚠️ 严重：不正确的声明将锁定所有用户，包括管理员！顺序很重要——使用第一个匹配的声明。这些声明必须存在于来自你的提供商的 JWT 令牌中。默认值适用于大多数配置。',
  "JWT/SAML/LDAP attribute containing the user's email. When configured, enables email-first identity resolution. Replaces jwtPrincipalClaims for simpler configuration.":
    '包含用户电子邮件的 JWT/SAML/LDAP 属性。配置后，启用以电子邮件优先的身份解析。替代 jwtPrincipalClaims，使配置更简单。',
  "JWT/SAML/LDAP attribute containing the user's display name. Only used when Email Claim is configured.":
    '包含用户显示名称的 JWT/SAML/LDAP 属性。仅在配置了 Email Claim 时使用。',
  'Auto-generated callback URL. Copy this and register it as Redirect URI in your OIDC provider configuration.':
    '自动生成的回调 URL。请复制它并在你的 OIDC 提供商配置中将其注册为重定向 URI。',
  'Enable this for Active Directory nested groups. OpenMetadata will use AD transitive membership matching when checking role mappings.':
    '为 Active Directory 嵌套组启用此项。检查角色映射时，OpenMetadata 将使用 AD 可传递成员资格匹配。',
  'Map LDAP groups to {brandName} roles. Users in mapped LDAP groups will automatically be assigned the corresponding roles.':
    '将 LDAP 组映射到 {brandName} 角色。已映射 LDAP 组中的用户将自动分配相应角色。',
  'Auto-generated Service Provider Entity ID. Copy this value and paste it as Entity ID in your SAML Identity Provider configuration.':
    '自动生成的服务提供商实体 ID。请复制此值并将其作为实体 ID 粘贴到你的 SAML 身份提供商配置中。',
  'Auto-generated Assertion Consumer Service URL. Copy this value and paste it as ACS URL (or Reply URL) in your SAML Identity Provider configuration.':
    '自动生成的断言消费服务 URL。请复制此值并将其作为 ACS URL（或回复 URL）粘贴到你的 SAML 身份提供商配置中。',
  'Preferred over Admin Principals. Uses full email addresses for admin designation.':
    '优先于管理员主体。使用完整电子邮件地址指定管理员。',
  'Restrict authentication to users from these email domains. If empty, all domains are allowed.':
    '将身份验证限制为来自这些电子邮件域的用户。如果为空，则允许所有域。',
  'Email domain for system-created bots (e.g. ingestion-bot@{botDomain}).':
    '系统创建的机器人所用的电子邮件域（例如 ingestion-bot@{botDomain}）。',
};

/**
 * Localizes one pin hard-coded string. English renders the constant verbatim;
 * Chinese renders the mapped translation, falling back to the English
 * constant when no translation exists (unmapped strings render as-is rather
 * than inventing text). `{brandName}` is interpolated in both languages;
 * `{botDomain}` is literal and untouched.
 */
export function resolveSsoFieldText(
  englishText: string,
  locale: string,
  brandName: string,
): string {
  const localized =
    locale === 'zh-CN'
      ? (SSO_FIELD_TEXT_ZH[englishText] ?? englishText)
      : englishText;
  return localized.replaceAll('{brandName}', brandName);
}
