/**
 * Uniform spatial hash grid for circle broadphase queries.
 * Rebuilt each sim tick from SoA entity arrays; cell size ~ max query radius.
 */
export class SpatialHash {
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  private heads: Int32Array; // -1 = empty, else first index in cell
  private next: Int32Array;  // linked list per inserted item

  constructor(worldW: number, worldH: number, cell: number) {
    this.cell = cell;
    this.cols = Math.max(1, Math.ceil(worldW / cell));
    this.rows = Math.max(1, Math.ceil(worldH / cell));
    // -1 = empty cell. Must be -1 (not 0) from construction on: queries may
    // run before the first clear(), and a 0 head would self-loop via next[0]=0.
    this.heads = new Int32Array(this.cols * this.rows).fill(-1);
    this.next = new Int32Array(0);
  }

  clear(cap: number): void {
    this.heads.fill(-1);
    if (this.next.length < cap) this.next = new Int32Array(cap).fill(-1);
  }

  insert(index: number, x: number, y: number): void {
    const cx = (x / this.cell) | 0;
    const cy = (y / this.cell) | 0;
    const c = this.cellCoord(cx, cy);
    this.next[index] = this.heads[c];
    this.heads[c] = index;
  }

  private cellCoord(cx: number, cy: number): number {
    const x = cx < 0 ? 0 : cx >= this.cols ? this.cols - 1 : cx;
    const y = cy < 0 ? 0 : cy >= this.rows ? this.rows - 1 : cy;
    return y * this.cols + x;
  }

  /**
   * Visit all inserted indices whose cell overlaps the circle (x,y,r).
   * Callback may return false to stop early.
   * Returns false if the visit was stopped early.
   */
  queryCircle(x: number, y: number, r: number, visit: (index: number) => boolean): boolean {
    const minX = ((x - r) / this.cell) | 0;
    const maxX = ((x + r) / this.cell) | 0;
    const minY = ((y - r) / this.cell) | 0;
    const maxY = ((y + r) / this.cell) | 0;
    for (let cy = minY; cy <= maxY; cy++) {
      if (cy < 0 || cy >= this.rows) continue;
      const rowBase = cy * this.cols;
      for (let cx = minX; cx <= maxX; cx++) {
        if (cx < 0 || cx >= this.cols) continue;
        let i = this.heads[rowBase + cx];
        while (i !== -1) {
          if (!visit(i)) return false;
          i = this.next[i];
        }
      }
    }
    return true;
  }

  /** First inserted index whose cell overlaps (x,y,r) and satisfies `pred`, else -1. */
  queryCircleFind(x: number, y: number, r: number, pred: (index: number) => boolean): number {
    let found = -1;
    this.queryCircle(x, y, r, (i) => {
      if (pred(i)) {
        found = i;
        return false;
      }
      return true;
    });
    return found;
  }
}
