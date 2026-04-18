export type DevicePresenceStatus = 'online' | 'offline' | 'unknown';

export type DeviceLifecycleState = 'new' | 'known';

export type DeviceStatusFilter = 'online' | 'offline';

export const DEVICE_LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 'all'] as const;

export type DeviceListPageSizeOption = typeof DEVICE_LIST_PAGE_SIZE_OPTIONS[number];

export type DeviceListPageSizeLabel = '10' | '25' | '50' | '100' | 'All';

export type DeviceStatusSortField = 'name' | 'ipAddress' | 'vendor' | 'lastSeen' | 'status';

export type DeviceStatusSortOrder = 'asc' | 'desc';

export interface DeviceStatusPagination {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  total: number;
}

export interface DeviceStatusMeta {
  timestamp: string;
  pagination?: DeviceStatusPagination;
}

export interface DeviceStatusErrorBody {
  code: 'VALIDATION_ERROR' | 'UNAUTHORIZED' | 'NOT_FOUND' | 'INTERNAL_ERROR';
  message: string;
  details?: string[];
}

export interface DeviceStatusErrorResponse {
  error: DeviceStatusErrorBody;
  meta: DeviceStatusMeta;
}

export interface DeviceStatusInventoryQuery {
  limit?: number;
  cursor?: string;
  search?: string;
  tag?: string;
  status?: DeviceStatusFilter;
  sortBy?: DeviceStatusSortField;
  order?: DeviceStatusSortOrder;
}

export interface DeviceStatusInventoryFullQuery extends Omit<DeviceStatusInventoryQuery, 'limit' | 'cursor'> {
  pageSize?: DeviceListPageSizeOption;
}

export interface DeviceStatusInventoryItem {
  id: string;
  macAddress: string;
  ipAddress: string;
  hostname?: string;
  vendor?: string;
  displayName?: string;
  isKnown: boolean;
  status: DevicePresenceStatus;
  isOnline: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  discoveryMethod: string;
  tags: string[];
  notes?: string;
}

export interface DeviceStatusPresentation {
  status: DevicePresenceStatus;
  lifecycle: DeviceLifecycleState;
  isKnown: boolean;
}

export interface DeviceStatusInventoryResponse {
  data: DeviceStatusInventoryItem[];
  meta: DeviceStatusMeta & {
    pagination: DeviceStatusPagination;
  };
}

export type DeviceStatusInventoryFullResponse = DeviceStatusInventoryItem[];

export interface DeviceStatusDetailResponse {
  data: DeviceStatusInventoryItem;
  meta: DeviceStatusMeta;
}

export interface DeviceStatusOverviewStats {
  totalDevices: number;
  newDevices24h: number;
  offlineDevices: number;
  lastScanAt: string | null;
  lastScanStatus: 'pending' | 'in-progress' | 'completed' | 'failed' | null;
}

export interface DeviceStatusOverviewResponse {
  data: DeviceStatusOverviewStats;
  meta: DeviceStatusMeta;
}

export interface DeviceStatusConfigContract {
  presenceOfflineThreshold: number;
}

export interface DeviceStatusPageSizeErrorState {
  code: 'FULL_RESULT_RETRIEVAL_FAILED';
  message: string;
}
