// AERODROME :: src/10-instruments.js :: v1.10.0
// Every instrument is drawn into the framebuffer with the panel palette bank.
// Depends on 00-core.js, 01-palette.js, 02-raster.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math, P = AERO.palette, R = AERO.raster;

  var I = AERO.instruments = {};

  var C = {
    face: P.RAMP.panel.start,
    faceLit: P.RAMP.panel.start + 2,
    bezel: P.RAMP.panel.start + 3,
    needle: P.RAMP.amber.start,
    dim: P.RAMP.amberDim.start,
    mint: P.RAMP.mint.start,
    warn: P.RAMP.warn.start,
    ink: P.RAMP.ink.start,
    dark: P.RAMP.dark.start,
    hudLo: P.RAMP.hud.start,
    hudHi: P.RAMP.hud.start + P.RAMP.hud.len - 1,
    alert: P.RAMP.alert.start
  };
  I.COLORS = C;

  I.hudVisible = true;

  function needle(cx, cy, r, ang, idx, inner) {
    var s = Math.sin(ang), c = -Math.cos(ang);
    R.line(cx + s * (inner || 0), cy + c * (inner || 0), cx + s * r, cy + c * r, idx);
  }

  function ticks(cx, cy, r, count, idx, len) {
    for (var i = 0; i < count; i++) {
      var a = i / count * Math.PI * 2;
      var s = Math.sin(a), c = -Math.cos(a);
      R.line(cx + s * (r - (len || 3)), cy + c * (r - (len || 3)), cx + s * r, cy + c * r, idx);
    }
  }

  function dialFace(g) {
    R.circle(g.x, g.y, g.r, C.dark, true);
    R.circle(g.x, g.y, g.r, C.bezel, false);
    R.circle(g.x, g.y, g.r - 1, C.face, false);
  }

  // ------------------------------------------------------------------ gauges
  var GAUGE = {};

  GAUGE.asi = function (g, d) {
    dialFace(g);
    ticks(g.x, g.y, g.r - 2, 12, C.dim, 3);
    var vmax = 120;
    var t = M.clamp(d.airspeed / vmax, 0, 1);
    needle(g.x, g.y, g.r - 4, M.rad(30) + t * M.rad(300), d.stalled ? C.alert : C.needle);
    R.textCentered('IAS', g.x, g.y - g.r + 4, C.dim);
    R.textCentered(AERO.util.pad(d.airspeed, 2), g.x, g.y + g.r - 11, C.mint);
  };

  GAUGE.alt = function (g, d) {
    dialFace(g);
    ticks(g.x, g.y, g.r - 2, 10, C.dim, 3);
    var hundreds = (d.altitude % 1000) / 1000;
    var thousands = (d.altitude % 10000) / 10000;
    needle(g.x, g.y, g.r - 9, thousands * Math.PI * 2, C.dim);
    needle(g.x, g.y, g.r - 4, hundreds * Math.PI * 2, C.needle);
    R.textCentered('ALT', g.x, g.y - g.r + 4, C.dim);
    R.textCentered(AERO.util.pad(d.altitude, 4), g.x, g.y + g.r - 11, C.mint);
  };

  GAUGE.vsi = function (g, d) {
    dialFace(g);
    ticks(g.x, g.y, g.r - 2, 8, C.dim, 3);
    var t = M.clamp(d.vsi / 10, -1, 1);
    needle(g.x, g.y, g.r - 4, M.rad(90) + t * M.rad(140), C.needle);
    R.textCentered('VS', g.x, g.y - g.r + 4, C.dim);
    R.textCentered((d.vsi >= 0 ? '+' : '-') + Math.abs(d.vsi).toFixed(1), g.x, g.y + g.r - 11,
      d.vsi >= 0 ? C.mint : C.needle);
  };

  GAUGE.vario = function (g, d) {
    GAUGE.vsi(g, d);
    R.textCentered('VAR', g.x, g.y - g.r + 4, C.dim);
  };

  GAUGE.heading = function (g, d) {
    dialFace(g);
    var hdg = d.heading;
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2 - hdg;
      var s = Math.sin(a), c = -Math.cos(a);
      var lab = ['N', '3', '6', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'][i];
      if (i % 3 === 0) {
        R.text(lab, g.x + s * (g.r - 8) - 2, g.y + c * (g.r - 8) - 3, C.mint);
      } else {
        R.line(g.x + s * (g.r - 4), g.y + c * (g.r - 4), g.x + s * (g.r - 2), g.y + c * (g.r - 2), C.dim);
      }
    }
    R.line(g.x, g.y - 3, g.x, g.y - g.r + 2, C.needle);
    R.textCentered(AERO.util.pad(M.deg(hdg), 3), g.x, g.y + g.r - 11, C.needle);
  };

  GAUGE.attitude = function (g, d) {
    R.circle(g.x, g.y, g.r, C.bezel, true);
    var bank = d.bank, pitch = d.pitch;
    var sb = Math.sin(bank), cb = Math.cos(bank);
    var pitchPx = M.deg(pitch) * (g.r / 45);
    for (var y = -g.r; y <= g.r; y++) {
      var halfW = Math.floor(Math.sqrt(Math.max(0, g.r * g.r - y * y)));
      for (var x = -halfW; x <= halfW; x++) {
        // Rotate the sample into the aircraft frame and compare with the
        // pitch offset horizon.
        var ry = -x * sb + y * cb;
        var idx = (ry < -pitchPx) ? C.hudHi : C.dim;
        R.px(g.x + x, g.y + y, idx);
      }
    }
    // Pitch ladder every ten degrees.
    for (var p = -30; p <= 30; p += 10) {
      if (p === 0) { continue; }
      var off = (p * (g.r / 45)) - pitchPx;
      var lx = Math.abs(p) === 10 ? 6 : 4;
      var x0 = -lx, x1 = lx;
      var ax = g.x + x0 * cb + off * sb, ay = g.y + x0 * sb - off * cb;
      var bx = g.x + x1 * cb + off * sb, by = g.y + x1 * sb - off * cb;
      if (Math.abs(off) < g.r - 2) { R.line(ax, ay, bx, by, C.ink); }
    }
    // Fixed aircraft symbol and bank pointer.
    R.hline(g.y, g.x - g.r + 4, g.x - 3, C.needle);
    R.hline(g.y, g.x + 3, g.x + g.r - 4, C.needle);
    R.px(g.x, g.y, C.needle);
    R.circle(g.x, g.y, g.r, C.face, false);
    var pa = -bank;
    R.line(g.x + Math.sin(pa) * (g.r - 3), g.y - Math.cos(pa) * (g.r - 3),
      g.x + Math.sin(pa) * g.r, g.y - Math.cos(pa) * g.r, C.warn);
  };

  GAUGE.rpm = function (g, d) {
    dialFace(g);
    ticks(g.x, g.y, g.r - 2, 8, C.dim, 3);
    var t = M.clamp(d.rpm / 3000, 0, 1);
    needle(g.x, g.y, g.r - 4, M.rad(35) + t * M.rad(290), t > 0.9 ? C.alert : C.needle);
    R.textCentered('RPM', g.x, g.y - g.r + 4, C.dim);
    R.textCentered(AERO.util.pad(d.rpm, 4), g.x, g.y + g.r - 11, C.mint);
  };

  GAUGE.rotor = function (g, d) {
    dialFace(g);
    ticks(g.x, g.y, g.r - 2, 10, C.dim, 3);
    var t = M.clamp(d.rotorRPM / 460, 0, 1);
    var low = t < 0.55;
    needle(g.x, g.y, g.r - 4, M.rad(30) + t * M.rad(300), low ? C.alert : C.needle);
    R.textCentered('ROTOR', g.x, g.y - g.r + 4, C.dim);
    R.textCentered(AERO.util.pad(d.rotorRPM, 3), g.x, g.y + g.r - 11, low ? C.alert : C.mint);
  };

  GAUGE.burner = function (g, d) {
    dialFace(g);
    var amb = 288;
    var t = M.clamp((d.gasTempK - amb) / 140, 0, 1);
    ticks(g.x, g.y, g.r - 2, 6, C.dim, 3);
    needle(g.x, g.y, g.r - 4, M.rad(40) + t * M.rad(280), t > 0.9 ? C.alert : C.needle);
    R.textCentered('ENV T', g.x, g.y - g.r + 4, C.dim);
    R.textCentered(AERO.util.pad(d.gasTempK - 273, 3) + 'C', g.x, g.y + g.r - 11, C.mint);
  };

  // Deliberately illegible. The saucer does not explain itself.
  GAUGE.glyph = function (g, d, t) {
    R.circle(g.x, g.y, g.r, C.dark, true);
    R.circle(g.x, g.y, g.r, C.mint, false);
    var seed = Math.floor((t || 0) * 1.7) + g.x;
    var rnd = AERO.rng(seed);
    for (var i = 0; i < 7; i++) {
      var a0 = rnd() * Math.PI * 2, a1 = rnd() * Math.PI * 2;
      var r0 = rnd() * g.r * 0.85, r1 = rnd() * g.r * 0.85;
      R.line(g.x + Math.sin(a0) * r0, g.y - Math.cos(a0) * r0,
        g.x + Math.sin(a1) * r1, g.y - Math.cos(a1) * r1, i % 3 ? C.mint : C.needle);
    }
    var bars = Math.floor(M.clamp(Math.abs(d.airspeed) / 12, 0, 5));
    for (var b = 0; b < bars; b++) { R.hline(g.y + g.r - 4 - b * 2, g.x - 4, g.x + 4, C.hudHi); }
  };

  I.GAUGE = GAUGE;

  // ------------------------------------------------------------------ tapes
  function tape(x, y, h, value, step, label, idx) {
    R.rect(x - 13, y, 26, h, C.dark);
    R.frame(x - 13, y, 26, h, C.bezel);
    var mid = y + h / 2;
    var base = Math.round(value / step) * step;
    for (var i = -3; i <= 3; i++) {
      var v = base + i * step;
      var py = Math.round(mid - (v - value) / step * (h / 7));
      if (py < y + 2 || py > y + h - 8) { continue; }
      R.hline(py, x - 12, x - 8, C.dim);
      R.text(String(Math.round(v)), x - 6, py - 3, C.dim);
    }
    R.hline(mid, x - 13, x + 13, C.needle);
    R.text(label, x - 12, y - 7, C.dim);
    R.text(String(Math.round(value)), x - 11, mid + 3, C.mint);
  }

  // ----------------------------------------------------------------- panel
  I.drawPanel = function (ac, d, t, opts, off) {
    var panel = ac.panel;
    if (!panel) { return; }
    var scaleY = R.H / 224;
    // Head look slides the whole panel, instruments and all, because that is
    // what a panel a metre away does when you turn your head.
    var ox = off ? off.x : 0, oy = off ? off.y : 0;
    var shape = panel.shape.map(function (p) {
      return { x: p[0] * (R.W / 320) + ox, y: p[1] * scaleY + oy };
    });
    // The panel is a hole cut in the bottom of the screen. When it slides, the
    // ends have to run off both edges or the slide opens a gap of sky where
    // the aeroplane should be.
    if (ox !== 0 || oy !== 0) {
      // The ends run out flat at the height of the coaming, not at the height
      // of the bottom corner, or the extension is a horizontal edge the
      // scanline never crosses and the slide still opens a gap.
      var pad = Math.abs(ox) + R.W;
      var leftY = (shape.length > 1 ? shape[1].y : shape[0].y);
      var rightY = (shape.length > 1 ? shape[shape.length - 2].y : shape[0].y);
      shape = [{ x: -pad, y: leftY }]
        .concat(shape)
        .concat([
          { x: R.W + pad, y: rightY },
          { x: R.W + pad, y: R.H + Math.abs(oy) + 60 },
          { x: -pad, y: R.H + Math.abs(oy) + 60 }
        ]);
    }
    R.fillPoly(shape, C.face);
    // Panel edge highlight, one pixel, so the cut reads as a shape.
    for (var i = 0; i < shape.length - 1; i++) {
      R.line(shape[i].x, shape[i].y, shape[i + 1].x, shape[i + 1].y, C.bezel);
    }
    var g, k;
    for (var j = 0; j < (panel.gauges || []).length; j++) {
      g = panel.gauges[j];
      var gg = { x: g.x * (R.W / 320) + ox, y: g.y * scaleY + oy, r: g.r };
      k = GAUGE[g.k];
      if (k) { k(gg, d, t); }
    }
    for (var m = 0; m < (panel.tapes || []).length; m++) {
      var tp = panel.tapes[m];
      if (tp.k === 'asi') { tape(tp.x * (R.W / 320) + ox, tp.y * scaleY + oy, tp.h, d.airspeed, 20, 'IAS', C.mint); }
      if (tp.k === 'alt') { tape(tp.x * (R.W / 320) + ox, tp.y * scaleY + oy, tp.h, d.altitude, 200, 'ALT', C.mint); }
    }
    for (var s = 0; s < (panel.strips || []).length; s++) {
      var strip = panel.strips[s];
      var sx = strip.x * (R.W / 320) + ox, sy = strip.y * scaleY + oy;
      if (strip.k === 'fuel' && ac.fuelKg) {
        var frac = M.clamp(d.fuel / ac.fuelKg, 0, 1);
        R.frame(sx, sy, strip.w, 6, C.bezel);
        R.rect(sx + 1, sy + 1, Math.round((strip.w - 2) * frac), 4, frac < 0.15 ? C.alert : C.mint);
        R.text('FUEL', sx, sy - 7, C.dim);
      }
      if (strip.k === 'flags') { I.flags(sx, sy, d, opts); }
    }
  };

  I.flags = function (x, y, d, opts) {
    opts = opts || {};
    var items = [];
    if (d.stalled) { items.push(['STALL', C.alert]); }
    if (opts.engineOff) { items.push(['ENG', C.alert]); }
    if (opts.starting) { items.push(['CRANK', C.needle]); }
    if (opts.gear > 0.5) { items.push(['GEAR', C.mint]); }
    if (opts.flap > 0.02) { items.push(['FLAP', C.needle]); }
    if (opts.brake > 0.02) { items.push(['BRK', C.needle]); }
    if (opts.spoiler > 0.02) { items.push(['SPL', C.needle]); }
    if (opts.burner > 0.02) { items.push(['BURN', C.alert]); }
    if (opts.lowFuel) { items.push(['FUEL', C.alert]); }
    var cx = x;
    for (var i = 0; i < items.length; i++) {
      var w = R.textWidth(items[i][0]) + 4;
      R.frame(cx, y, w, 9, C.bezel);
      R.text(items[i][0], cx + 2, y + 2, items[i][1]);
      cx += w + 3;
    }
  };

  // Canopy frame, glare and reflections. Palette tricks only, no blending.
  I.drawCanopy = function (ac, rig, d, panOff) {
    if (!ac.panel || ac.panel.cutTop === undefined) { return; }
    var frameIdx = C.dark;
    // The window posts used to be drawn here as two vertical lines slid by
    // the head look. They are geometry now, in the cockpit interior mesh, so
    // they occlude the world properly and move at their own distance. What is
    // left is the screen edge and the glare on the glass.
    R.rect(0, 0, R.W, 3, frameIdx);
    R.rect(0, 0, 3, R.H, frameIdx);
    R.rect(R.W - 3, 0, 3, R.H, frameIdx);
    if (ac.panel.illegible) { return; }
    var off = Math.round(panOff ? panOff.x * 0.5 : 0);
    // Glare on the upper glass. It brightens whatever is actually behind it,
    // pixel by pixel. The old version sampled one pixel at the left edge of
    // the screen, which by then was the canopy frame, so the glare was a
    // large black and white rectangle bolted to the sky.
    var glareRight = Math.round(R.W * 0.5) + off;
    for (var y = 5; y < 26; y++) {
      var tt = (1 - (y - 5) / 21) * 0.16;
      if (tt <= 0.01) { continue; }
      for (var x = Math.max(4, 4 + off); x < glareRight; x++) {
        if (x < 0 || x >= R.W) { continue; }
        var src = R.get(x, y);
        if (src === frameIdx || src === C.bezel) { continue; }
        // Brighten by one ramp step rather than toward white. Dithering the
        // sky against pure white put a field of white dots in the corner of
        // every forward view.
        var sky0 = P.RAMP.sky.start, sky1 = sky0 + P.RAMP.sky.len - 1;
        var up = (src >= sky0 && src < sky1) ? src + 1 : P.RAMP.white.start;
        if (up === src) { continue; }
        R.px(x, y, P.ditherPick(src, up, tt * 2.2, x, y, 'soft'));
      }
    }
  };

  // --------------------------------------------------------------- chase HUD
  I.drawHUD = function (ac, d, opts) {
    if (!I.hudVisible) { return; }
    var x = 6, y = 6;
    var line = function (s, idx) { R.text(s, x, y, idx); y += 8; };
    line(ac.name, C.hudHi);
    line('IAS ' + AERO.util.pad(d.airspeed, 3) + ' MPS', C.mint);
    line('ALT ' + AERO.util.pad(d.altitude, 4) + ' M', C.mint);
    line('VS  ' + (d.vsi >= 0 ? '+' : '-') + Math.abs(d.vsi).toFixed(1), d.vsi >= 0 ? C.mint : C.needle);
    line('HDG ' + AERO.util.pad(M.deg(d.heading), 3), C.mint);
    if (d.stalled) { line('STALL', C.alert); }
    // Small horizon reference at the top right so the chase view still tells
    // you which way is up.
    var cx = R.W - 34, cy = 20, r = 14;
    var sb = Math.sin(d.bank), cb = Math.cos(d.bank);
    var pitchPx = M.deg(d.pitch) * (r / 45);
    // Sky over ground, in sky and ground colors. It used to be two shades of
    // dark, which is not an attitude indicator, it is a hole.
    var hudSky = P.RAMP.sky.start + 3;
    var hudGnd = P.RAMP.grass.start + 1;
    for (var i = -r; i <= r; i++) {
      var hw = Math.floor(Math.sqrt(Math.max(0, r * r - i * i)));
      for (var j = -hw; j <= hw; j++) {
        var ry = -j * sb + i * cb;
        R.px(cx + j, cy + i, (ry < -pitchPx) ? hudSky : hudGnd);
      }
    }
    R.circle(cx, cy, r, C.hudHi, false);
    R.hline(cy, cx - r + 3, cx + r - 3, C.needle);
    I.flags(R.W - 120, R.H - 12, d, opts);
  };

  // Debug overlay lives behind the in app debug toggle, not a code flag.
  I.drawDebug = function (st, env, stats, fps, extra) {
    var x = 6, y = R.H - 60;
    var put = function (s) { R.text(s, x, y, C.hudHi); y += 7; };
    put('FPS ' + fps.toFixed(0) + '  FACES ' + stats.faces + '/' + stats.drawn);
    put('SPR ' + stats.sprites + '  OVF ' + AERO.raster.overflowCount);
    put('POS ' + st.pos.x.toFixed(0) + ' ' + st.pos.y.toFixed(0) + ' ' + st.pos.z.toFixed(0));
    put('WND ' + env.wind.x.toFixed(1) + ' ' + env.wind.y.toFixed(1) + ' ' + env.wind.z.toFixed(1));
    put('A/B ' + M.deg(st.derived.alpha).toFixed(1) + ' ' + M.deg(st.derived.beta).toFixed(1)
      + '  G ' + st.derived.load.toFixed(1));
    if (extra) { put(extra); }
  };

  // Force vectors, drawn in the chase view under the debug toggle.
  I.drawForces = function (cam, st) {
    var G = AERO.render, V = AERO.vec3;
    var origin = st.pos;
    var pairs = [
      { v: { x: 0, y: -st.ac.massKg * 9.81, z: 0 }, idx: C.warn },
      { v: AERO.vec3.scale(st.accel, st.ac.massKg), idx: C.mint }
    ];
    for (var i = 0; i < pairs.length; i++) {
      var end = V.add(origin, V.scale(pairs[i].v, 0.0012));
      var a = G.toView(cam, origin), b = G.toView(cam, end);
      if (a.z < G.NEAR || b.z < G.NEAR) { continue; }
      var pa = G.project(cam, a), pb = G.project(cam, b);
      R.line(pa.x, pa.y, pb.x, pb.y, pairs[i].idx);
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
