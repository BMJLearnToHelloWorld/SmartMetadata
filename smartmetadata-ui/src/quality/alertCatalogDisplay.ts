/**
 * Official AlertCatalog.json condition display names.
 * The capabilities API usually ships displayName; this map is the fallback
 * when it is omitted so the form still shows official English labels
 * (including in the ZH UI, matching official live).
 */
export const OFFICIAL_ALERT_CONDITION_DISPLAY_NAMES: Record<string, string> = {
  filterBySource: 'Source of Change Event',
  filterByOwnerName: 'Owner',
  filterByFqn: 'Entity FQN',
  filterByEntityId: 'Entity Id',
  filterByEventType: 'Event Type',
  filterByUpdaterName: 'Updater Name',
  filterByFieldChange: 'Field Change',
  filterByDomain: 'Domain',
  filterByMentionedName: 'Mentioned Users',
  filterByGeneralMetadataEvents: 'General Metadata Events',
  filterByUpdaterIsBot: 'Update is Bot',
  filterByOwner: 'Owner Name',
  filterByTableNameTestCaseBelongsTo: 'Table Name A Test Case Belongs To',
  filterByEntityName: 'Entity Name Data Contract Belongs To',
  GetTableSchemaChanges: 'Get Schema Changes',
  GetTableMetricsUpdates: 'Get Table Metrics Updates',
  GetTopicSchemaChanges: 'Get Schema Changes',
  GetContainerSchemaChanges: 'Get Schema Changes',
  GetPipelineStatusUpdates: 'Get Pipeline Status Updates',
  GetIngestionPipelineStatusUpdates: 'Get Ingestion Pipeline Status Updates',
  GetTestCaseStatusUpdates: 'Get Test Case Status Updates',
  GetTestCaseStatusUpdatesUnderSuite: 'Get Test Case Status Updates belonging to a Test Suite',
  GetTestSuiteStatusUpdates: 'Get Test Suite Status Updates',
  GetDataContractStatusUpdates: 'Get Data Contract Status Updates',
  GetTestCaseSchemaChanges: 'Get Schema Changes',
  GetTestSuiteSchemaChanges: 'Get Schema Changes',
};

export function officialConditionDisplayName(name: string, displayName?: string): string {
  if (displayName && displayName.trim()) {
    return displayName;
  }
  return OFFICIAL_ALERT_CONDITION_DISPLAY_NAMES[name] ?? name;
}
