// AERODROME :: src/01-palette.js :: v1.2.0
// 9-bit color, four palettes of sixteen, ordered dither. Depends on 00-core.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math;

  var P = AERO.palette = {};

  P.PALETTES = 4;
  P.ENTRIES = 16;
  P.TOTAL = P.PALETTES * P.ENTRIES; // 64 on screen, the hardware ceiling
  P.SPACE = 512;                    // 9-bit RGB, three bits per channel

  // Palette bank layout, kept as named constants so the rest of the engine
  // never guesses at an index.
  P.BANK = {
    WORLD: 0,   // 0..15   terrain, water, tarmac
    SKY: 1,     // 16..31  sky ramp, clouds, sun, stars
    CRAFT: 2,   // 32..47  airframes, sprites, effects
    PANEL: 3    // 48..63  instruments and HUD
  };

  // Ramps inside the banks. start is a global index, len is entry count.
  P.RAMP = {
    grass: { start: 1, len: 6 },
    rock: { start: 7, len: 3 },
    water: { start: 10, len: 2 },
    tarmac: { start: 12, len: 2 },
    mark: { start: 14, len: 1 },
    shadow: { start: 15, len: 1 },
    sky: { start: 17, len: 8 },
    cloud: { start: 25, len: 3 },
    sun: { start: 28, len: 3 },
    star: { start: 31, len: 1 },
    hull: { start: 33, len: 6 },
    accent: { start: 39, len: 3 },
    glass: { start: 42, len: 2 },
    red: { start: 44, len: 1 },
    white: { start: 45, len: 1 },
    black: { start: 46, len: 1 },
    flame: { start: 47, len: 1 },
    panel: { start: 49, len: 4 },
    amber: { start: 53, len: 1 },
    amberDim: { start: 54, len: 1 },
    mint: { start: 55, len: 1 },
    warn: { start: 56, len: 1 },
    ink: { start: 57, len: 1 },
    dark: { start: 58, len: 1 },
    hud: { start: 59, len: 4 },
    alert: { start: 63, len: 1 }
  };

  // Index 0 of every bank is the transparency slot. Global index 0 doubles as
  // the framebuffer backdrop, which is what the hardware did.
  P.isTransparent = function (idx) { return (idx % P.ENTRIES) === 0; };

  // ------------------------------------------------------------ quantization
  // Every color the engine produces passes through here. Input 0..255 floats,
  // output a 9-bit packed code 0..511.
  P.quant = function (r, g, b) {
    var q = function (v) { return M.clamp(Math.round(M.clamp(v, 0, 255) / 255 * 7), 0, 7); };
    return (q(r) << 6) | (q(g) << 3) | q(b);
  };

  P.expand = function (code) {
    var r = (code >> 6) & 7, g = (code >> 3) & 7, b = code & 7;
    return { r: Math.round(r * 255 / 7), g: Math.round(g * 255 / 7), b: Math.round(b * 255 / 7) };
  };

  P.hex = function (code) {
    var c = P.expand(code);
    var h = function (v) { var s = v.toString(16); return s.length < 2 ? '0' + s : s; };
    return '#' + h(c.r) + h(c.g) + h(c.b);
  };

  // ------------------------------------------------------------------ state
  // codes holds one 9-bit code per on-screen entry. rgba is the flattened
  // lookup the presenter uses, rebuilt only when codes change.
  P.codes = new Uint16Array(P.TOTAL);
  P.rgba = new Uint32Array(P.TOTAL);
  P.dirty = true;

  P.setEntry = function (idx, r, g, b) {
    var code = P.quant(r, g, b);
    if (P.codes[idx] !== code) { P.codes[idx] = code; P.dirty = true; }
  };


  P.rebuild = function () {
    for (var i = 0; i < P.TOTAL; i++) {
      var c = P.expand(P.codes[i]);
      // Little endian ABGR packing for Uint32 writes into ImageData.
      P.rgba[i] = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
    }
    P.dirty = false;
  };

  // Ramp helper. t of 0 is the darkest entry, 1 the brightest.
  P.rampIndex = function (ramp, t) {
    var r = P.RAMP[ramp];
    var i = Math.round(M.clamp(t, 0, 1) * (r.len - 1));
    return r.start + i;
  };

  // ---------------------------------------------------------------- dither
  // 4 x 4 Bayer. Gradients, haze and dusk skies are dithered between two
  // palette entries. There is no alpha blending anywhere in this engine.
  P.BAYER = [
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5
  ];

  // A second, longer period pattern. Bayer at 4 x 4 reads as a visible grid
  // on a soft edge scaled up three times, which is exactly what a cloud is.
  // This 8 x 8 spreads the same sixty four levels over a larger cell.
  P.SOFT = [
    0, 48, 12, 60, 3, 51, 15, 63,
    32, 16, 44, 28, 35, 19, 47, 31,
    8, 56, 4, 52, 11, 59, 7, 55,
    40, 24, 36, 20, 43, 27, 39, 23,
    2, 50, 14, 62, 1, 49, 13, 61,
    34, 18, 46, 30, 33, 17, 45, 29,
    10, 58, 6, 54, 9, 57, 5, 53,
    42, 26, 38, 22, 41, 25, 37, 21
  ];

  // pattern is optional. Leave it out for Bayer, pass 'soft' for the 8 x 8.
  P.ditherPick = function (idxA, idxB, t, x, y, pattern) {
    var threshold = (pattern === 'soft')
      ? (P.SOFT[(y & 7) * 8 + (x & 7)] + 0.5) / 64
      : (P.BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
    return (t > threshold) ? idxB : idxA;
  };

  // Pick a ramp entry with dithering between the two nearest steps.
  P.ditherRamp = function (ramp, t, x, y) {
    var r = P.RAMP[ramp];
    var f = M.clamp(t, 0, 1) * (r.len - 1);
    var i = Math.floor(f);
    if (i >= r.len - 1) { return r.start + r.len - 1; }
    return P.ditherPick(r.start + i, r.start + i + 1, f - i, x, y);
  };

  // ------------------------------------------------------------ stock banks
  // Authored as 24-bit intent, stored as 9-bit fact.
  var STOCK = {
    world: [
      [0, 0, 0],        // 0 backdrop and transparency
      [18, 40, 18], [30, 62, 26], [46, 88, 34], [62, 112, 44], [86, 140, 56], [116, 168, 74],
      [70, 62, 52], [104, 94, 78], [140, 130, 112],
      [24, 52, 94], [46, 88, 140],
      [46, 46, 50], [76, 76, 80],
      [216, 216, 208],
      [12, 18, 14]
    ],
    sky: [
      [0, 0, 0],
      [10, 14, 34], [22, 34, 72], [36, 62, 116], [58, 96, 158], [92, 134, 190], [130, 168, 210], [172, 200, 226], [208, 224, 238],
      [150, 158, 172], [196, 202, 212], [238, 240, 244],
      [252, 216, 130], [244, 150, 78], [206, 92, 70],
      [236, 236, 244]
    ],
    craft: [
      [0, 0, 0],
      [26, 28, 34], [52, 56, 66], [86, 92, 104], [124, 130, 142], [166, 172, 184], [212, 216, 226],
      [180, 60, 48], [216, 130, 44], [240, 196, 70],
      [70, 118, 150], [150, 196, 216],
      [200, 44, 40],
      [238, 238, 238],
      [10, 10, 12],
      [252, 220, 120]
    ],
    panel: [
      [0, 0, 0],
      [18, 22, 20], [34, 42, 38], [56, 66, 60], [82, 96, 88],
      [240, 176, 64],
      [150, 106, 36],
      [126, 214, 168],
      [214, 88, 74],
      [232, 240, 232],
      [8, 10, 9],
      [40, 88, 62], [72, 140, 96], [110, 190, 132], [160, 228, 176],
      [244, 96, 72]
    ]
  };

  P.loadStock = function () {
    var banks = [STOCK.world, STOCK.sky, STOCK.craft, STOCK.panel];
    for (var b = 0; b < 4; b++) {
      for (var e = 0; e < 16; e++) {
        var c = banks[b][e] || [0, 0, 0];
        P.setEntry(b * 16 + e, c[0], c[1], c[2]);
      }
    }
    P.rebuild();
  };

  // ------------------------------------------------------- time of day sky
  // Rewrites the sky ramp, sun accents and star entry for a given hour. The
  // result is quantized like everything else, so dusk still lives in 9 bits.
  var KEYS = [
    { h: 0, zen: [4, 6, 18], hor: [10, 14, 30], sun: [40, 40, 60], amb: 0.18 },
    { h: 5, zen: [16, 22, 54], hor: [96, 70, 84], sun: [180, 110, 90], amb: 0.30 },
    { h: 7, zen: [46, 92, 158], hor: [188, 176, 176], sun: [252, 216, 150], amb: 0.62 },
    { h: 12, zen: [34, 84, 168], hor: [176, 206, 232], sun: [255, 250, 226], amb: 1.0 },
    { h: 17, zen: [40, 82, 150], hor: [206, 178, 150], sun: [252, 220, 160], amb: 0.72 },
    { h: 19, zen: [26, 40, 96], hor: [226, 128, 74], sun: [244, 130, 70], amb: 0.36 },
    { h: 21, zen: [10, 14, 40], hor: [58, 44, 68], sun: [110, 70, 80], amb: 0.20 },
    { h: 24, zen: [4, 6, 18], hor: [10, 14, 30], sun: [40, 40, 60], amb: 0.18 }
  ];

  function keyAt(hour) {
    var a = KEYS[0], b = KEYS[KEYS.length - 1];
    for (var i = 0; i < KEYS.length - 1; i++) {
      if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) { a = KEYS[i]; b = KEYS[i + 1]; break; }
    }
    var t = (b.h === a.h) ? 0 : (hour - a.h) / (b.h - a.h);
    var mix = function (u, v) { return [M.lerp(u[0], v[0], t), M.lerp(u[1], v[1], t), M.lerp(u[2], v[2], t)]; };
    return { zen: mix(a.zen, b.zen), hor: mix(a.hor, b.hor), sun: mix(a.sun, b.sun), amb: M.lerp(a.amb, b.amb, t) };
  }


  P.applyTimeOfDay = function (hour) {
    hour = ((hour % 24) + 24) % 24;
    var k = keyAt(hour);
    var r = P.RAMP.sky;
    for (var i = 0; i < r.len; i++) {
      var t = i / (r.len - 1); // 0 at zenith, 1 at the horizon band
      P.setEntry(r.start + i,
        M.lerp(k.zen[0], k.hor[0], t),
        M.lerp(k.zen[1], k.hor[1], t),
        M.lerp(k.zen[2], k.hor[2], t));
    }
    var cl = P.RAMP.cloud;
    for (var c = 0; c < cl.len; c++) {
      var ct = c / (cl.len - 1);
      var lum = M.lerp(0.42, 1.0, ct) * M.lerp(0.35, 1.0, k.amb);
      P.setEntry(cl.start + c, 240 * lum, 242 * lum, 248 * lum);
    }
    var s = P.RAMP.sun;
    for (var j = 0; j < s.len; j++) {
      var st = j / (s.len - 1);
      P.setEntry(s.start + j, k.sun[0] * M.lerp(0.6, 1, st), k.sun[1] * M.lerp(0.6, 1, st), k.sun[2] * M.lerp(0.6, 1, st));
    }
    var night = M.clamp(1 - k.amb * 1.4, 0, 1);
    P.setEntry(P.RAMP.star.start, 236 * night, 236 * night, 244 * night);
    if (P.dirty) { P.rebuild(); }
    return k.amb;
  };

  // ------------------------------------------------------------- assertions
  // Used by the self test and by anything that wants to prove the constraint.
  P.audit = function () {
    var inSpace = true, distinct = {};
    for (var i = 0; i < P.TOTAL; i++) {
      var c = P.codes[i];
      if (c < 0 || c > 511 || (c | 0) !== c) { inSpace = false; }
      distinct[c] = true;
    }
    return {
      entries: P.TOTAL,
      inSpace: inSpace,
      distinctCodes: Object.keys(distinct).length,
      withinCeiling: P.TOTAL <= 64
    };
  };

  P.loadStock();

})(typeof window !== 'undefined' ? window : globalThis);
