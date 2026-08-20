// AERODROME :: src/03-render.js :: v1.0.0
// Fixed function 3D pipeline: transform, near clip, painter sort, flat shade.
// Depends on 00-core.js, 01-palette.js, 02-raster.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var V = AERO.vec3, Q = AERO.quat, M = AERO.math, P = AERO.palette, R = AERO.raster;

  var G = AERO.render = {};

  G.NEAR = 0.35;
  G.FAR = 14000;
  G.wireframe = false;
  G.showNormals = false;
  G.stats = { faces: 0, drawn: 0, sprites: 0, clipped: 0 };

  // Material to palette ramp. Flat shading picks the nearest ramp entry for a
  // face given one directional light plus an ambient term.
  G.MATERIALS = {
    hull: { ramp: 'hull' },
    accent: { ramp: 'accent' },
    glass: { ramp: 'glass' },
    dark: { ramp: 'black', flat: true },
    white: { ramp: 'white', flat: true },
    red: { ramp: 'red', flat: true },
    flame: { ramp: 'flame', flat: true },
    grass: { ramp: 'grass' },
    rock: { ramp: 'rock' },
    water: { ramp: 'water' },
    tarmac: { ramp: 'tarmac' },
    mark: { ramp: 'mark', flat: true },
    shadow: { ramp: 'shadow', flat: true }
  };

  // --------------------------------------------------------------- camera
  G.makeCamera = function () {
    return {
      pos: V.make(0, 2, 0),
      quat: Q.identity(),
      fovDeg: 62,
      fwd: V.make(0, 0, 1),
      up: V.make(0, 1, 0),
      right: V.make(1, 0, 0),
      f: 160,
      cx: 160,
      cy: 112
    };
  };

  G.updateCamera = function (cam) {
    cam.fwd = Q.rotate(cam.quat, { x: 1, y: 0, z: 0 });
    cam.up = Q.rotate(cam.quat, { x: 0, y: 1, z: 0 });
    cam.right = V.cross(cam.up, cam.fwd);
    cam.cx = R.W / 2;
    cam.cy = R.H / 2;
    cam.f = (R.W / 2) / Math.tan(M.rad(cam.fovDeg) / 2);
    return cam;
  };

  G.toView = function (cam, p) {
    var dx = p.x - cam.pos.x, dy = p.y - cam.pos.y, dz = p.z - cam.pos.z;
    return {
      x: dx * cam.right.x + dy * cam.right.y + dz * cam.right.z,
      y: dx * cam.up.x + dy * cam.up.y + dz * cam.up.z,
      z: dx * cam.fwd.x + dy * cam.fwd.y + dz * cam.fwd.z
    };
  };

  G.fromView = function (cam, v) {
    return {
      x: cam.pos.x + cam.right.x * v.x + cam.up.x * v.y + cam.fwd.x * v.z,
      y: cam.pos.y + cam.right.y * v.x + cam.up.y * v.y + cam.fwd.y * v.z,
      z: cam.pos.z + cam.right.z * v.x + cam.up.z * v.y + cam.fwd.z * v.z
    };
  };

  G.project = function (cam, v) {
    var inv = cam.f / v.z;
    return { x: cam.cx + v.x * inv, y: cam.cy - v.y * inv, z: v.z };
  };

  // ------------------------------------------------------------ queue
  var queue = [];
  var queueLen = 0;

  G.resetQueue = function () {
    queueLen = 0;
    G.stats.faces = 0; G.stats.drawn = 0; G.stats.clipped = 0; G.stats.sprites = 0;
  };

  function push(pts, color, key, ditherB, ditherT) {
    if (queueLen < queue.length) {
      var s = queue[queueLen];
      s.pts = pts; s.color = color; s.key = key; s.db = ditherB; s.dt = ditherT;
    } else {
      queue.push({ pts: pts, color: color, key: key, db: ditherB, dt: ditherT });
    }
    queueLen++;
  }

  function clipNear(vs) {
    var out = [], n = vs.length;
    for (var i = 0; i < n; i++) {
      var a = vs[i], b = vs[(i + 1) % n];
      var ain = a.z >= G.NEAR, bin = b.z >= G.NEAR;
      if (ain) { out.push(a); }
      if (ain !== bin) {
        var t = (G.NEAR - a.z) / (b.z - a.z);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: G.NEAR });
      }
    }
    return out;
  }

  // Submit one world space polygon. verts is an array of world points.
  G.submitFace = function (cam, verts, mat, opts) {
    opts = opts || {};
    G.stats.faces++;
    var n = verts.length;
    if (n < 3) { return; }

    // World normal from the first three vertices.
    var e1 = V.sub(verts[1], verts[0]);
    var e2 = V.sub(verts[2], verts[0]);
    var nrm = V.norm(V.cross(e1, e2));

    var cxw = 0, cyw = 0, czw = 0, i;
    for (i = 0; i < n; i++) { cxw += verts[i].x; cyw += verts[i].y; czw += verts[i].z; }
    cxw /= n; cyw /= n; czw /= n;

    var toCam = { x: cam.pos.x - cxw, y: cam.pos.y - cyw, z: cam.pos.z - czw };
    var facing = V.dot(nrm, toCam);
    if (!opts.twoSided && facing <= 0) { return; }
    if (opts.twoSided && facing < 0) { nrm = V.scale(nrm, -1); }

    var vs = [];
    for (i = 0; i < n; i++) { vs.push(G.toView(cam, verts[i])); }
    var anyIn = false;
    for (i = 0; i < n; i++) { if (vs[i].z >= G.NEAR) { anyIn = true; break; } }
    if (!anyIn) { return; }
    var clipped = clipNear(vs);
    if (clipped.length < 3) { G.stats.clipped++; return; }

    var pts = [], zsum = 0;
    for (i = 0; i < clipped.length; i++) {
      var p = G.project(cam, clipped[i]);
      if (p.x < -4000) { p.x = -4000; }
      if (p.x > 4000) { p.x = 4000; }
      if (p.y < -4000) { p.y = -4000; }
      if (p.y > 4000) { p.y = 4000; }
      pts.push(p);
      zsum += clipped[i].z;
    }
    var z = zsum / clipped.length;
    if (z > G.FAR) { return; }

    var color = G.shade(mat, nrm, opts.light, opts.ambient, opts.tint);
    // Distance haze, done by dithering toward the horizon band, never blended.
    var db = null, dt = 0;
    if (!opts.noHaze) {
      var hz = M.clamp((z - 1200) / 5200, 0, 1);
      if (hz > 0.02) {
        db = P.RAMP.sky.start + P.RAMP.sky.len - 1;
        dt = hz * 0.9;
      }
    }
    push(pts, color, -z, db, dt);
  };

  G.shade = function (mat, nrm, light, ambient, tint) {
    var m = G.MATERIALS[mat] || G.MATERIALS.hull;
    if (m.flat) { return P.RAMP[m.ramp].start; }
    ambient = (ambient === undefined) ? 0.45 : ambient;
    var d = light ? Math.max(0, -V.dot(nrm, light)) : 0.5;
    var t = M.clamp(ambient + d * (1 - ambient), 0, 1);
    if (tint) { t = M.clamp(t + tint, 0, 1); }
    return P.rampIndex(m.ramp, t);
  };

  G.submitMesh = function (cam, mesh, pos, quat, opts) {
    opts = opts || {};
    var faces = mesh.faces, world = [];
    for (var i = 0; i < faces.length; i++) {
      var f = faces[i];
      world.length = 0;
      var verts = [];
      for (var j = 0; j < f.v.length; j++) {
        var lv = f.v[j];
        var rv = quat ? Q.rotate(quat, { x: lv[0], y: lv[1], z: lv[2] }) : { x: lv[0], y: lv[1], z: lv[2] };
        verts.push({ x: pos.x + rv.x, y: pos.y + rv.y, z: pos.z + rv.z });
      }
      G.submitFace(cam, verts, f.mat, {
        light: opts.light, ambient: opts.ambient, twoSided: f.twoSided || opts.twoSided,
        tint: opts.tint, noHaze: opts.noHaze
      });
    }
  };

  G.flushQueue = function () {
    var list = queue.slice(0, queueLen);
    list.sort(function (a, b) { return a.key - b.key; });
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (G.wireframe) {
        R.polyOutline(s.pts, P.RAMP.mint.start);
      } else {
        R.fillPoly(s.pts, s.color, s.db, s.dt);
      }
      G.stats.drawn++;
    }
  };

  // ---------------------------------------------------- sky and ground plane
  // The horizon is a line in screen space. Everything above it is the sky
  // scrollplane, everything below is the far ground band. Both are dithered
  // between two palette entries, never blended.
  G.drawSkyPlane = function (cam, env) {
    var A = cam.right.y;
    var B = -cam.up.y;
    var C = cam.fwd.y * cam.f - cam.right.y * cam.cx + cam.up.y * cam.cy;
    var K = cam.f * 0.85;
    var skyStart = P.RAMP.sky.start, skyLen = P.RAMP.sky.len;
    var groundA = P.RAMP.grass.start + 1, groundB = P.RAMP.rock.start;
    var horizonBand = skyStart + skyLen - 1;
    var buf = R.buf, W = R.W, H = R.H;

    for (var y = 0; y < H; y++) {
      var base = y * W;
      var e = A * 0.5 + B * (y + 0.5) + C;
      for (var x = 0; x < W; x++, e += A) {
        var idx;
        if (e >= 0) {
          var t = 1 - M.clamp(e / K, 0, 1); // 1 at the horizon, 0 at the zenith
          var f = t * (skyLen - 1);
          var i0 = Math.floor(f);
          if (i0 >= skyLen - 1) { idx = skyStart + skyLen - 1; } else {
            idx = P.ditherPick(skyStart + i0, skyStart + i0 + 1, f - i0, x, y);
          }
        } else {
          var g = M.clamp(-e / (K * 0.75), 0, 1);
          idx = P.ditherPick(horizonBand, g > 0.5 ? groundB : groundA, M.clamp(g * 1.6, 0, 1), x, y);
        }
        buf[base + x] = idx;
      }
    }
    G.horizonLine = { A: A, B: B, C: C };
  };

  G.drawStars = function (cam, env) {
    if (env.ambient > 0.34) { return; }
    var stars = G.starField();
    var idx = P.RAMP.star.start;
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var v = G.toView(cam, { x: cam.pos.x + s.x * 8000, y: cam.pos.y + s.y * 8000, z: cam.pos.z + s.z * 8000 });
      if (v.z < G.NEAR) { continue; }
      var p = G.project(cam, v);
      if (p.x < 0 || p.y < 0 || p.x >= R.W || p.y >= R.H) { continue; }
      R.px(p.x | 0, p.y | 0, idx);
    }
  };

  var starCache = null;
  G.starField = function () {
    if (starCache) { return starCache; }
    var rnd = AERO.rng(20260819);
    starCache = [];
    for (var i = 0; i < 220; i++) {
      var u = rnd() * Math.PI * 2, v = rnd() * 0.9 + 0.05;
      starCache.push({ x: Math.cos(u) * Math.sqrt(1 - v * v), y: v, z: Math.sin(u) * Math.sqrt(1 - v * v) });
    }
    return starCache;
  };

  G.drawSun = function (cam, env) {
    var d = env.sunDir; // unit vector pointing from the sun toward the ground
    var p = { x: cam.pos.x - d.x * 9000, y: cam.pos.y - d.y * 9000, z: cam.pos.z - d.z * 9000 };
    var v = G.toView(cam, p);
    if (v.z < G.NEAR) { return; }
    var s = G.project(cam, v);
    if (s.x < -40 || s.y < -40 || s.x > R.W + 40 || s.y > R.H + 40) { return; }
    var core = P.RAMP.sun.start + P.RAMP.sun.len - 1;
    var glow = P.RAMP.sun.start;
    R.circle(s.x | 0, s.y | 0, 9, glow, true);
    R.circle(s.x | 0, s.y | 0, 6, core, true);
  };

  // Scrolling ground grid, drawn under the terrain mesh so distant ground has
  // motion cues even where there is no geometry left.
  G.drawGroundGrid = function (cam, spacing, extent) {
    spacing = spacing || 500;
    extent = extent || 9000;
    var idx = P.RAMP.rock.start + 1;
    var ox = Math.round(cam.pos.x / spacing) * spacing;
    var oz = Math.round(cam.pos.z / spacing) * spacing;
    var n = Math.floor(extent / spacing);
    for (var i = -n; i <= n; i++) {
      G.groundSeg(cam, ox + i * spacing, oz - extent, ox + i * spacing, oz + extent, idx);
      G.groundSeg(cam, ox - extent, oz + i * spacing, ox + extent, oz + i * spacing, idx);
    }
  };

  G.groundSeg = function (cam, x0, z0, x1, z1, idx) {
    var a = G.toView(cam, { x: x0, y: 0, z: z0 });
    var b = G.toView(cam, { x: x1, y: 0, z: z1 });
    if (a.z < G.NEAR && b.z < G.NEAR) { return; }
    if (a.z < G.NEAR) {
      var t = (G.NEAR - a.z) / (b.z - a.z);
      a = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: G.NEAR };
    } else if (b.z < G.NEAR) {
      var u = (G.NEAR - b.z) / (a.z - b.z);
      b = { x: b.x + (a.x - b.x) * u, y: b.y + (a.y - b.y) * u, z: G.NEAR };
    }
    var pa = G.project(cam, a), pb = G.project(cam, b);
    if ((pa.x < 0 && pb.x < 0) || (pa.x > R.W && pb.x > R.W)) { return; }
    if ((pa.y < 0 && pb.y < 0) || (pa.y > R.H && pb.y > R.H)) { return; }
    R.line(pa.x, pa.y, pb.x, pb.y, idx);
  };

  // Parallax cloud layer, drawn from sprite cells so it shares the scanline
  // budget and flickers like the rest of the sprite plane.
  G.drawClouds = function (cam, env, t) {
    var alt = 900, spacing = 700, span = 5;
    var drift = (env.wind ? env.wind.x : 0) * t * 0.15;
    var driftZ = (env.wind ? env.wind.z : 0) * t * 0.15;
    var bx = Math.round((cam.pos.x - drift) / spacing);
    var bz = Math.round((cam.pos.z - driftZ) / spacing);
    for (var i = -span; i <= span; i++) {
      for (var j = -span; j <= span; j++) {
        var gx = bx + i, gz = bz + j;
        var h = AERO.noise2(gx * 0.7, gz * 0.7, 991);
        if (h < 0.15) { continue; }
        var wx = gx * spacing + drift + h * 120;
        var wz = gz * spacing + driftZ - h * 90;
        var wy = alt + h * 160;
        var v = G.toView(cam, { x: wx, y: wy, z: wz });
        if (v.z < 40) { continue; }
        var p = G.project(cam, v);
        if (p.x < -40 || p.x > R.W + 40 || p.y < -40 || p.y > R.H + 40) { continue; }
        var scale = M.clamp(2200 / v.z, 0.4, 3);
        G.puff(p.x, p.y, scale, (h > 0.55) ? 1 : 0);
      }
    }
  };

  G.puff = function (cx, cy, scale, variant) {
    var lo = P.RAMP.cloud.start, hi = P.RAMP.cloud.start + P.RAMP.cloud.len - 1;
    var w = Math.max(3, Math.round(16 * scale));
    var h = Math.max(2, Math.round(6 * scale));
    var y0 = Math.round(cy - h / 2);
    if (y0 + h < 0 || y0 >= R.H) { return; }
    for (var y = 0; y < h; y++) {
      var ly = y0 + y;
      if (ly < 0 || ly >= R.H) { continue; }
      if (R.spriteLoad[ly] >= R.SPRITES_PER_LINE) { R.overflowCount++; continue; }
      R.spriteLoad[ly]++;
      var tt = y / h;
      var half = Math.round(w / 2 * Math.sin(Math.PI * (0.25 + 0.75 * (1 - tt))));
      var shade = (variant && y > h * 0.6) ? lo : hi;
      R.hlineDither(ly, Math.round(cx) - half, Math.round(cx) + half, shade, hi, 1 - tt * 0.6);
    }
    G.stats.sprites++;
  };

  // A billboard sprite cell placed in the world, used for trees, birds and
  // distant traffic.
  G.drawBillboard = function (cam, name, world, flipH) {
    var v = G.toView(cam, world);
    if (v.z < 2 || v.z > 3500) { return false; }
    var p = G.project(cam, v);
    var c = R.cells[name];
    if (!c) { return false; }
    if (p.x < -32 || p.x > R.W + 32 || p.y < -32 || p.y > R.H + 32) { return false; }
    var ok = R.drawCell(name, p.x - c.w / 2, p.y - c.h, flipH);
    if (ok) { G.stats.sprites++; }
    return ok;
  };

})(typeof window !== 'undefined' ? window : globalThis);
