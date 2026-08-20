// AERODROME :: src/08-weather.js :: v1.1.0
// Mean wind, gusts, turbulence, ridge lift, thermals, and the sky clock.
// The balloon and the sailplane are unflyable without this file.
// Depends on 00-core.js, 01-palette.js, 07-world.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math, V = AERO.vec3, W = AERO.world, P = AERO.palette;

  var X = AERO.weather = {};

  X.state = {
    hour: 9.5,
    hourRate: 0.06,          // hours per real second, about a 400 second day
    meanDirDeg: 265,         // direction the wind is coming from
    meanSpeed: 6.5,
    gustiness: 0.45,
    turbulence: 0.5,
    thermalStrength: 1.0,
    ridgeStrength: 1.0,
    enabled: true
  };

  // Surface roughness length for the boundary layer profile. Open grass.
  X.ROUGHNESS_M = 0.35;

  var gust = { speed: 0, dir: 0, t: 0 };

  X.thermals = [];
  X.buildThermals = function () {
    var rnd = AERO.rng(3311);
    X.thermals = [];
    // Over the town, which heats first, and over the open ground east of the
    // river. Nothing over the water.
    for (var i = 0; i < 5; i++) {
      X.thermals.push({
        x: W.TOWN.x + (rnd() - 0.5) * 700, z: W.TOWN.z + (rnd() - 0.5) * 700,
        r: 150 + rnd() * 120, core: 2.6 + rnd() * 2.2, phase: rnd() * 6.28, urban: true
      });
    }
    for (var j = 0; j < 7; j++) {
      X.thermals.push({
        x: (rnd() - 0.5) * 3000, z: (rnd() - 0.5) * 3000,
        r: 130 + rnd() * 180, core: 1.8 + rnd() * 2.4, phase: rnd() * 6.28, urban: false
      });
    }
  };
  X.buildThermals();

  X.env = {
    wind: V.zero(),
    windMean: V.zero(),
    sunDir: V.make(0, -1, 0),
    ambient: 0.7,
    hour: 9.5,
    dt: 1 / 60,
    noDissipation: false,
    groundHeight: function (x, z) { return W.heightAt(x, z); },
    groundNormal: function (x, z) { return W.normalAt(x, z); }
  };

  // Direction the wind blows toward, as a unit vector.
  function meanVector() {
    var s = X.state;
    var toRad = M.rad(s.meanDirDeg + 180);
    return { x: Math.sin(toRad), y: 0, z: Math.cos(toRad) };
  }

  X.tick = function (dt) {
    var s = X.state;
    s.hour += s.hourRate * dt;
    if (s.hour >= 24) { s.hour -= 24; }
    // Ornstein Uhlenbeck gust process. Mean reverting, so the wind wanders
    // without running away.
    gust.t += dt;
    var tau = 4.5;
    var a = Math.exp(-dt / tau);
    var sigma = s.gustiness * s.meanSpeed * 0.55;
    gust.speed = gust.speed * a + Math.sqrt(1 - a * a) * sigma * (Math.random() * 2 - 1) * 1.2;
    gust.dir = gust.dir * a + Math.sqrt(1 - a * a) * M.rad(18) * s.gustiness * (Math.random() * 2 - 1) * 1.2;

    var mv = meanVector();
    var ang = Math.atan2(mv.x, mv.z) + gust.dir;
    var sp = Math.max(0, s.meanSpeed + gust.speed);
    X.env.windMean = { x: Math.sin(ang) * sp, y: 0, z: Math.cos(ang) * sp };
    X.env.hour = s.hour;
    X.env.ambient = P.applyTimeOfDay(s.hour);
    X.env.sunDir = X.sunDirection(s.hour);
    return X.env;
  };

  X.sunDirection = function (hour) {
    // A simple arc: sunrise near 6, noon overhead, sunset near 18. The vector
    // points from the sun toward the ground, which is what the shader wants.
    var t = (hour - 6) / 12;
    var elev = Math.sin(M.clamp(t, -0.2, 1.2) * Math.PI);
    var az = M.rad(90 - t * 180);
    var dir = { x: -Math.cos(az) * Math.cos(elev * Math.PI / 2), y: -Math.max(0.12, elev), z: -Math.sin(az) * 0.4 };
    return V.norm(dir);
  };

  // Total wind at a point, including terrain effects. Called once per frame
  // for the aircraft, and by the tuning readouts.
  X.windAt = function (pos, t, gustFactor) {
    var s = X.state;
    if (!s.enabled) { return V.zero(); }
    var w = V.copy(X.env.windMean);
    var agl = pos.y - W.heightAt(pos.x, pos.z);

    // Surface boundary layer. A log profile referenced to 200 metres, so the
    // wind on short final is genuinely weaker than the wind that was reported
    // at altitude. This is what makes a crosswind landing a skill.
    if (s.gradient !== false) {
      var z0 = X.ROUGHNESS_M;
      var prof = Math.log((Math.max(0.4, agl) + z0) / z0) / Math.log((200 + z0) / z0);
      prof = M.clamp(prof, 0.10, 1.22);
      w.x *= prof; w.z *= prof;
    }
    var sp = Math.sqrt(w.x * w.x + w.z * w.z);

    // Turbulence. Band limited noise sampled in space and time, stronger in
    // the first few hundred metres and stronger for very light aircraft.
    var lowLevel = M.clamp(1 - agl / 420, 0.15, 1);
    var amp = s.turbulence * (0.6 + sp * 0.09) * lowLevel * (gustFactor || 1);
    if (amp > 0.001) {
      var sx = pos.x / 140, sz = pos.z / 140, st = t * 0.35;
      w.x += AERO.fbm2(sx + st, sz, 3, 11) * amp;
      w.y += AERO.fbm2(sx, sz + st, 3, 23) * amp * 0.85;
      w.z += AERO.fbm2(sx - st, sz + st, 3, 37) * amp;
    }

    // Ridge lift. The upwind slope deflects the flow upward, and it fades out
    // above the ridge crest.
    if (s.ridgeStrength > 0 && sp > 0.5) {
      var n = W.normalAt(pos.x, pos.z);
      var slope = Math.sqrt(n.x * n.x + n.z * n.z);
      if (slope > 0.03) {
        var into = -(n.x * w.x + n.z * w.z) / sp; // positive on the upwind face
        var terr = W.heightAt(pos.x, pos.z);
        var above = pos.y - terr;
        var fade = Math.exp(-Math.max(0, above) / 220);
        var lift = sp * slope * M.clamp(into, 0, 1) * 1.35 * fade * s.ridgeStrength;
        w.y += lift;
        // Lee side sink, so the wrong side of the ridge is genuinely wrong.
        if (into < -0.15) { w.y -= sp * slope * M.clamp(-into, 0, 1) * 0.8 * fade * s.ridgeStrength; }
      }
    }

    // Thermals. Strength follows the sun, drift follows the wind, and each
    // column is ringed by compensating sink.
    if (s.thermalStrength > 0) {
      var day = M.clamp(Math.sin((X.state.hour - 6) / 12 * Math.PI), 0, 1);
      var drift = t * 0.6;
      for (var i = 0; i < X.thermals.length; i++) {
        var th = X.thermals[i];
        var cx = th.x + X.env.windMean.x * drift * 0.02;
        var cz = th.z + X.env.windMean.z * drift * 0.02;
        var dx = pos.x - cx, dz = pos.z - cz;
        var d = Math.sqrt(dx * dx + dz * dz);
        if (d > th.r * 2.4) { continue; }
        var base = W.heightAt(cx, cz);
        var h = pos.y - base;
        if (h < -20 || h > 1500) { continue; }
        var vertProfile = M.clamp(h / 120, 0, 1) * M.clamp(1 - (h - 700) / 800, 0, 1);
        var pulse = 0.75 + 0.25 * Math.sin(t * 0.25 + th.phase);
        var strength = th.core * day * (th.urban ? 1.15 : 1) * vertProfile * pulse * s.thermalStrength;
        if (d < th.r) {
          w.y += strength * Math.cos(d / th.r * Math.PI / 2);
        } else {
          var od = (d - th.r) / (th.r * 1.4);
          w.y -= strength * 0.32 * Math.exp(-od * 2.2);
        }
      }
    }
    return w;
  };

  X.describe = function () {
    var s = X.state;
    var w = X.env.windMean;
    var sp = Math.sqrt(w.x * w.x + w.z * w.z);
    var from = (M.deg(Math.atan2(-w.x, -w.z)) + 360) % 360;
    return {
      hour: s.hour,
      speed: sp,
      fromDeg: from,
      label: AERO.util.pad(from, 3) + ' / ' + sp.toFixed(1) + ' MPS'
    };
  };

  X.set = function (key, value) {
    if (X.state[key] === undefined) { return false; }
    X.state[key] = value;
    return true;
  };

})(typeof window !== 'undefined' ? window : globalThis);
