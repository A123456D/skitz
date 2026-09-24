import { describe, expect, it } from 'vitest';
import { SpatialHash } from '../src/engine/spatialHash';

describe('SpatialHash', () => {
  it('finds inserted points within a query circle', () => {
    const h = new SpatialHash(1000, 1000, 64);
    h.clear(3);
    h.insert(0, 100, 100);
    h.insert(1, 500, 500);
    h.insert(2, 130, 110);
    const found = new Set<number>();
    h.queryCircle(110, 105, 40, (i) => {
      found.add(i);
      return true;
    });
    expect(found.has(0)).toBe(true);
    expect(found.has(2)).toBe(true);
    expect(found.has(1)).toBe(false);
  });

  it('queryCircleFind returns first match or -1', () => {
    const h = new SpatialHash(1000, 1000, 64);
    h.clear(2);
    h.insert(0, 300, 300);
    h.insert(1, 310, 310);
    expect(h.queryCircleFind(300, 300, 30, () => true)).toBeGreaterThanOrEqual(0);
    expect(h.queryCircleFind(800, 800, 10, () => true)).toBe(-1);
  });

  it('clamps out-of-bounds queries without crashing', () => {
    const h = new SpatialHash(100, 100, 10);
    h.clear(1);
    h.insert(0, 5, 5);
    let count = 0;
    h.queryCircle(-500, -500, 900, () => {
      count++;
      return true;
    });
    expect(count).toBe(1);
  });
});
