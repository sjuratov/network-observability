const testSupportState = {
  failNextFullInventoryRequest: false,
  failNextActivityHistoryForDeviceId: null as string | null,
};

export function resetTestSupportState() {
  testSupportState.failNextFullInventoryRequest = false;
  testSupportState.failNextActivityHistoryForDeviceId = null;
}

export function armFullInventoryFailure() {
  testSupportState.failNextFullInventoryRequest = true;
}

export function consumeFullInventoryFailure(): boolean {
  if (!testSupportState.failNextFullInventoryRequest) {
    return false;
  }

  testSupportState.failNextFullInventoryRequest = false;
  return true;
}

export function armActivityHistoryFailure(deviceId: string) {
  testSupportState.failNextActivityHistoryForDeviceId = deviceId;
}

export function consumeActivityHistoryFailure(deviceId: string): boolean {
  if (testSupportState.failNextActivityHistoryForDeviceId !== deviceId) {
    return false;
  }

  testSupportState.failNextActivityHistoryForDeviceId = null;
  return true;
}
