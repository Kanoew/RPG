import Phaser from 'phaser';
import { clamp, dirIndex, percentile, pointInRect, resolveRects, type Rect } from '../logic';
import type { Quality } from './Boot';

// ── Géométrie du donjon du Chapitre 1 (reprise de Claudex-RPG : salle 960 × 672, deux piliers, porte au nord) ──
const ROOM = { w: 960, h: 672 };
const WALL = 44;
const PILLARS: Rect[] = [
  { x: 288, y: 240, w: 72, h: 144 },
  { x: 600, y: 384, w: 96, h: 72 },
];
const PILLAR_HEIGHT = 64;
const DOOR = { x: 480, half: 44 };
const START = { x: 480, y: 600 };

// ── Réglages de jeu ──
const PLAYER = { r: 18, speed: 190, hp: 5, dodgeSpeed: 430, dodgeTime: 0.22, dodgeCd: 0.75, invuln: 1.0, shootCd: 0.42, hurtHeight: 104 };
const ARROW = { speed: 560, life: 0.85, range: 560 };

// ── Interface tactile (coordonnées du jeu 480 × 854) ──
const BTN_SHOOT = { x: 392, y: 736, r: 46 };
const BTN_DODGE = { x: 290, y: 788, r: 34 };
const STICK = { hintX: 104, hintY: 740, max: 56, zoneW: 250 };

type Kind = 'goblin' | 'ogre' | 'troll';
type Stage = 'guards' | 'boss' | 'exit' | 'done' | 'dead';

interface Enemy {
  kind: Kind;
  x: number; y: number; r: number;
  hp: number; maxHp: number; speed: number;
  g: Phaser.GameObjects.Graphics;
  alive: boolean;
  flash: number;
  windup: number; windupMax: number;
  cooldown: number;
  charge: number; stun: number; chargeHit: boolean;
  dirX: number; dirY: number;
  tx: number; ty: number;
  appear: number;
}

interface Arrow { x: number; y: number; vx: number; vy: number; life: number }
interface Puff { x: number; y: number; t: number; max: number; r: number; color: number }

const COLORS: Record<Kind, number> = { goblin: 0x3f78e0, ogre: 0xc43c3c, troll: 0x7b5ac8 };

export class Dungeon extends Phaser.Scene {
  private quality: Quality = 'half';
  private god = false;
  private auto = false;
  private showDebug = true;

  private sprite!: Phaser.GameObjects.Sprite;
  private shadow!: Phaser.GameObjects.Graphics;
  private tele!: Phaser.GameObjects.Graphics;
  private proj!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Graphics;
  private doorG!: Phaser.GameObjects.Graphics;
  private objectiveText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private overlay: Phaser.GameObjects.GameObject[] = [];

  private p = { x: START.x, y: START.y, hp: PLAYER.hp, fx: 0, fy: -1, dodge: 0, dodgeCd: 0, dodgeX: 0, dodgeY: -1, invuln: 0, shootCd: 0, shotPose: 0, aim: 6, moving: false };
  private enemies: Enemy[] = [];
  private arrows: Arrow[] = [];
  private puffs: Puff[] = [];
  private stage: Stage = 'guards';
  private doorOpen = false;

  // Entrées
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private stick = { id: -1, bx: STICK.hintX, by: STICK.hintY, vx: 0, vy: 0 };
  private shootPtr = -1;
  private dodgePtr = -1;
  private dodgeQueued = false;

  // Mesures
  private frameTimes: number[] = [];
  private frames = 0;
  private shots = 0;
  private runStart = 0;
  private endedAt = 0;
  private result: Record<string, string | number> | null = null;

  constructor() { super('Dungeon'); }

  // ───────────────────────────── création ─────────────────────────────

  create(): void {
    const params = new URLSearchParams(window.location.search);
    this.quality = this.registry.get('quality') as Quality;
    this.auto = params.get('auto') === '1';
    this.god = this.auto || params.get('god') === '1';
    this.showDebug = params.get('debug') !== '0';

    this.p = { x: START.x, y: START.y, hp: PLAYER.hp, fx: 0, fy: -1, dodge: 0, dodgeCd: 0, dodgeX: 0, dodgeY: -1, invuln: 0, shootCd: 0, shotPose: 0, aim: 6, moving: false };
    this.enemies = []; this.arrows = []; this.puffs = []; this.overlay = [];
    this.stage = 'guards'; this.doorOpen = false;
    this.frameTimes = []; this.frames = 0; this.shots = 0; this.result = null; this.endedAt = 0;
    this.stick = { id: -1, bx: STICK.hintX, by: STICK.hintY, vx: 0, vy: 0 };
    this.shootPtr = -1; this.dodgePtr = -1; this.dodgeQueued = false;
    this.runStart = this.time.now;

    this.buildAnimations();
    this.buildWorld();
    this.buildPlayer();
    this.spawn('goblin', 480, 150);
    this.spawn('ogre', 710, 190);
    this.buildHud();
    this.buildInput();

    const cam = this.cameras.main;
    cam.setBounds(-60, -60, ROOM.w + 120, ROOM.h + 120);
    cam.startFollow(this.sprite, true, 0.12, 0.12);
    cam.setBackgroundColor('#07060b');
    this.setObjective('Vaincs le gobelin et l’ogre');
  }

  private buildAnimations(): void {
    for (let i = 0; i < 8; i++) {
      const key = `run-${i}`;
      if (this.anims.exists(key)) continue;
      this.anims.create({ key, frames: this.anims.generateFrameNumbers('heroine-run', { start: i * 6, end: i * 6 + 5 }), frameRate: 12, repeat: -1 });
    }
  }

  private buildWorld(): void {
    // Sol : dalles de pierre dessinées dans une texture canvas (aucun fichier d'image nécessaire).
    if (!this.textures.exists('floor')) {
      const t = this.textures.createCanvas('floor', 128, 128)!;
      const c = t.getContext();
      c.fillStyle = '#1c1828'; c.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 90; i++) {
        const v = 24 + Math.floor(Math.random() * 16);
        c.fillStyle = `rgb(${v},${v - 2},${v + 8})`;
        c.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 10, 2 + Math.random() * 6);
      }
      c.strokeStyle = '#0d0a14'; c.lineWidth = 3; c.strokeRect(1.5, 1.5, 125, 125);
      c.strokeStyle = 'rgba(120,105,160,0.12)'; c.lineWidth = 1; c.strokeRect(4.5, 4.5, 119, 119);
      t.refresh();
    }
    this.add.tileSprite(0, 0, ROOM.w, ROOM.h, 'floor').setOrigin(0).setDepth(-10);

    // Murs : cadre autour de la salle, face visible au nord.
    const w = this.add.graphics().setDepth(-5);
    w.fillStyle(0x2b2438, 1);
    w.fillRect(-WALL, -WALL, ROOM.w + WALL * 2, WALL);
    w.fillRect(-WALL, ROOM.h, ROOM.w + WALL * 2, WALL);
    w.fillRect(-WALL, 0, WALL, ROOM.h);
    w.fillRect(ROOM.w, 0, WALL, ROOM.h);
    w.fillStyle(0x3a3150, 1);
    w.fillRect(0, -WALL, ROOM.w, WALL - 8);
    w.lineStyle(2, 0x120e1a, 0.8);
    for (let x = 0; x <= ROOM.w; x += 48) w.lineBetween(x, -WALL, x, -8);
    w.lineBetween(0, -WALL + 18, ROOM.w, -WALL + 18);
    w.fillStyle(0x000000, 0.35);
    w.fillRect(0, -8, ROOM.w, 8);

    // Piliers : une boîte (dessus clair, face sombre) triée en profondeur avec les personnages.
    for (const p of PILLARS) {
      const g = this.add.graphics().setDepth(10 + p.y + p.h);
      g.fillStyle(0x000000, 0.3); g.fillEllipse(p.x + p.w / 2, p.y + p.h, p.w * 1.25, 16);
      g.fillStyle(0x4a4163, 1); g.fillRect(p.x, p.y + p.h - PILLAR_HEIGHT, p.w, PILLAR_HEIGHT);
      g.fillStyle(0x6a5f8c, 1); g.fillRect(p.x, p.y - PILLAR_HEIGHT, p.w, p.h);
      g.lineStyle(2, 0x1a1526, 0.8); g.strokeRect(p.x, p.y - PILLAR_HEIGHT, p.w, p.h + PILLAR_HEIGHT);
    }

    this.doorG = this.add.graphics().setDepth(-4);
    this.drawDoor();
    this.tele = this.add.graphics().setDepth(1);
    this.shadow = this.add.graphics().setDepth(2);
    this.proj = this.add.graphics().setDepth(2000);
  }

  private drawDoor(): void {
    const g = this.doorG; g.clear();
    const x = DOOR.x - DOOR.half;
    g.fillStyle(this.doorOpen ? 0x2f9d62 : 0x1c3a2a, 1);
    g.fillRect(x, -WALL, DOOR.half * 2, WALL + 6);
    g.lineStyle(3, this.doorOpen ? 0x8dffbd : 0x0c1a12, 1);
    g.strokeRect(x, -WALL, DOOR.half * 2, WALL + 6);
    if (this.doorOpen) { g.fillStyle(0x8dffbd, 0.18); g.fillRect(x - 10, -WALL, DOOR.half * 2 + 20, WALL + 40); }
  }

  private buildPlayer(): void {
    const frame = this.registry.get('frame') as { w: number; h: number };
    this.sprite = this.add.sprite(this.p.x, this.p.y, 'heroine-bow', 6).setOrigin(0.5, 0.97);
    this.sprite.setScale(PLAYER.hurtHeight / frame.h);
  }

  private spawn(kind: Kind, x: number, y: number): void {
    const base = {
      goblin: { r: 22, hp: 3, speed: 110 },
      ogre: { r: 32, hp: 2, speed: 85 },
      troll: { r: 52, hp: 8, speed: 65 },
    }[kind];
    this.enemies.push({
      kind, x, y, r: base.r, hp: base.hp, maxHp: base.hp, speed: base.speed,
      g: this.add.graphics(), alive: true, flash: 0,
      windup: 0, windupMax: 0, cooldown: 0.8, charge: 0, stun: 0, chargeHit: false,
      dirX: 0, dirY: 1, tx: 0, ty: 0, appear: kind === 'troll' ? 0.9 : 0,
    });
  }

  // ───────────────────────────── interface ─────────────────────────────

  private buildHud(): void {
    this.ui = this.add.graphics().setScrollFactor(0).setDepth(5000);
    const style = { fontFamily: 'system-ui, sans-serif', color: '#eae7f5' };
    this.objectiveText = this.add.text(this.scale.width / 2, 40, '', { ...style, fontSize: '14px', align: 'center' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(5001);
    this.debugText = this.add.text(10, 58, '', { fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#9fffd0', backgroundColor: '#00000088' }).setScrollFactor(0).setDepth(5001);
    this.add.text(BTN_SHOOT.x, BTN_SHOOT.y, 'TIR', { ...style, fontSize: '16px', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(5001);
    this.add.text(BTN_DODGE.x, BTN_DODGE.y, 'ESQ', { ...style, fontSize: '13px', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(5001);
  }

  private setObjective(text: string): void { this.objectiveText.setText(text); }

  private buildInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,Z,Q,UP,LEFT,DOWN,RIGHT,SPACE,SHIFT,P') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.mouse?.disableContextMenu();
    this.input.addPointer(2);

    const inCircle = (x: number, y: number, c: { x: number; y: number; r: number }) => Math.hypot(x - c.x, y - c.y) <= c.r + 12;

    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (this.stage === 'dead' || this.stage === 'done') {
        if (this.time.now - this.endedAt > 700) this.scene.restart();
        return;
      }
      const { x, y } = ptr;
      if (x < 160 && y < 90 && y > 50) { this.showDebug = !this.showDebug; return; }
      if (inCircle(x, y, BTN_SHOOT)) { this.shootPtr = ptr.id; return; }
      if (inCircle(x, y, BTN_DODGE)) { this.dodgePtr = ptr.id; this.dodgeQueued = true; return; }
      if (x < STICK.zoneW && this.stick.id < 0) {
        this.stick = { id: ptr.id, bx: x, by: y, vx: 0, vy: 0 };
      }
    });
    this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (ptr.id !== this.stick.id) return;
      const dx = ptr.x - this.stick.bx, dy = ptr.y - this.stick.by;
      const len = Math.hypot(dx, dy);
      if (len < 6) { this.stick.vx = 0; this.stick.vy = 0; return; }
      const m = Math.min(len, STICK.max) / STICK.max;
      this.stick.vx = (dx / len) * m; this.stick.vy = (dy / len) * m;
    });
    const release = (ptr: Phaser.Input.Pointer) => {
      if (ptr.id === this.stick.id) this.stick = { id: -1, bx: STICK.hintX, by: STICK.hintY, vx: 0, vy: 0 };
      if (ptr.id === this.shootPtr) this.shootPtr = -1;
      if (ptr.id === this.dodgePtr) this.dodgePtr = -1;
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.input.on('gameout', () => {
      this.stick = { id: -1, bx: STICK.hintX, by: STICK.hintY, vx: 0, vy: 0 }; this.shootPtr = -1; this.dodgePtr = -1;
    });
    this.keys.P.on('down', () => { this.showDebug = !this.showDebug; });
    this.keys.SHIFT.on('down', () => { this.dodgeQueued = true; });
  }

  /** Vecteur de déplacement (longueur 0..1) et état de tir. */
  private readInput(): { mx: number; my: number; shoot: boolean } {
    if (this.auto) return this.botInput();
    let mx = 0, my = 0;
    const k = this.keys;
    if (k.A.isDown || k.Q.isDown || k.LEFT.isDown) mx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) mx += 1;
    if (k.W.isDown || k.Z.isDown || k.UP.isDown) my -= 1;
    if (k.S.isDown || k.DOWN.isDown) my += 1;
    const kl = Math.hypot(mx, my);
    if (kl > 0) { mx /= kl; my /= kl; }
    if (this.stick.id >= 0) { mx = this.stick.vx; my = this.stick.vy; }
    return { mx, my, shoot: this.shootPtr >= 0 || k.SPACE.isDown };
  }

  /** Mode ?auto=1 : un petit pilote automatique, pour tester tout le déroulé sans les mains. */
  private botInput(): { mx: number; my: number; shoot: boolean } {
    const alive = this.enemies.filter(e => e.alive && e.appear <= 0);
    if (this.stage === 'exit') return this.towards(DOOR.x, 10, false);
    if (alive.length === 0) return { mx: 0, my: 0, shoot: false };
    let best = alive[0], bd = Infinity;
    for (const e of alive) { const d = Math.hypot(e.x - this.p.x, e.y - this.p.y); if (d < bd) { bd = d; best = e; } }
    const dx = best.x - this.p.x, dy = best.y - this.p.y;
    let mx = 0, my = 0;
    if (bd > 300) { mx = dx / bd; my = dy / bd; }
    else if (bd < 200) { mx = -dx / bd; my = -dy / bd; }
    else { mx = -dy / bd; my = dx / bd; }
    return { mx, my, shoot: bd < ARROW.range };
  }

  private towards(x: number, y: number, shoot: boolean): { mx: number; my: number; shoot: boolean } {
    const dx = x - this.p.x, dy = y - this.p.y, d = Math.hypot(dx, dy) || 1;
    return { mx: dx / d, my: dy / d, shoot };
  }

  // ───────────────────────────── boucle ─────────────────────────────

  update(_time: number, delta: number): void {
    const dt = Math.min(delta, 50) / 1000;
    if (this.stage !== 'done' && this.stage !== 'dead') {
      this.frames++;
      if (this.frames > 30) this.frameTimes.push(delta); // on ignore le démarrage (compilation des shaders)
      if (this.frameTimes.length > 30000) this.frameTimes.shift();
    }

    if (this.stage !== 'done' && this.stage !== 'dead') {
      const input = this.readInput();
      this.updatePlayer(dt, input);
      this.updateEnemies(dt);
      this.updateArrows(dt);
      this.updateStage();
    }
    this.drawFx(dt);
    this.drawHud();
  }

  private updatePlayer(dt: number, input: { mx: number; my: number; shoot: boolean }): void {
    const p = this.p;
    const len = Math.hypot(input.mx, input.my);
    p.moving = len > 0.12;
    if (p.moving) { p.fx = input.mx / len; p.fy = input.my / len; }

    if (p.dodgeCd > 0) p.dodgeCd -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.shootCd > 0) p.shootCd -= dt;
    if (p.shotPose > 0) p.shotPose -= dt;

    if (this.dodgeQueued && p.dodgeCd <= 0 && p.dodge <= 0) {
      p.dodge = PLAYER.dodgeTime; p.dodgeCd = PLAYER.dodgeCd;
      p.dodgeX = p.fx; p.dodgeY = p.fy;
    }
    this.dodgeQueued = false;

    if (p.dodge > 0) {
      p.dodge -= dt;
      p.x += p.dodgeX * PLAYER.dodgeSpeed * dt;
      p.y += p.dodgeY * PLAYER.dodgeSpeed * dt;
    } else if (p.moving) {
      const m = Math.min(1, len);
      p.x += (input.mx / len) * PLAYER.speed * m * dt;
      p.y += (input.my / len) * PLAYER.speed * m * dt;
    }
    resolveRects(p, PLAYER.r, PILLARS);
    const throughDoor = this.doorOpen && Math.abs(p.x - DOOR.x) <= DOOR.half - 8;
    p.x = clamp(p.x, PLAYER.r, ROOM.w - PLAYER.r);
    p.y = clamp(p.y, throughDoor ? -8 : PLAYER.r, ROOM.h - PLAYER.r);

    if (input.shoot && p.shootCd <= 0) this.shoot();

    // Sprite : course dans la direction du déplacement, pose à l'arc à l'arrêt ou au tir.
    const s = this.sprite;
    if (p.shotPose > 0) {
      s.anims.stop(); s.setTexture('heroine-bow', p.aim);
    } else if (p.moving || p.dodge > 0) {
      const key = `run-${dirIndex(p.fx, p.fy)}`;
      if (!s.anims.isPlaying || s.anims.currentAnim?.key !== key) s.play(key);
      s.anims.timeScale = p.dodge > 0 ? 1.8 : 1;
    } else {
      s.anims.stop(); s.setTexture('heroine-bow', dirIndex(p.fx, p.fy));
    }
    s.setPosition(p.x, p.y).setDepth(10 + p.y);
    s.setAlpha(p.dodge > 0 ? 0.5 : p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0 ? 0.35 : 1);
  }

  private shoot(): void {
    const p = this.p;
    let dx = p.fx, dy = p.fy, best = ARROW.range;
    for (const e of this.enemies) {
      if (!e.alive || e.appear > 0) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d < best) { best = d; dx = (e.x - p.x) / d; dy = (e.y - p.y) / d; }
    }
    p.aim = dirIndex(dx, dy); p.fx = dx; p.fy = dy;
    p.shotPose = 0.3; p.shootCd = PLAYER.shootCd; this.shots++;
    this.arrows.push({ x: p.x + dx * 24, y: p.y + dy * 24, vx: dx * ARROW.speed, vy: dy * ARROW.speed, life: ARROW.life });
  }

  private updateArrows(dt: number): void {
    for (const a of this.arrows) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.life -= dt;
      if (a.x < 0 || a.x > ROOM.w || a.y < 0 || a.y > ROOM.h) a.life = 0;
      for (const rect of PILLARS) if (pointInRect(a.x, a.y, rect)) a.life = 0;
      if (a.life <= 0) continue;
      for (const e of this.enemies) {
        if (!e.alive || e.appear > 0) continue;
        if (Math.hypot(e.x - a.x, e.y - a.y) <= e.r + 10) {
          this.damageEnemy(e, 1, a.vx, a.vy);
          a.life = 0;
          break;
        }
      }
    }
    this.arrows = this.arrows.filter(a => a.life > 0);
  }

  private damageEnemy(e: Enemy, dmg: number, vx: number, vy: number): void {
    e.hp -= dmg; e.flash = 0.1;
    const n = Math.hypot(vx, vy) || 1;
    e.x += (vx / n) * 6; e.y += (vy / n) * 6;
    if (e.hp <= 0) {
      e.alive = false; e.g.destroy();
      this.puffs.push({ x: e.x, y: e.y - e.r, t: 0.45, max: 0.45, r: e.r * 1.6, color: COLORS[e.kind] });
      if (e.kind === 'troll') this.cameras.main.shake(260, 0.01);
    }
  }

  private hurtPlayer(dmg: number): void {
    const p = this.p;
    if (p.invuln > 0 || p.dodge > 0 || this.stage === 'dead' || this.stage === 'done') return;
    p.invuln = PLAYER.invuln;
    this.cameras.main.shake(140, 0.006);
    if (this.god) return;
    p.hp -= dmg;
    if (p.hp <= 0) { p.hp = 0; this.finish('dead'); }
  }

  // ───────────────────────────── ennemis ─────────────────────────────

  private moveEnemy(e: Enemy, dx: number, dy: number, speed: number, dt: number): void {
    const d = Math.hypot(dx, dy) || 1;
    e.x += (dx / d) * speed * dt; e.y += (dy / d) * speed * dt;
    resolveRects(e, e.r * 0.8, PILLARS);
    e.x = clamp(e.x, e.r, ROOM.w - e.r); e.y = clamp(e.y, e.r, ROOM.h - e.r);
  }

  private updateEnemies(dt: number): void {
    const p = this.p;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.flash > 0) e.flash -= dt;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);

      if (e.kind === 'goblin') {
        if (e.windup > 0) {
          e.windup -= dt;
          if (e.windup <= 0) { if (d <= 62 + PLAYER.r) this.hurtPlayer(1); e.cooldown = 1.1; }
        } else if (e.cooldown > 0) { e.cooldown -= dt; if (d > 56) this.moveEnemy(e, dx, dy, e.speed * 0.7, dt); }
        else if (d < 52) { e.windup = e.windupMax = 0.35; }
        else this.moveEnemy(e, dx, dy, e.speed, dt);
      } else if (e.kind === 'ogre') {
        if (e.stun > 0) e.stun -= dt;
        else if (e.charge > 0) {
          const bx = e.x, by = e.y;
          this.moveEnemy(e, e.dirX, e.dirY, 400, dt);
          e.charge -= dt;
          if (!e.chargeHit && d <= e.r + PLAYER.r) { e.chargeHit = true; this.hurtPlayer(1); }
          if (Math.hypot(e.x - bx, e.y - by) < 400 * dt * 0.4) e.charge = 0; // bloqué par un mur ou un pilier
          if (e.charge <= 0) { e.stun = 0.8; e.cooldown = 0.8; }
        } else if (e.windup > 0) {
          e.windup -= dt;
          if (e.windup <= 0) { e.charge = 0.45; e.chargeHit = false; }
        } else if (e.cooldown > 0) { e.cooldown -= dt; this.moveEnemy(e, dx, dy, e.speed * 0.6, dt); }
        else if (d < 270) { e.windup = e.windupMax = 0.55; e.dirX = dx / (d || 1); e.dirY = dy / (d || 1); }
        else this.moveEnemy(e, dx, dy, e.speed, dt);
      } else {
        // Troll : cercle d'impact annoncé en orange ; plus rapide sous la moitié de vie.
        if (e.appear > 0) { e.appear -= dt; continue; }
        if (e.windup > 0) {
          e.windup -= dt;
          if (e.windup <= 0) {
            if (Math.hypot(p.x - e.tx, p.y - e.ty) <= 84 + PLAYER.r * 0.5) this.hurtPlayer(2);
            this.cameras.main.shake(180, 0.008);
            e.cooldown = 1.2;
          }
        } else if (e.cooldown > 0) { e.cooldown -= dt; this.moveEnemy(e, dx, dy, e.speed * 0.5, dt); }
        else if (d <= 190) { e.windup = e.windupMax = e.hp <= 4 ? 0.6 : 0.8; e.tx = p.x; e.ty = p.y; }
        else this.moveEnemy(e, dx, dy, e.speed, dt);
      }
    }
  }

  private updateStage(): void {
    if (this.stage === 'guards' && !this.enemies.some(e => e.alive && e.kind !== 'troll')) {
      this.stage = 'boss';
      this.spawn('troll', 480, 130);
      this.cameras.main.shake(300, 0.008);
      this.setObjective('Le Troll arrive : sors des cercles orange');
    } else if (this.stage === 'boss' && !this.enemies.some(e => e.alive)) {
      this.stage = 'exit'; this.doorOpen = true; this.drawDoor();
      this.setObjective('Rejoins la porte verte ↑');
    } else if (this.stage === 'exit' && this.doorOpen && this.p.y <= 24 && Math.abs(this.p.x - DOOR.x) <= DOOR.half) {
      this.finish('done');
    }
  }

  // ───────────────────────────── fin de partie et mesures ─────────────────────────────

  private finish(kind: 'done' | 'dead'): void {
    this.stage = kind;
    this.endedAt = this.time.now;
    const seconds = (this.time.now - this.runStart) / 1000;
    const times = this.frameTimes;
    const sum = times.reduce((a, b) => a + b, 0) || 1;
    const frame = this.registry.get('frame') as { w: number; h: number };
    const gpuMb = (this.registry.get('gpuBytes') as number) / 1048576;
    const renderer = this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas 2D';
    this.result = {
      issue: kind === 'done' ? 'donjon terminé' : 'Yarden est tombée',
      duree_s: Math.round(seconds),
      fps_moyen: Math.round(1000 / (sum / Math.max(1, times.length))),
      pire_1pct_ms: Math.round(percentile(times, 99)),
      pire_image_ms: Math.round(Math.max(0, ...times.slice(-30000))),
      moteur: renderer,
      qualite: this.quality,
      taille_sprite: `${frame.w}x${frame.h}`,
      memoire_textures_Mo: Number(gpuMb.toFixed(1)),
      chargement_ms: this.registry.get('loadMs') as number,
      ecran: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}`,
    };
    // eslint-disable-next-line no-console
    console.log('RESULTAT_TEST', JSON.stringify(this.result));
    this.showOverlay();
  }

  private showOverlay(): void {
    const r = this.result!;
    const w = this.scale.width, h = this.scale.height;
    const bg = this.add.rectangle(w / 2, h / 2, w - 40, 470, 0x07060b, 0.92).setScrollFactor(0).setDepth(8000).setStrokeStyle(2, 0x8b6fd6);
    const title = this.add.text(w / 2, h / 2 - 205, this.stage === 'done' ? 'DONJON TERMINÉ' : 'YARDEN EST TOMBÉE', { fontFamily: 'system-ui', fontSize: '24px', fontStyle: 'bold', color: this.stage === 'done' ? '#8dffbd' : '#ff8c8c' }).setOrigin(0.5).setScrollFactor(0).setDepth(8001);
    const lines = [
      `FPS moyen : ${r.fps_moyen}`,
      `Pire 1 % : ${r.pire_1pct_ms} ms`,
      `Pire image : ${r.pire_image_ms} ms`,
      `Moteur : ${r.moteur}`,
      `Sprites : ${r.qualite} (${r.taille_sprite} px)`,
      `Mémoire textures héroïne : ${r.memoire_textures_Mo} Mo`,
      `Chargement : ${r.chargement_ms} ms`,
      `Durée : ${r.duree_s} s`,
      `Écran : ${r.ecran}`,
    ];
    const body = this.add.text(w / 2, h / 2 - 150, lines.join('\n'), { fontFamily: 'ui-monospace, monospace', fontSize: '15px', color: '#eae7f5', lineSpacing: 8 }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(8001);
    const tip = this.add.text(w / 2, h / 2 + 175, 'Fais une capture de cet écran,\npuis touche pour rejouer', { fontFamily: 'system-ui', fontSize: '14px', color: '#c5afff', align: 'center' }).setOrigin(0.5).setScrollFactor(0).setDepth(8001);
    this.overlay.push(bg, title, body, tip);
  }

  // ───────────────────────────── dessin ─────────────────────────────

  private drawFx(dt: number): void {
    const t = this.tele; t.clear();
    const sh = this.shadow; sh.clear();
    const pr = this.proj; pr.clear();

    // Ombre de l'héroïne
    sh.fillStyle(0x000000, 0.4); sh.fillEllipse(this.p.x, this.p.y - 2, 46, 14);

    // Annonces orange
    for (const e of this.enemies) {
      if (!e.alive || e.windup <= 0) continue;
      const prog = 1 - e.windup / e.windupMax;
      if (e.kind === 'goblin') {
        t.fillStyle(0xff8c2a, 0.18 + prog * 0.3); t.fillCircle(e.x, e.y, 62);
        t.lineStyle(3, 0xffb86b, 0.9); t.strokeCircle(e.x, e.y, 62);
      } else if (e.kind === 'ogre') {
        t.lineStyle(e.r * 1.6, 0xff8c2a, 0.16 + prog * 0.3);
        t.lineBetween(e.x, e.y, e.x + e.dirX * 300, e.y + e.dirY * 300);
      } else {
        t.fillStyle(0xff8c2a, 0.1); t.fillCircle(e.tx, e.ty, 84);
        t.fillStyle(0xff8c2a, 0.35); t.fillCircle(e.tx, e.ty, 84 * prog);
        t.lineStyle(4, 0xffb86b, 0.95); t.strokeCircle(e.tx, e.ty, 84);
      }
    }

    // Poussières de mort
    for (const f of this.puffs) {
      f.t -= dt;
      const k = Math.max(0, f.t / f.max);
      t.fillStyle(f.color, 0.5 * k); t.fillCircle(f.x, f.y, f.r * (1.2 - k * 0.6));
    }
    this.puffs = this.puffs.filter(f => f.t > 0);

    // Flèches
    for (const a of this.arrows) {
      const n = Math.hypot(a.vx, a.vy) || 1, ux = a.vx / n, uy = a.vy / n;
      const x = a.x, y = a.y - 36;
      pr.lineStyle(4, 0xd9b3ff, 1); pr.lineBetween(x - ux * 26, y - uy * 26, x, y);
      pr.fillStyle(0xffffff, 1); pr.fillCircle(x, y, 4);
    }

    // Ennemis
    for (const e of this.enemies) if (e.alive) this.drawEnemy(e);
  }

  private drawEnemy(e: Enemy): void {
    const g = e.g;
    g.clear(); g.setPosition(e.x, e.y).setDepth(10 + e.y);
    const s = e.kind === 'troll' ? clamp(1 - e.appear / 0.9, 0.05, 1) : 1;
    const r = e.r * s;
    g.fillStyle(0x000000, 0.35); g.fillEllipse(0, 2, r * 2.2, r * 0.8);
    const body = e.flash > 0 ? 0xffffff : COLORS[e.kind];
    const cy = -r * 0.9;
    g.fillStyle(body, 1); g.fillCircle(0, cy, r);
    g.lineStyle(3, 0x000000, 0.45); g.strokeCircle(0, cy, r);
    // Détails propres à chaque créature (formes provisoires : à remplacer par de vrais sprites)
    if (e.kind === 'goblin') {
      g.fillStyle(body, 1); g.fillTriangle(-r, cy - r * 0.2, -r * 1.6, cy - r * 0.8, -r * 0.6, cy - r * 0.7);
      g.fillTriangle(r, cy - r * 0.2, r * 1.6, cy - r * 0.8, r * 0.6, cy - r * 0.7);
    } else if (e.kind === 'ogre') {
      g.fillStyle(0xe8d9b0, 1); g.fillTriangle(-r * 0.7, cy - r * 0.8, -r * 0.35, cy - r * 1.6, -r * 0.05, cy - r * 0.9);
      g.fillTriangle(r * 0.7, cy - r * 0.8, r * 0.35, cy - r * 1.6, r * 0.05, cy - r * 0.9);
    } else {
      g.fillStyle(0xe8d9b0, 1); g.fillTriangle(-r * 0.4, cy + r * 0.2, -r * 0.2, cy + r * 0.8, -r * 0.05, cy + r * 0.2);
      g.fillTriangle(r * 0.4, cy + r * 0.2, r * 0.2, cy + r * 0.8, r * 0.05, cy + r * 0.2);
    }
    const ex = r * 0.35;
    g.fillStyle(0xffe27a, 1); g.fillCircle(-ex, cy - r * 0.15, r * 0.16); g.fillCircle(ex, cy - r * 0.15, r * 0.16);
    // Barre de vie
    if (e.hp < e.maxHp || e.kind === 'troll') {
      const bw = Math.max(46, r * 2), top = cy - r - 16;
      g.fillStyle(0x000000, 0.6); g.fillRect(-bw / 2, top, bw, 7);
      g.fillStyle(e.kind === 'troll' ? 0xb187ef : 0xe05a6e, 1); g.fillRect(-bw / 2 + 1, top + 1, (bw - 2) * (e.hp / e.maxHp), 5);
    }
  }

  private drawHud(): void {
    const u = this.ui; u.clear();
    // Vie
    for (let i = 0; i < PLAYER.hp; i++) {
      u.fillStyle(i < this.p.hp ? 0xe05a6e : 0x3a3045, 1); u.fillCircle(20 + i * 26, 22, 9);
      u.lineStyle(2, 0x000000, 0.5); u.strokeCircle(20 + i * 26, 22, 9);
    }
    // Boutons
    const press = (down: boolean) => (down ? 0.55 : 0.32);
    u.fillStyle(0x8b6fd6, press(this.shootPtr >= 0)); u.fillCircle(BTN_SHOOT.x, BTN_SHOOT.y, BTN_SHOOT.r);
    u.lineStyle(3, 0xc5afff, 0.8); u.strokeCircle(BTN_SHOOT.x, BTN_SHOOT.y, BTN_SHOOT.r);
    const dodgeReady = this.p.dodgeCd <= 0;
    u.fillStyle(dodgeReady ? 0x4aa3d6 : 0x555566, press(this.dodgePtr >= 0)); u.fillCircle(BTN_DODGE.x, BTN_DODGE.y, BTN_DODGE.r);
    u.lineStyle(3, 0x9fd8ff, 0.8); u.strokeCircle(BTN_DODGE.x, BTN_DODGE.y, BTN_DODGE.r);
    // Joystick flottant
    const sx = this.stick.bx, sy = this.stick.by;
    u.lineStyle(3, 0xffffff, this.stick.id >= 0 ? 0.35 : 0.14); u.strokeCircle(sx, sy, STICK.max);
    u.fillStyle(0xffffff, this.stick.id >= 0 ? 0.3 : 0.1); u.fillCircle(sx + this.stick.vx * STICK.max, sy + this.stick.vy * STICK.max, 24);

    this.debugText.setVisible(this.showDebug);
    if (this.showDebug) {
      const frame = this.registry.get('frame') as { w: number; h: number };
      const times = this.frameTimes;
      const recent = times.slice(-300);
      const p99 = percentile(recent, 99);
      this.debugText.setText([
        `FPS ${Math.round(this.game.loop.actualFps)}  pire1% ${Math.round(p99)}ms`,
        `${this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas'}  ${this.quality} ${frame.w}x${frame.h}`,
        `tex ${((this.registry.get('gpuBytes') as number) / 1048576).toFixed(1)}Mo  ${this.god ? 'GOD ' : ''}${this.auto ? 'AUTO' : ''}`,
      ].join('\n'));
    }
    const w = window as unknown as { __yarden?: unknown };
    w.__yarden = { stage: this.stage, hp: this.p.hp, enemies: this.enemies.filter(e => e.alive).map(e => e.kind), door: this.doorOpen, result: this.result, frames: this.frames, x: Math.round(this.p.x), y: Math.round(this.p.y), arrows: this.arrows.length, shots: this.shots };
  }
}
