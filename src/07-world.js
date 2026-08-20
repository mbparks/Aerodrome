// AERODROME :: src/07-world.js :: v1.0.0
// One valley, one airfield, one river, one town. Hand authored on purpose.
// Depends on 00-core.js, 03-render.js, 06-aircraft.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math, V = AERO.vec3, Q = AERO.quat, G = AERO.render, mk = AERO.aircraft.mk;

  var W = AERO.world = {};

  W.FLOOR = 42;             // valley floor elevation
  W.RIDGE_X = -1650;        // ridge line runs north to south, west of the field
  W.RIDGE_H = 400;
  W.RIDGE_W = 620;
  W.RUNWAY = { x: 0, z: 0, halfLen: 500, halfWid: 17, elev: 42, headingDeg: 0 };
  W.TOWN = { x: 1150, z: 520, r: 420 };

  W.riverX = function (z) { return 430 + 210 * Math.sin(z / 900) + 70 * Math.sin(z / 310); };

  function ridgeProfile(x) {
    var d = (x - W.RIDGE_X) / W.RIDGE_W;
    return W.RIDGE_H * Math.exp(-d * d);
  }

  // Base landform without the flattened airfield or the river channel.
  function baseHeight(x, z) {
    var h = W.FLOOR;
    h += ridgeProfile(x);
    // A second, lower shoulder to the east so the valley reads as a valley.
    var d2 = (x - 2600) / 1100;
    h += 180 * Math.exp(-d2 * d2);
    h += AERO.fbm2(x / 900, z / 900, 4, 7) * 46;
    h += AERO.fbm2(x / 260, z / 260, 3, 19) * 9;
    return h;
  }

  W.inRunway = function (x, z) {
    var r = W.RUNWAY;
    return Math.abs(x - r.x) < r.halfWid && Math.abs(z - r.z) < r.halfLen;
  };

  W.inField = function (x, z) {
    return Math.abs(x) < 260 && Math.abs(z) < 740;
  };

  W.heightAt = function (x, z) {
    var h = baseHeight(x, z);
    // River channel, carved after the landform.
    var rx = W.riverX(z);
    var dr = Math.abs(x - rx);
    if (dr < 78) {
      var t = M.smoothstep(1 - dr / 78);
      h = M.lerp(h, W.FLOOR - 7, t);
    }
    // Airfield apron, flattened with a soft edge so the ground stays smooth.
    var fx = M.clamp((260 - Math.abs(x)) / 160, 0, 1);
    var fz = M.clamp((740 - Math.abs(z)) / 220, 0, 1);
    var f = M.smoothstep(fx) * M.smoothstep(fz);
    if (f > 0) { h = M.lerp(h, W.RUNWAY.elev, f); }
    return h;
  };

  W.normalAt = function (x, z) {
    var e = 6;
    var hL = W.heightAt(x - e, z), hR = W.heightAt(x + e, z);
    var hD = W.heightAt(x, z - e), hU = W.heightAt(x, z + e);
    return V.norm({ x: (hL - hR) / (2 * e), y: 1, z: (hD - hU) / (2 * e) });
  };

  W.materialAt = function (x, z, h) {
    if (W.inRunway(x, z)) { return 'tarmac'; }
    var rx = W.riverX(z);
    if (Math.abs(x - rx) < 62) { return 'water'; }
    if (h > W.FLOOR + 250) { return 'rock'; }
    var n = W.normalAt(x, z);
    if (n.y < 0.82) { return 'rock'; }
    return 'grass';
  };

  // Water is drawn as a flat sheet so it reads as water, not as a ditch.
  W.WATER_LEVEL = W.FLOOR - 3.4;

  // ------------------------------------------------------------- structures
  function hangar(x, z, rotY) {
    var faces = [].concat(
      mk.box(0, 4.4, 0, 16, 4.4, 11, 'hull'),
      mk.box(0, 9.4, 0, 16.4, 1.2, 11.4, 'accent'),
      mk.box(16.1, 3.2, 0, 0.2, 3.2, 6, 'dark')
    );
    return { mesh: { faces: faces }, pos: V.make(x, W.heightAt(x, z), z), quat: Q.fromEuler(rotY || 0, 0, 0), r: 24 };
  }

  function tower(x, z) {
    var faces = [].concat(
      mk.box(0, 7, 0, 3.2, 7, 3.2, 'hull'),
      mk.box(0, 15.4, 0, 4.6, 1.6, 4.6, 'glass'),
      mk.box(0, 17.4, 0, 5.0, 0.5, 5.0, 'accent'),
      mk.box(0, 19.4, 0, 0.2, 2, 0.2, 'dark')
    );
    return { mesh: { faces: faces }, pos: V.make(x, W.heightAt(x, z), z), quat: Q.identity(), r: 22 };
  }

  function block(x, z, w, h, d, mat) {
    return {
      mesh: { faces: [].concat(mk.box(0, h / 2, 0, w / 2, h / 2, d / 2, mat || 'hull'),
        mk.box(0, h + 0.4, 0, w / 2 + 0.5, 0.4, d / 2 + 0.5, 'rock')) },
      pos: V.make(x, W.heightAt(x, z), z), quat: Q.identity(), r: Math.max(w, d, h) + 4
    };
  }

  function bridge(z) {
    var x = W.riverX(z);
    var faces = [].concat(
      mk.box(0, 0, 0, 96, 1.2, 6, 'tarmac'),
      mk.box(-40, -6, 0, 3, 6, 6, 'rock'),
      mk.box(40, -6, 0, 3, 6, 6, 'rock'),
      mk.box(0, 2.6, 6.2, 96, 1.6, 0.3, 'accent'),
      mk.box(0, 2.6, -6.2, 96, 1.6, 0.3, 'accent')
    );
    return { mesh: { faces: faces }, pos: V.make(x, W.FLOOR + 11, z), quat: Q.identity(), r: 100, flyUnder: true };
  }

  // The oddity worth flying through. A standing ring on the ridge shoulder.
  function ring(x, z, radius, tilt) {
    var faces = [], seg = 14, thick = 2.2;
    for (var i = 0; i < seg; i++) {
      var a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2;
      var p0 = [0, Math.sin(a0) * radius, Math.cos(a0) * radius];
      var p1 = [0, Math.sin(a1) * radius, Math.cos(a1) * radius];
      faces.push({ mat: (i % 2) ? 'accent' : 'white', twoSided: true, v: [
        [p0[0] - thick, p0[1], p0[2]], [p1[0] - thick, p1[1], p1[2]],
        [p1[0] + thick, p1[1], p1[2]], [p0[0] + thick, p0[1], p0[2]]
      ] });
    }
    faces = faces.concat(mk.box(0, -radius - 6, 0, 1.6, 6, 1.6, 'rock'));
    return {
      mesh: { faces: faces },
      pos: V.make(x, W.heightAt(x, z) + radius + 12, z),
      quat: Q.fromEuler(tilt || 0, 0, 0), r: radius + 14, flyThrough: true
    };
  }

  function windsockMast(x, z) {
    var faces = mk.box(0, 5, 0, 0.25, 5, 0.25, 'dark');
    return { mesh: { faces: faces }, pos: V.make(x, W.heightAt(x, z), z), quat: Q.identity(), r: 10, sock: true };
  }

  W.objects = [];
  W.build = function () {
    W.objects = [
      hangar(-90, 250, M.rad(90)),
      hangar(-90, 320, M.rad(90)),
      tower(-70, 120),
      windsockMast(40, 60),
      bridge(400),
      ring(-1080, -260, 34, M.rad(28)),
      ring(-980, -420, 26, M.rad(75))
    ];
    // The town. Low blocky buildings on a loose grid, nothing taller than the
    // tower so the skyline stays readable at 320 by 224.
    var rnd = AERO.rng(8171);
    for (var i = 0; i < 34; i++) {
      var ang = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * W.TOWN.r;
      var x = W.TOWN.x + Math.cos(ang) * rad;
      var z = W.TOWN.z + Math.sin(ang) * rad;
      var w = 12 + rnd() * 20, d = 12 + rnd() * 20, h = 7 + rnd() * 16;
      W.objects.push(block(x, z, w, h, d, rnd() > 0.5 ? 'hull' : 'rock'));
    }
    W.scatter = [];
    var rnd2 = AERO.rng(5150);
    for (var j = 0; j < 420; j++) {
      var sx = (rnd2() - 0.5) * 5200, sz = (rnd2() - 0.5) * 5200;
      if (W.inField(sx, sz)) { continue; }
      var h2 = W.heightAt(sx, sz);
      if (h2 > W.FLOOR + 260) { continue; }
      if (Math.abs(sx - W.riverX(sz)) < 80) { continue; }
      W.scatter.push({ x: sx, z: sz, y: h2, cell: rnd2() > 0.32 ? 'tree' : 'bush', flip: rnd2() > 0.5 });
    }
    W.birds = [];
    for (var b = 0; b < 14; b++) {
      W.birds.push({
        x: (rnd2() - 0.5) * 2400, z: (rnd2() - 0.5) * 2400,
        y: W.FLOOR + 60 + rnd2() * 220, phase: rnd2() * 6.28, r: 90 + rnd2() * 160
      });
    }
    return W;
  };

  // ------------------------------------------------------------- emission
  // Two bands of terrain tiles. Near band is fine, far band is coarse, and
  // everything outside the far band is the ground scrollplane.
  var BANDS = [
    { tile: 110, radius: 1000, near: 0 },
    { tile: 440, radius: 3800, near: 1000 }
  ];

  function tileMaterial(x, z, h) { return W.materialAt(x, z, h); }

  W.emitTerrain = function (cam, env) {
    var light = env.sunDir, amb = env.ambient;
    for (var b = 0; b < BANDS.length; b++) {
      var band = BANDS[b], t = band.tile;
      var n = Math.ceil(band.radius / t);
      var ox = Math.floor(cam.pos.x / t), oz = Math.floor(cam.pos.z / t);
      for (var i = -n; i <= n; i++) {
        for (var j = -n; j <= n; j++) {
          var gx = (ox + i) * t, gz = (oz + j) * t;
          var cxp = gx + t * 0.5, czp = gz + t * 0.5;
          var dx = cxp - cam.pos.x, dz = czp - cam.pos.z;
          var dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > band.radius || dist < band.near - t) { continue; }
          // Cheap cone cull. Anything well behind the camera is skipped.
          var ahead = dx * cam.fwd.x + dz * cam.fwd.z;
          if (ahead < -t * 2 && dist > t * 2) { continue; }
          var h00 = W.heightAt(gx, gz), h10 = W.heightAt(gx + t, gz);
          var h11 = W.heightAt(gx + t, gz + t), h01 = W.heightAt(gx, gz + t);
          var hc = (h00 + h10 + h11 + h01) * 0.25;
          var mat = tileMaterial(cxp, czp, hc);
          if (mat === 'water') {
            var wl = W.WATER_LEVEL;
            G.submitFace(cam, [
              { x: gx, y: wl, z: gz }, { x: gx, y: wl, z: gz + t },
              { x: gx + t, y: wl, z: gz + t }, { x: gx + t, y: wl, z: gz }
            ], 'water', { light: light, ambient: amb + 0.15 });
            continue;
          }
          G.submitFace(cam, [
            { x: gx, y: h00, z: gz }, { x: gx, y: h01, z: gz + t },
            { x: gx + t, y: h11, z: gz + t }, { x: gx + t, y: h10, z: gz }
          ], mat, { light: light, ambient: amb, tint: (AERO.noise2(gx * 0.01, gz * 0.01, 3) * 0.07) });
        }
      }
    }
  };

  W.emitRunway = function (cam, env) {
    var r = W.RUNWAY, y = r.elev + 0.06, light = env.sunDir, amb = env.ambient;
    G.submitFace(cam, [
      { x: r.x - r.halfWid, y: y, z: r.z - r.halfLen },
      { x: r.x - r.halfWid, y: y, z: r.z + r.halfLen },
      { x: r.x + r.halfWid, y: y, z: r.z + r.halfLen },
      { x: r.x + r.halfWid, y: y, z: r.z - r.halfLen }
    ], 'tarmac', { light: light, ambient: amb + 0.2, noHaze: true });
    // Centerline dashes and the two thresholds.
    for (var i = -9; i <= 9; i++) {
      var z0 = r.z + i * 52 - 14, z1 = z0 + 28;
      G.submitFace(cam, [
        { x: -1.1, y: y + 0.03, z: z0 }, { x: -1.1, y: y + 0.03, z: z1 },
        { x: 1.1, y: y + 0.03, z: z1 }, { x: 1.1, y: y + 0.03, z: z0 }
      ], 'mark', { light: light, ambient: 1, noHaze: true });
    }
    [-1, 1].forEach(function (s) {
      for (var k = -3; k <= 3; k++) {
        if (k === 0) { continue; }
        var zx = r.z + s * (r.halfLen - 26);
        G.submitFace(cam, [
          { x: k * 4 - 1.4, y: y + 0.03, z: zx - 16 }, { x: k * 4 - 1.4, y: y + 0.03, z: zx + 16 },
          { x: k * 4 + 1.4, y: y + 0.03, z: zx + 16 }, { x: k * 4 + 1.4, y: y + 0.03, z: zx - 16 }
        ], 'mark', { light: light, ambient: 1, noHaze: true });
      }
    });
  };

  W.emitObjects = function (cam, env, t) {
    var light = env.sunDir, amb = env.ambient;
    for (var i = 0; i < W.objects.length; i++) {
      var o = W.objects[i];
      var dx = o.pos.x - cam.pos.x, dz = o.pos.z - cam.pos.z;
      var d2 = dx * dx + dz * dz;
      if (d2 > 3200 * 3200) { continue; }
      if (o.sock) {
        W.emitSock(cam, env, o, t);
        continue;
      }
      G.submitMesh(cam, o.mesh, o.pos, o.quat, { light: light, ambient: amb });
    }
  };

  // The windsock reads the wind, which is the only honest instrument outside
  // the cockpit.
  W.emitSock = function (cam, env, o, t) {
    G.submitMesh(cam, o.mesh, o.pos, o.quat, { light: env.sunDir, ambient: env.ambient });
    var w = env.wind || V.zero();
    var sp = Math.sqrt(w.x * w.x + w.z * w.z);
    var dir = sp > 0.2 ? { x: -w.x / sp, y: 0, z: -w.z / sp } : { x: 1, y: 0, z: 0 };
    var droop = M.clamp(1 - sp / 12, 0, 1) * 3.2;
    var base = { x: o.pos.x, y: o.pos.y + 10, z: o.pos.z };
    var len = 5.5;
    var lat = V.norm(V.cross({ x: 0, y: 1, z: 0 }, dir));
    for (var s = 0; s < 4; s++) {
      var t0 = s / 4, t1 = (s + 1) / 4;
      var r0 = 1.1 * (1 - t0 * 0.55), r1 = 1.1 * (1 - t1 * 0.55);
      var flap = Math.sin(t * 6 + s) * 0.25 * M.clamp(sp / 8, 0, 1);
      var p0 = {
        x: base.x - dir.x * len * t0, y: base.y - droop * t0 * t0 + flap,
        z: base.z - dir.z * len * t0
      };
      var p1 = {
        x: base.x - dir.x * len * t1, y: base.y - droop * t1 * t1 + flap,
        z: base.z - dir.z * len * t1
      };
      var mat = (s % 2) ? 'white' : 'red';
      G.submitFace(cam, [
        { x: p0.x + lat.x * r0, y: p0.y + r0, z: p0.z + lat.z * r0 },
        { x: p1.x + lat.x * r1, y: p1.y + r1, z: p1.z + lat.z * r1 },
        { x: p1.x - lat.x * r1, y: p1.y - r1, z: p1.z - lat.z * r1 },
        { x: p0.x - lat.x * r0, y: p0.y - r0, z: p0.z - lat.z * r0 }
      ], mat, { light: env.sunDir, ambient: 1, twoSided: true });
    }
  };

  // Sprite plane. Trees, bushes and circling birds, subject to the per
  // scanline budget, which is why the far treeline flickers.
  W.emitSprites = function (cam, env, t, frame) {
    var list = W.scatter, i;
    var order = (frame & 1) ? 1 : -1;
    var start = order > 0 ? 0 : list.length - 1;
    var count = 0;
    for (i = start; i >= 0 && i < list.length && count < 260; i += order) {
      var s = list[i];
      var dx = s.x - cam.pos.x, dz = s.z - cam.pos.z;
      if (dx * dx + dz * dz > 1500 * 1500) { continue; }
      count++;
      G.drawBillboard(cam, s.cell, { x: s.x, y: s.y + 6, z: s.z }, s.flip);
    }
    for (i = 0; i < W.birds.length; i++) {
      var b = W.birds[i];
      var a = t * 0.4 + b.phase;
      G.drawBillboard(cam, 'bird', {
        x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a * 2) * 8, z: b.z + Math.sin(a) * b.r
      }, Math.cos(a) > 0);
    }
  };

  W.emit = function (cam, env, t, frame) {
    W.emitTerrain(cam, env);
    W.emitRunway(cam, env);
    W.emitObjects(cam, env, t);
  };

  W.build();

})(typeof window !== 'undefined' ? window : globalThis);
