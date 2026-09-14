import type { SyncState } from "../types";
import { hoursAgo } from "../now";

export const SYNC_STATE: SyncState = {
  status: "synced",
  lastSyncAt: hoursAgo(0.03),
  queueDepth: 0,
  failedCount: 2,
  nextRetryAt: null,
  error: null,
};

export const SYNC_STATE_SYNCING: SyncState = {
  status: "syncing",
  lastSyncAt: hoursAgo(0.6),
  queueDepth: 34,
  failedCount: 0,
  nextRetryAt: null,
  error: null,
};

export const SYNC_STATE_FAILED: SyncState = {
  status: "failed",
  lastSyncAt: hoursAgo(2.1),
  queueDepth: 12,
  failedCount: 5,
  nextRetryAt: hoursAgo(-0.25),
  error: { code: "RATE_LIMIT", message: "Gmail rate limit reached." },
};

export const SYNC_STATE_OFFLINE: SyncState = {
  status: "offline",
  lastSyncAt: hoursAgo(3.4),
  queueDepth: 0,
  failedCount: 0,
  nextRetryAt: null,
  error: { code: "NETWORK", message: "No network connection." },
};
