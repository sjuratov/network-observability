export interface CleanupResult {
  scansDeleted: number;
  scanResultsDeleted: number;
  historyDeleted: number;
  durationMs: number;
}

export interface DbStatsResponse {
  data: {
    tables: Record<string, number>;
    dbSizeBytes: number;
    walSizeBytes: number;
    retentionDays: number;
    lastCleanupAt: string | null;
  };
  meta: { timestamp: string };
}

export interface DbCleanupResponse {
  data: CleanupResult;
  meta: { timestamp: string };
}

export interface DbFactoryResetResponse {
  data: {
    devicesDeleted: number;
    scansDeleted: number;
    scanResultsDeleted: number;
    deviceHistoryDeleted: number;
    deviceTagsDeleted: number;
  };
  meta: { timestamp: string };
}
