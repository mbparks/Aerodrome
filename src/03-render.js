// AERODROME :: src/03-render.js :: v1.4.2
// Fixed function 3D pipeline: transform, near clip, painter sort, flat shade.
// Depends on 00-core.js, 01-palette.js, 02-raster.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var V = AERO.vec3, Q = AERO.quat, M = AERO.math, P = AERO.palette, R = AERO.raster;

  var G = AERO.render = {};

  G.NEAR = 0.35;
  // Haze tuning. Distance should be suggested, not shouted.
  G.HAZE_NEAR = 2600;
  G.HAZE_RANGE = 6000;
  G.HAZE_MAX = 0.32;
  G.FAR = 14000;
  G.wireframe = false;
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
    shadow: { ramp: 'shadow', flat: true },
    lamp: { ramp: 'white', flat: true },
    beacon: { ramp: 'red', flat: true },
    window: { ramp: 'mark', flat: true }
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

  function push(pts, color, key, ditherB, ditherT, pattern) {
    if (queueLen < queue.length) {
      var s = queue[queueLen];
      s.pts = pts; s.color = color; s.key = key; s.db = ditherB; s.dt = ditherT; s.pat = pattern;
    } else {
      queue.push({ pts: pts, color: color, key: key, db: ditherB, dt: ditherT, pat: pattern });
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

  // Sutherland Hodgman against the screen rectangle. Clamping coordinates was
  // cheaper but distorted geometry that ran off the side of the screen, since
  // a clamped vertex is in the wrong place rather than off the edge.
  G.MARGIN = 2;

  function clipEdge(pts, side, limit) {
    var out = [], n = pts.length, i, a, b, ain, bin, t;
    function inside(p) {
      if (side === 0) { return p.x >= limit; }
      if (side === 1) { return p.x <= limit; }
      if (side === 2) { return p.y >= limit; }
      return p.y <= limit;
    }
    for (i = 0; i < n; i++) {
      a = pts[i]; b = pts[(i + 1) % n];
      ain = inside(a); bin = inside(b);
      if (ain) { out.push(a); }
      if (ain !== bin) {
        if (side < 2) {
          t = (limit - a.x) / (b.x - a.x);
          out.push({ x: limit, y: a.y + (b.y - a.y) * t });
        } else {
          t = (limit - a.y) / (b.y - a.y);
          out.push({ x: a.x + (b.x - a.x) * t, y: limit });
        }
      }
    }
    return out;
  }

  G.clipScreen = function (pts) {
    var m = G.MARGIN;
    var lo = -m, hiX = R.W + m, hiY = R.H + m;
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].x < minX) { minX = pts[i].x; }
      if (pts[i].x > maxX) { maxX = pts[i].x; }
      if (pts[i].y < minY) { minY = pts[i].y; }
      if (pts[i].y > maxY) { maxY = pts[i].y; }
    }
    if (maxX < lo || minX > hiX || maxY < lo || minY > hiY) { return null; }
    if (minX >= lo && maxX <= hiX && minY >= lo && maxY <= hiY) { return pts; }
    var out = clipEdge(pts, 0, lo);
    if (out.length) { out = clipEdge(out, 1, hiX); }
    if (out.length) { out = clipEdge(out, 2, lo); }
    if (out.length) { out = clipEdge(out, 3, hiY); }
    return out.length >= 3 ? out : null;
  };

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

    var pts = [], zsum = 0, zmin = Infinity;
    for (i = 0; i < clipped.length; i++) {
      var p = G.project(cam, clipped[i]);
      pts.push(p);
      zsum += clipped[i].z;
      if (clipped[i].z < zmin) { zmin = clipped[i].z; }
    }
    var z = zsum / clipped.length;
    if (z > G.FAR) { return; }
    pts = G.clipScreen(pts);
    if (!pts) { G.stats.clipped++; return; }

    var color = G.shade(mat, nrm, opts.light, opts.ambient, opts.tint);
    // Distance haze, dithered toward the horizon band and never blended. It
    // starts further out and stops well short of a fifty percent checker,
    // because a checkerboard reads as static rather than as distance, and it
    // uses the long period pattern so it does not read as a grid either.
    var db = null, dt = 0;
    if (!opts.noHaze) {
      var hz = M.clamp((z - G.HAZE_NEAR) / G.HAZE_RANGE, 0, 1);
      if (hz > 0.04) {
        db = P.RAMP.sky.start + P.RAMP.sky.len - 1;
        dt = hz * hz * G.HAZE_MAX;
      }
    }
    // Painter order. Pure centroid depth loses badly when a large polygon
    // overlaps a small near one, so the key leans on the nearest vertex.
    // opts.bias breaks ties for coplanar work like runway markings.
    var key = -(zmin * 0.6 + z * 0.4) + (opts.bias || 0);
    push(pts, color, key, db, dt, 'soft');
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
        R.fillPoly(s.pts, s.color, s.db, s.dt, s.pat);
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
    var groundA = P.RAMP.grass.start + 1, groundB = P.RAMP.grass.start + 2;
    var SEAM = 0.14;
    var horizonBand = skyStart + skyLen - 1;
    var buf = R.buf, W = R.W, H = R.H;

    for (var y = 0; y < H; y++) {
      var base = y * W;
      var e = A * 0.5 + B * (y + 0.5) + C;
      for (var x = 0; x < W; x++, e += A) {
        var idx;
        if (e >= 0) {
          var t = 1 - M.clamp(e / K, 0, 1); // 1 at the horizon, 0 at the zenith
          // Curved rather than linear, so the pale bands stay near the horizon
          // where they belong instead of washing out half the sky.
          t = t * t * t * 0.55 + t * 0.45;
          var f = t * (skyLen - 1);
          var i0 = Math.floor(f);
          if (i0 >= skyLen - 1) {
            idx = skyStart + skyLen - 1;
          } else {
            // Solid bands with a dithered seam between them. Dithering the
            // whole band turned the sky into a checkerboard, which is the one
            // thing a Genesis sky never was.
            var frac = f - i0;
            if (frac < 0.5 - SEAM) { idx = skyStart + i0; }
            else if (frac > 0.5 + SEAM) { idx = skyStart + i0 + 1; }
            else {
              idx = P.ditherPick(skyStart + i0, skyStart + i0 + 1,
                (frac - (0.5 - SEAM)) / (SEAM * 2), x, y, 'soft');
            }
          }
        } else {
          // Ground beyond the terrain mesh. Solid, with one dithered band at
          // the horizon so the seam is not a hard line.
          var g = M.clamp(-e / (K * 0.75), 0, 1);
          if (g < 0.10) {
            idx = P.ditherPick(horizonBand, groundA, g / 0.10, x, y, 'soft');
          } else if (g < 0.26) {
            idx = groundA;
          } else if (g < 0.40) {
            idx = P.ditherPick(groundA, groundB, (g - 0.26) / 0.14, x, y, 'soft');
          } else {
            idx = groundB;
          }
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
      R.hlineDither(ly, Math.round(cx) - half, Math.round(cx) + half, shade, hi, 1 - tt * 0.6, 'soft');
    }
    G.stats.sprites++;
  };

  // A billboard sprite cell placed in the world, used for trees, birds and
  // distant traffic.
  // Three tiers by distance: doubled cell close in, the plain cell at middle
  // distance, a speck beyond the range where a cell is legible at all.
  G.SPRITE_NEAR = 190;
  G.SPRITE_FAR = 1250;
  // Past this a tree is one or two pixels of noise on a hillside rather than
  // information about a hillside.
  G.SPRITE_CULL = 2300;

  // Which tier a sprite belongs in, by true distance. Exposed because the
  // rule matters: judging by forward distance alone put a tree seven hundred
  // metres below the aircraft into the near tier.
  G.tierFor = function (dist) {
    if (dist > G.SPRITE_CULL) { return 'cull'; }
    if (dist < G.SPRITE_NEAR) { return 'near'; }
    if (dist < G.SPRITE_FAR) { return 'mid'; }
    return 'far';
  };

  G.drawBillboard = function (cam, name, world, flipH, speckIdx) {
    var v = G.toView(cam, world);
    if (v.z < 2) { return false; }
    // Tier and cull on the true distance to the sprite, not on how far ahead
    // of the camera it is. Judging by forward distance alone drew a tree that
    // was seven hundred metres below the aircraft as if it were thirty metres
    // ahead of it, which is how a tree ends up standing in front of a flying
    // saucer.
    var dist = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    var tier = G.tierFor(dist);
    if (tier === 'cull') { return false; }
    var p = G.project(cam, v);
    var c = R.cells[name];
    if (!c) { return false; }
    if (p.x < -64 || p.x > R.W + 64 || p.y < -64 || p.y > R.H + 64) { return false; }
    var ok;
    if (tier === 'near') {
      ok = R.drawCellScaled(name, p.x - c.w, p.y - c.h * 2, flipH, 2);
    } else if (tier === 'mid') {
      ok = R.drawCell(name, p.x - c.w / 2, p.y - c.h, flipH);
    } else {
      var size = 2;
      ok = R.drawSpeck(p.x, p.y - size, speckIdx || c.data[(c.h - 1) * c.w + (c.w >> 1)] || 1, size);
    }
    if (ok) { G.stats.sprites++; }
    return ok;
  };

  // The contact shadow. Every mesh vertex is dropped onto the ground plane and
  // the convex hull of that footprint is filled once. It is not a real shadow
  // volume, but it is the aircraft's own shape rather than a rectangle.
  var hullPts = [];

  // Monotone chain. Lower hull then upper hull, with the upper hull forbidden
  // from eating into the lower one.
  function hull2d(points) {
    points.sort(function (a, b) { return (a.x - b.x) || (a.z - b.z); });
    var n = points.length, k = 0, out = [], i, floor;
    if (n < 3) { return points; }
    for (i = 0; i < n; i++) {
      while (k >= 2 && cross2(out[k - 2], out[k - 1], points[i]) <= 0) { k--; }
      out[k++] = points[i];
    }
    floor = k + 1;
    for (i = n - 2; i >= 0; i--) {
      while (k >= floor && cross2(out[k - 2], out[k - 1], points[i]) <= 0) { k--; }
      out[k++] = points[i];
    }
    out.length = Math.max(0, k - 1);
    return out;
  }

  function cross2(o, a, b) {
    return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  }

  G.submitShadow = function (cam, mesh, pos, quat, groundY, opts) {
    opts = opts || {};
    hullPts.length = 0;
    var faces = mesh.faces, step = Math.max(1, Math.floor(faces.length / 24));
    for (var i = 0; i < faces.length; i += step) {
      var f = faces[i];
      for (var j = 0; j < f.v.length; j++) {
        var lv = f.v[j];
        var rv = quat ? Q.rotate(quat, { x: lv[0], y: lv[1], z: lv[2] }) : { x: lv[0], y: lv[1], z: lv[2] };
        hullPts.push({ x: pos.x + rv.x, z: pos.z + rv.z });
      }
    }
    if (hullPts.length < 3) { return; }
    var h = hull2d(hullPts.slice());
    if (h.length < 3) { return; }
    var verts = [];
    for (var k = 0; k < h.length; k++) {
      verts.push({ x: h[k].x, y: groundY, z: h[k].z });
    }
    G.submitFace(cam, verts, 'shadow', {
      twoSided: true, noHaze: true, bias: opts.bias || 0.6,
      light: opts.light, ambient: opts.ambient
    });
  };

})(typeof window !== 'undefined' ? window : globalThis);
