// AERODROME :: src/07-world.js :: v1.4.2
// One valley, one airfield, one river, one town. Hand authored on purpose.
// Depends on 00-core.js, 03-render.js, 06-aircraft.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math, V = AERO.vec3, Q = AERO.quat, G = AERO.render, mk = AERO.aircraft.mk;

  var W = AERO.world = {};

  // The valley is data. Everything below is read from W.params, which is
  // loaded from a world file rather than compiled in. The stock valley is
  // just the world file that ships in the box.
  W.SCHEMA = 1;

  W.STOCK = {
    world: 'AERODROME',
    schema: 1,
    name: 'LONG MEADOW VALLEY',
    terrain: {
      floor: 42,
      ridgeX: -1650, ridgeH: 400, ridgeW: 620,
      shoulderX: 2600, shoulderH: 180, shoulderW: 1100,
      riverBase: 430, riverAmpA: 210, riverPeriodA: 900,
      riverAmpB: 70, riverPeriodB: 310,
      coarseAmp: 46, fineAmp: 9,
      waterDrop: 3.4, channelDepth: 7, channelHalfWidth: 78
    },
    runway: { x: 0, z: 0, halfLen: 500, halfWid: 17, elev: 42, headingDeg: 0 },
    field: { halfX: 260, halfZ: 740 },
    town: { x: 1150, z: 520, r: 420, count: 34, seed: 8171 },
    scatter: { count: 420, seed: 5150, spread: 5200, birds: 14 },
    structures: [
      { type: 'hangar', x: -90, z: 250, rotDeg: 90 },
      { type: 'hangar', x: -90, z: 320, rotDeg: 90 },
      { type: 'tower', x: -70, z: 120, beacon: true },
      { type: 'sock', x: 40, z: 60 },
      { type: 'bridge', z: 400 },
      { type: 'ring', x: -1080, z: -260, radius: 34, tiltDeg: 28 },
      { type: 'ring', x: -980, z: -420, radius: 26, tiltDeg: 75 }
    ],
    views: [
      { name: 'TOWER', x: -70, z: 120, height: 17 },
      { name: 'PAD', x: 46, z: -180, height: 6 },
      { name: 'RIDGE', x: -1180, z: -300, height: 26 }
    ],
    movers: [
      { kind: 'car', road: 'field', speed: 11, offset: 0 },
      { kind: 'car', road: 'field', speed: 9, offset: 0.45 },
      { kind: 'car', road: 'bridge', speed: 14, offset: 0.2 },
      { kind: 'boat', road: 'river', speed: 6, offset: 0.1 }
    ]
  };

  W.params = AERO.util.deepCopy(W.STOCK);

  // Mirrors kept for readability at the call sites. They are refreshed
  // whenever a world is loaded, never edited by hand.
  function refreshMirrors() {
    var p = W.params;
    W.FLOOR = p.terrain.floor;
    W.RIDGE_X = p.terrain.ridgeX;
    W.RIDGE_H = p.terrain.ridgeH;
    W.RIDGE_W = p.terrain.ridgeW;
    W.RUNWAY = p.runway;
    W.TOWN = p.town;
    W.WATER_LEVEL = p.terrain.floor - p.terrain.waterDrop;
  }

  refreshMirrors();

  W.riverX = function (z) {
    var t = W.params.terrain;
    return t.riverBase + t.riverAmpA * Math.sin(z / t.riverPeriodA)
      + t.riverAmpB * Math.sin(z / t.riverPeriodB);
  };

  function ridgeProfile(x) {
    var t = W.params.terrain;
    var d = (x - t.ridgeX) / t.ridgeW;
    return t.ridgeH * Math.exp(-d * d);
  }

  // Base landform without the flattened airfield or the river channel.
  function baseHeight(x, z) {
    var t = W.params.terrain;
    var h = t.floor;
    h += ridgeProfile(x);
    // A second, lower shoulder to the east so the valley reads as a valley.
    var d2 = (x - t.shoulderX) / t.shoulderW;
    h += t.shoulderH * Math.exp(-d2 * d2);
    h += AERO.fbm2(x / 900, z / 900, 4, 7) * t.coarseAmp;
    h += AERO.fbm2(x / 260, z / 260, 3, 19) * t.fineAmp;
    return h;
  }

  W.inRunway = function (x, z) {
    var r = W.RUNWAY;
    return Math.abs(x - r.x) < r.halfWid && Math.abs(z - r.z) < r.halfLen;
  };

  W.inField = function (x, z) {
    var f = W.params.field;
    return Math.abs(x) < f.halfX && Math.abs(z) < f.halfZ;
  };

  W.heightAt = function (x, z) {
    var h = baseHeight(x, z);
    // River channel, carved after the landform.
    var tp = W.params.terrain, fp = W.params.field;
    var rx = W.riverX(z);
    var dr = Math.abs(x - rx);
    if (dr < tp.channelHalfWidth) {
      var t = M.smoothstep(1 - dr / tp.channelHalfWidth);
      h = M.lerp(h, tp.floor - tp.channelDepth, t);
    }
    // Airfield apron, flattened with a soft edge so the ground stays smooth.
    var fx = M.clamp((fp.halfX - Math.abs(x)) / 160, 0, 1);
    var fz = M.clamp((fp.halfZ - Math.abs(z)) / 220, 0, 1);
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
  W.WATER_LEVEL = W.params.terrain.floor - W.params.terrain.waterDrop;

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

  // ---------------------------------------------------------- subdivision
  // Painter order sorts whole polygons, so one long face can only ever be in
  // front of or behind its neighbour, never both. Splitting the big static
  // faces at build time costs nothing at runtime and stops the town and the
  // bridge from swapping over each other as you fly past.
  W.subdivideFace = function (face, maxEdge) {
    var v = face.v;
    if (v.length !== 4) { return [face]; }
    function len(a, b) {
      var dx = a[0] - b[0], dy = a[1] - b[1], dz = a[2] - b[2];
      return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    var nu = Math.min(6, Math.max(1, Math.ceil(Math.max(len(v[0], v[1]), len(v[3], v[2])) / maxEdge)));
    var nv = Math.min(6, Math.max(1, Math.ceil(Math.max(len(v[1], v[2]), len(v[0], v[3])) / maxEdge)));
    if (nu === 1 && nv === 1) { return [face]; }
    function lerp3(a, b, t) {
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    function at(u, w) {
      return lerp3(lerp3(v[0], v[1], u), lerp3(v[3], v[2], u), w);
    }
    var out = [];
    for (var i = 0; i < nu; i++) {
      for (var j = 0; j < nv; j++) {
        var u0 = i / nu, u1 = (i + 1) / nu, w0 = j / nv, w1 = (j + 1) / nv;
        out.push({
          mat: face.mat, twoSided: face.twoSided,
          v: [at(u0, w0), at(u1, w0), at(u1, w1), at(u0, w1)]
        });
      }
    }
    return out;
  };

  W.subdivideMesh = function (mesh, maxEdge) {
    var out = [];
    for (var i = 0; i < mesh.faces.length; i++) {
      out = out.concat(W.subdivideFace(mesh.faces[i], maxEdge));
    }
    return { faces: out };
  };

  W.objects = [];
  // Structure types a world file may name. Anything else is dropped by the
  // validator rather than guessed at.
  var BUILDERS = {
    hangar: function (d) { return hangar(d.x, d.z, M.rad(d.rotDeg || 0)); },
    tower: function (d) {
      var o = tower(d.x, d.z);
      o.beacon = !!d.beacon;
      return o;
    },
    sock: function (d) { return windsockMast(d.x, d.z); },
    bridge: function (d) { return bridge(d.z); },
    ring: function (d) { return ring(d.x, d.z, d.radius, M.rad(d.tiltDeg || 0)); },
    block: function (d) { return block(d.x, d.z, d.w, d.h, d.d, d.mat); }
  };
  W.BUILDERS = BUILDERS;

  W.build = function () {
    var p = W.params;
    W.objects = [];
    for (var si = 0; si < p.structures.length; si++) {
      var spec = p.structures[si];
      var make = BUILDERS[spec.type];
      if (!make) { continue; }
      var built = make(spec);
      built.spec = spec;
      W.objects.push(built);
    }
    // The town. Low blocky buildings on a loose grid, nothing taller than the
    // tower so the skyline stays readable at 320 by 224.
    var rnd = AERO.rng(p.town.seed);
    for (var i = 0; i < p.town.count; i++) {
      var ang = rnd() * Math.PI * 2, rad = Math.sqrt(rnd()) * p.town.r;
      var x = p.town.x + Math.cos(ang) * rad;
      var z = p.town.z + Math.sin(ang) * rad;
      var w = 12 + rnd() * 20, d = 12 + rnd() * 20, h = 7 + rnd() * 16;
      var b = block(x, z, w, h, d, rnd() > 0.5 ? 'hull' : 'rock');
      b.windows = { w: w, h: h, d: d, seed: (i * 37 + 11) };
      W.objects.push(b);
    }
    // Split the large static geometry once, here, and never again. The split
    // mesh is kept alongside the plain one and used only up close, where
    // sorting errors are visible and the extra faces are affordable.
    for (var k = 0; k < W.objects.length; k++) {
      if (W.objects[k].sock) { continue; }
      W.objects[k].meshFine = W.subdivideMesh(W.objects[k].mesh, 14);
    }
    W.scatter = [];
    var sc = p.scatter;
    var rnd2 = AERO.rng(sc.seed);
    for (var j = 0; j < sc.count; j++) {
      var sx = (rnd2() - 0.5) * sc.spread, sz = (rnd2() - 0.5) * sc.spread;
      if (W.inField(sx, sz)) { continue; }
      var h2 = W.heightAt(sx, sz);
      if (h2 > W.FLOOR + 260) { continue; }
      if (Math.abs(sx - W.riverX(sz)) < 80) { continue; }
      W.scatter.push({ x: sx, z: sz, y: h2, cell: rnd2() > 0.32 ? 'tree' : 'bush', flip: rnd2() > 0.5 });
    }
    W.birds = [];
    for (var bi = 0; bi < sc.birds; bi++) {
      W.birds.push({
        x: (rnd2() - 0.5) * 2400, z: (rnd2() - 0.5) * 2400,
        y: W.FLOOR + 60 + rnd2() * 220, phase: rnd2() * 6.28, r: 90 + rnd2() * 160
      });
    }
    W.buildMovers();
    return W;
  };

  // ------------------------------------------------------- world file I/O
  // A world file is validated exactly the way the settings file is: field by
  // field, with anything unrecognized dropped rather than trusted.
  function num(v, lo, hi, dflt) {
    if (typeof v !== 'number' || !isFinite(v)) { return dflt; }
    return Math.min(hi, Math.max(lo, v));
  }

  W.validateWorld = function (input) {
    var out = AERO.util.deepCopy(W.STOCK);
    if (!input || typeof input !== 'object') { return { ok: false, reason: 'Not an object', data: out }; }
    if (input.world !== 'AERODROME') { return { ok: false, reason: 'Not an AERODROME world file', data: out }; }
    if (typeof input.schema !== 'number') { return { ok: false, reason: 'Missing schema version', data: out }; }
    if (input.schema > W.SCHEMA) {
      return { ok: false, reason: 'World is schema ' + input.schema + ', this build reads ' + W.SCHEMA, data: out };
    }
    if (typeof input.name === 'string') { out.name = input.name.slice(0, 48).toUpperCase(); }

    var t = input.terrain || {}, d = out.terrain;
    d.floor = num(t.floor, -200, 2000, d.floor);
    d.ridgeX = num(t.ridgeX, -20000, 20000, d.ridgeX);
    d.ridgeH = num(t.ridgeH, 0, 4000, d.ridgeH);
    d.ridgeW = num(t.ridgeW, 20, 8000, d.ridgeW);
    d.shoulderX = num(t.shoulderX, -20000, 20000, d.shoulderX);
    d.shoulderH = num(t.shoulderH, 0, 4000, d.shoulderH);
    d.shoulderW = num(t.shoulderW, 20, 8000, d.shoulderW);
    d.riverBase = num(t.riverBase, -8000, 8000, d.riverBase);
    d.riverAmpA = num(t.riverAmpA, 0, 2000, d.riverAmpA);
    d.riverPeriodA = num(t.riverPeriodA, 40, 20000, d.riverPeriodA);
    d.riverAmpB = num(t.riverAmpB, 0, 2000, d.riverAmpB);
    d.riverPeriodB = num(t.riverPeriodB, 40, 20000, d.riverPeriodB);
    d.coarseAmp = num(t.coarseAmp, 0, 400, d.coarseAmp);
    d.fineAmp = num(t.fineAmp, 0, 200, d.fineAmp);
    d.waterDrop = num(t.waterDrop, 0, 60, d.waterDrop);
    d.channelDepth = num(t.channelDepth, 0, 120, d.channelDepth);
    d.channelHalfWidth = num(t.channelHalfWidth, 4, 600, d.channelHalfWidth);

    var r = input.runway || {};
    out.runway = {
      x: num(r.x, -20000, 20000, out.runway.x),
      z: num(r.z, -20000, 20000, out.runway.z),
      halfLen: num(r.halfLen, 60, 4000, out.runway.halfLen),
      halfWid: num(r.halfWid, 4, 200, out.runway.halfWid),
      elev: num(r.elev, -200, 2000, d.floor),
      headingDeg: num(r.headingDeg, 0, 360, 0)
    };
    var f = input.field || {};
    out.field = {
      halfX: num(f.halfX, 40, 4000, out.field.halfX),
      halfZ: num(f.halfZ, 40, 4000, out.field.halfZ)
    };
    var tw = input.town || {};
    out.town = {
      x: num(tw.x, -20000, 20000, out.town.x),
      z: num(tw.z, -20000, 20000, out.town.z),
      r: num(tw.r, 20, 4000, out.town.r),
      count: num(tw.count, 0, 200, out.town.count) | 0,
      seed: num(tw.seed, 0, 4294967295, out.town.seed) | 0
    };
    var sc = input.scatter || {};
    out.scatter = {
      count: num(sc.count, 0, 3000, out.scatter.count) | 0,
      seed: num(sc.seed, 0, 4294967295, out.scatter.seed) | 0,
      spread: num(sc.spread, 200, 40000, out.scatter.spread),
      birds: num(sc.birds, 0, 200, out.scatter.birds) | 0
    };

    if (Array.isArray(input.structures)) {
      out.structures = [];
      input.structures.slice(0, 400).forEach(function (spec) {
        if (!spec || typeof spec !== 'object') { return; }
        if (!BUILDERS[spec.type]) { return; }
        var clean = { type: spec.type };
        // The bridge finds its own x from the river, so it does not carry one.
        if (spec.type !== 'bridge') { clean.x = num(spec.x, -20000, 20000, 0); }
        clean.z = num(spec.z, -20000, 20000, 0);
        if (spec.type === 'ring') {
          clean.radius = num(spec.radius, 4, 400, 24);
          clean.tiltDeg = num(spec.tiltDeg, -180, 180, 0);
        }
        if (spec.type === 'hangar') { clean.rotDeg = num(spec.rotDeg, -360, 360, 0); }
        if (spec.type === 'tower') { clean.beacon = spec.beacon !== false; }
        if (spec.type === 'block') {
          clean.w = num(spec.w, 1, 400, 12);
          clean.h = num(spec.h, 1, 300, 10);
          clean.d = num(spec.d, 1, 400, 12);
          clean.mat = (spec.mat === 'rock' || spec.mat === 'hull' || spec.mat === 'accent') ? spec.mat : 'hull';
        }
        out.structures.push(clean);
      });
    }

    if (Array.isArray(input.views)) {
      out.views = [];
      input.views.slice(0, 12).forEach(function (v) {
        if (!v || typeof v !== 'object') { return; }
        out.views.push({
          name: (typeof v.name === 'string' ? v.name : 'VIEW').slice(0, 12).toUpperCase(),
          x: num(v.x, -20000, 20000, 0),
          z: num(v.z, -20000, 20000, 0),
          height: num(v.height, 1, 400, 16)
        });
      });
      if (!out.views.length) { out.views = AERO.util.deepCopy(W.STOCK.views); }
    }

    if (Array.isArray(input.movers)) {
      out.movers = [];
      input.movers.slice(0, 40).forEach(function (m) {
        if (!m || typeof m !== 'object') { return; }
        if (m.kind !== 'car' && m.kind !== 'boat') { return; }
        if (['field', 'bridge', 'river'].indexOf(m.road) < 0) { return; }
        out.movers.push({
          kind: m.kind, road: m.road,
          speed: num(m.speed, 0, 60, 10),
          offset: num(m.offset, 0, 1, 0)
        });
      });
    }
    return { ok: true, reason: '', data: out };
  };

  W.exportWorld = function () { return JSON.stringify(W.params, null, 2); };

  W.loadWorld = function (input) {
    var res = W.validateWorld(input);
    if (!res.ok) { return res; }
    W.params = res.data;
    refreshMirrors();
    W.build();
    return res;
  };

  W.resetWorld = function () {
    W.params = AERO.util.deepCopy(W.STOCK);
    refreshMirrors();
    W.build();
    return W.params;
  };

  // -------------------------------------------------------------- movers
  // Cars on the field road and the bridge, a boat on the river. Each follows
  // a parametric path, so there is no traffic model to go wrong.
  W.movers = [];

  W.buildMovers = function () {
    W.movers = [];
    var list = W.params.movers || [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      W.movers.push({
        kind: m.kind, road: m.road, speed: m.speed || 10,
        t: m.offset || 0, x: 0, y: 0, z: 0, heading: 0
      });
    }
    W.tickMovers(0);
    return W.movers;
  };

  // Path position for a mover at parameter t in zero to one.
  W.moverPoint = function (road, t) {
    var r = W.RUNWAY, p = W.params;
    if (road === 'bridge') {
      var bz = 400, bx = W.riverX(bz);
      var span = 260;
      return { x: bx - span / 2 + span * t, y: W.FLOOR + 11.6, z: bz };
    }
    if (road === 'river') {
      var rz = -1400 + 2800 * t;
      return { x: W.riverX(rz), y: W.WATER_LEVEL + 0.5, z: rz };
    }
    // The field road: a loop around the apron east of the runway.
    var a = t * Math.PI * 2;
    var fx = r.x + 150 + Math.cos(a) * 90;
    var fz = r.z + Math.sin(a) * 420;
    return { x: fx, y: W.heightAt(fx, fz) + 0.8, z: fz };
  };

  W.tickMovers = function (dt) {
    for (var i = 0; i < W.movers.length; i++) {
      var m = W.movers[i];
      var loopLen = (m.road === 'field') ? 1900 : (m.road === 'bridge' ? 260 : 2800);
      m.t += (m.speed * dt) / loopLen;
      while (m.t > 1) { m.t -= 1; }
      while (m.t < 0) { m.t += 1; }
      var p0 = W.moverPoint(m.road, m.t);
      var p1 = W.moverPoint(m.road, (m.t + 0.004) % 1);
      m.x = p0.x; m.y = p0.y; m.z = p0.z;
      m.heading = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    }
    return W.movers;
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
            ], 'water', { light: light, ambient: amb * 0.9 + 0.08 });
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
      ], 'mark', { light: light, ambient: 1, noHaze: true, bias: 1.5 });
    }
    [-1, 1].forEach(function (s) {
      for (var k = -3; k <= 3; k++) {
        if (k === 0) { continue; }
        var zx = r.z + s * (r.halfLen - 26);
        G.submitFace(cam, [
          { x: k * 4 - 1.4, y: y + 0.03, z: zx - 16 }, { x: k * 4 - 1.4, y: y + 0.03, z: zx + 16 },
          { x: k * 4 + 1.4, y: y + 0.03, z: zx + 16 }, { x: k * 4 + 1.4, y: y + 0.03, z: zx - 16 }
        ], 'mark', { light: light, ambient: 1, noHaze: true, bias: 1.5 });
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
      var mesh = (d2 < 700 * 700 && o.meshFine) ? o.meshFine : o.mesh;
      G.submitMesh(cam, mesh, o.pos, o.quat, { light: light, ambient: amb });
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
    W.emitMovers(cam, env, t);
    var list = W.scatter, i;
    var order = (frame & 1) ? 1 : -1;
    var start = order > 0 ? 0 : list.length - 1;
    var count = 0;
    for (i = start; i >= 0 && i < list.length && count < 260; i += order) {
      var s = list[i];
      var dx = s.x - cam.pos.x, dy = s.y - cam.pos.y, dz = s.z - cam.pos.z;
      if (dx * dx + dy * dy + dz * dz > 1500 * 1500) { continue; }
      count++;
      // Anchored on the ground. The old anchor sat six metres up, which put
      // every tree in the valley on a six metre invisible stalk.
      G.drawBillboard(cam, s.cell, { x: s.x, y: s.y, z: s.z }, s.flip);
    }
    for (i = 0; i < W.birds.length; i++) {
      var b = W.birds[i];
      var a = t * 0.4 + b.phase;
      G.drawBillboard(cam, 'bird', {
        x: b.x + Math.cos(a) * b.r, y: b.y + Math.sin(a * 2) * 8, z: b.z + Math.sin(a) * b.r
      }, Math.cos(a) > 0);
    }
  };

  // --------------------------------------------------------------- lights
  // Night lighting. The sky ramp already goes dark at dusk. This is the
  // ground answering. Everything here is a flat unshaded face so it reads as
  // a light source rather than as a surface catching one.
  W.nightFactor = function (env) {
    var hour = (env && env.hour !== undefined) ? env.hour : 12;
    // Full night before 5.4 and after 19.4, with a half hour of twilight.
    var dawn = M.clamp((6.4 - hour) / 1.0, 0, 1);
    var dusk = M.clamp((hour - 18.4) / 1.0, 0, 1);
    return Math.max(dawn, dusk);
  };

  function lampQuad(cam, x, y, z, size, mat) {
    var h = size * 0.5;
    G.submitFace(cam, [
      { x: x - h, y: y, z: z - h }, { x: x - h, y: y, z: z + h },
      { x: x + h, y: y, z: z + h }, { x: x + h, y: y, z: z - h }
    ], mat, { twoSided: true, noHaze: true, ambient: 1, bias: 2 });
  }

  W.emitLights = function (cam, env, t) {
    var night = W.nightFactor(env);
    if (night < 0.15) { return 0; }
    var r = W.RUNWAY, count = 0, i;
    // Runway edge lights, both sides, plus green and red ends.
    var step = r.halfLen / 9;
    for (i = -9; i <= 9; i++) {
      var lz = r.z + i * step;
      var dz = lz - cam.pos.z, dx = r.x - cam.pos.x;
      if (dx * dx + dz * dz > 2600 * 2600) { continue; }
      lampQuad(cam, r.x - r.halfWid - 2, r.elev + 0.7, lz, 1.6, 'lamp');
      lampQuad(cam, r.x + r.halfWid + 2, r.elev + 0.7, lz, 1.6, 'lamp');
      count += 2;
    }
    lampQuad(cam, r.x, r.elev + 0.7, r.z - r.halfLen - 3, 2.4, 'window');
    lampQuad(cam, r.x, r.elev + 0.7, r.z + r.halfLen + 3, 2.4, 'beacon');
    count += 2;

    // The rotating beacon on the tower. One face, visible only while the lamp
    // is pointing your way, which is what a beacon actually is.
    for (i = 0; i < W.objects.length; i++) {
      var o = W.objects[i];
      if (!o.beacon) { continue; }
      var sweep = (t * 1.1) % (Math.PI * 2);
      var toCam = Math.atan2(cam.pos.x - o.pos.x, cam.pos.z - o.pos.z);
      var delta = Math.abs(M.wrapPi(sweep - toCam));
      if (delta < 0.45) {
        lampQuad(cam, o.pos.x, o.pos.y + 19.6, o.pos.z, 3.2 * (1 - delta / 0.45), 'beacon');
        count++;
      }
    }

    // Town windows. A handful per building, lit on a fixed pattern so the
    // town has a shape at night instead of being a hole in the sky.
    for (i = 0; i < W.objects.length; i++) {
      var b = W.objects[i];
      if (!b.windows) { continue; }
      var bdx = b.pos.x - cam.pos.x, bdz = b.pos.z - cam.pos.z;
      if (bdx * bdx + bdz * bdz > 1400 * 1400) { continue; }
      var wspec = b.windows;
      var rnd = AERO.rng(wspec.seed);
      var rows = Math.max(1, Math.floor(wspec.h / 5));
      for (var row = 0; row < rows; row++) {
        if (rnd() > 0.62) { continue; }
        var wy = b.pos.y + 3 + row * 4.5;
        var side = rnd() > 0.5 ? 1 : -1;
        lampQuad(cam, b.pos.x + side * (wspec.w / 2 + 0.2), wy, b.pos.z + (rnd() - 0.5) * wspec.d * 0.6, 1.5, 'window');
        count++;
      }
    }
    return count;
  };

  // Cars and the boat, drawn as sprite cells so they cost the sprite budget
  // rather than the polygon budget.
  W.emitMovers = function (cam, env, t) {
    for (var i = 0; i < W.movers.length; i++) {
      var m = W.movers[i];
      var dx = m.x - cam.pos.x, dz = m.z - cam.pos.z;
      if (dx * dx + dz * dz > 2200 * 2200) { continue; }
      G.drawBillboard(cam, m.kind === 'boat' ? 'bush' : 'traffic',
        { x: m.x, y: m.y + 1.6, z: m.z }, m.heading > 0);
    }
  };

  W.emit = function (cam, env, t, frame) {
    W.emitTerrain(cam, env);
    W.emitRunway(cam, env);
    W.emitObjects(cam, env, t);
    W.emitLights(cam, env, t);
  };

  W.build();

})(typeof window !== 'undefined' ? window : globalThis);
