// AERODROME :: src/07-world.js :: v1.9.0
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
      { type: 'ring', x: -980, z: -420, radius: 26, tiltDeg: 75 },
      { type: 'barn', x: 620, z: -180, rotDeg: 20 },
      { type: 'barn', x: 1520, z: 900, rotDeg: -35 },
      { type: 'silo', x: 648, z: -206 },
      { type: 'silo', x: 664, z: -212 },
      { type: 'watertower', x: 1010, z: 300 },
      { type: 'church', x: 1180, z: 470, rotDeg: 12 },
      { type: 'mast', x: -420, z: 980, height: 52 },
      { type: 'powerline', x: 300, z: -900, rotDeg: 78, count: 12, span: 95 },
      { type: 'fence', x: 250, z: -140, rotDeg: 0, length: 320 },
      { type: 'fence', x: 250, z: -140, rotDeg: 90, length: 260 }
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

  // ---------------------------------------------------------- drainage
  // Fractal noise has no drainage, which is why it reads as lumps rather than
  // as land. One flow accumulation pass at build time routes water downhill,
  // and where a lot of water passes, the ground is lower. Gullies join,
  // because that is what flow does. Built once, sampled bilinearly.
  W.EROSION = { n: 128, span: 10000, depth: 26, grid: null };

  W.buildErosion = function () {
    var e = W.EROSION, n = e.n, cell = e.span / n;
    var base = new Float32Array(n * n);
    var flow = new Float32Array(n * n);
    var order = new Int32Array(n * n);
    var i, j, k;
    for (j = 0; j < n; j++) {
      for (i = 0; i < n; i++) {
        var wx = (i - n / 2) * cell, wz = (j - n / 2) * cell;
        base[j * n + i] = baseHeight(wx, wz);
        flow[j * n + i] = 1;
        order[j * n + i] = j * n + i;
      }
    }
    // Highest first, so every cell is handed its own catchment before it
    // passes it on.
    var idx = Array.prototype.slice.call(order);
    idx.sort(function (a, b) { return base[b] - base[a]; });
    for (k = 0; k < idx.length; k++) {
      var c = idx[k];
      var ci = c % n, cj = (c / n) | 0;
      var lowest = -1, lowestH = base[c];
      for (var dj = -1; dj <= 1; dj++) {
        for (var di = -1; di <= 1; di++) {
          if (!di && !dj) { continue; }
          var ni = ci + di, nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= n || nj >= n) { continue; }
          var nc = nj * n + ni;
          if (base[nc] < lowestH) { lowestH = base[nc]; lowest = nc; }
        }
      }
      if (lowest >= 0) { flow[lowest] += flow[c]; }
    }
    var carve = new Float32Array(n * n);
    for (k = 0; k < carve.length; k++) {
      // Diminishing returns: a stream cuts, a river does not cut ten times as
      // deep for ten times the water.
      carve[k] = e.depth * (1 - 1 / (1 + Math.pow(flow[k] * 0.06, 0.55)));
    }
    e.grid = carve;
    // The coarse surface, after carving. The horizon map is built from this
    // rather than from heightAt, because a ray march over an array is three
    // orders of magnitude cheaper than one over a noise field.
    var surf = new Float32Array(n * n);
    for (k = 0; k < surf.length; k++) { surf[k] = base[k] - carve[k]; }
    e.surface = surf;
    return carve;
  };

  // ---------------------------------------------------------- terrain shade
  // How high the skyline stands in each of eight directions, from every cell.
  // A hillside is in shadow when the sun is lower than its own horizon, which
  // is what makes a valley fill with shade in the evening instead of staying
  // evenly lit until the light simply goes out.
  W.HORIZON = { dirs: 8, grid: null };

  W.buildHorizon = function () {
    var e = W.EROSION, n = e.n, cell = e.span / n;
    var surf = e.surface;
    if (!surf) { return null; }
    var dirs = W.HORIZON.dirs;
    var out = new Uint8Array(n * n * dirs);
    var steps = 26;
    for (var d = 0; d < dirs; d++) {
      var a = d / dirs * Math.PI * 2;
      var dx = Math.sin(a), dz = Math.cos(a);
      for (var j = 0; j < n; j++) {
        for (var i = 0; i < n; i++) {
          var h0 = surf[j * n + i];
          var best = 0;
          for (var st = 1; st <= steps; st++) {
            var r = st * st * 0.5 + st;          // finer near, coarser far
            var si = Math.round(i + dx * r), sj = Math.round(j + dz * r);
            if (si < 0 || sj < 0 || si >= n || sj >= n) { break; }
            var dh = surf[sj * n + si] - h0;
            if (dh <= 0) { continue; }
            var ang = Math.atan2(dh, r * cell);
            if (ang > best) { best = ang; }
          }
          // Stored in half degrees, which is finer than the light is.
          out[(j * n + i) * dirs + d] = Math.min(255, Math.round(M.deg(best) * 2));
        }
      }
    }
    W.HORIZON.grid = out;
    return out;
  };

  // Sun elevation and azimuth against the local skyline. Returns 1 in full
  // light and 0 in shadow, with a soft edge because a skyline is not a knife.
  W.sunlightAt = function (x, z, sunDir) {
    var hg = W.HORIZON.grid;
    if (!hg || !sunDir) { return 1; }
    var e = W.EROSION, n = e.n, cell = e.span / n, dirs = W.HORIZON.dirs;
    var fx = x / cell + n / 2, fz = z / cell + n / 2;
    if (fx < 0 || fz < 0 || fx > n - 1 || fz > n - 1) { return 1; }
    var i = fx | 0, j = fz | 0;
    // sunDir points from the sun toward the ground, so the sun is behind it.
    var toSun = { x: -sunDir.x, y: -sunDir.y, z: -sunDir.z };
    var flat = Math.sqrt(toSun.x * toSun.x + toSun.z * toSun.z);
    var elev = M.deg(Math.atan2(toSun.y, flat > 1e-6 ? flat : 1e-6));
    if (elev <= 0) { return 0; }
    var az = Math.atan2(toSun.x, toSun.z);
    if (az < 0) { az += Math.PI * 2; }
    var slot = az / (Math.PI * 2) * dirs;
    var s0 = Math.floor(slot) % dirs, s1 = (s0 + 1) % dirs, t = slot - Math.floor(slot);
    var base = (j * n + i) * dirs;
    var hz = (hg[base + s0] * (1 - t) + hg[base + s1] * t) / 2;
    // One degree of softness at the terminator.
    return M.clamp((elev - hz) / 1.0 + 0.5, 0, 1);
  };

  // Cloud shadows. A field of shade drifting with the wind, which is what
  // makes an aerial view read as weather rather than as a diagram.
  W.cloudShadowAt = function (x, z, t, wind) {
    var dx = wind ? wind.x * t * 0.6 : 0;
    var dz = wind ? wind.z * t * 0.6 : 0;
    var v = AERO.fbm2((x - dx) / 520, (z - dz) / 520, 2, 77);
    return M.clamp((v + 0.15) * 2.4, 0, 1);   // 1 in full sun, 0 under a cloud
  };

  function carveAt(x, z) {
    var e = W.EROSION;
    if (!e.grid) { return 0; }
    var n = e.n, cell = e.span / n;
    var fx = x / cell + n / 2, fz = z / cell + n / 2;
    if (fx < 0 || fz < 0 || fx > n - 1.001 || fz > n - 1.001) { return 0; }
    var i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j;
    var g = e.grid;
    var a = g[j * n + i], b = g[j * n + i + 1];
    var c = g[(j + 1) * n + i], d = g[(j + 1) * n + i + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }

  W.carveAt = carveAt;

  W.heightAt = function (x, z) {
    var h = baseHeight(x, z) - carveAt(x, z);
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

  // Farmland. A grid at an angle to the terrain grid, near the town, with a
  // per field crop chosen from the cell index. Fields are the most
  // recognisable thing there is under a light aircraft.
  W.FIELD = { size: 130, angleRad: 0.38, radius: 900 };

  W.fieldAt = function (x, z) {
    var f = W.FIELD, t = W.params.town;
    var dx = x - t.x, dz = z - t.z;
    if (dx * dx + dz * dz > f.radius * f.radius) { return null; }
    var c = Math.cos(f.angleRad), sn = Math.sin(f.angleRad);
    var u = (dx * c + dz * sn) / f.size;
    var v = (-dx * sn + dz * c) / f.size;
    var cu = Math.floor(u), cv = Math.floor(v);
    // Hedgerows are the field boundaries, a few metres either side of a line.
    var eu = Math.abs(u - cu - 0.5), ev = Math.abs(v - cv - 0.5);
    var edge = Math.max(eu, ev) > 0.46;
    var kind = (((cu * 73856093) ^ (cv * 19349663)) >>> 0) % 5;
    return { cu: cu, cv: cv, edge: edge, kind: kind };
  };

  // Material by what the ground is doing, rather than by height alone: slope
  // for rock and scree, the waterline for sand, the field grid for farmland.
  W.materialAt = function (x, z, h) {
    if (W.inRunway(x, z)) { return 'tarmac'; }
    var rx = W.riverX(z);
    var dr = Math.abs(x - rx);
    if (dr < 62) { return 'water'; }
    if (dr < 82) { return 'sand'; }
    var n = W.normalAt(x, z);
    // Grass climbs a long way up a hillside in real country. Only the steep
    // ground is bare, and only the steepest is stone.
    if (n.y < 0.58) { return 'rock'; }
    if (n.y < 0.72) { return 'scree'; }
    if (h > W.FLOOR + 320 && n.y < 0.9) { return 'scree'; }
    var f = W.fieldAt(x, z);
    if (f) {
      if (f.edge) { return 'hedge'; }
      if (f.kind === 0) { return 'crop'; }
      if (f.kind === 1) { return 'plough'; }
      if (f.kind === 2) { return 'meadow'; }
    }
    if (h < W.FLOOR + 30 && n.y > 0.96) { return 'meadow'; }
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
  // ------------------------------------------------------- more structures
  // A valley with one hangar and a tower in it is an airfield with nothing
  // around it. These are the things that make it somewhere.

  function barn(x, z, rotY) {
    var faces = [].concat(
      mk.box(0, 3.4, 0, 9, 3.4, 6, 'accent'),
      // A pitched roof, two slabs meeting at a ridge.
      [{ mat: 'rock', v: [[-9, 6.8, -6], [9, 6.8, -6], [9, 9.4, 0], [-9, 9.4, 0]] },
        { mat: 'rock', v: [[-9, 9.4, 0], [9, 9.4, 0], [9, 6.8, 6], [-9, 6.8, 6]] }],
      mk.box(9.1, 2.4, 0, 0.2, 2.4, 2.4, 'dark')
    );
    return { mesh: { faces: faces }, pos: V.make(x, W.heightAt(x, z), z),
      quat: Q.fromEuler(rotY || 0, 0, 0), r: 14 };
  }

  function silo(x, z) {
    var faces = [].concat(
      mk.lathe([[0, 2.6], [11, 2.6], [13.4, 2.0], [14.6, 0]], 10, 'white'),
      mk.box(0, 0.4, 0, 3.2, 0.4, 3.2, 'rock')
    );
    return { mesh: { faces: faces }, pos: V.make(x, W.heightAt(x, z), z),
      quat: Q.identity(), r: 6 };
  }

  function watertower(x, z) {
    var faces = [].concat(
      mk.lathe([[13, 4.4], [17, 5.0], [20, 4.2], [21.5, 0]], 10, 'hull'),
      mk.box(-2.6, 6.5, -2.6, 0.5, 6.5, 0.5, 'rock'),
      mk.box(2.6, 6.5, -2.6, 0.5, 6.5, 0.5, 'rock'),
      mk.box(-2.6, 6.5, 2.6, 0.5, 6.5, 0.5, 'rock'),
      mk.box(2.6, 6.5, 2.6, 0.5, 6.5, 0.5, 'rock')
    );
    return { mesh: { faces: faces }, pos: V.make(x, W.heightAt(x, z), z),
      quat: Q.identity(), r: 8 };
  }

  function church(x, z, rotY) {
    var faces = [].concat(
      mk.box(0, 3.6, 0, 5, 3.6, 11, 'white'),
      [{ mat: 'rock', v: [[-5, 7.2, -11], [5, 7.2, -11], [5, 9.6, 0], [-5, 9.6, 0]] },
        { mat: 'rock', v: [[-5, 9.6, 0], [5, 9.6, 0], [5, 7.2, 11], [-5, 7.2, 11]] }],
      mk.box(0, 8, -9, 3, 8, 3, 'white'),
      // The spire, which is the point of a church from the air.
      mk.lathe([[16, 3.0], [19, 2.4], [27, 0]], 6, 'rock', 0)
    );
    // The spire is built about the origin, so lift it onto the tower.
    for (var i = faces.length - 6; i < faces.length; i++) {
      if (!faces[i]) { continue; }
      for (var j = 0; j < faces[i].v.length; j++) { faces[i].v[j][2] -= 9; }
    }
    return { mesh: { faces: faces }, pos: V.make(x, W.heightAt(x, z), z),
      quat: Q.fromEuler(rotY || 0, 0, 0), r: 14 };
  }

  function mast(x, z, height) {
    height = height || 46;
    var faces = [];
    var seg = 6, step = height / seg;
    for (var i = 0; i < seg; i++) {
      var y0 = i * step, y1 = (i + 1) * step;
      var w0 = 1.6 * (1 - i / seg * 0.6), w1 = 1.6 * (1 - (i + 1) / seg * 0.6);
      faces.push({ mat: 'rock', twoSided: true, v: [[-w0, y0, 0], [w0, y0, 0], [w1, y1, 0], [-w1, y1, 0]] });
      faces.push({ mat: 'rock', twoSided: true, v: [[0, y0, -w0], [0, y0, w0], [0, y1, w1], [0, y1, -w1]] });
    }
    return { mesh: { faces: faces }, pos: V.make(x, W.heightAt(x, z), z),
      quat: Q.identity(), r: 4, beacon: true, beaconY: height };
  }

  // A run of poles with wires between them, built as one object so the wires
  // sag between the right pairs.
  function powerline(x, z, rotDeg, count, span) {
    count = Math.max(2, Math.min(24, count || 8));
    span = span || 90;
    var faces = [], i;
    var rot = M.rad(rotDeg || 0);
    var dx = Math.sin(rot), dz = Math.cos(rot);
    var base = W.heightAt(x, z);
    for (i = 0; i < count; i++) {
      var px = dx * span * i, pz = dz * span * i;
      var top = W.heightAt(x + px, z + pz) - base + 13;
      faces = faces.concat(mk.box(px, (top - 13) + 6.5, pz, 0.5, 6.5, 0.5, 'rock'));
      faces.push({ mat: 'rock', twoSided: true, v: [
        [px - 3.4, top - 0.9, pz], [px + 3.4, top - 0.9, pz],
        [px + 3.4, top - 0.4, pz], [px - 3.4, top - 0.4, pz]] });
      if (i + 1 < count) {
        var nx = dx * span * (i + 1), nz = dz * span * (i + 1);
        var ntop = W.heightAt(x + nx, z + nz) - base + 13;
        for (var w = -1; w <= 1; w += 2) {
          var off = w * 3.0;
          var sag = 2.6;
          var midx = (px + nx) / 2 + dz * 0, midz = (pz + nz) / 2;
          faces.push({ mat: 'dark', twoSided: true, v: [
            [px + dz * off, top - 0.7, pz - dx * off],
            [midx + dz * off, (top + ntop) / 2 - sag, midz - dx * off],
            [nx + dz * off, ntop - 0.7, nz - dx * off],
            [midx + dz * off, (top + ntop) / 2 - sag + 0.25, midz - dx * off]] });
        }
      }
    }
    return { mesh: { faces: faces }, pos: V.make(x, base, z), quat: Q.identity(),
      r: span * count };
  }

  function fence(x, z, rotDeg, length) {
    length = Math.max(10, Math.min(600, length || 120));
    var faces = [], rot = M.rad(rotDeg || 0);
    var dx = Math.sin(rot), dz = Math.cos(rot);
    var base = W.heightAt(x, z);
    var n = Math.floor(length / 8);
    for (var i = 0; i <= n; i++) {
      var px = dx * 8 * i, pz = dz * 8 * i;
      var h = W.heightAt(x + px, z + pz) - base;
      faces = faces.concat(mk.box(px, h + 0.8, pz, 0.12, 0.8, 0.12, 'rock'));
    }
    faces.push({ mat: 'rock', twoSided: true, v: [
      [0, 1.2, 0], [dx * 8 * n, W.heightAt(x + dx * 8 * n, z + dz * 8 * n) - base + 1.2, dz * 8 * n],
      [dx * 8 * n, W.heightAt(x + dx * 8 * n, z + dz * 8 * n) - base + 1.05, dz * 8 * n], [0, 1.05, 0]] });
    return { mesh: { faces: faces }, pos: V.make(x, base, z), quat: Q.identity(), r: length };
  }

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
    block: function (d) { return block(d.x, d.z, d.w, d.h, d.d, d.mat); },
    barn: function (d) { return barn(d.x, d.z, M.rad(d.rotDeg || 0)); },
    silo: function (d) { return silo(d.x, d.z); },
    watertower: function (d) { return watertower(d.x, d.z); },
    church: function (d) { return church(d.x, d.z, M.rad(d.rotDeg || 0)); },
    mast: function (d) { return mast(d.x, d.z, d.height); },
    powerline: function (d) { return powerline(d.x, d.z, d.rotDeg, d.count, d.span); },
    fence: function (d) { return fence(d.x, d.z, d.rotDeg, d.length); }
  };
  W.BUILDERS = BUILDERS;

  W.build = function () {
    var p = W.params;
    // Drainage first: everything else is placed on the eroded surface, and
    // the skyline map is built from that surface.
    W.buildErosion();
    W.buildHorizon();
    // Adjacent tiles share corners, so the renderer asks for the same height
    // four times over. The cache is rebuilt here so a new world cannot be
    // drawn with the old ground.
    W.heightCached = AERO.memo2(function (x, z) { return W.heightAt(x, z); }, 13);
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
    // Subdivision existed to make a sorting error smaller. The depth buffer
    // makes the error impossible, so the split meshes are not built any more.
    // The helpers stay: splitting a face is still useful for anything that
    // wants per piece shading later.
    // Scatter, placed by a density field rather than uniformly at random.
    // Uniform placement is why the ridge used to read as confetti: real
    // country has woods and clearings, not an even sprinkle.
    W.scatter = [];
    var sc = p.scatter;
    var rnd2 = AERO.rng(sc.seed);
    var tries = 0;
    while (W.scatter.length < sc.count && tries < sc.count * 12) {
      tries++;
      var sx = (rnd2() - 0.5) * sc.spread, sz = (rnd2() - 0.5) * sc.spread;
      if (W.inField(sx, sz)) { continue; }
      var h2 = W.heightAt(sx, sz);
      if (Math.abs(sx - W.riverX(sz)) < 74) { continue; }
      var mat = W.materialAt(sx, sz, h2);
      if (mat === 'water' || mat === 'tarmac' || mat === 'crop' || mat === 'plough') { continue; }

      // Woodland where the density noise is high, clearings where it is low,
      // and a thinning tree line as the ground rises.
      var dens = (AERO.fbm2(sx / 620, sz / 620, 3, 41) + 1) * 0.5;
      var line = M.clamp(1 - (h2 - (W.FLOOR + 120)) / 240, 0, 1);
      var chance = dens * dens * 1.5 * (0.35 + 0.65 * line);
      if (mat === 'hedge') { chance = 0.9; }
      if (rnd2() > chance) { continue; }

      // What grows there depends on where there is.
      var cell = 'tree';
      var r = rnd2();
      if (mat === 'scree' || mat === 'rock') { cell = r < 0.55 ? 'boulder' : 'conifer'; }
      else if (h2 > W.FLOOR + 170) { cell = r < 0.62 ? 'conifer' : (r < 0.86 ? 'tree' : 'deadtree'); }
      else if (mat === 'meadow') {
        // Cattle belong in the fields near the farm, not scattered over every
        // flat acre in the valley.
        var nearFarm = !!W.fieldAt(sx, sz);
        cell = (nearFarm && r < 0.28) ? 'cow' : (r < 0.55 ? 'bush' : 'tree');
      }
      else if (mat === 'hedge') { cell = r < 0.5 ? 'bush' : 'post'; }
      else { cell = r < 0.58 ? 'tree' : (r < 0.82 ? 'bush' : (r < 0.94 ? 'conifer' : 'deadtree')); }
      W.scatter.push({ x: sx, z: sz, y: h2, cell: cell, flip: rnd2() > 0.5 });
    }
    // Hay bales sit in the ripe fields, which is how you know they are ripe.
    for (var hb = 0; hb < 40; hb++) {
      var bx = W.TOWN.x + (rnd2() - 0.5) * W.FIELD.radius * 1.8;
      var bz = W.TOWN.z + (rnd2() - 0.5) * W.FIELD.radius * 1.8;
      var bh = W.heightAt(bx, bz);
      if (W.materialAt(bx, bz, bh) !== 'crop') { continue; }
      W.scatter.push({ x: bx, z: bz, y: bh, cell: 'haybale', flip: rnd2() > 0.5 });
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
        if (spec.type === 'hangar' || spec.type === 'barn' || spec.type === 'church'
          || spec.type === 'powerline' || spec.type === 'fence') {
          clean.rotDeg = num(spec.rotDeg, -360, 360, 0);
        }
        if (spec.type === 'mast') { clean.height = num(spec.height, 8, 200, 46); }
        if (spec.type === 'powerline') {
          clean.count = num(spec.count, 2, 24, 8) | 0;
          clean.span = num(spec.span, 20, 300, 90);
        }
        if (spec.type === 'fence') { clean.length = num(spec.length, 10, 600, 120); }
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

  W.emitTerrain = function (cam, env, t2) {
    var light = env.sunDir, amb = env.ambient;
    var wind = env.windMean;
    t2 = t2 || 0;
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
          var hc0 = W.heightCached || W.heightAt;
          var h00 = hc0(gx, gz), h10 = hc0(gx + t, gz);
          var h11 = hc0(gx + t, gz + t), h01 = hc0(gx, gz + t);
          var hc = (h00 + h10 + h11 + h01) * 0.25;
          var mat = tileMaterial(cxp, czp, hc);
          // Shade from the skyline and from the clouds, and haze that thickens
          // in the low ground the way real air does.
          var lit = W.sunlightAt(cxp, czp, light) * (0.55 + 0.45 * W.cloudShadowAt(cxp, czp, t2, wind));
          var shade = (lit - 1) * 0.16;
          var hazeBoost = M.clamp(1 - (hc - W.FLOOR) / 260, 0, 1) * 0.5;
          if (mat === 'water') {
            var wl = W.WATER_LEVEL;
            // Glint. Where the water would reflect the sun into the camera,
            // it is bright, and everywhere else it is not.
            var glint = 0;
            if (light && light.y < -0.02) {
              var refx = light.x, refz = light.z;
              var vx = cam.pos.x - cxp, vz = cam.pos.z - czp;
              var vlen = Math.sqrt(vx * vx + vz * vz) || 1;
              var align = (refx * vx + refz * vz) / vlen;
              glint = M.clamp((align - 0.55) * 2.2, 0, 1);
            }
            G.submitFace(cam, [
              { x: gx, y: wl, z: gz }, { x: gx, y: wl, z: gz + t },
              { x: gx + t, y: wl, z: gz + t }, { x: gx + t, y: wl, z: gz }
            ], 'water', {
              light: light, ambient: amb * 0.9 + 0.08,
              tint: shade * 0.5 + glint * 0.5, hazeBoost: hazeBoost
            });
            continue;
          }
          G.submitFace(cam, [
            { x: gx, y: h00, z: gz }, { x: gx, y: h01, z: gz + t },
            { x: gx + t, y: h11, z: gz + t }, { x: gx + t, y: h10, z: gz }
          ], mat, {
            light: light, ambient: amb, hazeBoost: hazeBoost,
            tint: (AERO.noise2(gx * 0.01, gz * 0.01, 3) * 0.07) + shade
          });

          // Skirts. Where one level of detail meets the next the two grids
          // disagree by a metre or two, and without a skirt that disagreement
          // is a slot of sky in the middle of a hillside. The skirt hangs
          // down from the tile edge and is never seen unless it is needed.
          if (b < BANDS.length - 1 && dist > band.radius - t * 1.6) {
            var drop = t * 0.35;
            G.submitFace(cam, [
              { x: gx, y: h00, z: gz }, { x: gx + t, y: h10, z: gz },
              { x: gx + t, y: h10 - drop, z: gz }, { x: gx, y: h00 - drop, z: gz }
            ], mat, { light: light, ambient: amb * 0.9, twoSided: true });
            G.submitFace(cam, [
              { x: gx, y: h01, z: gz + t }, { x: gx + t, y: h11, z: gz + t },
              { x: gx + t, y: h11 - drop, z: gz + t }, { x: gx, y: h01 - drop, z: gz + t }
            ], mat, { light: light, ambient: amb * 0.9, twoSided: true });
          }
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
      ], 'mark', { light: light, ambient: 1, noHaze: true, zlift: 0.004 });
    }
    [-1, 1].forEach(function (s) {
      for (var k = -3; k <= 3; k++) {
        if (k === 0) { continue; }
        var zx = r.z + s * (r.halfLen - 26);
        G.submitFace(cam, [
          { x: k * 4 - 1.4, y: y + 0.03, z: zx - 16 }, { x: k * 4 - 1.4, y: y + 0.03, z: zx + 16 },
          { x: k * 4 + 1.4, y: y + 0.03, z: zx + 16 }, { x: k * 4 + 1.4, y: y + 0.03, z: zx - 16 }
        ], 'mark', { light: light, ambient: 1, noHaze: true, zlift: 0.004 });
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
    ], mat, { twoSided: true, noHaze: true, ambient: 1, zlift: 0.01 });
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
    W.emitTerrain(cam, env, t);
    W.emitRunway(cam, env);
    W.emitObjects(cam, env, t);
    W.emitLights(cam, env, t);
  };

  W.build();

})(typeof window !== 'undefined' ? window : globalThis);
