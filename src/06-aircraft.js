// AERODROME :: src/06-aircraft.js :: v1.4.0
// Aircraft parameter blocks. Data only. The integrator never reads a name
// from this file, only capability flags and numbers.
// Depends on 00-core.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math;
  var rad = M.rad;

  var AC = AERO.aircraft = {};

  // -------------------------------------------------------- mesh primitives
  // Body axes: x nose, y up, z toward the pilot's left. Faces are wound so the
  // outward normal comes out of the first three vertices.
  var mk = AC.mk = {};

  mk.box = function (cx, cy, cz, hx, hy, hz, mat) {
    var x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    return [
      { mat: mat, v: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]] },
      { mat: mat, v: [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]] },
      { mat: mat, v: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
      { mat: mat, v: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
      { mat: mat, v: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
      { mat: mat, v: [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]] }
    ];
  };

  mk.quad = function (a, b, c, d, mat) {
    return [{ mat: mat, v: [a, b, c, d], twoSided: true }];
  };

  mk.tri = function (a, b, c, mat) {
    return [{ mat: mat, v: [a, b, c], twoSided: true }];
  };

  // A tapered wing panel mirrored about the body x axis.
  mk.wingPair = function (rootX, rootY, tipX, tipY, span, rootChord, tipChord, mat) {
    var f = [];
    [1, -1].forEach(function (s) {
      f.push({
        mat: mat, twoSided: true, v: [
          [rootX, rootY, 0],
          [rootX - rootChord, rootY, 0],
          [tipX - tipChord, tipY, span * s],
          [tipX, tipY, span * s]
        ]
      });
    });
    return f;
  };

  mk.fin = function (x0, x1, yBase, yTip, sweep, mat) {
    return [{
      mat: mat, twoSided: true, v: [
        [x0, yBase, 0], [x1, yBase, 0], [x1 - sweep * 0.2, yTip, 0], [x0 + sweep, yTip, 0]
      ]
    }];
  };

  // Stacked rings, used for envelopes and saucer hulls.
  mk.lathe = function (profile, segments, mat, yOffset) {
    var faces = [], i, j;
    yOffset = yOffset || 0;
    for (i = 0; i < profile.length - 1; i++) {
      var a = profile[i], b = profile[i + 1];
      for (j = 0; j < segments; j++) {
        var t0 = j / segments * Math.PI * 2, t1 = (j + 1) / segments * Math.PI * 2;
        faces.push({
          mat: mat, v: [
            [a[1] * Math.cos(t0), a[0] + yOffset, a[1] * Math.sin(t0)],
            [b[1] * Math.cos(t0), b[0] + yOffset, b[1] * Math.sin(t0)],
            [b[1] * Math.cos(t1), b[0] + yOffset, b[1] * Math.sin(t1)],
            [a[1] * Math.cos(t1), a[0] + yOffset, a[1] * Math.sin(t1)]
          ]
        });
      }
    }
    return faces;
  };

  function mesh() {
    var f = [];
    for (var i = 0; i < arguments.length; i++) { f = f.concat(arguments[i]); }
    return { faces: f };
  }

  // ------------------------------------------------------------ panel decks
  // Screen space is the 320 x 224 framebuffer. Gauges are drawn in engine by
  // 10-instruments.js, this is only the layout.
  var PANEL = {};

  PANEL.sixpack = function (opts) {
    opts = opts || {};
    return {
      cutTop: 150,
      shape: [[0, 224], [0, 150], [46, 142], [120, 138], [200, 138], [274, 142], [320, 150], [320, 224]],
      gauges: [
        { k: 'asi', x: 40, y: 178, r: 22 },
        { k: 'attitude', x: 92, y: 178, r: 22 },
        { k: 'alt', x: 144, y: 178, r: 22 },
        { k: 'vsi', x: 196, y: 178, r: 22 },
        { k: 'heading', x: 248, y: 178, r: 22 },
        { k: opts.power || 'rpm', x: 296, y: 178, r: 20 }
      ],
      strips: [{ k: 'fuel', x: 8, y: 150, w: 60 }, { k: 'flags', x: 200, y: 150, w: 110 }]
    };
  };

  PANEL.jet = function () {
    return {
      cutTop: 156,
      shape: [[0, 224], [0, 156], [60, 148], [160, 144], [260, 148], [320, 156], [320, 224]],
      gauges: [
        { k: 'attitude', x: 160, y: 184, r: 30 },
        { k: 'rpm', x: 276, y: 182, r: 22 }
      ],
      tapes: [{ k: 'asi', x: 26, y: 158, h: 60 }, { k: 'alt', x: 286, y: 158, h: 60 }],
      strips: [{ k: 'fuel', x: 60, y: 210, w: 80 }, { k: 'flags', x: 170, y: 210, w: 130 }]
    };
  };

  PANEL.balloon = function () {
    return {
      cutTop: 168,
      shape: [[0, 224], [0, 172], [40, 168], [280, 168], [320, 172], [320, 224]],
      gauges: [
        { k: 'vsi', x: 80, y: 196, r: 24 },
        { k: 'alt', x: 160, y: 196, r: 24 },
        { k: 'burner', x: 240, y: 196, r: 24 }
      ],
      strips: [{ k: 'flags', x: 110, y: 170, w: 110 }]
    };
  };

  PANEL.saucer = function () {
    return {
      cutTop: 176,
      illegible: true,
      shape: [[0, 224], [0, 190], [70, 176], [250, 176], [320, 190], [320, 224]],
      gauges: [
        { k: 'glyph', x: 96, y: 200, r: 18 },
        { k: 'glyph', x: 160, y: 200, r: 18 },
        { k: 'glyph', x: 224, y: 200, r: 18 }
      ],
      strips: []
    };
  };

  PANEL.open = function (gauges) {
    return {
      cutTop: 206,
      shape: [[0, 224], [0, 210], [320, 210], [320, 224]],
      gauges: gauges || [{ k: 'asi', x: 40, y: 216, r: 8 }],
      strips: [{ k: 'flags', x: 120, y: 212, w: 120 }]
    };
  };

  PANEL.rotorcraft = function () {
    return {
      cutTop: 152,
      shape: [[0, 224], [0, 152], [80, 144], [240, 144], [320, 152], [320, 224]],
      gauges: [
        { k: 'asi', x: 44, y: 180, r: 22 },
        { k: 'attitude', x: 100, y: 180, r: 22 },
        { k: 'alt', x: 156, y: 180, r: 22 },
        { k: 'vsi', x: 212, y: 180, r: 22 },
        { k: 'rotor', x: 272, y: 180, r: 24 }
      ],
      strips: [{ k: 'fuel', x: 8, y: 152, w: 60 }, { k: 'flags', x: 190, y: 152, w: 120 }]
    };
  };

  // ------------------------------------------------------------------ stock
  var stock = {};

  stock.trainer = {
    id: 'trainer',
    name: 'CADET 150',
    kind: 'High wing trainer',
    blurb: 'Forgiving, honest, hard to hurt. Start here.',
    massKg: 1080,
    inertia: { x: 1300, y: 2600, z: 1900 },
    fuelKg: 90,
    crashVsMps: 7,
    hullClearM: 1.1,
    wing: {
      areaM2: 16.2, spanM: 11, chordM: 1.5, clAlpha: 5.0, cl0: 0.18, stallAlpha: rad(16),
      cd0: 0.032, k: 0.045, cm0: 0.020, cmAlpha: 0.24, refQ: 420,
      flapCl: 0.55, flapCd: 0.035, gearCd: 0.006, spoilerCd: 0.0,
      cyBeta: 0.55, cnBeta: 0.9, clBeta: 0.35, cdStall: 0.5, cdBeta: 0.4
    },
    propulsion: {
      maxThrustN: 2500, vRef: 92, vExp: 2, minFade: 0.1, idleRPM: 700, maxRPM: 2500,
      burnKgPerSec: 0.0035, torqueRoll: -120, pFactor: 60, rhoExp: 0.7, slipQ: 300
    },
    limits: { qMax: 4200, gearN: 63000 },
    control: { pitch: 1250, roll: 1500, yaw: 780, maxAuthMul: 2.4, damp: { x: 900, y: 1500, z: 1500 } },
    contacts: [
      { p: [0.4, -1.1, 1.3], gear: true, brake: true },
      { p: [0.4, -1.1, -1.3], gear: true, brake: true },
      { p: [-3.4, -0.9, 0], gear: true, brake: true, sideMu: 0.9, steer: true }
    ],
    eye: [1.0, 0.55, 0],
    chase: { dist: 16, up: 4.0, lag: 3.2, lead: 0.9 },
    audio: { patch: 'piston', hzPerRPM: 0.055, base: 22, level: 0.55,
      layer: { patch: 'hum', mul: 2.02, level: 0.22 } },
    entry: { alt: 300, speed: 55, throttle: 0.62, pitch: rad(2), trim: 'aero' },
    mesh: mesh(
      mk.box(-1.2, 0, 0, 2.6, 0.62, 0.55, 'hull'),
      mk.box(-4.4, 0.15, 0, 1.6, 0.35, 0.28, 'hull'),
      mk.wingPair(0.4, 0.75, 0.2, 0.95, 5.5, 1.6, 1.2, 'accent'),
      mk.fin(-5.6, -4.6, 0.4, 2.0, 0.7, 'accent'),
      mk.wingPair(-4.8, 0.3, -4.9, 0.35, 1.9, 1.0, 0.8, 'accent'),
      mk.box(1.5, 0.1, 0, 0.16, 0.1, 0.1, 'dark'),
      mk.quad([1.36, 1.4, 0], [1.36, -1.4, 0], [1.32, -1.4, 0], [1.32, 1.4, 0], 'dark'),
      mk.box(0.2, 0.55, 0, 1.0, 0.42, 0.5, 'glass'),
      mk.box(0.4, -1.05, 1.3, 0.22, 0.22, 0.12, 'dark'),
      mk.box(0.4, -1.05, -1.3, 0.22, 0.22, 0.12, 'dark')
    )
  };

  stock.warbird = {
    id: 'warbird',
    limits: { qMax: 17000, gearN: 210000 },
    name: 'STANCHION P-4',
    kind: 'Warbird',
    blurb: 'Torque roll on the runway, heavy in the turn, loud everywhere.',
    massKg: 4100,
    inertia: { x: 9000, y: 16000, z: 12000 },
    fuelKg: 420,
    crashVsMps: 8,
    hullClearM: 1.3,
    wing: {
      areaM2: 21.8, spanM: 11.3, chordM: 2.0, clAlpha: 5.2, cl0: 0.12, stallAlpha: rad(15),
      cd0: 0.026, k: 0.042, cm0: 0.016, cmAlpha: 0.26, refQ: 900,
      flapCl: 0.5, flapCd: 0.045, gearCd: 0.008,
      cyBeta: 0.6, cnBeta: 1.0, clBeta: 0.4, cdStall: 0.6, cdBeta: 0.45
    },
    propulsion: {
      maxThrustN: 13500, vRef: 175, vExp: 2, minFade: 0.12, idleRPM: 800, maxRPM: 3000,
      burnKgPerSec: 0.11, torqueRoll: -2600, pFactor: 900, rhoExp: 0.6
    },
    control: { pitch: 7200, roll: 9000, yaw: 4200, maxAuthMul: 2.2, damp: { x: 4200, y: 9000, z: 8000 } },
    contacts: [
      { p: [0.9, -1.5, 1.5], gear: true, brake: true },
      { p: [0.9, -1.5, -1.5], gear: true, brake: true },
      { p: [-5.2, -0.8, 0], gear: true, brake: true, sideMu: 1.1, steer: true }
    ],
    eye: [0.2, 1.0, 0],
    chase: { dist: 22, up: 5.0, lag: 2.6, lead: 1.2 },
    audio: { patch: 'piston', hzPerRPM: 0.038, base: 26, level: 0.75,
      layer: { patch: 'hum', mul: 1.51, level: 0.3 } },
    entry: { alt: 600, speed: 105, throttle: 0.7, pitch: rad(1.5), trim: 'aero' },
    mesh: mesh(
      mk.box(-1.6, 0, 0, 3.4, 0.72, 0.62, 'hull'),
      mk.box(2.0, -0.05, 0, 0.6, 0.5, 0.45, 'hull'),
      mk.wingPair(-0.6, -0.2, -1.4, 0.1, 5.6, 2.6, 1.4, 'hull'),
      mk.fin(-6.6, -5.0, 0.5, 2.4, 1.1, 'accent'),
      mk.wingPair(-5.6, 0.1, -5.8, 0.2, 2.2, 1.3, 0.9, 'hull'),
      mk.box(2.65, -0.05, 0, 0.12, 0.34, 0.34, 'dark'),
      mk.quad([2.6, 2.0, 0], [2.6, -2.0, 0], [2.54, -2.0, 0], [2.54, 2.0, 0], 'dark'),
      mk.box(0.0, 0.75, 0, 1.3, 0.36, 0.44, 'glass'),
      mk.wingPair(-0.6, -0.25, -1.0, -0.3, 1.3, 1.2, 1.0, 'red')
    )
  };

  stock.jet = {
    id: 'jet',
    limits: { qMax: 58000, gearN: 480000 },
    name: 'PICKET F-9',
    kind: 'Jet interceptor',
    blurb: 'Fast, high wing loading, no manners at all below 120.',
    massKg: 8800,
    inertia: { x: 14000, y: 62000, z: 52000 },
    fuelKg: 1800,
    crashVsMps: 9,
    hullClearM: 1.4,
    wing: {
      areaM2: 27, spanM: 9.4, chordM: 3.4, clAlpha: 3.9, cl0: 0.04, stallAlpha: rad(13),
      cd0: 0.022, k: 0.10, cm0: 0.010, cmAlpha: 0.22, refQ: 2600,
      flapCl: 0.45, flapCd: 0.06, gearCd: 0.012,
      cyBeta: 0.7, cnBeta: 1.1, clBeta: 0.28, cdStall: 0.7, cdBeta: 0.5
    },
    propulsion: {
      maxThrustN: 62000, vRef: 480, vExp: 2, minFade: 0.35, idleRPM: 2400, maxRPM: 12000,
      burnKgPerSec: 0.62, rhoExp: 0.9
    },
    control: { pitch: 46000, roll: 52000, yaw: 22000, maxAuthMul: 2.0, damp: { x: 9000, y: 42000, z: 40000 } },
    contacts: [
      { p: [1.6, -1.7, 1.1], gear: true, brake: true },
      { p: [1.6, -1.7, -1.1], gear: true, brake: true },
      { p: [-3.6, -1.7, 0], gear: true, brake: true, sideMu: 1.0, steer: true }
    ],
    eye: [2.6, 0.85, 0],
    chase: { dist: 30, up: 6.0, lag: 2.2, lead: 1.6 },
    audio: { patch: 'turbine', hzPerRPM: 0.028, base: 60, level: 0.7,
      layer: { patch: 'blip', mul: 8.4, level: 0.14 } },
    entry: { alt: 1500, speed: 180, throttle: 0.72, pitch: rad(1.2), trim: 'aero' },
    mesh: mesh(
      mk.box(-1.0, 0, 0, 5.4, 0.8, 0.8, 'hull'),
      mk.box(5.0, 0.05, 0, 1.4, 0.42, 0.42, 'hull'),
      mk.wingPair(-1.4, -0.2, -4.6, 0.0, 4.7, 4.4, 1.4, 'hull'),
      mk.fin(-6.0, -3.8, 0.6, 2.9, 1.6, 'hull'),
      mk.wingPair(-5.4, 0.0, -6.0, 0.1, 1.9, 1.6, 0.8, 'hull'),
      mk.box(2.2, 0.72, 0, 1.5, 0.34, 0.52, 'glass'),
      mk.box(-6.3, 0.0, 0, 0.3, 0.5, 0.5, 'dark'),
      mk.wingPair(-1.4, -0.75, -2.6, -0.75, 1.5, 2.4, 2.0, 'dark')
    )
  };

  stock.sailplane = {
    id: 'sailplane',
    towable: { restLen: 48, k: 1200, c: 800, maxN: 12000, releaseAltM: 700 },
    limits: { qMax: 5200, gearN: 26000 },
    name: 'LONG MEADOW',
    kind: 'Sailplane',
    blurb: 'No engine. Ridge on the upwind slope, thermals over the town.',
    massKg: 380,
    inertia: { x: 1900, y: 2400, z: 900 },
    fuelKg: 0,
    crashVsMps: 5,
    hullClearM: 0.9,
    wing: {
      areaM2: 12.4, spanM: 15.6, chordM: 0.82, clAlpha: 5.6, cl0: 0.22, stallAlpha: rad(14),
      cd0: 0.0115, k: 0.017, cm0: 0.022, cmAlpha: 0.28, refQ: 320,
      spoilerCd: 0.09, gearCd: 0.004,
      cyBeta: 0.5, cnBeta: 0.85, clBeta: 0.5, cdStall: 0.45, cdBeta: 0.35
    },
    control: { pitch: 620, roll: 900, yaw: 380, maxAuthMul: 2.6, damp: { x: 420, y: 900, z: 700 } },
    contacts: [
      { p: [0.2, -0.62, 0], gear: true, brake: true, sideMu: 0.9 },
      { p: [-4.6, -0.42, 0], gear: true, brake: true, sideMu: 0.9 },
      { p: [0.0, -0.35, 7.6], skid: 0.4 },
      { p: [0.0, -0.35, -7.6], skid: 0.4 }
    ],
    eye: [1.1, 0.42, 0],
    chase: { dist: 20, up: 4.2, lag: 3.6, lead: 0.7 },
    audio: { patch: 'hum', hzPerRPM: 0, base: 0, level: 0 },
    entry: { alt: 800, speed: 26, throttle: 0, pitch: rad(-2.6), trim: 'glide' },
    mesh: mesh(
      mk.box(-1.4, 0, 0, 3.0, 0.34, 0.3, 'hull'),
      mk.box(1.2, 0.02, 0, 0.7, 0.28, 0.26, 'hull'),
      mk.wingPair(0.3, 0.34, 0.1, 0.9, 7.8, 0.95, 0.5, 'white'),
      mk.fin(-5.4, -4.2, 0.2, 1.5, 0.7, 'accent'),
      mk.wingPair(-5.0, 1.4, -5.1, 1.42, 1.6, 0.7, 0.5, 'accent'),
      mk.box(0.9, 0.32, 0, 1.0, 0.26, 0.28, 'glass')
    )
  };

  stock.balloon = {
    id: 'balloon',
    name: 'SLOW ARGUMENT',
    kind: 'Hot air balloon',
    blurb: 'Burner and vent. Everything else is the wind having an opinion.',
    massKg: 470,
    inertia: { x: 22000, y: 22000, z: 22000 },
    crashVsMps: 6,
    hullClearM: 2.0,
    buoyancy: {
      volumeM3: 2500, ambientK: 288, trimK: 345, burnerKPerSec: 26, ventKPerSec: 30,
      coolPerSec: 0.055, maxDeltaK: 135, dragArea: 96, cd: 0.55
    },
    control: { pitch: 0, roll: 0, yaw: 220, maxAuthMul: 1, damp: { x: 26000, y: 30000, z: 26000 } },
    contacts: [
      { p: [1.1, -2.6, 1.1], k: 26000, c: 9000, sideMu: 1.6 },
      { p: [1.1, -2.6, -1.1], k: 26000, c: 9000, sideMu: 1.6 },
      { p: [-1.1, -2.6, 1.1], k: 26000, c: 9000, sideMu: 1.6 },
      { p: [-1.1, -2.6, -1.1], k: 26000, c: 9000, sideMu: 1.6 }
    ],
    eye: [0.0, -1.4, 0],
    chase: { dist: 26, up: 6, lag: 4.5, lead: 0.2 },
    audio: { patch: 'hum', hzPerRPM: 0, base: 0, level: 0 },
    entry: { alt: 400, speed: 0, throttle: 0, pitch: 0, trim: 'buoyant' },
    mesh: mesh(
      mk.lathe([[2.2, 0.6], [4.0, 4.2], [7.0, 6.4], [10.0, 6.0], [12.4, 3.2], [13.4, 0.4]], 10, 'accent'),
      mk.box(0, -2.1, 0, 1.1, 0.9, 1.1, 'hull'),
      mk.quad([0.9, -1.2, 0.9], [0.9, 2.0, 0.9], [0.85, 2.0, 0.85], [0.85, -1.2, 0.85], 'dark'),
      mk.quad([-0.9, -1.2, 0.9], [-0.9, 2.0, 0.9], [-0.85, 2.0, 0.85], [-0.85, -1.2, 0.85], 'dark'),
      mk.quad([0.9, -1.2, -0.9], [0.9, 2.0, -0.9], [0.85, 2.0, -0.85], [0.85, -1.2, -0.85], 'dark'),
      mk.quad([-0.9, -1.2, -0.9], [-0.9, 2.0, -0.9], [-0.85, 2.0, -0.85], [-0.85, -1.2, -0.85], 'dark')
    )
  };

  stock.blimp = {
    id: 'blimp',
    name: 'CIVIC PATIENCE',
    kind: 'Blimp',
    blurb: 'Buoyant, vectored, and enormous. Plan every turn a minute early.',
    massKg: 5900,
    inertia: { x: 180000, y: 900000, z: 900000 },
    fuelKg: 200,
    crashVsMps: 5,
    hullClearM: 4.0,
    buoyancy: {
      volumeM3: 6000, gasDensityRatio: 0.138, dragArea: 210, cd: 0.35, vectored: 9000
    },
    control: { pitch: 260000, roll: 90000, yaw: 320000, maxAuthMul: 1.6, damp: { x: 120000, y: 900000, z: 700000 } },
    propulsion: { maxThrustN: 9000, vRef: 40, vExp: 2, minFade: 0.2, idleRPM: 500, maxRPM: 1800, burnKgPerSec: 0.01, rhoExp: 0.7 },
    wing: {
      areaM2: 90, spanM: 18, chordM: 12, clAlpha: 0.9, cl0: 0, stallAlpha: rad(30),
      cd0: 0.045, k: 0.2, cm0: 0, cmAlpha: 0.5, refQ: 200,
      cyBeta: 1.4, cnBeta: 1.6, clBeta: 0.1, cdStall: 0.2, cdBeta: 0.9
    },
    contacts: [
      { p: [0, -9.0, 0], k: 180000, c: 60000, sideMu: 1.2 },
      { p: [8, -8.0, 0], k: 90000, c: 30000, sideMu: 1.2 },
      { p: [-8, -8.0, 0], k: 90000, c: 30000, sideMu: 1.2 }
    ],
    eye: [10.0, -6.4, 0],
    chase: { dist: 62, up: 14, lag: 5.0, lead: 0.4 },
    audio: { patch: 'piston', hzPerRPM: 0.03, base: 18, level: 0.4,
      layer: { patch: 'hum', mul: 0.51, level: 0.2 } },
    entry: { alt: 500, speed: 12, throttle: 0.45, pitch: 0, trim: 'buoyant' },
    mesh: mesh(
      mk.lathe([[-16, 0.5], [-12, 4.0], [-4, 6.4], [4, 6.4], [11, 4.6], [16, 0.6]], 10, 'white'),
      mk.box(9.0, -7.0, 0, 2.6, 1.0, 1.2, 'hull'),
      mk.box(9.0, -6.0, 0, 0.4, 1.2, 0.4, 'dark'),
      mk.fin(-17.0, -12.0, 0.0, 7.0, 3.0, 'accent'),
      mk.fin(-17.0, -12.0, 0.0, -7.0, 3.0, 'accent'),
      mk.wingPair(-12.0, 0, -16.5, 0, 7.0, 5.0, 2.0, 'accent'),
      mk.box(7.0, -6.4, 2.0, 0.5, 0.5, 0.9, 'dark'),
      mk.box(7.0, -6.4, -2.0, 0.5, 0.5, 0.9, 'dark')
    )
  };

  stock.saucer = {
    id: 'saucer',
    name: 'PLATE 6',
    kind: 'Flying saucer',
    blurb: 'Reaction thrust in any direction. No stall, no engine note, no manual.',
    massKg: 900,
    inertia: { x: 2600, y: 2600, z: 2600 },
    crashVsMps: 12,
    hullClearM: 1.2,
    reaction: { upN: 19000, lateralN: 9000, forwardN: 13000, dragK: 7.5, alwaysOn: false },
    control: { pitch: 2400, roll: 2400, yaw: 2600, maxAuthMul: 1, damp: { x: 3600, y: 3600, z: 3600 } },
    contacts: [
      { p: [3.2, -1.0, 0], k: 60000, c: 12000, sideMu: 0.6 },
      { p: [-1.6, -1.0, 2.8], k: 60000, c: 12000, sideMu: 0.6 },
      { p: [-1.6, -1.0, -2.8], k: 60000, c: 12000, sideMu: 0.6 }
    ],
    eye: [0.9, 0.75, 0],
    chase: { dist: 18, up: 5, lag: 2.8, lead: 1.1 },
    audio: { patch: 'hum', hzPerRPM: 0, base: 70, level: 0.35 },
    entry: { alt: 700, speed: 0, throttle: 0.46, pitch: 0, trim: 'hover' },
    mesh: mesh(
      mk.lathe([[-0.9, 1.2], [-0.3, 4.6], [0.0, 5.2], [0.35, 4.4], [0.75, 2.2]], 12, 'hull'),
      mk.lathe([[0.75, 2.2], [1.25, 1.9], [1.6, 0.9]], 12, 'glass'),
      mk.lathe([[-1.15, 0.5], [-0.9, 1.2]], 12, 'accent')
    )
  };

  stock.helicopter = {
    id: 'helicopter',
    name: 'DERRICK 12',
    kind: 'Helicopter',
    blurb: 'Collective, cyclic, pedals. Chop the throttle and autorotate.',
    massKg: 1250,
    inertia: { x: 2600, y: 5400, z: 5000 },
    fuelKg: 150,
    crashVsMps: 7,
    hullClearM: 1.2,
    rotor: {
      powered: true, cyclic: true, nominalRPM: 400, maxThrustN: 20000, tiltRad: 0.30,
      radiusM: 5.2, hubY: 1.66,
      hubMoment: 3000, torqueYaw: 1400, translationalLift: 0.42, etlSpeed: 12,
      inertiaTau: 3.4, autoDescent: 13, rotorDragArea: 2.6
    },
    propulsion: null,
    control: { pitch: 900, roll: 900, yaw: 2200, maxAuthMul: 1, damp: { x: 2600, y: 3600, z: 3200 } },
    contacts: [
      { p: [1.4, -1.5, 1.0], k: 60000, c: 14000, sideMu: 1.4 },
      { p: [1.4, -1.5, -1.0], k: 60000, c: 14000, sideMu: 1.4 },
      { p: [-1.6, -1.5, 1.0], k: 60000, c: 14000, sideMu: 1.4 },
      { p: [-1.6, -1.5, -1.0], k: 60000, c: 14000, sideMu: 1.4 }
    ],
    eye: [1.5, 0.55, 0],
    chase: { dist: 17, up: 4.6, lag: 3.0, lead: 0.9 },
    audio: { patch: 'rotor', hzPerRPM: 0.09, base: 12, level: 0.6,
      layer: { patch: 'turbine', mul: 5.6, level: 0.2 } },
    entry: { alt: 200, speed: 0, throttle: 0.8, collective: 0.62, pitch: 0, trim: 'hover' },
    mesh: mesh(
      mk.box(0.2, 0, 0, 2.2, 0.85, 0.85, 'hull'),
      mk.box(-3.8, 0.35, 0, 2.0, 0.22, 0.22, 'hull'),
      mk.box(1.9, 0.1, 0, 0.6, 0.6, 0.7, 'glass'),
      mk.fin(-6.0, -5.0, 0.35, 1.6, 0.5, 'accent'),
      mk.box(0.0, 1.5, 0, 0.2, 0.2, 0.2, 'dark'),
      mk.quad([5.2, 1.66, 0.28], [5.2, 1.66, -0.28], [-5.2, 1.66, -0.28], [-5.2, 1.66, 0.28], 'dark'),
      mk.quad([0.28, 1.66, 5.2], [-0.28, 1.66, 5.2], [-0.28, 1.66, -5.2], [0.28, 1.66, -5.2], 'dark'),
      mk.quad([-5.6, 1.4, 0.06], [-5.6, 0.2, 0.06], [-5.9, 0.2, 0.06], [-5.9, 1.4, 0.06], 'accent')
    )
  };

  stock.autogyro = {
    id: 'autogyro',
    name: 'PENNY FARTHING',
    kind: 'Autogyro',
    blurb: 'Unpowered rotor, powered prop. It genuinely cannot stall.',
    massKg: 430,
    inertia: { x: 700, y: 1500, z: 1300 },
    fuelKg: 40,
    crashVsMps: 6,
    hullClearM: 0.9,
    rotor: {
      powered: false, cyclic: true, nominalRPM: 340, maxThrustN: 8600, tiltRad: 0.22,
      radiusM: 4.6, hubY: 1.78,
      hubMoment: 1100, translationalLift: 0.7, etlSpeed: 9, inertiaTau: 4.5,
      autoDescent: 7.5, rotorDragArea: 1.4, fixedCollective: 1.0
    },
    propulsion: {
      maxThrustN: 1500, vRef: 60, vExp: 2, minFade: 0.15, idleRPM: 900, maxRPM: 2900,
      burnKgPerSec: 0.003, torqueRoll: -60, rhoExp: 0.7, slipQ: 140
    },
    limits: { qMax: 2600 },
    wing: {
      areaM2: 2.4, spanM: 2.6, chordM: 0.9, clAlpha: 3.0, cl0: 0, stallAlpha: rad(40),
      cd0: 0.09, k: 0.2, cm0: 0.02, cmAlpha: 0.8, refQ: 260,
      cyBeta: 1.2, cnBeta: 1.6, clBeta: 0.2, cdStall: 0.1, cdBeta: 0.6
    },
    control: { pitch: 380, roll: 320, yaw: 460, maxAuthMul: 2.0, damp: { x: 520, y: 1100, z: 900 } },
    contacts: [
      { p: [0.8, -1.3, 0.9], gear: true, brake: true },
      { p: [0.8, -1.3, -0.9], gear: true, brake: true },
      { p: [-1.9, -1.3, 0], gear: true, brake: true, sideMu: 0.9, steer: true }
    ],
    eye: [0.6, 0.35, 0],
    chase: { dist: 14, up: 4.0, lag: 3.2, lead: 0.9 },
    audio: { patch: 'piston', hzPerRPM: 0.05, base: 20, level: 0.5,
      layer: { patch: 'hum', mul: 2.4, level: 0.18 } },
    entry: { alt: 300, speed: 26, throttle: 0.6, pitch: rad(3), trim: 'rotor' },
    mesh: mesh(
      mk.box(0.0, 0, 0, 1.2, 0.45, 0.45, 'hull'),
      mk.box(-1.9, 0.1, 0, 1.0, 0.12, 0.12, 'hull'),
      mk.box(-1.3, 0.05, 0, 0.15, 0.35, 0.35, 'dark'),
      mk.fin(-3.1, -2.3, 0.2, 1.2, 0.4, 'accent'),
      mk.wingPair(-2.6, 0.2, -2.7, 0.22, 1.3, 0.7, 0.5, 'accent'),
      mk.box(0.2, 1.0, 0, 0.12, 0.75, 0.12, 'dark'),
      mk.quad([4.6, 1.78, 0.22], [4.6, 1.78, -0.22], [-4.6, 1.78, -0.22], [-4.6, 1.78, 0.22], 'dark'),
      mk.box(0.9, -1.25, 0.9, 0.16, 0.16, 0.1, 'dark'),
      mk.box(0.9, -1.25, -0.9, 0.16, 0.16, 0.1, 'dark')
    )
  };

  stock.ornithopter = {
    id: 'ornithopter',
    name: 'MAYFLY',
    kind: 'Ornithopter',
    blurb: 'Altitude sawtooths with every beat. Trust the average, not the moment.',
    massKg: 92,
    inertia: { x: 90, y: 140, z: 120 },
    fuelKg: 6,
    crashVsMps: 5,
    hullClearM: 0.8,
    wing: {
      areaM2: 9.5, spanM: 8.4, chordM: 1.1, clAlpha: 4.4, cl0: 0.3, stallAlpha: rad(19),
      cd0: 0.06, k: 0.09, cm0: 0.03, cmAlpha: 0.4, refQ: 90,
      cyBeta: 0.5, cnBeta: 0.7, clBeta: 0.4, cdStall: 0.4, cdBeta: 0.4
    },
    flapping: { baseHz: 0.7, hzPerThrottle: 1.7, peakN: 1250, upFrac: 0.85, forwardFrac: 0.62, pitchCouple: 26 },
    control: { pitch: 120, roll: 150, yaw: 70, maxAuthMul: 3.0, damp: { x: 90, y: 150, z: 130 } },
    contacts: [
      { p: [0.4, -0.9, 0.5], gear: true, brake: true, sideMu: 1.0 },
      { p: [0.4, -0.9, -0.5], gear: true, brake: true, sideMu: 1.0 },
      { p: [-2.2, -0.5, 0], gear: true, sideMu: 0.8, steer: true }
    ],
    eye: [0.5, 0.3, 0],
    chase: { dist: 12, up: 3.4, lag: 3.4, lead: 0.8 },
    audio: { patch: 'hum', hzPerRPM: 0, base: 40, level: 0.25 },
    entry: { alt: 250, speed: 15, throttle: 0.7, pitch: rad(5), trim: 'flap' },
    mesh: mesh(
      mk.box(-0.6, 0, 0, 1.6, 0.28, 0.26, 'hull'),
      mk.wingPair(0.4, 0.28, 0.0, 0.9, 4.2, 1.3, 0.6, 'accent'),
      mk.fin(-2.4, -1.6, 0.1, 0.9, 0.4, 'accent'),
      mk.wingPair(-2.0, 0.1, -2.1, 0.12, 1.1, 0.6, 0.4, 'accent'),
      mk.box(0.5, 0.2, 0, 0.5, 0.22, 0.24, 'glass')
    )
  };

  stock.paper = {
    id: 'paper',
    name: 'FOLDED NOTE',
    kind: 'Paper airplane',
    blurb: 'Eight grams. Weight shift only. The gusts are in charge.',
    massKg: 0.009,
    inertia: { x: 0.0009, y: 0.0016, z: 0.0012 },
    crashVsMps: 40,
    hullClearM: 0.2,
    gustFactor: 5.5,
    wing: {
      areaM2: 0.032, spanM: 0.22, chordM: 0.17, clAlpha: 3.2, cl0: 0.1, stallAlpha: rad(22),
      cd0: 0.075, k: 0.16, cm0: 0.06, cmAlpha: 0.9, refQ: 4,
      cyBeta: 0.5, cnBeta: 1.2, clBeta: 0.6, cdStall: 0.3, cdBeta: 0.5
    },
    control: { pitch: 0.010, roll: 0.012, yaw: 0.004, maxAuthMul: 3.0, damp: { x: 0.0045, y: 0.008, z: 0.007 } },
    contacts: [
      { p: [0.08, -0.02, 0], k: 40, c: 3, sideMu: 1.4 },
      { p: [-0.09, -0.02, 0], k: 40, c: 3, sideMu: 1.4 }
    ],
    eye: [0.06, 0.03, 0],
    chase: { dist: 1.6, up: 0.5, lag: 4.5, lead: 0.5 },
    audio: { patch: 'hum', hzPerRPM: 0, base: 0, level: 0 },
    entry: { alt: 80, speed: 7, throttle: 0, pitch: rad(-3), trim: 'glide' },
    mesh: mesh(
      mk.tri([0.14, 0, 0], [-0.09, 0, 0.11], [-0.09, 0.02, 0], 'white'),
      mk.tri([0.14, 0, 0], [-0.09, 0.02, 0], [-0.09, 0, -0.11], 'white'),
      mk.tri([0.14, 0, 0], [-0.09, 0.02, 0], [-0.02, -0.02, 0], 'white')
    )
  };

  stock.rocket = {
    id: 'rocket',
    limits: { qMax: 90000 },
    name: 'PARABOLA X',
    kind: 'Lifting body rocket',
    blurb: 'Ballistic on the way up, dead stick all the way back down.',
    massKg: 1450,
    inertia: { x: 900, y: 7000, z: 7000 },
    fuelKg: 520,
    crashVsMps: 9,
    hullClearM: 1.1,
    wing: {
      areaM2: 12.5, spanM: 4.6, chordM: 3.4, clAlpha: 2.7, cl0: 0.05, stallAlpha: rad(24),
      cd0: 0.048, k: 0.13, cm0: 0.012, cmAlpha: 0.34, refQ: 1400,
      gearCd: 0.01, cyBeta: 0.9, cnBeta: 1.3, clBeta: 0.2, cdStall: 0.4, cdBeta: 0.6
    },
    propulsion: {
      maxThrustN: 46000, vRef: 0, idleRPM: 0, maxRPM: 100, burnKgPerSec: 11, rhoExp: 0
    },
    control: { pitch: 9000, roll: 7000, yaw: 5000, maxAuthMul: 2.0, damp: { x: 2200, y: 7000, z: 7000 } },
    contacts: [
      { p: [1.4, -1.2, 1.0], gear: true, brake: true },
      { p: [1.4, -1.2, -1.0], gear: true, brake: true },
      { p: [-3.0, -1.2, 0], gear: true, brake: true, sideMu: 1.0, steer: true }
    ],
    eye: [2.2, 0.7, 0],
    chase: { dist: 26, up: 6, lag: 2.4, lead: 1.4 },
    audio: { patch: 'rocket', hzPerRPM: 0.6, base: 34, level: 0.85,
      layer: { patch: 'turbine', mul: 0.5, level: 0.3 } },
    entry: { alt: 40, speed: 0, throttle: 1.0, pitch: rad(70), trim: 'ballistic' },
    mesh: mesh(
      mk.lathe([[-3.6, 0.9], [0.0, 1.15], [2.6, 0.9], [3.8, 0.25]], 8, 'white', 0),
      mk.wingPair(-1.6, -0.3, -3.4, 0.6, 2.3, 3.0, 1.2, 'hull'),
      mk.fin(-3.9, -2.0, 0.6, 2.4, 1.3, 'red'),
      mk.box(2.4, 0.55, 0, 0.9, 0.28, 0.4, 'glass'),
      mk.box(-3.8, 0, 0, 0.35, 0.55, 0.55, 'dark')
    )
  };

  // Rotate the lathe based hulls that were authored around the y axis so they
  // point along the body x axis. Done once at load, not per frame.
  function layDown(def) {
    var f = def.mesh.faces;
    for (var i = 0; i < f.length; i++) {
      for (var j = 0; j < f[i].v.length; j++) {
        var v = f[i].v[j];
        var x = v[1], y = -v[0];
        v[0] = x; v[1] = y;
      }
    }
  }
  layDown(stock.blimp);
  layDown(stock.rocket);

  stock.trainer.panel = PANEL.sixpack();
  stock.warbird.panel = PANEL.sixpack();
  stock.jet.panel = PANEL.jet();
  stock.sailplane.panel = PANEL.sixpack({ power: 'vario' });
  stock.balloon.panel = PANEL.balloon();
  stock.blimp.panel = PANEL.sixpack({ power: 'rpm' });
  stock.saucer.panel = PANEL.saucer();
  stock.helicopter.panel = PANEL.rotorcraft();
  stock.autogyro.panel = PANEL.rotorcraft();
  stock.ornithopter.panel = PANEL.open([{ k: 'asi', x: 40, y: 216, r: 7 }, { k: 'alt', x: 90, y: 216, r: 7 }, { k: 'vsi', x: 140, y: 216, r: 7 }]);
  stock.paper.panel = PANEL.open([]);
  stock.rocket.panel = PANEL.jet();

  AC.PANEL = PANEL;
  AC.stock = stock;

  AC.ORDER = ['trainer', 'warbird', 'jet', 'sailplane', 'balloon', 'blimp',
    'saucer', 'helicopter', 'autogyro', 'ornithopter', 'paper', 'rocket'];

  AC.list = function () {
    return AC.ORDER.map(function (id) { return AC.stock[id]; }).filter(Boolean);
  };

  AC.byId = function (id) { return AC.stock[id] || null; };

  // Tunable fields exposed in the in app tuning panel. Everything here can be
  // edited without touching the physics code, and reset to stock.
  AC.TUNABLE = [
    { path: 'massKg', label: 'Mass kg', min: 0.005, max: 20000, step: 0.005 },
    { path: 'wing.areaM2', label: 'Wing area m2', min: 0.01, max: 200, step: 0.01 },
    { path: 'wing.clAlpha', label: 'Lift curve slope', min: 0.5, max: 8, step: 0.05 },
    { path: 'wing.stallAlpha', label: 'Stall alpha rad', min: 0.05, max: 0.9, step: 0.005 },
    { path: 'wing.cd0', label: 'Zero lift drag', min: 0.005, max: 0.4, step: 0.001 },
    { path: 'wing.k', label: 'Induced drag k', min: 0.005, max: 0.5, step: 0.001 },
    { path: 'wing.cm0', label: 'Pitch trim cm0', min: -0.1, max: 0.1, step: 0.001 },
    { path: 'propulsion.maxThrustN', label: 'Max thrust N', min: 0, max: 120000, step: 10 },
    { path: 'control.pitch', label: 'Pitch authority', min: 0, max: 60000, step: 1 },
    { path: 'control.roll', label: 'Roll authority', min: 0, max: 60000, step: 1 },
    { path: 'control.yaw', label: 'Yaw authority', min: 0, max: 60000, step: 1 },
    { path: 'chase.dist', label: 'Chase distance m', min: 1, max: 120, step: 0.5 },
    { path: 'chase.up', label: 'Chase height m', min: 0, max: 40, step: 0.2 },
    { path: 'chase.lag', label: 'Chase spring', min: 0.4, max: 12, step: 0.1 },
    { path: 'chase.lead', label: 'Chase lead', min: 0, max: 3, step: 0.05 },
    // Capability specific. Each one is skipped for an aircraft that does not
    // have that capability, so a balloon shows balloon numbers.
    { path: 'buoyancy.volumeM3', label: 'Envelope volume m3', min: 50, max: 40000, step: 10 },
    { path: 'buoyancy.burnerKPerSec', label: 'Burner K per second', min: 0, max: 120, step: 0.5 },
    { path: 'buoyancy.ventKPerSec', label: 'Vent K per second', min: 0, max: 120, step: 0.5 },
    { path: 'rotor.maxThrustN', label: 'Rotor thrust N', min: 0, max: 120000, step: 50 },
    { path: 'rotor.nominalRPM', label: 'Rotor rpm', min: 40, max: 1200, step: 1 },
    { path: 'rotor.tiltRad', label: 'Cyclic range rad', min: 0.02, max: 0.9, step: 0.005 },
    { path: 'reaction.upN', label: 'Reaction lift N', min: 0, max: 120000, step: 50 },
    { path: 'reaction.forwardN', label: 'Reaction thrust N', min: 0, max: 120000, step: 50 },
    { path: 'flapping.peakN', label: 'Beat force N', min: 0, max: 20000, step: 5 },
    { path: 'flapping.baseHz', label: 'Beat rate Hz', min: 0.1, max: 12, step: 0.05 },
    { path: 'crashVsMps', label: 'Survivable arrival m/s', min: 0.5, max: 40, step: 0.1 }
  ];

  AC.getPath = function (obj, path) {
    var parts = path.split('.'), o = obj;
    for (var i = 0; i < parts.length; i++) {
      if (o === null || o === undefined) { return undefined; }
      o = o[parts[i]];
    }
    return o;
  };

  AC.setPath = function (obj, path, value) {
    var parts = path.split('.'), o = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (!o[parts[i]]) { return false; }
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
    return true;
  };

  // Deep copies keep the stock table pristine so reset to stock always works.
  var STOCK_SNAPSHOT = JSON.stringify(AC.ORDER.map(function (id) {
    var d = AC.stock[id], out = {};
    AC.TUNABLE.forEach(function (t) {
      var v = AC.getPath(d, t.path);
      if (v !== undefined) { out[t.path] = v; }
    });
    return { id: id, values: out };
  }));

  AC.resetToStock = function (id) {
    var snap = JSON.parse(STOCK_SNAPSHOT);
    for (var i = 0; i < snap.length; i++) {
      if (id && snap[i].id !== id) { continue; }
      var def = AC.stock[snap[i].id];
      if (!def) { continue; }
      Object.keys(snap[i].values).forEach(function (p) { AC.setPath(def, p, snap[i].values[p]); });
    }
  };

  AC.stockValues = function (id) {
    var snap = JSON.parse(STOCK_SNAPSHOT);
    for (var i = 0; i < snap.length; i++) { if (snap[i].id === id) { return snap[i].values; } }
    return {};
  };

})(typeof window !== 'undefined' ? window : globalThis);
