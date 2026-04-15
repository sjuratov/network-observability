export function validateTagName(name: string): { valid: boolean; error?: string } {
  if (!name || !name.trim()) {
    return { valid: false, error: 'Tag name must not be empty' };
  }
  if (name.length > 64) {
    return { valid: false, error: 'Tag name must not exceed 64 characters' };
  }
  if (!/^[a-zA-Z0-9 _-]+$/.test(name)) {
    return { valid: false, error: 'Tag name contains invalid characters' };
  }
  return { valid: true };
}

export function validateDisplayName(name: string): { valid: boolean; error?: string } {
  if (name === '') {
    return { valid: true };
  }
  if (name.length > 128) {
    return { valid: false, error: 'Display name must not exceed 128 characters' };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(name)) {
    return { valid: false, error: 'Display name must not contain control characters' };
  }
  return { valid: true };
}
