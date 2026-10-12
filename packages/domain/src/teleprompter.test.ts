import assert from 'node:assert/strict';
import test from 'node:test';
import { clampReadingSettings, countWords, DEFAULT_READING_SETTINGS } from './index.ts';

test('counts words across spaces and line breaks', () => {
  assert.equal(countWords('  Welcome   everyone.\nToday we begin.  '), 5);
});

test('returns zero for an empty or whitespace-only script', () => {
  assert.equal(countWords(''), 0);
  assert.equal(countWords(' \n\t '), 0);
});

test('clamps reading settings to supported ranges and steps', () => {
  assert.deepEqual(clampReadingSettings({ fontSize: 101, scrollSpeed: 1, surfaceOpacity: 12 }), {
    fontSize: 56,
    scrollSpeed: 12,
    surfaceOpacity: 70,
  });
});

test('keeps the default reading settings within the supported ranges', () => {
  assert.deepEqual(clampReadingSettings(DEFAULT_READING_SETTINGS), DEFAULT_READING_SETTINGS);
});
