/**
 * Official Test Definition drawer help (en-US TestDefinitionForm.md).
 * Live official shows this English help panel even in a ZH session because
 * only the en-US markdown ships. Do not substitute site branding.
 */
export interface TestDefinitionHelpSection {
  id: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
  note?: string;
}

export const TEST_DEFINITION_HELP_INTRO =
  'Create test definitions to describe reusable data quality rules. A test definition controls where a rule can be used, which engines can execute it, and which parameters a user must provide while creating test cases.';

export const TEST_DEFINITION_HELP_SECTIONS: TestDefinitionHelpSection[] = [
  {
    id: 'name',
    title: 'Name',
    paragraphs: [
      'Provide the unique technical name for the test definition. This name is used to reference the definition in APIs, test cases, and rule configuration. Use a concise name that describes the validation the rule performs.',
    ],
  },
  {
    id: 'displayName',
    title: 'Display Name',
    paragraphs: [
      'Provide a user-friendly name shown in the UI. Use this field when the technical name needs clearer spacing, capitalization, or wording for users browsing the test library.',
    ],
  },
  {
    id: 'description',
    title: 'Description',
    paragraphs: [
      'Describe what the test definition validates, when it should be used, and any important behavior users should know before creating test cases from it.',
    ],
  },
  {
    id: 'sqlExpression',
    title: 'SQL Query',
    paragraphs: [
      'Define the SQL expression used to evaluate the rule for OpenMetadata-native tests. The expression should match the selected entity type.',
      'The expression is a Jinja2 template, so every substitution variable must use double curly braces:',
    ],
    bullets: [
      '{{ table_name }} — the fully qualified table, resolved at runtime.',
      '{{ column_name }} — the column, resolved at runtime (column-level definitions only).',
      '{{ paramName }} — any parameter you declare in the Parameters section below.',
    ],
    note: 'Single-brace forms such as {table} or {column} are not substituted. They are passed through to the engine verbatim and fail at query time with a syntax error from your database.',
  },
  {
    id: 'entityType',
    title: 'Entity Type',
    paragraphs: [
      'Choose whether this definition applies to tables or columns. This controls where the definition appears when users add data quality tests.',
    ],
  },
  {
    id: 'testPlatforms',
    title: 'Test Platforms',
    paragraphs: [
      'Select the platforms that support this definition, such as OpenMetadata, dbt, or Great Expectations. OpenMetadata definitions can use SQL expressions and supported data type settings.',
    ],
  },
  {
    id: 'dataQualityDimension',
    title: 'Data Quality Dimension',
    paragraphs: [
      'Classify the rule under a data quality dimension such as completeness, accuracy, consistency, or validity. This helps teams group and report test coverage.',
    ],
  },
  {
    id: 'supportedServices',
    title: 'Supported Services',
    paragraphs: [
      'Limit the definition to specific database services when the rule only works for certain engines. Leave this empty when the definition can be used for all supported services.',
    ],
  },
  {
    id: 'supportedDataTypes',
    title: 'Supported Data Types',
    paragraphs: [
      'Select the column data types where this definition is valid. This is used for column-level OpenMetadata tests so users only see applicable rules for the selected column. Leave this empty when the definition can be used for all data types.',
    ],
  },
  {
    id: 'parameterDefinition',
    title: 'Parameters',
    paragraphs: [
      'Define the inputs users must provide when creating test cases from this definition. Each parameter can include a name, display name, description, data type, and whether it is required.',
    ],
  },
];
