import { describe, it, expect } from 'vitest';
import { validateTagName, validateDisplayName } from '../../../src/web/utils/tags.js';

describe('Tagging — validateTagName', () => {
  it('accepts a valid tag name', () => {
    const result = validateTagName('IoT');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects an empty tag name', () => {
    const result = validateTagName('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects a whitespace-only tag name', () => {
    const result = validateTagName('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects a tag name exceeding 64 characters', () => {
    const longName = 'a'.repeat(65);
    const result = validateTagName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('64');
  });

  it('accepts a tag name at exactly 64 characters', () => {
    const name = 'a'.repeat(64);
    const result = validateTagName(name);
    expect(result.valid).toBe(true);
  });

  it('rejects tag names with special symbols', () => {
    const result = validateTagName('tag@name');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('accepts tag names with hyphens, underscores, and spaces', () => {
    const result = validateTagName('My Tag-Name_1');
    expect(result.valid).toBe(true);
  });
});

describe('Tagging — validateDisplayName', () => {
  it('accepts a valid display name', () => {
    const result = validateDisplayName('Living Room TV');
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('accepts an empty display name (clears the name)', () => {
    const result = validateDisplayName('');
    expect(result.valid).toBe(true);
  });

  it('rejects a display name exceeding 128 characters', () => {
    const longName = 'a'.repeat(129);
    const result = validateDisplayName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('128');
  });

  it('accepts a display name at exactly 128 characters', () => {
    const name = 'a'.repeat(128);
    const result = validateDisplayName(name);
    expect(result.valid).toBe(true);
  });

  it('rejects display names with control characters', () => {
    const result = validateDisplayName('Name\x00Bad');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('accepts names with unicode, spaces, hyphens, underscores, periods, and parens', () => {
    const result = validateDisplayName('Café Router (2nd floor)');
    expect(result.valid).toBe(true);
  });
});

describe('Tagging — notes handling', () => {
  it('accepts valid notes text', () => {
    const notes = 'Main office printer on 2nd floor.\nModel: HP LaserJet Pro.';
    expect(notes.length).toBeLessThanOrEqual(4096);
  });

  it('rejects notes exceeding 4096 characters', () => {
    const longNotes = 'a'.repeat(4097);
    expect(longNotes.length).toBeGreaterThan(4096);
  });
});
