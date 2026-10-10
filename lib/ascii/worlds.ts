import type { AsciiConfig } from './config'
import { makePrim, type MeshScene, type Vec3 } from './scene'
import {
  defaultBehaviour,
  defaultField,
  defaultGeom,
  makeObject,
  type ArraySpec,
  type Behaviour,
  type Field,
  type Geom,
  type GeomKind,
  type World,
  type WObject,
} from './world'

// Curated worlds for the studio gallery. Each is a World plus the config patch it was tuned with.

export interface WorldPreset {
  key: string
  label: string
  /** One line for the gallery. */
  blurb: string
  world: () => World
  config: Partial<AsciiConfig>
}

type GeomOf<K extends GeomKind> = Extract<Geom, { kind: K }>

function o<K extends GeomKind>(kind: K, geom: Partial<Omit<GeomOf<K>, 'kind'>>, patch: Partial<WObject> = {}): WObject {
  return makeObject(kind, { ...patch, geom: { ...(defaultGeom(kind) as GeomOf<K>), ...geom } as Geom })
}

function b<T extends Behaviour['type']>(type: T, patch: Partial<Extract<Behaviour, { type: T }>> = {}): Behaviour {
  return { ...(defaultBehaviour(type) as Extract<Behaviour, { type: T }>), ...patch } as Behaviour
}

function f(type: Field['type'], patch: Partial<Field> = {}): Field {
  return { ...defaultField(type), ...patch }
}

function arr(patch: Partial<ArraySpec>): ArraySpec {
  return { count: 6, offset: [0, 0, 0], step: [0, 0, 0], rot: [0, 0, 0], grow: 1, spin: 0, phase: 0, ...patch }
}

const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z]
const u = (s: number): Vec3 => [s, s, s]

function sceneOf(prims: MeshScene['prims'], blend = 0.06): MeshScene {
  return { prims, dabs: [], paint: {}, blend, meshes: {} }
}

const BASE: Partial<AsciiConfig> = {
  gridDots: false,
  intro: 0.9,
  shimmer: 0.02,
  depthFade: 0.15,
  contrast: 1.1,
  brightness: 0.02,
  ambient: 0.16,
  cellSize: 7,
  zoom: 1,
  offsetX: 0,
  offsetY: 0,
  invert: false,
  gamma: 1,
  scanStrength: 0,
  waveAmp: 0,
  transparentBg: false,
}

export const WORLD_PRESETS: WorldPreset[] = [
  {
    key: 'orrery',
    label: 'Orrery',
    blurb: 'A burning sun, three planets, a ringed giant and a moon, on a nebula.',
    config: { ...BASE, bg: '#04050c', charset: ' .:-=+*#%@', lightAzimuth: 0, lightElevation: 8, ambient: 0.08 },
    world: () => {
      const sat = [b('orbit', { radius: 1.25, speed: -20, phase: 200, tilt: 4 })]
      return {
        name: 'Orrery',
        duration: 18,
        fit: 1.25,
        camera: { rot: [-24, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0.05], anim: [b('sway', { axis: 'y', amp: 14, speed: 1 / 18 })] },
        fields: [
          f('noise', { charset: ' .·:', colors: ['#04050c', '#2a1a5e', '#6a3cb0'], intensity: 1.1, scale: 0.8, speed: 0.4 }),
          f('stars', { colors: ['#3a4060', '#ffffff'], scale: 1.2 }),
        ],
        objects: [
          o('shape', { type: 'sphere' }, { name: 'Sun', scale: u(0.62), color: '#ffe08a', shadow: '#ff4d1a', emissive: 0.45, charset: ' .:-=+*#%@', anim: [b('spin', { speed: 20 }), b('wave', { axis: 'x', amp: 0.012, freq: 18, speed: 0.5 }), b('pulse', { amp: 0.025, speed: 1 / 3 })] }),
          o('flat', { type: 'ring', inner: 0.8, bevel: 0 }, { name: 'Corona', scale: u(0.98), color: '#ff8a3d', shadow: '#2a0c05', emissive: 1, charset: ' ·:', rot: v3(24, 0, 0), anim: [b('pulse', { amp: 0.04, speed: 0.5 })] }),
          o('curve', { type: 'circle', tube: 0.004 }, { name: 'Orbit 1', scale: u(0.75 / 0.45), color: '#6670a8', charset: '·', emissive: 1 }),
          o('curve', { type: 'circle', tube: 0.004 }, { name: 'Orbit 2', scale: u(1.25 / 0.45), color: '#6670a8', charset: '·', emissive: 1 }),
          o('shape', { type: 'sphere' }, { name: 'Ice world', scale: u(0.11), color: '#8fd3ff', shadow: '#0a1a33', anim: [b('orbit', { radius: 0.75, speed: 40 })] }),
          o('shape', { type: 'sphere' }, { name: 'Giant', scale: u(0.22), color: '#f2c58c', shadow: '#24140a', anim: [...sat, b('spin', { speed: 40 })] }),
          o('particles', { type: 'ring', count: 2600, speed: 1, seed: 4 }, { name: 'Rings', scale: u(0.62), rot: v3(18, 0, 10), color: '#e8d2a6', shadow: '#2a1d0e', charset: ' .·:', emissive: 1, anim: sat }),
          o('shape', { type: 'sphere' }, { name: 'Moon', scale: u(0.05), color: '#cfcfcf', shadow: '#161616', anim: [...sat, b('orbit', { radius: 0.36, speed: 120, tilt: 20 })] }),
        ],
      }
    },
  },
  {
    key: 'sunset',
    label: 'Ocean sunset',
    blurb: 'A striped sun sinks behind a breathing sea under drifting clouds.',
    config: { ...BASE, bg: '#12061f', charset: ' .:-=+*#', lightAzimuth: 170, lightElevation: 40, ambient: 0.22, depthFade: 0.2, cellSize: 6 },
    world: () => ({
      name: 'Ocean sunset',
      duration: 20,
      fit: 1.1,
      camera: { rot: [-6, 0, 0], zoom: 1, fov: 0.35, pan: [0, 0.15], anim: [] },
      fields: [
        f('gradient', { charset: ' .·:-', colors: ['#12061f', '#5a1f5e', '#d6456b', '#ffb36b'], angle: -90, scale: 0.75, intensity: 1 }),
        f('stars', { colors: ['#4a2c6a', '#ffe6f0'], scale: 0.5 }),
      ],
      objects: [
        o('flat', { type: 'circle', bevel: 0 }, { name: 'Sun', pos: v3(0, 0.12, -3), scale: u(1.5), color: '#fff3b0', shadow: '#ff3d6e', emissive: 1, tint: 'height', charset: '#', anim: [b('bob', { amp: 0.06, speed: 1 / 20 })] }),
        o('flat', { type: 'rect', bevel: 0 }, { name: 'Sun stripes', pos: v3(0, 0.3, -2.95), scale: v3(1.6, 0.03, 1), color: '#12061f', charset: ' ', array: arr({ count: 6, step: v3(0, -0.1, 0), grow: 1.13 }), anim: [b('bob', { amp: 0.06, speed: 1 / 20 })] }),
        o('terrain', { type: 'ocean', amp: 0.045, freq: 5, speed: 1, seed: 2 }, { name: 'Sea', pos: v3(0, -0.42, -0.6), scale: v3(7, 1, 4.5), color: '#ffc69a', shadow: '#3a1250', charset: '.·-~=≈' }),
        o('flat', { type: 'circle', bevel: 0.4 }, { name: 'Clouds', pos: v3(-1.6, 0.85, -2), scale: v3(0.9, 0.16, 1), color: '#ff9fb0', shadow: '#3a1446', charset: ' .:-=', array: arr({ count: 4, step: v3(1.15, 0.13, 0), grow: 0.85 }), anim: [b('drift', { vel: v3(0.05, 0, 0), wrap: 3 })] }),
      ],
    }),
  },
  {
    key: 'koi',
    label: 'Koi pond',
    blurb: 'Two koi circle a lotus on rippling water. Flat, top-down, 2D.',
    config: { ...BASE, bg: '#03141a', charset: ' .:-=+*#%@', lightAzimuth: -40, lightElevation: 50, ambient: 0.25, depthFade: 0 },
    world: () => {
      const koi = (color: string, spot: string) =>
        sceneOf([
          makePrim('sphere', { pos: [0, 0.02, 0], scale: [0.36, 0.9, 0.3], color }),
          makePrim('cone', { pos: [0, -0.55, 0], rot: [0, 0, 180], scale: [0.34, 0.32, 0.12], color }),
          makePrim('sphere', { pos: [0.02, 0.18, 0.1], scale: [0.2, 0.24, 0.14], color: spot }),
          makePrim('sphere', { pos: [-0.06, -0.12, 0.09], scale: [0.16, 0.2, 0.12], color: spot }),
          makePrim('sphere', { pos: [0.2, 0.12, 0], rot: [0, 0, -40], scale: [0.22, 0.1, 0.05], color }),
          makePrim('sphere', { pos: [-0.2, 0.12, 0], rot: [0, 0, 40], scale: [0.22, 0.1, 0.05], color }),
        ], 0.08)
      return {
        name: 'Koi pond',
        duration: 18,
        fit: 1.05,
        camera: { rot: [0, 0, 0], zoom: 1, fov: 0, pan: [0, 0], anim: [] },
        fields: [f('ripples', { charset: ' .·~-', colors: ['#03141a', '#0b3d45', '#3d9c95'], intensity: 0.9, scale: 0.9, speed: 0.7, seed: 3 })],
        objects: [
          o('sculpt', { scene: koi('#ff7a2e', '#fff4e6') }, { name: 'Kohaku', scale: u(0.62), source: true, anim: [b('orbit', { radius: 0.68, speed: 20, plane: 'xy' }), b('spin', { axis: 'z', speed: 20 }), b('wave', { axis: 'x', amp: 0.05, freq: 7, speed: 1.2 })] }),
          o('sculpt', { scene: koi('#f2f2f2', '#1a1a1a') }, { name: 'Utsuri', scale: u(0.5), rot: v3(0, 0, 180), source: true, anim: [b('orbit', { radius: 0.4, speed: -40, phase: 140, plane: 'xy' }), b('spin', { axis: 'z', speed: -40 }), b('wave', { axis: 'x', amp: 0.05, freq: 7, speed: 1.4 })] }),
          o('flat', { type: 'moon', inner: 0.1, bevel: 0.15 }, { name: 'Lily pad', pos: v3(0.95, 0.55, 0.1), scale: u(0.42), rot: v3(0, 0, 30), color: '#7fc46a', shadow: '#0c2a14', anim: [b('sway', { axis: 'z', amp: 6, speed: 1 / 9 })] }),
          o('flat', { type: 'moon', inner: 0.1, bevel: 0.15 }, { name: 'Lily pad 2', pos: v3(-1.05, -0.5, 0.1), scale: u(0.34), rot: v3(0, 0, 200), color: '#6bb35a', shadow: '#0c2a14', anim: [b('sway', { axis: 'z', amp: 8, speed: 1 / 6 })] }),
          o('flat', { type: 'circle', bevel: 0.2 }, { name: 'Lotus pad', pos: v3(0, 0, 0.05), scale: u(0.5), color: '#5aa651', shadow: '#0c2a14' }),
          o('flat', { type: 'petal', inner: 0.42, bevel: 0.2 }, { name: 'Lotus outer', pos: v3(0, 0, 0.15), scale: u(0.26), color: '#ffc2dc', shadow: '#5a1e3c', array: arr({ count: 8, offset: v3(0, 0.12, 0), rot: v3(0, 0, 45), spin: 6 }) }),
          o('flat', { type: 'petal', inner: 0.42, bevel: 0.2 }, { name: 'Lotus inner', pos: v3(0, 0, 0.2), scale: u(0.17), color: '#fff0f6', shadow: '#7a2a52', array: arr({ count: 6, offset: v3(0, 0.07, 0), rot: v3(0, 0, 60), spin: -9 }) }),
          o('flat', { type: 'circle', bevel: 0.5 }, { name: 'Heart', pos: v3(0, 0, 0.25), scale: u(0.07), color: '#ffd84a', shadow: '#6a4a00' }),
        ],
      }
    },
  },
  {
    key: 'aurora',
    label: 'Aurora peaks',
    blurb: 'Northern lights over snowy mountains and a still lake, snow falling.',
    config: { ...BASE, bg: '#01040b', charset: ' .:-=+*#%@', lightAzimuth: -55, lightElevation: 35, ambient: 0.12, depthFade: 0.25 },
    world: () => ({
      name: 'Aurora peaks',
      duration: 24,
      fit: 1.15,
      camera: { rot: [-7, 0, 0], zoom: 1, fov: 0.35, pan: [0, 0.2], anim: [b('sway', { axis: 'y', amp: 5, speed: 1 / 24 })] },
      fields: [
        f('gradient', { charset: ' .', colors: ['#01040b', '#0a1a33'], angle: 90, scale: 0.8, intensity: 0.8 }),
        f('stars', { colors: ['#2a3a5a', '#e6f2ff'], scale: 1.1 }),
        f('aurora', { charset: ' .:-=+*', colors: ['#02140f', '#13a875', '#7dffc8', '#c9b6ff'], intensity: 0.85, speed: 0.6, scale: 1 }),
      ],
      objects: [
        o('terrain', { type: 'mountains', amp: 0.55, freq: 2.2, seed: 7 }, { name: 'Far range', pos: v3(0, -0.3, -1.7), scale: v3(6, 1.2, 1.4), color: '#b8d0f5', shadow: '#060e22', emissive: 0.35, tint: 'height' }),
        o('terrain', { type: 'mountains', amp: 0.5, freq: 2.6, seed: 3 }, { name: 'Peaks', pos: v3(0, -0.55, -0.7), scale: v3(5, 1.2, 1.4), color: '#ffffff', shadow: '#0a1530', emissive: 0.45, tint: 'height' }),
        o('terrain', { type: 'ocean', amp: 0.006, freq: 9, speed: 0.4 }, { name: 'Lake', pos: v3(0, -0.72, 0.6), scale: v3(5, 1, 1.8), color: '#5fe0b0', shadow: '#020a10', charset: ' .-~' }),
        o('particles', { type: 'snow', count: 900, speed: 1.2, seed: 5 }, { name: 'Snow', pos: v3(0, 0.1, 0.4), scale: v3(4, 2.4, 1.5), color: '#ffffff', shadow: '#2a3a5a', charset: ' ..·*' }),
      ],
    }),
  },
  {
    key: 'galaxy',
    label: 'Galaxy',
    blurb: 'Nine thousand stars wind round a bright core.',
    config: { ...BASE, bg: '#03020a', charset: ' .·:+*#@', lightAzimuth: 0, lightElevation: 30, depthFade: 0.35, shimmer: 0.04 },
    world: () => ({
      name: 'Galaxy',
      duration: 24,
      fit: 1.35,
      camera: { rot: [-38, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0], anim: [b('sway', { axis: 'x', amp: 10, speed: 1 / 24 }), b('sway', { axis: 'z', amp: 8, speed: 1 / 24, phase: 0.25 })] },
      fields: [
        f('noise', { charset: ' .·', colors: ['#03020a', '#2a0f3d', '#5b2a7a'], intensity: 0.6, scale: 0.7, speed: 0.3 }),
        f('stars', { colors: ['#2a2a4a', '#ffffff'], scale: 0.8 }),
      ],
      objects: [
        o('particles', { type: 'galaxy', count: 9000, speed: 1, seed: 2 }, { name: 'Arms', scale: u(3.2), color: '#d6e4ff', shadow: '#2a1650', charset: ' .·:+*#@', emissive: 1 }),
        o('shape', { type: 'sphere' }, { name: 'Core', scale: u(0.2), color: '#fff2c4', shadow: '#ff8a3d', emissive: 0.7, anim: [b('pulse', { amp: 0.06, speed: 0.25 })] }),
      ],
    }),
  },
  {
    key: 'dna',
    label: 'Double helix',
    blurb: 'A turning DNA strand with base-pair rungs in a drifting particle field.',
    config: { ...BASE, bg: '#020a10', charset: ' .:-=+*#%@', lightAzimuth: -40, lightElevation: 30, ambient: 0.12 },
    world: () => ({
      name: 'Double helix',
      duration: 12,
      fit: 1.75,
      camera: { rot: [-8, 0, -14], zoom: 1, fov: 0.3, pan: [0, 0], anim: [b('sway', { axis: 'z', amp: 5, speed: 1 / 12 })] },
      fields: [f('vortex', { charset: ' .·', colors: ['#020a10', '#0b2a3a', '#1f6f8b'], intensity: 0.7, speed: 0.5, scale: 0.8 })],
      objects: [
        // Strand angle a(y) = 720°·(y/3 + 0.5); a rung along (cos a, 0, sin a) is Ry(90° − a)·Rx(90°).
        o('curve', { type: 'helix', turns: 2, p: 2, tube: 0.055 }, { name: 'Backbone', scale: v3(0.9, 3, 0.9), color: '#6ef0ff', shadow: '#03202a', anim: [b('spin', { speed: 30 })] }),
        o('shape', { type: 'cylinder' }, { name: 'Rungs', pos: v3(0, -1.25, 0), rot: v3(90, 30, 0), scale: v3(0.035, 0.56, 0.035), color: '#ff7ad9', shadow: '#2a0520', array: arr({ count: 21, step: v3(0, 0.125, 0), rot: v3(0, -30, 0), spin: 30 }) }),
        o('shape', { type: 'sphere' }, { name: 'Bases', pos: v3(0, -1.25, 0), scale: u(0.07), color: '#ffd166', shadow: '#2a1a00', array: arr({ count: 21, offset: v3(0.065, 0, 0.1126), step: v3(0, 0.125, 0), rot: v3(0, -30, 0), spin: 30 }) }),
        o('shape', { type: 'sphere' }, { name: 'Bases 2', pos: v3(0, -1.25, 0), scale: u(0.07), color: '#7dff9a', shadow: '#002a10', array: arr({ count: 21, offset: v3(-0.065, 0, -0.1126), step: v3(0, 0.125, 0), rot: v3(0, -30, 0), spin: 30 }) }),
        o('particles', { type: 'dust', count: 700, speed: 1.5, seed: 3 }, { name: 'Plankton', scale: v3(4, 3, 2), color: '#9fe8ff', shadow: '#0b2a3a', charset: ' .·', emissive: 1 }),
      ],
    }),
  },
  {
    key: 'campfire',
    label: 'Campfire',
    blurb: 'Flames lick crossed logs inside a ring of stones; embers rise to the stars.',
    config: { ...BASE, bg: '#06040a', charset: ' .:-=+*#%@', lightAzimuth: 20, lightElevation: 12, ambient: 0.1, depthFade: 0.25 },
    world: () => ({
      name: 'Campfire',
      duration: 12,
      fit: 0.72,
      camera: { rot: [-20, 0, 0], zoom: 1, fov: 0.35, pan: [0, 0.02], anim: [b('sway', { axis: 'y', amp: 10, speed: 1 / 12 })] },
      fields: [
        f('gradient', { charset: ' .', colors: ['#06040a', '#1a0d1f'], angle: 90, scale: 0.7 }),
        f('stars', { colors: ['#3a2a40', '#fff2d6'], scale: 1 }),
      ],
      objects: [
        o('flat', { type: 'circle', bevel: 0 }, { name: 'Ground', pos: v3(0, -0.46, 0), rot: v3(-90, 0, 0), scale: u(2.4), color: '#2a1a14', shadow: '#0a0605', charset: ' ..,' }),
        o('shape', { type: 'sphere' }, { name: 'Stones', pos: v3(0, -0.42, 0), scale: v3(0.17, 0.12, 0.15), color: '#a49a94', shadow: '#120e0c', array: arr({ count: 11, offset: v3(0.55, 0, 0), rot: v3(0, 360 / 11, 0) }) }),
        o('shape', { type: 'cylinder' }, { name: 'Logs', pos: v3(0, -0.36, 0), rot: v3(0, 0, 78), scale: v3(0.09, 0.75, 0.09), color: '#8a5a3a', shadow: '#140804', array: arr({ count: 3, rot: v3(0, 60, 0) }) }),
        o('flat', { type: 'petal', inner: 0.55, bevel: 0.3 }, { name: 'Flames', pos: v3(0, -0.1, 0), scale: v3(0.3, 0.6, 0.3), color: '#ff3d0a', shadow: '#fff0a8', emissive: 0.6, tint: 'height', charset: ' .:-=+*#%@', array: arr({ count: 5, rot: v3(0, 36, 0), phase: 0.27 }), anim: [b('pulse', { amp: 0.14, speed: 1.1 }), b('wave', { axis: 'x', amp: 0.08, freq: 5, speed: 1.5 })] }),
        o('flat', { type: 'petal', inner: 0.5, bevel: 0.3 }, { name: 'Flame core', pos: v3(0, -0.2, 0.05), scale: v3(0.16, 0.3, 0.16), color: '#ffffff', shadow: '#ffb03d', emissive: 0.8, anim: [b('pulse', { amp: 0.18, speed: 1.6 })] }),
        o('particles', { type: 'embers', count: 220, speed: 1.4, seed: 9 }, { name: 'Embers', pos: v3(0, 0.45, 0), scale: v3(0.7, 1.6, 0.7), color: '#ffd27a', shadow: '#5a1200', charset: ' .·*' }),
      ],
    }),
  },
  {
    key: 'warp',
    label: 'Warp tunnel',
    blurb: 'Neon rings rush past through an endless tunnel.',
    config: { ...BASE, bg: '#000005', charset: ' .:-=+*#%@', lightAzimuth: 0, lightElevation: 0, ambient: 0.2, depthFade: 0.6, intro: 0.4 },
    world: () => ({
      name: 'Warp tunnel',
      duration: 8,
      fit: 1,
      camera: { rot: [0, 0, 0], zoom: 1, fov: 0.75, pan: [0, 0], anim: [b('sway', { axis: 'z', amp: 12, speed: 1 / 8 }), b('sway', { axis: 'y', amp: 4, speed: 1 / 8, phase: 0.25 })] },
      fields: [f('tunnel', { charset: ' .·:-=+', colors: ['#000005', '#2a1170', '#7af0ff'], speed: 1, scale: 1 })],
      objects: [
        o('curve', { type: 'circle', tube: 0.025 }, { name: 'Rings', pos: v3(0, 0, -1.2), rot: v3(90, 0, 0), scale: u(2), color: '#ff5ad1', shadow: '#1a0030', array: arr({ count: 6, phase: 4 / 6 }), anim: [b('drift', { vel: v3(0, 0, 1.2), wrap: 2.4 })] }),
        o('particles', { type: 'rain', count: 500, speed: -3, seed: 2 }, { name: 'Streaks', rot: v3(90, 0, 0), scale: v3(2.6, 6, 2.6), color: '#c9f6ff', shadow: '#0a1a40', charset: ' .·-' }),
      ],
    }),
  },
  {
    key: 'zen',
    label: 'Zen garden',
    blurb: 'Raked sand, three stones and cherry petals drifting down.',
    config: { ...BASE, bg: '#100c08', charset: ' .:-=≡#', lightAzimuth: 60, lightElevation: 32, ambient: 0.3, depthFade: 0.15, contrast: 1.25 },
    world: () => ({
      name: 'Zen garden',
      duration: 20,
      fit: 1.15,
      camera: { rot: [-42, 0, 0], zoom: 1, fov: 0.25, pan: [0, -0.05], anim: [b('sway', { axis: 'y', amp: 12, speed: 1 / 20 })] },
      fields: [f('noise', { charset: ' .', colors: ['#100c08', '#2a2116'], intensity: 0.6, scale: 1.2, speed: 0.2 })],
      objects: [
        o('terrain', { type: 'dunes', amp: 0.02, freq: 24, seed: 2 }, { name: 'Sand', pos: v3(0, -0.3, 0), scale: v3(3.4, 1, 2.2), color: '#f0e2c2', shadow: '#2a2014' }),
        o('shape', { type: 'sphere' }, { name: 'Stone', pos: v3(-0.55, -0.24, 0.1), scale: v3(0.42, 0.24, 0.34), color: '#8f8a84', shadow: '#0e0c0a', charset: ' .:-=+*#%@' }),
        o('shape', { type: 'sphere' }, { name: 'Stone 2', pos: v3(0.5, -0.26, -0.35), scale: v3(0.26, 0.17, 0.22), color: '#a29b92', shadow: '#0e0c0a', charset: ' .:-=+*#%@' }),
        o('shape', { type: 'sphere' }, { name: 'Pebble', pos: v3(0.75, -0.29, 0.45), scale: v3(0.13, 0.08, 0.11), color: '#b3aba0', shadow: '#0e0c0a', charset: ' .:-=+*#%@' }),
        o('flat', { type: 'ring', inner: 0.86, bevel: 0 }, { name: 'Rake ring', pos: v3(-0.55, -0.28, 0.1), rot: v3(-90, 0, 0), scale: u(1.1), color: '#cdbd99', shadow: '#2a2014', charset: '~', array: arr({ count: 3, grow: 1.22 }) }),
        o('particles', { type: 'snow', count: 160, speed: 0.6, seed: 8 }, { name: 'Petals', pos: v3(0, 0.3, 0), scale: v3(3, 1.6, 2), color: '#ffb7c8', shadow: '#5a2a3a', charset: ' ·•*' }),
      ],
    }),
  },
  {
    key: 'city',
    label: 'Neon rain',
    blurb: 'A rain-soaked skyline of neon towers mirrored in wet streets.',
    config: { ...BASE, bg: '#05030c', charset: ' .:-=+*#%@', lightAzimuth: -40, lightElevation: 20, ambient: 0.2, depthFade: 0.25, cellSize: 6 },
    world: () => ({
      name: 'Neon rain',
      duration: 16,
      fit: 1.35,
      camera: { rot: [-4, 0, 0], zoom: 1, fov: 0.35, pan: [0, 0.25], anim: [b('sway', { axis: 'y', amp: 7, speed: 1 / 16 })] },
      fields: [
        f('gradient', { charset: ' .·', colors: ['#05030c', '#2a0f4a', '#7a2a7a'], angle: -90, scale: 0.6 }),
        f('rain', { layer: 'front', charset: ' .:|', colors: ['#0a1030', '#6a8cff', '#cfe0ff'], random: false, intensity: 0.8, speed: 2.2, scale: 0.35 }),
      ],
      objects: [
        o('shape', { type: 'box' }, { name: 'Back towers', pos: v3(-2.4, -0.15, -1.6), scale: v3(0.32, 1.3, 0.32), color: '#8a6aff', shadow: '#120a30', emissive: 0.25, charset: ' .:|#', array: arr({ count: 13, step: v3(0.4, 0, 0), jitter: 0.55 }) }),
        o('shape', { type: 'box' }, { name: 'Towers', pos: v3(-2, -0.35, -0.6), scale: v3(0.3, 1, 0.3), color: '#ff6ae0', shadow: '#2a0838', charset: ' .:-=|#▓', emissive: 0.35, array: arr({ count: 11, step: v3(0.4, 0, 0), jitter: 0.6 }) }),
        o('shape', { type: 'box' }, { name: 'Front blocks', pos: v3(-1.9, -0.6, 0.3), scale: v3(0.36, 0.55, 0.3), color: '#5cf0ff', shadow: '#06243a', emissive: 0.35, charset: ' .:-=|#', array: arr({ count: 9, step: v3(0.48, 0, 0), jitter: 0.5 }) }),
        o('terrain', { type: 'ocean', amp: 0.006, freq: 10, speed: 0.8 }, { name: 'Wet street', pos: v3(0, -0.88, 0.4), scale: v3(6, 1, 2.6), color: '#ff7ae6', shadow: '#06030c', charset: ' .-~' }),
      ],
    }),
  },
  {
    key: 'mandala',
    label: 'Lotus mandala',
    blurb: 'Counter-rotating rings of petals and a pulsing halo of beads. 2D.',
    config: { ...BASE, bg: '#0a0618', charset: ' .:-=+*#%@', lightAzimuth: -30, lightElevation: 45, ambient: 0.3, depthFade: 0, shimmer: 0 },
    world: () => ({
      name: 'Lotus mandala',
      duration: 20,
      fit: 1.2,
      camera: { rot: [0, 0, 0], zoom: 1, fov: 0, pan: [0, 0], anim: [b('pulse', { amp: 0.03, speed: 0.1 })] },
      fields: [f('rings', { charset: ' .·', colors: ['#0a0618', '#2a1450', '#4a2a80'], intensity: 0.7, speed: 0.4, scale: 0.8 })],
      objects: [
        o('flat', { type: 'petal', inner: 0.62, bevel: 0.35 }, { name: 'Outer petals', scale: v3(0.34, 0.5, 1), color: '#2fd6c4', shadow: '#04201e', array: arr({ count: 16, offset: v3(0, 0.82, 0), rot: v3(0, 0, 22.5), spin: 3 }) }),
        o('flat', { type: 'petal', inner: 0.66, bevel: 0.35 }, { name: 'Middle petals', scale: v3(0.3, 0.42, 1), color: '#ff5fa2', shadow: '#2a0418', array: arr({ count: 12, offset: v3(0, 0.5, 0), rot: v3(0, 0, 30), spin: -5 }) }),
        o('flat', { type: 'petal', inner: 0.7, bevel: 0.35 }, { name: 'Inner petals', scale: v3(0.24, 0.3, 1), color: '#ffd166', shadow: '#2a1a00', array: arr({ count: 8, offset: v3(0, 0.25, 0), rot: v3(0, 0, 45), spin: 8 }) }),
        o('flat', { type: 'star', sides: 8, inner: 0.35, bevel: 0.3 }, { name: 'Heart star', scale: u(0.3), color: '#fff5d6', shadow: '#5a3a00', anim: [b('spin', { axis: 'z', speed: -12 }), b('pulse', { amp: 0.08, speed: 0.5 })] }),
        o('flat', { type: 'circle', bevel: 0.5 }, { name: 'Beads', scale: u(0.07), color: '#e6d9ff', shadow: '#2a1a4a', array: arr({ count: 32, offset: v3(0, 1.18, 0), rot: v3(0, 0, 11.25), spin: -2, phase: 0.08 }), anim: [b('pulse', { amp: 0.6, speed: 0.5 })] }),
      ],
    }),
  },
  {
    key: 'jellyfish',
    label: 'Jellyfish',
    blurb: 'A pulsing bell trails flowing tentacles through drifting plankton.',
    config: { ...BASE, bg: '#020612', charset: ' .:-=+*#%@', lightAzimuth: -20, lightElevation: 60, ambient: 0.2, depthFade: 0.3 },
    world: () => {
      const bell = sceneOf([
        makePrim('sphere', { pos: [0, 0, 0], scale: [1, 0.8, 1], color: '#ff9ad5' }),
        makePrim('sphere', { op: 'subtract', pos: [0, -0.32, 0], scale: [0.86, 0.6, 0.86], color: '#ff9ad5' }),
        makePrim('box', { op: 'subtract', pos: [0, -0.62, 0], scale: [2, 0.8, 2], color: '#ff9ad5' }),
      ], 0.04)
      const swim = [b('bob', { amp: 0.12, speed: 1 / 6 })]
      return {
        name: 'Jellyfish',
        duration: 12,
        fit: 1.25,
        camera: { rot: [-14, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0.05], anim: [b('spin', { axis: 'y', speed: 30 })] },
        fields: [
          f('gradient', { charset: ' .·', colors: ['#010208', '#06163a', '#0f3a6a'], angle: 90, scale: 0.8 }),
          f('noise', { charset: ' .', colors: ['#020612', '#14306a'], intensity: 0.5, speed: 0.3, scale: 1.4 }),
        ],
        objects: [
          o('sculpt', { scene: bell }, { name: 'Bell', pos: v3(0, 0.5, 0), scale: u(0.85), color: '#ffb0e0', shadow: '#2a0630', emissive: 0.25, anim: [...swim, b('pulse', { amp: 0.07, speed: 0.5 })] }),
          o('curve', { type: 'helix', turns: 1.2, p: 1, tube: 0.012 }, { name: 'Tentacles', pos: v3(0, 0.5, 0), scale: v3(0.25, 1.3, 0.25), color: '#ffd6f0', shadow: '#2a0630', charset: ' .:-+*', array: arr({ count: 10, offset: v3(0.24, -0.62, 0), rot: v3(0, 36, 0), phase: 0.12 }), anim: [...swim, b('wave', { axis: 'x', amp: 0.18, freq: 4, speed: 0.5 })] }),
          o('curve', { type: 'helix', turns: 2.5, p: 1, tube: 0.03 }, { name: 'Oral arms', pos: v3(0, 0.25, 0), scale: v3(0.12, 0.9, 0.12), color: '#ff6fc0', shadow: '#2a0630', array: arr({ count: 4, offset: v3(0.05, -0.3, 0), rot: v3(0, 90, 0), phase: 0.3 }), anim: [...swim, b('wave', { axis: 'z', amp: 0.08, freq: 5, speed: 0.6 })] }),
          o('particles', { type: 'dust', count: 900, speed: 2, seed: 6 }, { name: 'Plankton', scale: v3(4, 3, 3), color: '#a6d8ff', shadow: '#0a1a3a', charset: ' .·', emissive: 1 }),
        ],
      }
    },
  },
  {
    key: 'synthwave',
    label: 'Synthwave',
    blurb: 'Striped sun, wireframe peaks and a neon grid racing to the horizon.',
    config: { ...BASE, bg: '#0b0219', charset: ' .:-=+*#%@', lightAzimuth: 0, lightElevation: 40, ambient: 0.2, depthFade: 0.2, cellSize: 6 },
    world: () => ({
      name: 'Synthwave',
      duration: 10,
      fit: 1.05,
      camera: { rot: [0, 0, 0], zoom: 1, fov: 0, pan: [0, 0], anim: [] },
      fields: [
        f('gradient', { charset: ' .·:', colors: ['#0b0219', '#3a0a5a', '#a01a7a'], angle: -90, scale: 0.9 }),
        f('stars', { colors: ['#5a2a7a', '#ffe6ff'], scale: 0.7 }),
        f('grid', { charset: ' .·+#', colors: ['#3a0a5a', '#ff3dc8', '#ffd0f4'], angle: -18, speed: 1.2, scale: 1 }),
      ],
      objects: [
        o('flat', { type: 'circle', bevel: 0 }, { name: 'Sun', pos: v3(0, 0.3, -1), scale: u(1.05), color: '#ffe36a', shadow: '#ff2d95', emissive: 1, tint: 'height', charset: '#' }),
        o('flat', { type: 'rect', bevel: 0 }, { name: 'Sun bands', pos: v3(0, 0.3, -0.9), scale: v3(1.1, 0.02, 1), color: '#0b0219', charset: ' ', array: arr({ count: 6, step: v3(0, -0.085, 0), grow: 1.18 }) }),
        o('terrain', { type: 'mountains', amp: 0.5, freq: 1.6, seed: 11 }, { name: 'Peaks', pos: v3(0, -0.3, -0.85), rot: v3(10, 0, 0), scale: v3(4.2, 0.8, 0.4), color: '#41e2ff', shadow: '#2a0a4a', tint: 'height', charset: ' .:-=+*' }),
      ],
    }),
  },
  {
    key: 'lighthouse',
    label: 'Lighthouse storm',
    blurb: 'A lighthouse sweeps twin beams over a heavy sea as the rain comes in sideways.',
    config: { ...BASE, bg: '#060a14', charset: ' .:-=+*#%@', lightAzimuth: 150, lightElevation: 30, ambient: 0.3, depthFade: 0.2, cellSize: 6 },
    world: () => ({
      name: 'Lighthouse storm',
      duration: 16,
      fit: 1.05,
      camera: { rot: [-10, 0, 0], zoom: 1, fov: 0.3, pan: [0.05, 0.1], anim: [b('sway', { axis: 'y', amp: 6, speed: 1 / 16 })] },
      fields: [
        f('gradient', { charset: ' .·:', colors: ['#060a14', '#14203a', '#31435e'], angle: 90, scale: 0.8, intensity: 0.45 }),
        f('stars', { colors: ['#2a3448', '#c9d6ea'], scale: 0.7 }),
        f('rain', { layer: 'front', charset: ' .:/|', colors: ['#0a1220', '#5a7ab0', '#cfe0f5'], random: false, intensity: 0.45, speed: 2.6, scale: 0.4, angle: 68 }),
      ],
      objects: [
        o('terrain', { type: 'ocean', amp: 0.06, freq: 5.5, speed: 1.4, seed: 6 }, { name: 'Sea', pos: v3(0.4, -0.62, -0.5), scale: v3(7, 1, 3.4), color: '#7a9cc0', shadow: '#0a1626', charset: ' .·-~≈' }),
        o('shape', { type: 'sphere' }, { name: 'Rock', pos: v3(-0.72, -0.5, 0.25), scale: v3(0.62, 0.3, 0.45), color: '#3c4450', shadow: '#0a0e16', charset: ' .:-#' }),
        o('shape', { type: 'sphere' }, { name: 'Rock 2', pos: v3(-0.32, -0.6, 0.6), scale: v3(0.3, 0.16, 0.24), color: '#333b46', shadow: '#0a0e16', charset: ' .:-#' }),
        o('shape', { type: 'cylinder' }, { name: 'Tower', pos: v3(-0.72, -0.05, 0.25), scale: v3(0.13, 0.85, 0.13), color: '#f4f0e6', shadow: '#5a6070', charset: '-=+*#%' }),
        o('shape', { type: 'cylinder' }, { name: 'Band', pos: v3(-0.72, 0.08, 0.25), scale: v3(0.14, 0.12, 0.14), color: '#c0392b', shadow: '#3a0e0a', charset: '#%@*' }),
        o('shape', { type: 'cylinder' }, { name: 'Lamp', pos: v3(-0.72, 0.44, 0.25), scale: v3(0.09, 0.1, 0.09), color: '#ffe9a8', shadow: '#a87414', emissive: 1, charset: '#%@' }),
        o('shape', { type: 'cone' }, { name: 'Roof', pos: v3(-0.72, 0.53, 0.25), scale: v3(0.12, 0.1, 0.12), color: '#8a2f28', shadow: '#2a0c08', charset: '#' }),
        o('flat', { type: 'triangle', bevel: 0 }, { name: 'Beams', pos: v3(-0.72, 0.44, 0.25), rot: v3(-90, 0, 0), scale: v3(0.36, 1.5, 1), color: '#ffe9a8', shadow: '#4a4030', emissive: 0.85, charset: ' .:-', array: arr({ count: 2, rot: v3(0, 180, 0), spin: 55 }) }),
      ],
    }),
  },
  {
    key: 'blackhole',
    label: 'Black hole',
    blurb: 'An event horizon silhouette inside a spinning accretion disk and photon ring.',
    config: { ...BASE, bg: '#010104', charset: ' .·:-=+*#%@', lightAzimuth: 0, lightElevation: 10, ambient: 0.1, depthFade: 0.35, shimmer: 0.04 },
    world: () => ({
      name: 'Black hole',
      duration: 20,
      fit: 1.5,
      camera: { rot: [-16, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0], anim: [b('sway', { axis: 'y', amp: 12, speed: 1 / 20 })] },
      fields: [f('stars', { colors: ['#2a2a3a', '#ffffff'], scale: 1.3 })],
      objects: [
        o('shape', { type: 'sphere' }, { name: 'Horizon', scale: u(0.32), color: '#04040a', shadow: '#000000', charset: ' ' }),
        o('flat', { type: 'ring', inner: 0.9, bevel: 0 }, { name: 'Photon ring', scale: u(0.36), color: '#fff2d0', shadow: '#c07a20', emissive: 1, charset: '#%@' }),
        o('flat', { type: 'ring', inner: 0.55, bevel: 0.05 }, { name: 'Disk', rot: v3(-72, 0, 0), scale: u(2.3), color: '#ffcf8a', shadow: '#7a2408', emissive: 0.75, tint: 'height', charset: ' .·:-=+*#%', anim: [b('spin', { axis: 'z', speed: 16 })] }),
        o('particles', { type: 'ring', count: 2200, speed: 1.6, seed: 5 }, { name: 'Disk spray', rot: v3(-72, 0, 0), scale: u(2.6), color: '#ffd9a0', shadow: '#4a1606', charset: ' .·*', emissive: 1 }),
        o('flat', { type: 'ring', inner: 0.76, bevel: 0 }, { name: 'Inner heat', rot: v3(-72, 0, 0), scale: u(1.15), color: '#ffffff', shadow: '#ff9a3d', emissive: 1, charset: '#%@', anim: [b('spin', { axis: 'z', speed: 30 })] }),
      ],
    }),
  },
  {
    key: 'forest',
    label: 'Firefly grove',
    blurb: 'Moonlit pines over dark moss and a hundred drifting fireflies.',
    config: { ...BASE, bg: '#02080e', charset: ' .:-=+*#%@', lightAzimuth: -30, lightElevation: 55, ambient: 0.32, depthFade: 0.2 },
    world: () => ({
      name: 'Firefly grove',
      duration: 18,
      fit: 1.35,
      camera: { rot: [-14, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0.05], anim: [b('sway', { axis: 'y', amp: 8, speed: 1 / 18 })] },
      fields: [
        f('gradient', { charset: ' .·', colors: ['#02080e', '#0a1c2e', '#1e3a50'], angle: 90, scale: 0.85, intensity: 0.45 }),
        f('stars', { colors: ['#24344a', '#dceaff'], scale: 0.9 }),
        f('noise', { charset: ' .·', colors: ['#06121c', '#14344a'], intensity: 0.3, scale: 1.6, speed: 0.25 }),
      ],
      objects: [
        o('terrain', { type: 'dunes', amp: 0.05, freq: 9, seed: 4 }, { name: 'Moss', pos: v3(0, -0.5, 0), scale: v3(5, 1, 2.4), color: '#12331f', shadow: '#020c06', charset: ' .,:' }),
        o('shape', { type: 'cone' }, { name: 'Far pines', pos: v3(-1.9, -0.28, -1.4), scale: v3(0.34, 0.9, 0.34), color: '#1c5034', shadow: '#04180c', charset: '.:;+*', array: arr({ count: 9, step: v3(0.5, 0, 0), jitter: 0.5 }) }),
        o('shape', { type: 'cone' }, { name: 'Pines', pos: v3(-2.1, -0.2, 0.2), scale: v3(0.5, 1.35, 0.5), color: '#2f8a52', shadow: '#0a2a16', charset: ':;+*#%', array: arr({ count: 8, step: v3(0.62, 0, 0), jitter: 0.6 }) }),
        o('shape', { type: 'cone' }, { name: 'Pine', pos: v3(1.5, -0.12, 0.9), scale: v3(0.62, 1.7, 0.62), color: '#3a9e60', shadow: '#0c3018', charset: ':;+*#%' }),
        o('flat', { type: 'circle', bevel: 0 }, { name: 'Moon', pos: v3(1.35, 0.75, -2.2), scale: u(0.34), color: '#eaf4ff', shadow: '#8ab0d0', emissive: 1, charset: '#%@' }),
        o('particles', { type: 'fireflies', count: 160, speed: 1, seed: 7 }, { name: 'Fireflies', pos: v3(0, 0.05, 0), scale: v3(4.4, 1.6, 1.6), color: '#e8ffa8', shadow: '#9ab84a', charset: '*+@', emissive: 1 }),
      ],
    }),
  },
  {
    key: 'village',
    label: 'Winter village',
    blurb: 'Snow-bound cabins with warm windows under pines loaded with snow.',
    config: { ...BASE, bg: '#050a18', charset: ' .:-=+*#%@', lightAzimuth: -50, lightElevation: 45, ambient: 0.18, depthFade: 0.25, cellSize: 6 },
    world: () => {
      const cabin = (x: number, y: number, z: number, s: number): WObject[] => [
        o('shape', { type: 'box' }, { name: 'Walls', pos: v3(x, y, z), scale: v3(0.42 * s, 0.26 * s, 0.34 * s), color: '#7a5a40', shadow: '#1c120a', charset: ' .:-#' }),
        o('shape', { type: 'box' }, { name: 'Roof L', pos: v3(x - 0.13 * s, y + 0.2 * s, z), rot: v3(0, 0, 42), scale: v3(0.4 * s, 0.05 * s, 0.42 * s), color: '#eef4fb', shadow: '#4a5870', charset: ' .:-' }),
        o('shape', { type: 'box' }, { name: 'Roof R', pos: v3(x + 0.13 * s, y + 0.2 * s, z), rot: v3(0, 0, -42), scale: v3(0.4 * s, 0.05 * s, 0.42 * s), color: '#e6eef8', shadow: '#44526a', charset: ' .:-' }),
        o('shape', { type: 'box' }, { name: 'Chimney', pos: v3(x + 0.13 * s, y + 0.32 * s, z), scale: v3(0.05 * s, 0.14 * s, 0.05 * s), color: '#5a4636', shadow: '#160e08', charset: ':#' }),
        o('flat', { type: 'rect', bevel: 0 }, { name: 'Window', pos: v3(x - 0.06 * s, y + 0.01 * s, z + 0.18 * s), scale: v3(0.1 * s, 0.09 * s, 1), color: '#ffcf6e', shadow: '#8a5a10', emissive: 1, charset: '#' }),
        o('flat', { type: 'rect', bevel: 0 }, { name: 'Window 2', pos: v3(x + 0.1 * s, y + 0.01 * s, z + 0.18 * s), scale: v3(0.07 * s, 0.09 * s, 1), color: '#ffcf6e', shadow: '#8a5a10', emissive: 1, charset: '#' }),
      ]
      return {
        name: 'Winter village',
        duration: 20,
        fit: 1.4,
        camera: { rot: [-16, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0.08], anim: [b('sway', { axis: 'y', amp: 7, speed: 1 / 20 })] },
        fields: [
          f('gradient', { charset: ' .·', colors: ['#050a18', '#0c1830', '#22344f'], angle: 90, scale: 0.85, intensity: 0.85 }),
          f('stars', { colors: ['#2c3c58', '#ffffff'], scale: 1 }),
        ],
        objects: [
          o('terrain', { type: 'dunes', amp: 0.035, freq: 7, seed: 8 }, { name: 'Snowfield', pos: v3(0, -0.55, 0), scale: v3(6, 1, 2.6), color: '#dce8f5', shadow: '#243248', charset: ' .·:-' }),
          ...cabin(-0.85, -0.32, 0.35, 1),
          ...cabin(0.25, -0.36, -0.5, 0.78),
          ...cabin(1.1, -0.3, 0.6, 0.62),
          o('shape', { type: 'cone' }, { name: 'Snow pines', pos: v3(-2.15, -0.18, -0.2), scale: v3(0.44, 1.2, 0.44), color: '#e8f2f8', shadow: '#1a4a34', tint: 'height', charset: ' .:;#', array: arr({ count: 7, step: v3(0.55, 0, 0), jitter: 0.55 }) }),
          o('shape', { type: 'cone' }, { name: 'Pine', pos: v3(1.9, -0.14, 0.4), scale: v3(0.5, 1.4, 0.5), color: '#dce8f4', shadow: '#16402c', tint: 'height', charset: ' .:;#' }),
          o('flat', { type: 'circle', bevel: 0 }, { name: 'Moon', pos: v3(-1.35, 0.68, -2), scale: u(0.42), color: '#f2f6ff', shadow: '#9ab4d4', emissive: 1, charset: '#%@' }),
          o('particles', { type: 'snow', count: 700, speed: 0.9, seed: 11 }, { name: 'Snowfall', pos: v3(0, 0.15, 0.3), scale: v3(4.6, 1.9, 1.6), color: '#ffffff', shadow: '#3a4a66', charset: ' ..·*' }),
        ],
      }
    },
  },
  {
    key: 'earthrise',
    label: 'Earthrise',
    blurb: 'A living blue Earth hanging over grey regolith, in a dense star field.',
    config: { ...BASE, bg: '#01020a', charset: ' .:-=+*#%@', lightAzimuth: 30, lightElevation: 40, ambient: 0.1, depthFade: 0.3 },
    world: () => ({
      name: 'Earthrise',
      duration: 24,
      fit: 1.3,
      camera: { rot: [-14, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0.1], anim: [b('sway', { axis: 'y', amp: 10, speed: 1 / 24 })] },
      fields: [f('stars', { colors: ['#2a2a3a', '#ffffff'], scale: 1.4 })],
      objects: [
        o('terrain', { type: 'dunes', amp: 0.05, freq: 6, seed: 9 }, { name: 'Regolith', pos: v3(0, -0.62, 0.3), scale: v3(6.4, 1, 2.2), color: '#b8bcc6', shadow: '#1a1c26', charset: ' .·:-=' }),
        o('shape', { type: 'sphere' }, { name: 'Earth', pos: v3(0.5, 0.6, -2.6), scale: u(0.85), color: '#5ab4f0', shadow: '#0a2c58', emissive: 0.35, charset: ' .·:-=+*#%@' }),
        o('shape', { type: 'sphere' }, { name: 'Land', pos: v3(0.5, 0.6, -2.6), scale: v3(0.5, 0.3, 0.5), color: '#3aa06a', shadow: '#0a3a20', emissive: 0.3, charset: ' .:-#', anim: [b('orbit', { radius: 0.35, speed: 6, tilt: 18, phase: 40 })] }),
        o('shape', { type: 'sphere' }, { name: 'Land 2', pos: v3(0.5, 0.6, -2.6), scale: v3(0.34, 0.22, 0.34), color: '#4ab47a', shadow: '#0a3a20', emissive: 0.3, charset: ' .:-#', anim: [b('orbit', { radius: 0.3, speed: 6, tilt: -24, phase: 210 })] }),
        o('shape', { type: 'sphere' }, { name: 'Clouds', pos: v3(0.5, 0.6, -2.6), scale: v3(0.55, 0.18, 0.55), color: '#ffffff', shadow: '#8ab0d0', emissive: 0.5, charset: ' .·', anim: [b('orbit', { radius: 0.52, speed: 4, tilt: 8, phase: 120 })] }),
      ],
    }),
  },
  {
    key: 'balloons',
    label: 'Balloon dawn',
    blurb: 'Hot air balloons in two-tone enamel drifting over golden hills at sunrise.',
    config: { ...BASE, bg: '#160a1e', charset: ' .:-=+*#%@', lightAzimuth: 170, lightElevation: 25, ambient: 0.22, depthFade: 0.25, cellSize: 6 },
    world: () => {
      const balloon = (x: number, y: number, z: number, s: number, top: string, bottom: string, phase: number): WObject[] => [
        o('shape', { type: 'sphere' }, { name: 'Envelope', pos: v3(x, y, z), scale: v3(0.5 * s, 0.56 * s, 0.5 * s), color: top, shadow: bottom, tint: 'height', charset: ' .:-=+*#%', anim: [b('bob', { amp: 0.05, speed: 1 / 9, phase }), b('sway', { axis: 'z', amp: 4, speed: 1 / 12, phase })] }),
        o('shape', { type: 'box' }, { name: 'Basket', pos: v3(x, y - 0.52 * s, z), scale: v3(0.09 * s, 0.07 * s, 0.09 * s), color: '#8a5a34', shadow: '#241206', charset: '#', anim: [b('bob', { amp: 0.05, speed: 1 / 9, phase }), b('sway', { axis: 'z', amp: 4, speed: 1 / 12, phase })] }),
      ]
      return {
        name: 'Balloon dawn',
        duration: 20,
        fit: 1.35,
        camera: { rot: [-10, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0.12], anim: [b('sway', { axis: 'y', amp: 8, speed: 1 / 20 })] },
        fields: [
          f('gradient', { charset: ' .·:-', colors: ['#160a1e', '#5a2a4e', '#e08a5a', '#ffd9a0'], angle: -90, scale: 0.9, intensity: 1 }),
          f('stars', { colors: ['#4a2c5a', '#ffe6d0'], scale: 0.6 }),
        ],
        objects: [
          o('terrain', { type: 'hills', amp: 0.16, freq: 2.4, seed: 5 }, { name: 'Hills', pos: v3(0, -0.62, -0.6), scale: v3(7, 1, 3), color: '#c99a6a', shadow: '#3a1c30', tint: 'height', charset: ' .·:-=' }),
          o('flat', { type: 'circle', bevel: 0 }, { name: 'Sun', pos: v3(0.75, 0.24, -2.6), scale: u(0.6), color: '#fff0c4', shadow: '#ff6a3d', emissive: 1, charset: '#%@', anim: [b('bob', { amp: 0.04, speed: 1 / 20 })] }),
          ...balloon(-0.85, 0.3, -0.4, 1, '#e85a4f', '#5a1408', 0),
          ...balloon(0.15, 0.5, -1.1, 0.8, '#3ec6b8', '#0a3a34', 0.3),
          ...balloon(0.95, 0.15, 0.2, 1.1, '#c99aff', '#3a1466', 0.6),
          ...balloon(-0.1, -0.05, 0.6, 0.65, '#ffcf6e', '#6a3a0a', 0.15),
          o('flat', { type: 'circle', bevel: 0.4 }, { name: 'Clouds', pos: v3(-1.7, 0.8, -1.8), scale: v3(0.9, 0.15, 1), color: '#ffb8a0', shadow: '#4a1e3a', charset: ' .:-=', array: arr({ count: 3, step: v3(1.5, -0.08, 0), grow: 0.8 }), anim: [b('drift', { vel: v3(0.04, 0, 0), wrap: 3 })] }),
        ],
      }
    },
  },
  {
    key: 'matrix',
    label: 'Glyph rain',
    blurb: 'A wall of falling glyphs and one blinking prompt. Flat, green, endless.',
    config: { ...BASE, bg: '#020806', charset: ' .:-=+*#%@', lightAzimuth: 0, lightElevation: 60, ambient: 0.3, depthFade: 0, cellSize: 6 },
    world: () => ({
      name: 'Glyph rain',
      duration: 10,
      fit: 1.2,
      camera: { rot: [0, 0, 0], zoom: 1, fov: 0, pan: [0, 0], anim: [] },
      fields: [f('rain', { charset: ' ｱｲｳｴｵｶｷｸｹｺｻｼｽ01<>/#$%', colors: ['#03180c', '#1e8a4a', '#7dff9a', '#d8ffe6'], intensity: 1.1, speed: 1.6, scale: 0.5 })],
      objects: [
        o('text', { text: 'WAKE UP', fontKey: 'jetbrains', weight: 800, depth: 0.12 }, { name: 'Prompt', pos: v3(0, 0.08, 0), scale: v3(0.95, 0.34, 1), color: '#b8ffcf', shadow: '#0a3a1c', emissive: 1, charset: '#%@' }),
        o('text', { text: '_', fontKey: 'jetbrains', weight: 800, depth: 0 }, { name: 'Cursor', pos: v3(0.72, -0.09, 0.1), scale: v3(0.16, 0.26, 1), color: '#7dff9a', emissive: 1, charset: '#', anim: [b('keys', { loop: 1.2, ease: 'linear', keys: [{ t: 0, scale: 1 }, { t: 0.55, scale: 1 }, { t: 0.56, scale: 0.05 }, { t: 1.19, scale: 0.05 }] })] }),
      ],
    }),
  },
  {
    key: 'volcano',
    label: 'Volcano',
    blurb: 'A cone of black rock spitting embers into a smoke-red night.',
    config: { ...BASE, bg: '#0c0404', charset: ' .:-=+*#%@', lightAzimuth: 20, lightElevation: 35, ambient: 0.28, depthFade: 0.25 },
    world: () => ({
      name: 'Volcano',
      duration: 14,
      fit: 1.2,
      camera: { rot: [-12, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0.05], anim: [b('sway', { axis: 'y', amp: 10, speed: 1 / 14 })] },
      fields: [
        f('gradient', { charset: ' .·:', colors: ['#0c0404', '#3a0e08', '#7a2410'], angle: -90, scale: 0.9, intensity: 0.6 }),
        f('fire', { charset: ' .:*#', colors: ['#1a0604', '#ff5a1e', '#ffd27a'], intensity: 0.3, scale: 0.6, speed: 1.2 }),
      ],
      objects: [
        o('shape', { type: 'cone' }, { name: 'Cone', pos: v3(0, -0.3, 0), scale: v3(1.1, 0.8, 1.1), color: '#9a7a6a', shadow: '#2a1410', charset: ':-=+*#%' }),
        o('flat', { type: 'circle', bevel: 0 }, { name: 'Crater', pos: v3(0, 0.1, 0), rot: v3(-90, 0, 0), scale: u(0.18), color: '#ffb04a', shadow: '#ff3a10', emissive: 1, charset: '#%@', anim: [b('pulse', { amp: 0.15, speed: 1.4 })] }),
        o('particles', { type: 'embers', count: 900, speed: 1.4, seed: 3 }, { name: 'Embers', pos: v3(0, 0.55, 0), scale: v3(0.9, 1.1, 0.9), color: '#ffcf6e', shadow: '#c8341a', emissive: 1, charset: '.·*+' }),
        o('terrain', { type: 'hills', amp: 0.08, freq: 3, seed: 2 }, { name: 'Plain', pos: v3(0, -0.7, 0), scale: v3(6, 1, 3), color: '#3a2a26', shadow: '#080404', charset: ' .:-' }),
      ],
    }),
  },
  {
    key: 'saturn',
    label: 'Ringed giant',
    blurb: 'A banded gas giant with tilted rings and two little moons on patrol.',
    config: { ...BASE, bg: '#03030a', charset: ' .·:-=+*#%@', lightAzimuth: -55, lightElevation: 20, ambient: 0.12, depthFade: 0.2 },
    world: () => ({
      name: 'Ringed giant',
      duration: 24,
      fit: 1.4,
      camera: { rot: [-18, 0, 0], zoom: 1, fov: 0.25, pan: [0, 0], anim: [b('sway', { axis: 'y', amp: 14, speed: 1 / 24 })] },
      fields: [f('stars', { colors: ['#22223a', '#ffffff'], scale: 1.2 })],
      objects: [
        o('shape', { type: 'sphere' }, { name: 'Planet', scale: u(1), color: '#f0d29a', shadow: '#3a2410', tint: 'height', charset: ' .:-=+*#%', anim: [b('spin', { axis: 'y', speed: 12 })] }),
        o('flat', { type: 'ring', inner: 0.62, bevel: 0 }, { name: 'Rings', rot: v3(-90, 0, 0), scale: u(2.2), color: '#e8c890', shadow: '#5a4020', charset: ' .·:-=' }),
        o('shape', { type: 'sphere' }, { name: 'Moon', scale: u(0.08), color: '#d0d4e0', shadow: '#202430', charset: '#%@', anim: [b('orbit', { radius: 1.25, speed: 30, tilt: 14, phase: 0 })] }),
        o('shape', { type: 'sphere' }, { name: 'Moon 2', scale: u(0.05), color: '#c8a0ff', shadow: '#2a1a40', charset: '#%', anim: [b('orbit', { radius: 1.6, speed: -20, tilt: -10, phase: 140 })] }),
      ],
    }),
  },
  {
    key: 'atom',
    label: 'Atom',
    blurb: 'Three electron orbits wrapped round a pulsing nucleus — textbook, but alive.',
    config: { ...BASE, bg: '#020a12', charset: ' .:-=+*#%@', lightAzimuth: 30, lightElevation: 40, ambient: 0.3, depthFade: 0.3 },
    world: () => ({
      name: 'Atom',
      duration: 12,
      fit: 1.2,
      camera: { rot: [-20, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0], anim: [b('spin', { axis: 'y', speed: 30 })] },
      fields: [f('grid', { charset: ' .', colors: ['#020a12', '#0e2a3a'], intensity: 0.4, scale: 1 })],
      objects: [
        o('shape', { type: 'sphere' }, { name: 'Nucleus', scale: u(0.4), color: '#ff7a5a', shadow: '#5a1408', charset: '.:-=+*#%@', anim: [b('pulse', { amp: 0.08, speed: 1 })] }),
        ...[0, 60, 120].map((r, i) => o('flat', { type: 'ring', inner: 0.96, bevel: 0 }, { name: `Orbit ${i + 1}`, rot: v3(70, r, 0), scale: u(1.8), color: '#5ad8ff', shadow: '#0a3a5a', emissive: 0.6, charset: '.·:' })),
        ...[0, 60, 120].map((r, i) =>
          o('shape', { type: 'sphere' }, { name: `Electron ${i + 1}`, scale: u(0.06), color: '#e8fbff', shadow: '#5ad8ff', emissive: 1, charset: '#@', anim: [b('orbit', { radius: 0.9, speed: 140 + i * 30, tilt: 70 - i * 10, phase: r })] }),
        ),
      ],
    }),
  },
  {
    key: 'lavalamp',
    label: 'Lava lamp',
    blurb: 'Warm wax blobs merging and splitting in a glow. Very 1972.',
    config: { ...BASE, bg: '#12040e', charset: ' .:-=+*#%@', ambient: 0.3, depthFade: 0, cellSize: 6 },
    world: () => ({
      name: 'Lava lamp',
      duration: 16,
      fit: 1.1,
      camera: { rot: [0, 0, 0], zoom: 1, fov: 0, pan: [0, 0], anim: [] },
      fields: [f('metaballs', { charset: ' .:-=+*#%@', colors: ['#12040e', '#ff3a6a', '#ffb04a', '#fff0b0'], intensity: 1.1, scale: 0.6, speed: 0.5 })],
      objects: [
        o('flat', { type: 'rect', bevel: 0 }, { name: 'Base', pos: v3(0, -1.02, 0), scale: v3(3, 0.08, 1), color: '#c0c8d4', shadow: '#202430', charset: '=#' }),
      ],
    }),
  },
  {
    key: 'desert',
    label: 'Desert night',
    blurb: 'Rolling dunes under a crescent moon, with a lone cactus keeping watch.',
    config: { ...BASE, bg: '#060714', charset: ' .:-=+*#%@', lightAzimuth: -70, lightElevation: 25, ambient: 0.25, depthFade: 0.3 },
    world: () => ({
      name: 'Desert night',
      duration: 20,
      fit: 1.3,
      camera: { rot: [-8, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0.1], anim: [b('sway', { axis: 'y', amp: 8, speed: 1 / 20 })] },
      fields: [
        f('gradient', { charset: ' .·', colors: ['#060714', '#141a3a', '#2a2a5a'], angle: 90, scale: 0.9, intensity: 0.5 }),
        f('stars', { colors: ['#2a2a4a', '#fff4e0'], scale: 1.1 }),
      ],
      objects: [
        o('terrain', { type: 'dunes', amp: 0.18, freq: 2.2, speed: 0.15, seed: 8 }, { name: 'Dunes', pos: v3(0, -0.55, -0.4), scale: v3(7, 1, 3.4), color: '#e0b07a', shadow: '#2a1a24', tint: 'height', charset: ' .·:-=+' }),
        o('flat', { type: 'moon', bevel: 0 }, { name: 'Moon', pos: v3(-0.8, 0.62, -2.4), scale: u(0.32), color: '#fff4d0', shadow: '#c0a060', emissive: 1, charset: '#%@' }),
        o('shape', { type: 'cylinder' }, { name: 'Cactus', pos: v3(0.7, -0.18, 0.4), scale: v3(0.06, 0.4, 0.06), color: '#4aa06a', shadow: '#0a2a14', charset: ':;+#' }),
        o('shape', { type: 'cylinder' }, { name: 'Arm', pos: v3(0.79, -0.06, 0.4), scale: v3(0.04, 0.16, 0.04), color: '#4aa06a', shadow: '#0a2a14', charset: ':;+#' }),
        o('shape', { type: 'cylinder' }, { name: 'Arm 2', pos: v3(0.62, -0.12, 0.4), scale: v3(0.04, 0.12, 0.04), color: '#4aa06a', shadow: '#0a2a14', charset: ':;+#' }),
      ],
    }),
  },
  {
    key: 'summit',
    label: 'Snow summit',
    blurb: 'Jagged alpine peaks lost in a slow, heavy snowfall.',
    config: { ...BASE, bg: '#0a1018', charset: ' .:-=+*#%@', lightAzimuth: 60, lightElevation: 35, ambient: 0.25, depthFade: 0.4 },
    world: () => ({
      name: 'Snow summit',
      duration: 20,
      fit: 1.3,
      camera: { rot: [-10, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0.05], anim: [b('sway', { axis: 'y', amp: 10, speed: 1 / 20 })] },
      fields: [f('gradient', { charset: ' .·', colors: ['#0a1018', '#1e2c40', '#4a5a74'], angle: 90, scale: 0.9, intensity: 0.5 })],
      objects: [
        o('terrain', { type: 'mountains', amp: 0.55, freq: 2.4, seed: 11 }, { name: 'Peaks', pos: v3(0, -0.55, -0.6), scale: v3(5, 1, 2.6), color: '#ffffff', shadow: '#1a2a40', tint: 'height', charset: ' .:-=+*#%' }),
        o('particles', { type: 'snow', count: 900, speed: 0.8, seed: 4 }, { name: 'Snow', scale: v3(3.2, 2, 1.6), color: '#ffffff', shadow: '#8aa0c0', emissive: 0.8, charset: '.·*' }),
      ],
    }),
  },
  {
    key: 'knot',
    label: 'Torus knot',
    blurb: 'A neon (3, 5) torus knot tumbling slowly in a dark vortex.',
    config: { ...BASE, bg: '#06020e', charset: ' .:-=+*#%@', lightAzimuth: 40, lightElevation: 40, ambient: 0.3, depthFade: 0.45 },
    world: () => ({
      name: 'Torus knot',
      duration: 12,
      fit: 1.1,
      camera: { rot: [-15, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0], anim: [] },
      fields: [f('vortex', { charset: ' .·', colors: ['#06020e', '#1e0a3a'], intensity: 0.22, scale: 1, speed: 0.3 })],
      objects: [
        o('curve', { type: 'knot', p: 3, q: 5, tube: 0.09 }, { name: 'Knot', scale: u(1.3), color: '#ff5ad8', shadow: '#2a0a5a', tint: 'height', charset: '.:-=+*#%@', anim: [b('spin', { axis: 'y', speed: 30 }), b('spin', { axis: 'x', speed: 12 })] }),
      ],
    }),
  },
  {
    key: 'heartbeat',
    label: 'Heartbeat',
    blurb: 'A beating enamel heart in a slow drift of petals.',
    config: { ...BASE, bg: '#14040a', charset: ' .:-=+*#%@', lightAzimuth: -30, lightElevation: 40, ambient: 0.3, depthFade: 0.2 },
    world: () => ({
      name: 'Heartbeat',
      duration: 8,
      fit: 1.1,
      camera: { rot: [0, 0, 0], zoom: 1, fov: 0.3, pan: [0, 0], anim: [b('sway', { axis: 'y', amp: 18, speed: 1 / 8 })] },
      fields: [f('ripples', { charset: ' .·:', colors: ['#14040a', '#4a0a20'], intensity: 0.2, scale: 1, speed: 0.6 })],
      objects: [
        o('flat', { type: 'heart', bevel: 0.25, depth: 0.25 }, { name: 'Heart', scale: u(1.1), color: '#ff4a6a', shadow: '#4a0410', charset: '.:-=+*#%@', anim: [b('pulse', { amp: 0.08, speed: 1.2 })] }),
        o('flat', { type: 'petal', bevel: 0.1 }, { name: 'Petals', pos: v3(-1.6, 1.1, -0.4), scale: u(0.1), color: '#ffb0c4', shadow: '#6a1a2a', charset: '.:*#', array: arr({ count: 8, step: v3(0.42, -0.08, 0.1), rot: v3(0, 40, 25), phase: 0.7 }), anim: [b('drift', { vel: v3(0.08, -0.12, 0), wrap: 2.4 }), b('spin', { axis: 'z', speed: 60 })] }),
      ],
    }),
  },
]

export function getWorldPreset(key: string): WorldPreset | undefined {
  return WORLD_PRESETS.find((p) => p.key === key)
}
