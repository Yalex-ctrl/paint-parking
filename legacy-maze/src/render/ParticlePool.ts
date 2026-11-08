import { keepParticle } from './perf';
import { DELTA, type Dir } from '../../game/types';
import { GROUND_Y, WALL_H } from '../../render/coords';
import { particlePalette } from '../../render/paintPalette';
import type { BoardSurface } from '../../render/surface';

const GRAVITY = 14;
const FLOOR_Y = 0.03;
const TOP_STAIN_MIN_EDGE = 0.16;
/** Droplets never travel further than this (in cells) beyond the board's outer edge. */
const SPLASH_RANGE = 1;
/** A droplet that lands on the floor disappears within this many seconds: no lasting mark. */
const FLOOR_DROP_LIFE = 0.12;
const STAIN_CHANCE = 0.3;
/** The landing splash stays within this many cells of the start tile. */
export const SPLASH_LIMIT = 1;

export const WOOD_HEX = 0xb07f45;

/** '#rrggbb' -> 0xrrggbb */
export const hexOf = (css: string) => parseInt(css.replace('#', ''), 16);

/**
 * Permanent paint stains (flat discs). A fixed ring buffer: when it is full
 * the oldest stain is replaced, which caps the cost at a single InstancedMesh.
 */
export class DecalPool {
  readonly size: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly nx: Float32Array;
  readonly ny: Float32Array;
  readonly nz: Float32Array;
  readonly radius: Float32Array;
  readonly spin: Float32Array;
  readonly stretch: Float32Array;
  readonly hex: Uint32Array;
  /** Slots written since the last flush (matrix + colour need refreshing). */
  readonly fresh: number[] = [];
  private cursor = 0;

  constructor(size: number) {
    this.size = size;
    const f = () => new Float32Array(size);
    this.x = f();
    this.y = f();
    this.z = f();
    this.nx = f();
    this.ny = f();
    this.nz = f();
    this.radius = f();
    this.spin = f();
    this.stretch = f();
    this.hex = new Uint32Array(size);
  }

  add(x: number, y: number, z: number, nx: number, ny: number, nz: number, radius: number, hex: number) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.size;
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.nx[i] = nx;
    this.ny[i] = ny;
    this.nz[i] = nz;
    this.radius[i] = radius;
    this.hex[i] = hex;
    this.spin[i] = Math.random() * Math.PI * 2;
    this.stretch[i] = 0.75 + Math.random() * 0.6;
    this.fresh.push(i);
  }

  /** Forgets every stain (a new level starts clean). */
  clear() {
    this.radius.fill(0);
    for (let i = 0; i < this.size; i++) this.fresh.push(i);
  }
}

/**
 * Tiny CPU particle pool for splashes and debris. Pure data + math, so the mesh
 * component only has to copy the arrays into an InstancedMesh each frame.
 * Droplets collide with the board: they land on the floor or on wall tops
 * (paint leaves a stain there), vanish against wall sides, and are kept within about one
 * cell of the board.
 */
export class ParticlePool {
  readonly size: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly vz: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly radius: Float32Array;
  readonly landed: Uint8Array;
  readonly hex: Uint32Array;
  /** Debris (wood) never leaves stains. */
  readonly stainable: Uint8Array;
  /** Particles that must stay within `limit` cells of where they were born (0 = no limit). */
  readonly ax: Float32Array;
  readonly az: Float32Array;
  readonly limit: Float32Array;
  /** Indices spawned since the last flush, whose instance colour needs refreshing. */
  readonly freshColor: number[] = [];
  /** Colour of the level (the paint splashes take it, or the colours of the equipped paint built from it). */
  paintHex = 0xff4d6d;
  private paintEffect = 'classic';
  private palette: number[] = [0xff4d6d];
  private cursor = 0;
  private offered = 0;

  constructor(size: number) {
    this.size = size;
    const f = () => new Float32Array(size);
    this.x = f();
    this.y = f();
    this.z = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.life = f();
    this.maxLife = f();
    this.radius = f();
    this.landed = new Uint8Array(size);
    this.hex = new Uint32Array(size);
    this.stainable = new Uint8Array(size);
    this.ax = f();
    this.az = f();
    this.limit = f();
  }

  setPaintColor(css: string) {
    this.paintHex = hexOf(css);
    this.palette = particlePalette(this.paintEffect, this.paintHex);
  }

  /** The equipped paint: droplets and stains come in its colours (the palette of a stained glass, a rainbow, a metal...). */
  setPaintEffect(effect: string) {
    this.paintEffect = effect;
    this.palette = particlePalette(effect, this.paintHex);
  }

  private pickHex() {
    return this.palette[Math.floor(Math.random() * this.palette.length)];
  }

  /** Height of the floor under what is thrown now (a platform, a ramp, a chute): added to every droplet that is spawned. */
  elevation = 0;

  private spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    radius: number,
    life: number,
    hex = this.pickHex(),
    stain = true,
    limit = 0,
  ) {
    // On a phone that struggles, fewer droplets are thrown (the watch in perf.ts decides how many).
    if (!keepParticle(this.offered++)) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.size;
    this.x[i] = x;
    this.y[i] = y + this.elevation;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.radius[i] = radius;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.landed[i] = 0;
    this.hex[i] = hex;
    this.stainable[i] = stain ? 1 : 0;
    this.ax[i] = x;
    this.az[i] = z;
    this.limit[i] = limit;
    this.freshColor.push(i);
  }

  /** Droplets thrown to both sides of a ball rolling through (x, z) along `dir`. */
  trail(x: number, z: number, dir: Dir, count = 4) {
    const [dr, dc] = DELTA[dir];
    const px = -dr; // perpendicular, in world (x, z)
    const pz = dc;
    for (let k = 0; k < count; k++) {
      const side = k % 2 === 0 ? 1 : -1;
      // Some droplets arc high enough to land on top of the neighbouring walls.
      const high = Math.random() < 0.35;
      const lateral = (high ? 1.0 + Math.random() * 1.3 : 1.2 + Math.random() * 1.8) * side;
      this.spawn(
        x + px * side * 0.2,
        0.2,
        z + pz * side * 0.2,
        px * lateral + dc * (Math.random() - 0.3) * 1.2,
        high ? 5.6 + Math.random() * 1.8 : 2.2 + Math.random() * 2.2,
        pz * lateral + dr * (Math.random() - 0.3) * 1.2,
        0.05 + Math.random() * 0.04,
        high ? 1.3 : 0.8,
      );
    }
  }

  /** Bigger burst when the ball slams into a wall: fans out backwards and sideways. */
  impact(x: number, z: number, dir: Dir, count = 22) {
    const [dr, dc] = DELTA[dir];
    for (let k = 0; k < count; k++) {
      const a = (Math.random() - 0.5) * Math.PI * 1.7; // fan around the reverse direction
      const speed = 1.8 + Math.random() * 3;
      const back = Math.cos(a) * speed;
      const side = Math.sin(a) * speed;
      this.spawn(
        x,
        0.25,
        z,
        -dc * back + -dr * side,
        3 + Math.random() * 4.2,
        -dr * back + dc * side,
        0.06 + Math.random() * 0.07,
        1.1,
      );
    }
  }

  /** Round burst of paint in every direction (paint bomb, landing on a new board). */
  blast(x: number, y: number, z: number, count = 46, power = 1) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const speed = (1.5 + Math.random() * 3.8) * power;
      this.spawn(
        x,
        y,
        z,
        Math.cos(a) * speed,
        (3.5 + Math.random() * 5) * Math.min(power, 1.2),
        Math.sin(a) * speed,
        0.07 + Math.random() * 0.1,
        1.2,
      );
    }
  }

  /**
   * Splash of a ball landing on its start tile: droplets thrown up and out, but never further than
   * one cell from the tile (they are killed at that radius, whatever their speed).
   */
  splash(x: number, y: number, z: number, count = 40) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * 0.9;
      this.spawn(
        x,
        y,
        z,
        Math.cos(a) * speed,
        3 + Math.random() * 2.5,
        Math.sin(a) * speed,
        0.06 + Math.random() * 0.07,
        0.9,
        this.pickHex(),
        true,
        SPLASH_LIMIT,
      );
    }
  }

  /** Wood splinters from a breaking fragile wall. They leave no stains. */
  debris(x: number, z: number, count = 22) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 3.2;
      const shade = Math.random() < 0.5 ? WOOD_HEX : 0x8a5a2b;
      this.spawn(
        x,
        0.3 + Math.random() * 0.4,
        z,
        Math.cos(a) * speed,
        2.5 + Math.random() * 4.5,
        Math.sin(a) * speed,
        0.05 + Math.random() * 0.07,
        1.0,
        shade,
        false,
      );
    }
  }

  update(dt: number, surface: BoardSurface, decals: DecalPool) {
    for (let i = 0; i < this.size; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.landed[i]) continue;

      this.vy[i] -= GRAVITY * dt;
      const px = this.x[i];
      const py = this.y[i];
      const nx = px + this.vx[i] * dt;
      const ny = py + this.vy[i] * dt;
      const nz = this.z[i] + this.vz[i] * dt;
      if (this.limit[i] > 0 && Math.hypot(nx - this.ax[i], nz - this.az[i]) > this.limit[i]) {
        this.life[i] = 0;
        continue;
      }
      const k = surface.kind(nx, nz);

      if (k === 'out') {
        // Droplets only reach the grass right around the board; further out they just vanish.
        if (surface.distOutside(nx, nz) > SPLASH_RANGE) {
          this.life[i] = 0;
        } else if (ny <= GROUND_Y) {
          this.land(i, nx, GROUND_Y, nz, decals, true);
        } else {
          this.x[i] = nx;
          this.y[i] = ny;
          this.z[i] = nz;
        }
        continue;
      }

      const wallTop = k === 'wall' ? surface.wallTopAt(nx, nz) : WALL_H;
      if (k === 'wall' && ny < wallTop) {
        if (py >= wallTop) {
          // Fell onto a wall top.
          if (surface.edgeDistance(nx, nz) >= TOP_STAIN_MIN_EDGE) {
            this.land(i, nx, wallTop, nz, decals, true);
          } else {
            this.life[i] = 0;
          }
        } else {
          // Flew into a wall side: the droplet just disappears (no stain on the walls' faces).
          this.life[i] = 0;
        }
        continue;
      }

      const floorY = FLOOR_Y + (k === 'floor' ? surface.groundAt(nx, nz) : 0);
      if (k === 'floor' && ny <= floorY) {
        // Never a lasting stain on the floor: it would hide which cells are still unpainted.
        this.land(i, nx, floorY, nz, decals, false);
        this.life[i] = Math.min(this.life[i], FLOOR_DROP_LIFE);
        continue;
      }

      this.x[i] = nx;
      this.y[i] = ny;
      this.z[i] = nz;
    }
  }

  private land(i: number, x: number, y: number, z: number, decals: DecalPool, stain: boolean) {
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.vz[i] = 0;
    this.landed[i] = 1;
    // Only some drops leave a lasting stain, to keep the decal count (and cost) low.
    if (stain && this.stainable[i] && Math.random() < STAIN_CHANCE) {
      decals.add(x, y + 0.006, z, 0, 1, 0, this.radius[i] * (0.8 + Math.random() * 0.7), this.hex[i]);
    }
  }
}
