// Fonctions pures du jeu (sans Phaser) : testables avec `npm test`.

export interface Rect { x: number; y: number; w: number; h: number }
export interface Circle { x: number; y: number }

// Ordre des directions des planches : secteurs de 45° dans le sens horaire, en partant de la droite de l'écran.
export const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'] as const;

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Index de direction (0..7) d'un vecteur écran (y vers le bas). */
export function dirIndex(dx: number, dy: number): number {
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return ((sector % 8) + 8) % 8;
}

/** Repousse un disque hors d'un rectangle. Renvoie true s'il y a eu collision. */
export function pushOutOfRect(c: Circle, r: number, rect: Rect): boolean {
  const nx = clamp(c.x, rect.x, rect.x + rect.w);
  const ny = clamp(c.y, rect.y, rect.y + rect.h);
  let dx = c.x - nx, dy = c.y - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 === 0) {
    // Centre dans le rectangle : sortir par le côté le plus proche.
    const left = c.x - rect.x, right = rect.x + rect.w - c.x, top = c.y - rect.y, bottom = rect.y + rect.h - c.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) c.x = rect.x - r;
    else if (m === right) c.x = rect.x + rect.w + r;
    else if (m === top) c.y = rect.y - r;
    else c.y = rect.y + rect.h + r;
    return true;
  }
  const d = Math.sqrt(d2);
  dx /= d; dy /= d;
  c.x = nx + dx * r;
  c.y = ny + dy * r;
  return true;
}

export function resolveRects(c: Circle, r: number, rects: Rect[]): boolean {
  let hit = false;
  for (const rect of rects) if (pushOutOfRect(c, r, rect)) hit = true;
  return hit;
}

export function pointInRect(x: number, y: number, rect: Rect, margin = 0): boolean {
  return x >= rect.x - margin && x <= rect.x + rect.w + margin && y >= rect.y - margin && y <= rect.y + rect.h + margin;
}

/** Percentile (0..100) d'une liste de nombres, sans modifier la liste. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}
