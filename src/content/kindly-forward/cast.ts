import * as THREE from 'three';
import { PALETTE_CSS } from '../../art/palette';
import { assets, type AssetId } from '../../core/AssetLoader';
import type { CastPack } from '../types';

export const KINDLY_FORWARD_CAST_IDS = {
  albert: 'albert',
  mira: 'mira',
  rowan: 'rowan',
  liliane: 'liliane',
  amina: 'amina',
  niko: 'niko',
  maeve: 'maeve',
  vittorio: 'vittorio',
} as const;

const at = (x: number, z: number): THREE.Vector3 => new THREE.Vector3(x, 0, z);
const model = (id: AssetId) => () => assets.model(id);
const clips = (id: AssetId) => () => assets.animations(id);

/** All W4 authored roles; only the frozen eight residents enter `members`. */
export const KINDLY_FORWARD_CHARACTER_ASSETS = {
  postmaster: { model: model('postmaster'), clips: clips('postmaster') },
  albert: { model: model('albert'), clips: clips('albert') },
  mira: { model: model('mira'), clips: clips('mira') },
  rowan: { model: model('rowan'), clips: clips('rowan') },
  liliane: { model: model('liliane'), clips: clips('liliane') },
  amina: { model: model('amina'), clips: clips('amina') },
  niko: { model: model('niko'), clips: clips('niko') },
  maeve: { model: model('maeve'), clips: clips('maeve') },
  vittorio: { model: model('vittorio'), clips: clips('vittorio') },
  'ferry-recruit': { model: model('ferry-recruit'), clips: clips('ferry-recruit') },
} as const;

/**
 * Authored-asset production pack for W4/W6 authoring. Locations use the current
 * redressed island until W3 supplies final generated-island anchors.
 */
export const KINDLY_FORWARD_CAST: CastPack = {
  members: [
    {
      id: 'albert', displayName: 'ALBERT', ...KINDLY_FORWARD_CHARACTER_ASSETS.albert, home: at(-4.5, 2.5),
      homePlot: 'post-office', wanderRadius: 2.5, bubbleHeight: 2.8, quirk: 'scribble',
      gait: { rate: 1.35, bounce: 0.85, sway: 0.65, swing: 1.15, posture: 0.13 },
      speakerLook: [PALETTE_CSS.h9a7f4e, PALETTE_CSS.h6a3540],
      tastes: { loved: ['relic-letter'], liked: ['relic-teacup'], disliked: ['scrap-metal'] },
      schedule: ({ plaza }) => [
        { from: 6, to: 12, x: -4.5, z: 2.5, radius: 1.8, emote: 'idea' },
        { from: 12, to: 15, x: plaza.x, z: plaza.z, radius: 2.5 },
        { from: 15, to: 21, x: -4.5, z: 2.5, radius: 2.2, emote: 'question' },
      ],
    },
    {
      id: 'mira', displayName: 'MIRA', ...KINDLY_FORWARD_CHARACTER_ASSETS.mira, home: at(8, 8),
      homePlot: 'boarding-house', wanderRadius: 4, bubbleHeight: 2.05, quirk: 'headbob',
      gait: { rate: 1.55, bounce: 1.3, sway: 0.7, swing: 1.25 },
      speakerLook: [PALETTE_CSS.ha06a48, PALETTE_CSS.hd8cdb4],
      tastes: { loved: ['meadow-hopper'], liked: ['orchard-apple'], disliked: ['relic-boot'] },
      schedule: ({ plaza }) => [
        { from: 7, to: 11, x: 8, z: 8, radius: 4, emote: 'happy' },
        { from: 11, to: 15, x: plaza.x + 2, z: plaza.z, radius: 3 },
        { from: 15, to: 19, x: 11, z: 5, radius: 3.5, emote: 'love' },
      ],
    },
    {
      id: 'rowan', displayName: 'OLD ROWAN', ...KINDLY_FORWARD_CHARACTER_ASSETS.rowan, home: at(0, 16),
      homePlot: 'ferry-berth', wanderRadius: 2.5, bubbleHeight: 3.05, quirk: 'polish',
      gait: { rate: 0.72, bounce: 0.55, sway: 1.25, swing: 0.6, posture: 0.12 },
      speakerLook: [PALETTE_CSS.h3f4a5a, PALETTE_CSS.h8a6a52],
      tastes: { loved: ['relic-boot'], liked: ['fish:*'], disliked: ['cinder-moth'] },
      schedule: ({ plaza, spots }) => [
        { from: 5, to: 10, x: spots.dock.x, z: spots.dock.z - 1, radius: 2 },
        { from: 10, to: 16, x: 2, z: 14, radius: 2.5 },
        { from: 16, to: 19, x: plaza.x - 2, z: plaza.z, radius: 3 },
      ],
    },
    {
      id: 'liliane', displayName: 'LILIANE', ...KINDLY_FORWARD_CHARACTER_ASSETS.liliane, home: at(14, 1),
      homePlot: 'music-hall', wanderRadius: 3, bubbleHeight: 3.2, quirk: 'scan',
      gait: { rate: 0.82, bounce: 0.55, sway: 0.35, swing: 0.4 },
      speakerLook: [PALETTE_CSS.h6f4f36, PALETTE_CSS.hd8cdb4],
      tastes: { loved: ['relic-teacup'], liked: ['ivory-butterfly'], disliked: ['scrap-metal'] },
      schedule: ({ plaza }) => [
        { from: 8, to: 12, x: 14, z: 1, radius: 2 },
        { from: 12, to: 16, x: plaza.x + 2, z: plaza.z - 1, radius: 2.5 },
        { from: 16, to: 20, x: 10, z: 5, radius: 2.5, emote: 'music' },
      ],
    },
    {
      id: 'amina', displayName: 'DR. AMINA', ...KINDLY_FORWARD_CHARACTER_ASSETS.amina, home: at(-13, 3),
      homePlot: 'clinic', wanderRadius: 3.5, bubbleHeight: 2.75, quirk: 'scribble',
      gait: { rate: 1.05, bounce: 0.65, sway: 0.45, swing: 0.7 },
      speakerLook: [PALETTE_CSS.h6b5140, PALETTE_CSS.hd8cdb4],
      tastes: { loved: ['wild-chicory'], liked: ['forage:*'], disliked: ['gear-beetle'] },
      schedule: ({ plaza }) => [
        { from: 7, to: 12, x: -13, z: 3, radius: 2, emote: 'idea' },
        { from: 12, to: 16, x: plaza.x - 1, z: plaza.z, radius: 3 },
        { from: 16, to: 19, x: -20, z: -18, radius: 3.5 },
      ],
    },
    {
      id: 'niko', displayName: 'NIKO', ...KINDLY_FORWARD_CHARACTER_ASSETS.niko, home: at(26, -3),
      homePlot: 'greenhouse', wanderRadius: 5, bubbleHeight: 2.75, quirk: 'tend',
      gait: { rate: 0.9, bounce: 0.7, sway: 0.8, swing: 0.65, posture: 0.14 },
      speakerLook: [PALETTE_CSS.h5a7a4a, PALETTE_CSS.h8a6a52],
      tastes: { loved: ['wild-chicory'], liked: ['forage:*', 'orchard-apple'], disliked: ['scrap-metal'] },
      schedule: ({ plaza }) => [
        { from: 6, to: 12, x: 26, z: -3, radius: 4, emote: 'love' },
        { from: 12, to: 16, x: -20, z: -18, radius: 4 },
        { from: 16, to: 19, x: plaza.x, z: plaza.z + 2, radius: 3 },
      ],
    },
    {
      id: 'maeve', displayName: 'MAEVE', ...KINDLY_FORWARD_CHARACTER_ASSETS.maeve, home: at(-22, -26),
      homePlot: 'archive', wanderRadius: 3, nocturnal: true, bubbleHeight: 3.35, quirk: 'scan',
      gait: { rate: 0.7, bounce: 0.4, sway: 0.55, swing: 0.5, posture: 0.16 },
      speakerLook: [PALETTE_CSS.h5c6e78, PALETTE_CSS.hd8cdb4],
      tastes: { loved: ['relic-letter'], liked: ['relic:*'], disliked: ['mud-darter'] },
      schedule: ({ plaza }) => [
        { from: 10, to: 16, x: -22, z: -26, radius: 2.5, emote: 'idea' },
        { from: 16, to: 20, x: -4.5, z: 2.5, radius: 2 },
        { from: 20, to: 23, x: plaza.x - 2, z: plaza.z - 1, radius: 3 },
      ],
    },
    {
      id: 'vittorio', displayName: 'VITTORIO', ...KINDLY_FORWARD_CHARACTER_ASSETS.vittorio, home: at(10, 5),
      homePlot: 'music-hall', wanderRadius: 5, bubbleHeight: 3.05, quirk: 'crank',
      gait: { rate: 1.1, bounce: 1.1, sway: 1.35, swing: 1.55, posture: -0.03 },
      speakerLook: [PALETTE_CSS.ha8402f, PALETTE_CSS.hc9a227],
      tastes: { loved: ['relic-letter'], liked: ['relic-teacup'], disliked: ['stone'] },
      schedule: ({ plaza }) => [
        { from: 10, to: 14, x: plaza.x + 2, z: plaza.z + 1, radius: 2.5, emote: 'music' },
        { from: 14, to: 18, x: 10, z: 5, radius: 2, emote: 'music' },
        { from: 18, to: 22, x: plaza.x, z: plaza.z - 2, radius: 4, emote: 'happy' },
      ],
    },
  ],
};

export const KINDLY_FORWARD_TASTES = Object.fromEntries(
  KINDLY_FORWARD_CAST.members.map((member) => [member.id, member.tastes]),
);
