import Phaser from 'phaser';
import { Boot } from './scenes/Boot';
import { Dungeon } from './scenes/Dungeon';

// Portrait mobile 9:16, mis à l'échelle de l'écran. Pas de lissage forcé : les sprites sont du pixel-peint.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 480,
  height: 854,
  backgroundColor: '#07060b',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 3 },
  fps: { target: 60 },
  render: { antialias: true, roundPixels: false },
  scene: [Boot, Dungeon],
});

// Pour les tests automatisés et le diagnostic dans la console.
(window as unknown as { __game: Phaser.Game }).__game = game;
