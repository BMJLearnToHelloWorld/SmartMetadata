/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official CronUtils.getNextCronRunTimestamp (openmetadata-ui/src/main/resources/ui/src/utils/CronUtils.ts).
 */
export async function getNextCronRunTimestamp(
  scheduleInterval: string,
  timezone = 'UTC',
  currentTimestamp = Date.now(),
): Promise<number | undefined> {
  if (scheduleInterval.trim().split(/\s+/).length !== 5) {
    return undefined;
  }
  try {
    const { CronExpressionParser } = await import('cron-parser');
    const expression = CronExpressionParser.parse(scheduleInterval, {
      currentDate: new Date(currentTimestamp),
      tz: timezone,
    });
    return expression.next().toDate().getTime();
  } catch {
    return undefined;
  }
}