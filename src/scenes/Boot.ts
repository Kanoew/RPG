import Phaser from 'phaser';

export type Quality = 'full' | 'half';

interface Meta {
  variants: Record<Quality, { frame_w: number; frame_h: number; gpu_bytes: number }>;
}

// Charge les planches de l'héroïne dans la qualité demandée (?q=full | half, par défaut half).
export class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload(): void {
    const w = this.scale.width, h = this.scale.height;
    const text = this.add.text(w / 2, h / 2, 'Chargement…', { fontFamily: 'system-ui', fontSize: '20px', color: '#c5afff' }).setOrigin(0.5);
    this.load.on('progress', (p: number) => text.setText(`Chargement… ${Math.round(p * 100)} %`));
    this.load.json('meta', 'sprites/heroine-meta.json');
  }

  create(): void {
    const params = new URLSearchParams(window.location.search);
    const quality: Quality = params.get('q') === 'full' ? 'full' : 'half';
    const meta = this.cache.json.get('meta') as Meta;
    const v = meta.variants[quality];
    this.registry.set('quality', quality);
    this.registry.set('frame', { w: v.frame_w, h: v.frame_h });
    this.registry.set('gpuBytes', v.gpu_bytes);
    this.registry.set('loadStart', performance.now());

    this.load.spritesheet('heroine-run', `sprites/heroine-run-${quality}.png`, { frameWidth: v.frame_w, frameHeight: v.frame_h });
    this.load.spritesheet('heroine-bow', `sprites/heroine-bow-${quality}.png`, { frameWidth: v.frame_w, frameHeight: v.frame_h });
    this.load.once('complete', () => {
      this.registry.set('loadMs', Math.round(performance.now() - (this.registry.get('loadStart') as number)));
      this.scene.start('Dungeon');
    });
    this.load.start();
  }
}
