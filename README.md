# Yarden — test de faisabilité Phaser (donjon du Chapitre 1)

Test jetable, pas une migration : peut-on jouer le donjon du Chapitre 1 avec des sprites PixelLab
(héroïne aux cheveux rouges, à l'arc) sur un moteur 2D mobile, et que donne le rendu ?

- **Moteur** : Phaser 3 + TypeScript + Vite, portrait mobile 9:16, build statique.
- **Contenu** : la salle de 960 × 672 du Ch1 (deux piliers, porte verte au nord), un gobelin, un ogre,
  le Troll avec son cercle d'impact orange, puis la porte. L'arc remplace la faux.
- **Sprites** : course en 8 directions (6 images) et poses à l'arc en 8 directions, issues de PixelLab.
- **Provisoire** : gobelin, ogre, Troll et décor sont dessinés par le code (formes simples), pas de sprites.

## Jouer

| | |
|---|---|
| Téléphone | joystick flottant à gauche, **TIR** (maintenu = tir en continu, visée automatique), **ESQ** (esquive) |
| PC | ZQSD / WASD / flèches, **Espace** = tir, **Maj** = esquive, **P** = afficher/masquer les mesures |

Paramètres d'adresse :

- `?q=half` (défaut) ou `?q=full` : sprites en 113 × 122 px ou en taille d'origine 226 × 244 px
- `?god=1` : invincible (utile pour mesurer la fluidité sans mourir)
- `?auto=1` : pilote automatique (sert aux tests)
- `?debug=0` : cache les mesures

À la fin du donjon (ou à la mort), un écran affiche les mesures : FPS moyen, pire 1 %, moteur, mémoire
des textures, chargement. **Fais une capture de cet écran sur ton téléphone** : c'est le résultat du test.

## Lancer

```bash
npm install
npm run dev        # serveur local, accessible depuis le téléphone sur le même Wi-Fi
npm run build      # vérification TypeScript + build dans dist/
npm test           # tests de la logique (déplacements, collisions, directions)
python3 tests/e2e.py half   # partie complète automatique dans Chrome (nécessite npm run build et playwright)
```

## Publier sur GitHub Pages

1. Dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
2. Chaque push sur `main` publie le test (workflow `.github/workflows/pages.yml`).
3. Adresse : `https://kanoew.github.io/RPG/`

Attention : GitHub Pages sur un dépôt **privé** demande un abonnement payant (Pro). Sinon, passe le dépôt en
public, ou teste en local avec `npm run dev`.

## Refaire les planches de sprites

Les exports PixelLab d'origine sont dans `art-sources/pixellab/`. Pour les réassembler (cadrage commun,
version pleine taille et version réduite de moitié) :

```bash
python3 tools/pack_sprites.py
```

## Limites connues du test

- L'héroïne court **sans arc** (l'animation de course ne l'inclut pas) et s'arrête **avec l'arc** : il manque
  une course à l'arc, une attente animée, un tir animé, un coup reçu et une défaite.
- Les mesures prises dans le navigateur sans tête (rendu logiciel) ne représentent pas un téléphone.
- Les conditions d'usage commercial de PixelLab et la déclaration IA de Steam sont à vérifier avant toute vente.
