import type { SortingState } from '@tanstack/react-table';

export type DeviceListPageSizeOption = '10' | '25' | '50' | '100' | 'All';

type DeviceListSortColumnId = 'status' | 'name' | 'ip' | 'vendor' | 'firstSeen' | 'lastSeen';

interface DeviceListPreferences {
  pageSize: DeviceListPageSizeOption;
  sorting: SortingState;
}

const PAGE_SIZE_STORAGE_KEY = 'netobserver-device-list-page-size';
const SORT_STORAGE_KEY = 'netobserver-device-list-sort';
const VALID_PAGE_SIZES = new Set<DeviceListPageSizeOption>(['10', '25', '50', '100', 'All']);
const VALID_SORT_COLUMNS = new Set<DeviceListSortColumnId>([
  'status',
  'name',
  'ip',
  'vendor',
  'firstSeen',
  'lastSeen',
]);

export const DEFAULT_DEVICE_LIST_PAGE_SIZE: DeviceListPageSizeOption = '50';
export const DEFAULT_DEVICE_LIST_SORTING: SortingState = [{ id: 'ip', desc: false }];

function isPageSizeOption(value: string | null): value is DeviceListPageSizeOption {
  return value !== null && VALID_PAGE_SIZES.has(value as DeviceListPageSizeOption);
}

function parseStoredSorting(value: string | null): SortingState | undefined {
  if (value === null) {
    return undefined;
  }

  if (value === 'none') {
    return [];
  }

  const [columnId, direction] = value.split(':');
  if (!VALID_SORT_COLUMNS.has(columnId as DeviceListSortColumnId)) {
    return undefined;
  }

  if (direction === 'asc') {
    return [{ id: columnId, desc: false }];
  }

  if (direction === 'desc') {
    return [{ id: columnId, desc: true }];
  }

  return undefined;
}

function serializeSorting(sorting: SortingState): string {
  const [entry] = sorting;
  if (!entry) {
    return 'none';
  }

  return `${entry.id}:${entry.desc ? 'desc' : 'asc'}`;
}

export function loadDeviceListPreferences(): DeviceListPreferences {
  if (typeof window === 'undefined') {
    return {
      pageSize: DEFAULT_DEVICE_LIST_PAGE_SIZE,
      sorting: DEFAULT_DEVICE_LIST_SORTING,
    };
  }

  const storedSorting = parseStoredSorting(window.localStorage.getItem(SORT_STORAGE_KEY));

  return {
    pageSize: isPageSizeOption(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
      ? window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY) as DeviceListPageSizeOption
      : DEFAULT_DEVICE_LIST_PAGE_SIZE,
    sorting: storedSorting ?? DEFAULT_DEVICE_LIST_SORTING,
  };
}

export function saveDeviceListPreferences(preferences: DeviceListPreferences) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, preferences.pageSize);
  window.localStorage.setItem(SORT_STORAGE_KEY, serializeSorting(preferences.sorting));
}
