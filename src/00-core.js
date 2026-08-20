// AERODROME :: src/00-core.js :: v1.0.0
// Namespace, math, quaternions, seeded noise. Loaded first, depends on nothing.
// GPL-3.0
(function (root) {
  'use strict';

  var AERO = root.AERO = root.AERO || {};

  AERO.NAME = 'AERODROME';
  AERO.VERSION = '1.0.0';
  AERO.SCHEMA_VERSION = 1;
  AERO.BUILD = 0; // set by storage on load, displayed next to the version

  // ---------------------------------------------------------------- scalars
  var M = AERO.math = {};

  M.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  M.lerp = function (a, b, t) { return a + (b - a) * t; };
  M.rad = function (d) { return d * Math.PI / 180; };
  M.deg = function (r) { return r * 180 / Math.PI; };
  M.wrapPi = function (a) {
    while (a > Math.PI) { a -= Math.PI * 2; }
    while (a < -Math.PI) { a += Math.PI * 2; }
    return a;
  };
  M.approach = function (cur, target, rate, dt) {
    var d = target - cur;
    var step = rate * dt;
    if (Math.abs(d) <= step) { return target; }
    return cur + (d > 0 ? step : -step);
  };
  M.smoothstep = function (t) { t = M.clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  // ------------------------------------------------------------------- vec3
  // World axes: x east, y up, z north. Body axes: x nose, y up, z = x cross y.
  var V = AERO.vec3 = {};

  V.make = function (x, y, z) { return { x: x || 0, y: y || 0, z: z || 0 }; };
  V.copy = function (a) { return { x: a.x, y: a.y, z: a.z }; };
  V.set = function (o, x, y, z) { o.x = x; o.y = y; o.z = z; return o; };
  V.add = function (a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; };
  V.sub = function (a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; };
  V.scale = function (a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; };
  V.addTo = function (a, b, s) {
    s = (s === undefined) ? 1 : s;
    a.x += b.x * s; a.y += b.y * s; a.z += b.z * s; return a;
  };
  V.dot = function (a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; };
  V.cross = function (a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  };
  V.len = function (a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); };
  V.len2 = function (a) { return a.x * a.x + a.y * a.y + a.z * a.z; };
  V.norm = function (a) {
    var l = V.len(a);
    if (l < 1e-9) { return { x: 0, y: 0, z: 0 }; }
    return { x: a.x / l, y: a.y / l, z: a.z / l };
  };
  V.zero = function () { return { x: 0, y: 0, z: 0 }; };

  // ------------------------------------------------------------------- quat
  var Q = AERO.quat = {};

  Q.identity = function () { return { w: 1, x: 0, y: 0, z: 0 }; };
  Q.copy = function (q) { return { w: q.w, x: q.x, y: q.y, z: q.z }; };

  Q.mul = function (a, b) {
    return {
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
    };
  };

  Q.normalize = function (q) {
    var l = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
    if (l < 1e-12) { return Q.identity(); }
    return { w: q.w / l, x: q.x / l, y: q.y / l, z: q.z / l };
  };

  Q.conj = function (q) { return { w: q.w, x: -q.x, y: -q.y, z: -q.z }; };

  Q.fromAxisAngle = function (axis, ang) {
    var n = V.norm(axis);
    var h = ang * 0.5, s = Math.sin(h);
    return { w: Math.cos(h), x: n.x * s, y: n.y * s, z: n.z * s };
  };

  // Rotate a body vector into world space.
  Q.rotate = function (q, v) {
    var tx = 2 * (q.y * v.z - q.z * v.y);
    var ty = 2 * (q.z * v.x - q.x * v.z);
    var tz = 2 * (q.x * v.y - q.y * v.x);
    return {
      x: v.x + q.w * tx + (q.y * tz - q.z * ty),
      y: v.y + q.w * ty + (q.z * tx - q.x * tz),
      z: v.z + q.w * tz + (q.x * ty - q.y * tx)
    };
  };

  // Rotate a world vector into body space.
  Q.invRotate = function (q, v) { return Q.rotate(Q.conj(q), v); };

  // Integrate attitude by a body rate vector over dt.
  Q.integrate = function (q, omegaBody, dt) {
    var half = { w: 0, x: omegaBody.x * 0.5 * dt, y: omegaBody.y * 0.5 * dt, z: omegaBody.z * 0.5 * dt };
    var d = Q.mul(q, half);
    return Q.normalize({ w: q.w + d.w, x: q.x + d.x, y: q.y + d.y, z: q.z + d.z });
  };

  // Heading, pitch, bank derived from the body axes in world space.
  Q.attitude = function (q) {
    var fwd = Q.rotate(q, { x: 1, y: 0, z: 0 });
    var up = Q.rotate(q, { x: 0, y: 1, z: 0 });
    var pitch = Math.asin(M.clamp(fwd.y, -1, 1));
    var heading = Math.atan2(fwd.x, fwd.z); // 0 is north, positive toward east
    if (heading < 0) { heading += Math.PI * 2; }
    // Bank is measured about the nose axis, against the zero bank up vector
    // for the current heading and pitch.
    var up0 = V.sub({ x: 0, y: 1, z: 0 }, V.scale(fwd, fwd.y));
    if (V.len2(up0) < 1e-8) { up0 = V.norm(V.sub(up, V.scale(fwd, V.dot(up, fwd)))); }
    else { up0 = V.norm(up0); }
    var side = V.cross(up0, fwd); // horizontal, toward the pilot's right
    var bank = Math.atan2(V.dot(up, side), V.dot(up, up0));
    return { heading: heading, pitch: pitch, bank: bank };
  };

  // Build the attitude from the basis it should produce, which avoids any
  // argument about rotation order. Heading is measured from north toward east.
  Q.fromBasis = function (fwd, up) {
    var f = V.norm(fwd);
    var u = V.norm(V.sub(up, V.scale(f, V.dot(up, f))));
    if (V.len2(u) < 1e-9) { u = { x: 0, y: 1, z: 0 }; }
    var z = V.cross(f, u); // body z, toward the pilot's left
    var m00 = f.x, m01 = u.x, m02 = z.x;
    var m10 = f.y, m11 = u.y, m12 = z.y;
    var m20 = f.z, m21 = u.z, m22 = z.z;
    var tr = m00 + m11 + m22, s, q;
    if (tr > 0) {
      s = Math.sqrt(tr + 1) * 2;
      q = { w: 0.25 * s, x: (m21 - m12) / s, y: (m02 - m20) / s, z: (m10 - m01) / s };
    } else if (m00 > m11 && m00 > m22) {
      s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      q = { w: (m21 - m12) / s, x: 0.25 * s, y: (m01 + m10) / s, z: (m02 + m20) / s };
    } else if (m11 > m22) {
      s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      q = { w: (m02 - m20) / s, x: (m01 + m10) / s, y: 0.25 * s, z: (m12 + m21) / s };
    } else {
      s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      q = { w: (m10 - m01) / s, x: (m02 + m20) / s, y: (m12 + m21) / s, z: 0.25 * s };
    }
    return Q.normalize(q);
  };

  Q.fromEuler = function (headingRad, pitchRad, bankRad) {
    var ch = Math.cos(headingRad), sh = Math.sin(headingRad);
    var cp = Math.cos(pitchRad), sp = Math.sin(pitchRad);
    var fwd = { x: sh * cp, y: sp, z: ch * cp };
    var up0 = { x: -sh * sp, y: cp, z: -ch * sp };
    var right0 = V.cross(up0, fwd);
    var cb = Math.cos(bankRad || 0), sb = Math.sin(bankRad || 0);
    var up = {
      x: up0.x * cb + right0.x * sb,
      y: up0.y * cb + right0.y * sb,
      z: up0.z * cb + right0.z * sb
    };
    return Q.fromBasis(fwd, up);
  };

  // -------------------------------------------------------------------- rng
  AERO.rng = function (seed) {
    var s = (seed >>> 0) || 0x9E3779B9;
    var f = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = function (a, b) { return a + (b - a) * f(); };
    f.pick = function (arr) { return arr[Math.floor(f() * arr.length) % arr.length]; };
    return f;
  };

  // Deterministic value noise, used by terrain and turbulence. No tables to load.
  AERO.noise2 = function (x, y, seed) {
    seed = seed || 0;
    function h(ix, iy) {
      var n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2246822519);
      n = (n ^ (n >>> 13)) >>> 0;
      n = Math.imul(n, 1274126177) >>> 0;
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    }
    var x0 = Math.floor(x), y0 = Math.floor(y);
    var fx = M.smoothstep(x - x0), fy = M.smoothstep(y - y0);
    var a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
    return M.lerp(M.lerp(a, b, fx), M.lerp(c, d, fx), fy) * 2 - 1;
  };

  AERO.fbm2 = function (x, y, octaves, seed) {
    var sum = 0, amp = 1, freq = 1, norm = 0;
    for (var i = 0; i < octaves; i++) {
      sum += AERO.noise2(x * freq, y * freq, seed + i * 101) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  };

  // ------------------------------------------------------------- atmosphere
  AERO.atmos = {
    // International Standard Atmosphere, troposphere only. Good to 11 km.
    density: function (altM) {
      var t = 288.15 - 0.0065 * altM;
      if (t < 216.65) { t = 216.65; }
      var p = 101325 * Math.pow(t / 288.15, 5.2561);
      return p / (287.05 * t);
    },
    temperature: function (altM) {
      var t = 288.15 - 0.0065 * altM;
      return t < 216.65 ? 216.65 : t;
    },
    pressure: function (altM) {
      var t = 288.15 - 0.0065 * altM;
      if (t < 216.65) { t = 216.65; }
      return 101325 * Math.pow(t / 288.15, 5.2561);
    },
    G: 9.80665
  };

  AERO.util = {
    now: function () {
      if (typeof performance !== 'undefined' && performance.now) { return performance.now(); }
      return Date.now();
    },
    pad: function (n, w) {
      var s = String(Math.abs(Math.round(n)));
      while (s.length < w) { s = '0' + s; }
      return (n < 0 ? '-' : '') + s;
    },
    deepCopy: function (o) { return JSON.parse(JSON.stringify(o)); }
  };

})(typeof window !== 'undefined' ? window : globalThis);
