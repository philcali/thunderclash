/**
 * EntityManager — entity lifecycle + spatial grid for efficient queries.
 *
 * Entities are plain objects with: type, id, x, y, radius, and optional type-specific fields.
 */
class EntityManager {
  constructor() {
    this.entities = new Map(); // id -> entity
    this.toAdd = [];
    this.toRemove = new Set();
    this.nextId = 1;

    // Spatial grid (64px cells)
    this.gridSize = 64;
    this.grid = new Map();
  }

  create(props) {
    const entity = { id: this.nextId++, ...props };
    this.toAdd.push(entity);
    return entity;
  }

  remove(id) {
    this.toRemove.add(id);
  }

  get(id) {
    return this.entities.get(id) || null;
  }

  getByType(type) {
    const result = [];
    for (const entity of this.entities.values()) {
      if (entity.type === type) result.push(entity);
    }
    return result;
  }

  update(dt) {
    // Process adds
    for (const entity of this.toAdd) {
      this.entities.set(entity.id, entity);
      this._gridInsert(entity);
    }
    this.toAdd = [];

    // Update all entities
    for (const entity of this.entities.values()) {
      if (typeof entity.update === 'function') {
        entity.update(dt);
      }
    }

    // Process removes
    for (const id of this.toRemove) {
      const entity = this.entities.get(id);
      if (entity) this._gridRemove(entity);
      this.entities.delete(id);
    }
    this.toRemove = new Set();
  }

  // Spatial grid helpers
  _gridKey(cx, cy) {
    return `${cx},${cy}`;
  }

  _gridInsert(entity) {
    const cx = Math.floor(entity.x / this.gridSize);
    const cy = Math.floor(entity.y / this.gridSize);
    const key = this._gridKey(cx, cy);
    if (!this.grid.has(key)) this.grid.set(key, []);
    this.grid.get(key).push(entity);
  }

  _gridRemove(entity) {
    const cx = Math.floor(entity.x / this.gridSize);
    const cy = Math.floor(entity.y / this.gridSize);
    const key = this._gridKey(cx, cy);
    const cell = this.grid.get(key);
    if (cell) {
      const idx = cell.indexOf(entity);
      if (idx >= 0) cell.splice(idx, 1);
    }
  }

  /** Get entities in cells overlapping the circle at (x, y) with radius r. */
  getNearby(x, y, radius) {
    const result = [];
    const cx0 = Math.floor((x - radius) / this.gridSize);
    const cy0 = Math.floor((y - radius) / this.gridSize);
    const cx1 = Math.floor((x + radius) / this.gridSize);
    const cy1 = Math.floor((y + radius) / this.gridSize);

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cell = this.grid.get(this._gridKey(cx, cy));
        if (!cell) continue;
        for (const entity of cell) {
          const dx = entity.x - x;
          const dy = entity.y - y;
          if (dx * dx + dy * dy <= radius * radius) {
            result.push(entity);
          }
        }
      }
    }
    return result;
  }
}

export default EntityManager;
