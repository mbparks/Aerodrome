// AERODROME :: src/09-camera.js :: v1.4.0
// Cockpit eye point, trailing spring damper chase, and a tower view.
// Depends on 00-core.js, 03-render.js, 07-world.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math, V = AERO.vec3, Q = AERO.quat, G = AERO.render, W = AERO.world;

  var C = AERO.camera = {};

  C.MODES = ['cockpit', 'chase', 'tower'];

  C.create = function () {
    return {
      mode: 'cockpit',
      cam: G.makeCamera(),
      look: { yaw: 0, pitch: 0 },
      lookRate: 2.2,
      chasePos: V.make(0, 0, 0),
      chaseVel: V.zero(),
      chaseInit: false,
      shake: 0,
      reducedMotion: false,
      fovCockpit: 66,
      fovChase: 58,
      tower: { x: -70, y: 0, z: 120 },
      viewIndex: 0,
      viewAim: null,
      viewFov: 60,
      settings: { dist: 16, up: 4, lag: 3.2, lead: 0.9, damping: 1.35, bankMix: 0.35 }
    };
  };

  C.applyAircraftDefaults = function (rig, ac) {
    if (!ac || !ac.chase) { return; }
    rig.settings.dist = ac.chase.dist;
    rig.settings.up = ac.chase.up;
    rig.settings.lag = ac.chase.lag;
    rig.settings.lead = ac.chase.lead;
    rig.chaseInit = false;
  };

  C.snapForward = function (rig) { rig.look.yaw = 0; rig.look.pitch = 0; };

  C.lookAround = function (rig, dYaw, dPitch) {
    rig.look.yaw = M.clamp(rig.look.yaw + dYaw, -M.rad(160), M.rad(160));
    rig.look.pitch = M.clamp(rig.look.pitch + dPitch, -M.rad(80), M.rad(85));
  };

  // Build a quaternion that looks along fwd with the given up hint.
  C.lookAt = function (from, to, upHint) {
    var fwd = V.sub(to, from);
    if (V.len2(fwd) < 1e-6) { fwd = { x: 0, y: 0, z: 1 }; }
    return Q.fromBasis(fwd, upHint || { x: 0, y: 1, z: 0 });
  };

  C.update = function (rig, st, dt, opts) {
    opts = opts || {};
    var cam = rig.cam;
    var ac = st.ac;
    if (rig.mode === 'cockpit') {
      var eye = ac.eye || [0, 0.5, 0];
      var off = Q.rotate(st.quat, { x: eye[0], y: eye[1], z: eye[2] });
      cam.pos = V.add(st.pos, off);
      var qYaw = Q.fromAxisAngle({ x: 0, y: 1, z: 0 }, rig.look.yaw);
      var qPitch = Q.fromAxisAngle({ x: 0, y: 0, z: 1 }, rig.look.pitch);
      cam.quat = Q.mul(st.quat, Q.mul(qYaw, qPitch));
      cam.fovDeg = rig.fovCockpit;
    } else if (rig.mode === 'chase') {
      var s = rig.settings;
      var fwd = Q.rotate(st.quat, { x: 1, y: 0, z: 0 });
      var flat = V.norm({ x: fwd.x, y: 0, z: fwd.z });
      if (V.len2(flat) < 1e-6) { flat = { x: 0, y: 0, z: 1 }; }
      var desired = {
        x: st.pos.x - flat.x * s.dist - st.vel.x * s.lead * 0.12,
        y: st.pos.y + s.up + Math.max(-6, Math.min(6, -st.vel.y * 0.10)),
        z: st.pos.z - flat.z * s.dist - st.vel.z * s.lead * 0.12
      };
      if (!rig.chaseInit) {
        rig.chasePos = V.copy(desired);
        rig.chaseVel = V.zero();
        rig.chaseInit = true;
      }
      // Spring damper. The camera sags under acceleration and swings wide in
      // a hard turn because it is chasing a point, not welded to one.
      var k = s.lag * s.lag;
      var c = 2 * s.damping * s.lag;
      var err = V.sub(desired, rig.chasePos);
      rig.chaseVel.x += (err.x * k - rig.chaseVel.x * c) * dt;
      rig.chaseVel.y += (err.y * k - rig.chaseVel.y * c) * dt;
      rig.chaseVel.z += (err.z * k - rig.chaseVel.z * c) * dt;
      rig.chasePos = V.addTo(V.copy(rig.chasePos), rig.chaseVel, dt);
      var floor = W.heightAt(rig.chasePos.x, rig.chasePos.z) + 2.2;
      if (rig.chasePos.y < floor) { rig.chasePos.y = floor; rig.chaseVel.y = Math.max(0, rig.chaseVel.y); }
      cam.pos = V.copy(rig.chasePos);
      var aim = {
        x: st.pos.x + st.vel.x * s.lead * 0.06,
        y: st.pos.y + st.vel.y * s.lead * 0.04,
        z: st.pos.z + st.vel.z * s.lead * 0.06
      };
      var acUp = Q.rotate(st.quat, { x: 0, y: 1, z: 0 });
      var mix = rig.reducedMotion ? 0 : s.bankMix;
      var upHint = V.norm({
        x: acUp.x * mix, y: M.lerp(1, acUp.y, mix), z: acUp.z * mix
      });
      cam.quat = C.lookAt(cam.pos, aim, upHint);
      cam.fovDeg = rig.fovChase;
    } else {
      // Tower and flyby. The world file lists the fixed camera sites. The
      // nearest one takes the shot, the aim is smoothed so a fast pass looks
      // like a camera operator rather than a turret, and the zoom follows
      // distance so the aircraft stays the same size in frame.
      var site = C.pickView(rig, st);
      var sy = W.heightAt(site.x, site.z) + site.height;
      cam.pos = { x: site.x, y: sy, z: site.z };
      // Lead the aim slightly, then smooth it. Reduced motion snaps instead.
      var want = {
        x: st.pos.x + st.vel.x * 0.22,
        y: st.pos.y + st.vel.y * 0.18,
        z: st.pos.z + st.vel.z * 0.22
      };
      if (!rig.viewAim || rig.reducedMotion) {
        rig.viewAim = V.copy(want);
      } else {
        var k = M.clamp(dt * 4.5, 0, 1);
        rig.viewAim = {
          x: M.lerp(rig.viewAim.x, want.x, k),
          y: M.lerp(rig.viewAim.y, want.y, k),
          z: M.lerp(rig.viewAim.z, want.z, k)
        };
      }
      cam.quat = C.lookAt(cam.pos, rig.viewAim, { x: 0, y: 1, z: 0 });
      var d = V.len(V.sub(st.pos, cam.pos));
      // Frame the aircraft to a roughly constant size, then damp the zoom so
      // it does not pump on a close pass.
      var span = (st.ac.wing && st.ac.wing.spanM) ? st.ac.wing.spanM : 8;
      var wantFov = M.clamp(M.deg(2 * Math.atan((span * 2.6) / Math.max(12, d))), 9, 62);
      rig.viewFov = rig.viewFov ? M.lerp(rig.viewFov, wantFov, M.clamp(dt * 2.2, 0, 1)) : wantFov;
      cam.fovDeg = rig.viewFov;
    }

    // Camera shake, damped when the user asks for reduced motion.
    if (rig.shake > 0.0005) {
      var amp = rig.reducedMotion ? rig.shake * 0.15 : rig.shake;
      var jx = (Math.random() - 0.5) * amp * 0.02;
      var jy = (Math.random() - 0.5) * amp * 0.02;
      var qj = Q.mul(Q.fromAxisAngle({ x: 0, y: 1, z: 0 }, jx), Q.fromAxisAngle({ x: 0, y: 0, z: 1 }, jy));
      cam.quat = Q.mul(cam.quat, qj);
      rig.shake = Math.max(0, rig.shake - dt * 2.2);
    }

    G.updateCamera(cam);
    return cam;
  };

  // Fixed camera sites come from the world file. The closest one to the
  // aircraft gets the shot, with hysteresis so it does not flip back and
  // forth when the aircraft is equidistant between two.
  C.pickView = function (rig, st) {
    var views = (W.params && W.params.views && W.params.views.length)
      ? W.params.views
      : [{ name: 'TOWER', x: rig.tower.x, z: rig.tower.z, height: 17 }];
    var best = rig.viewIndex || 0;
    if (best >= views.length) { best = 0; }
    var bestD = Infinity;
    for (var i = 0; i < views.length; i++) {
      var dx = views[i].x - st.pos.x, dz = views[i].z - st.pos.z;
      var d = Math.sqrt(dx * dx + dz * dz);
      // The site already in use keeps a generous head start.
      if (i === rig.viewIndex) { d *= 0.62; }
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best !== rig.viewIndex) {
      rig.viewIndex = best;
      rig.viewAim = null;
    }
    return views[best];
  };

  C.nextView = function (rig) {
    var views = (W.params && W.params.views) ? W.params.views : [];
    if (!views.length) { return null; }
    rig.viewIndex = (rig.viewIndex + 1) % views.length;
    rig.viewAim = null;
    return views[rig.viewIndex];
  };

  C.cycle = function (rig, allowTower) {
    var order = allowTower ? C.MODES : ['cockpit', 'chase'];
    var i = order.indexOf(rig.mode);
    rig.mode = order[(i + 1) % order.length];
    rig.chaseInit = false;
    return rig.mode;
  };

  C.setMode = function (rig, mode) {
    if (C.MODES.indexOf(mode) < 0) { return false; }
    rig.mode = mode;
    rig.chaseInit = false;
    return true;
  };

})(typeof window !== 'undefined' ? window : globalThis);
