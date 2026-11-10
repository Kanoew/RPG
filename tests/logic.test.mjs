import test from 'node:test';
import assert from 'node:assert/strict';
import { dirIndex, clamp, pushOutOfRect, resolveRects, percentile, pointInRect, DIRS } from '../src/logic.ts';

test('dirIndex : les 8 directions, y vers le bas', () => {
  assert.equal(DIRS[dirIndex(1, 0)], 'east');
  assert.equal(DIRS[dirIndex(1, 1)], 'south-east');
  assert.equal(DIRS[dirIndex(0, 1)], 'south');
  assert.equal(DIRS[dirIndex(-1, 1)], 'south-west');
  assert.equal(DIRS[dirIndex(-1, 0)], 'west');
  assert.equal(DIRS[dirIndex(-1, -1)], 'north-west');
  assert.equal(DIRS[dirIndex(0, -1)], 'north');
  assert.equal(DIRS[dirIndex(1, -1)], 'north-east');
});

test('clamp', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

test('un disque est repoussé hors d\'un rectangle', () => {
  const rect = { x: 100, y: 100, w: 50, h: 50 };
  const c = { x: 95, y: 125 };
  assert.equal(pushOutOfRect(c, 10, rect), true);
  assert.ok(Math.abs(c.x - 90) < 1e-9, `x=${c.x}`);
  const far = { x: 0, y: 0 };
  assert.equal(pushOutOfRect(far, 10, rect), false);
});

test('centre dans le rectangle : sort par le côté le plus proche', () => {
  const rect = { x: 0, y: 0, w: 100, h: 100 };
  const c = { x: 5, y: 50 };
  assert.equal(pushOutOfRect(c, 10, rect), true);
  assert.equal(c.x, -10);
});

test('resolveRects sur plusieurs rectangles', () => {
  const rects = [{ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 0, w: 10, h: 10 }];
  const c = { x: 103, y: 5 };
  assert.equal(resolveRects(c, 4, rects), true);
  assert.ok(c.x < 96.1 || c.x > 113.9);
});

test('pointInRect avec marge', () => {
  const rect = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(pointInRect(11, 5, rect), false);
  assert.equal(pointInRect(11, 5, rect, 2), true);
});

test('percentile', () => {
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 99), 10);
  assert.equal(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50), 5);
  assert.equal(percentile([], 99), 0);
});
