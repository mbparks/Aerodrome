// AERODROME :: src/09-camera.js :: v1.0.0
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
      // Tower and flyby. Sits on the field, tracks the aircraft, and gives up
      // gracefully when the aircraft is far away.
      var t = rig.tower;
      var ty = W.heightAt(t.x, t.z) + 17;
      cam.pos = { x: t.x, y: ty, z: t.z };
      cam.quat = C.lookAt(cam.pos, st.pos, { x: 0, y: 1, z: 0 });
      var d = V.len(V.sub(st.pos, cam.pos));
      cam.fovDeg = M.clamp(60 - Math.log(Math.max(60, d) / 60) * 14, 12, 60);
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
