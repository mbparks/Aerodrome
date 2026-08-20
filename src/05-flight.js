// AERODROME :: src/05-flight.js :: v1.0.0
// One integrator for every aircraft. Capability flags extend it, nothing in
// this file branches on an aircraft by name.
// Depends on 00-core.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var V = AERO.vec3, Q = AERO.quat, M = AERO.math, ATM = AERO.atmos;

  var F = AERO.flight = {};

  F.SUBSTEP = 1 / 240;   // fixed physics step
  F.MAX_STEPS = 12;      // catch up limit, keeps a stalled tab from exploding

  F.neutralControls = function () {
    return {
      pitch: 0, roll: 0, yaw: 0, throttle: 0,
      collective: 0, cyclicPitch: 0, cyclicRoll: 0,
      burner: 0, vent: 0,
      liftX: 0, liftY: 0, liftZ: 0,   // reaction craft translation
      flap: 0, gear: 1, brake: 0, spoiler: 0,
      trim: 0
    };
  };

  F.createState = function (ac, init) {
    init = init || {};
    var st = {
      ac: ac,
      pos: init.pos ? V.copy(init.pos) : V.make(0, 0, 0),
      vel: init.vel ? V.copy(init.vel) : V.zero(),
      quat: init.quat ? Q.copy(init.quat) : Q.fromEuler(init.heading || 0, init.pitch || 0, init.bank || 0),
      omega: V.zero(),
      controls: F.neutralControls(),
      rpm: 0,
      rotorRPM: ac.rotor ? ac.rotor.nominalRPM : 0,
      fuel: ac.fuelKg || 0,
      gasTempK: ac.buoyancy ? ac.buoyancy.ambientK : 288,
      flapPhase: 0,
      onGround: false,
      contactCount: 0,
      crashed: false,
      crashReason: '',
      time: 0,
      accel: V.zero(),
      derived: {}
    };
    st.controls.gear = (init.gear === undefined) ? 1 : init.gear;
    st.controls.throttle = init.throttle || 0;
    if (ac.buoyancy) { st.gasTempK = init.gasTempK || ac.buoyancy.trimK || ac.buoyancy.ambientK + 90; }
    F.derive(st, F.stillAir());
    return st;
  };

  F.stillAir = function () {
    return {
      wind: V.zero(),
      groundHeight: function () { return 0; },
      groundNormal: function () { return { x: 0, y: 1, z: 0 }; },
      noDissipation: false,
      turbulence: V.zero()
    };
  };

  // ---------------------------------------------------------------- forces
  // Returns world force and body moment for the current state. Every branch
  // below is gated by a capability flag on the aircraft, never by its name.
  F.forces = function (st, env, out) {
    var ac = st.ac, c = st.controls;
    var g = ATM.G;
    var rho = ATM.density(st.pos.y);
    var wind = env.wind || V.zero();

    var force = V.make(0, -ac.massKg * g, 0);
    var moment = V.zero();

    // Relative airflow.
    var rel = V.sub(st.vel, wind);
    var speed = V.len(rel);
    var vb = Q.invRotate(st.quat, rel);
    var alpha = 0, beta = 0, qbar = 0;
    if (speed > 0.15) {
      alpha = Math.atan2(-vb.y, Math.max(0.05, Math.abs(vb.x)) * (vb.x < 0 ? -1 : 1));
      beta = Math.asin(M.clamp(vb.z / speed, -1, 1));
      qbar = 0.5 * rho * speed * speed;
    }
    var dissipate = env.noDissipation ? 0 : 1;

    var up = Q.rotate(st.quat, { x: 0, y: 1, z: 0 });
    var fwd = Q.rotate(st.quat, { x: 1, y: 0, z: 0 });
    var lat = V.cross(fwd, up); // body z in world, points to the pilot's left

    // --------------------------------------------------------- aerodynamics
    var CL = 0, CD = 0;
    if (ac.wing && speed > 0.15) {
      var w = ac.wing;
      var flapPos = c.flap || 0;
      var cl0 = (w.cl0 || 0) + (w.flapCl || 0) * flapPos;
      var linear = cl0 + w.clAlpha * alpha;
      var stall = w.stallAlpha || M.rad(15);
      var over = (Math.abs(alpha) - stall) / M.rad(6);
      var sigma = M.clamp(over, 0, 1);
      var plate = 1.9 * Math.sin(alpha) * Math.cos(alpha) * 2;
      CL = M.lerp(linear, plate, sigma);
      var cd0 = (w.cd0 || 0.03) + (w.flapCd || 0) * flapPos
        + (w.gearCd || 0) * (c.gear || 0) + (w.spoilerCd || 0) * (c.spoiler || 0);
      CD = cd0 + (w.k || 0.05) * CL * CL + Math.abs(beta) * (w.cdBeta || 0.4)
        + sigma * (w.cdStall || 0.5);

      var vhat = V.scale(rel, 1 / speed);
      var latAir = V.cross(vhat, up);
      if (V.len2(latAir) < 1e-6) { latAir = lat; }
      latAir = V.norm(latAir);
      var liftDir = V.norm(V.cross(latAir, vhat));

      var L = qbar * w.areaM2 * CL;
      var D = qbar * w.areaM2 * CD * dissipate;
      var Y = qbar * w.areaM2 * (w.cyBeta || 0.6) * beta * dissipate;

      V.addTo(force, liftDir, L);
      V.addTo(force, vhat, -D);
      V.addTo(force, lat, -Y);

      // Moments. Control authority scales with dynamic pressure, so controls
      // go soft at low speed exactly as they should.
      var auth = M.clamp(qbar / (w.refQ || 400), 0, ac.control.maxAuthMul || 2.2);
      moment.x += -c.roll * ac.control.roll * auth;
      moment.z += (c.pitch + (c.trim || 0)) * ac.control.pitch * auth;
      moment.y += c.yaw * ac.control.yaw * auth;

      // Static stability and damping. cm0 sets where the airframe wants to sit
      // with the stick centered, cmAlpha is how hard it argues about leaving.
      moment.z += ((w.cm0 || 0) - (w.cmAlpha || 1.2) * alpha) * qbar * w.areaM2 * (w.chordM || 1.2);
      moment.y += -(w.cnBeta || 0.9) * beta * qbar * w.areaM2 * (w.spanM || 8) * 0.1;
      moment.x += -(w.clBeta || 0.35) * beta * qbar * w.areaM2 * (w.spanM || 8) * 0.1;
    }

    // Rate damping applies whether or not there is a wing, so reaction craft
    // and balloons do not spin forever.
    var damp = ac.control.damp || { x: 40, y: 60, z: 90 };
    var dampScale = ac.wing ? (0.35 + qbar / 900) : 1;
    moment.x -= st.omega.x * damp.x * dampScale * dissipate;
    moment.y -= st.omega.y * damp.y * dampScale * dissipate;
    moment.z -= st.omega.z * damp.z * dampScale * dissipate;

    // ---------------------------------------------------------------- thrust
    if (ac.propulsion) {
      var pr = ac.propulsion;
      var thr = c.throttle;
      if (st.fuel <= 0 && ac.fuelKg) { thr = 0; }
      var fade = 1;
      if (pr.vRef) { fade = M.clamp(1 - Math.pow(Math.max(0, vb.x) / pr.vRef, pr.vExp || 2), pr.minFade || 0.1, 1); }
      var T = pr.maxThrustN * thr * fade * Math.pow(ATM.density(st.pos.y) / 1.225, pr.rhoExp || 0.7);
      V.addTo(force, fwd, T);
      if (pr.torqueRoll) { moment.x += pr.torqueRoll * thr; }
      if (pr.pFactor) { moment.y += pr.pFactor * thr * M.clamp(alpha / M.rad(10), -1, 1); }
      st.rpm = M.lerp(st.rpm, pr.idleRPM + (pr.maxRPM - pr.idleRPM) * thr, 0.08);
    }

    // ------------------------------------------------------------- buoyancy
    if (ac.buoyancy) {
      var b = ac.buoyancy;
      var ambient = ATM.temperature(st.pos.y);
      var rhoGas;
      if (b.gasDensityRatio) {
        rhoGas = rho * b.gasDensityRatio;              // helium or hydrogen
      } else {
        rhoGas = ATM.pressure(st.pos.y) / (287.05 * st.gasTempK); // hot air
        var heat = (c.burner || 0) * b.burnerKPerSec - (c.vent || 0) * b.ventKPerSec;
        var cool = (st.gasTempK - ambient) * b.coolPerSec;
        st.gasTempK += (heat - cool) * (env.dt || F.SUBSTEP);
        st.gasTempK = M.clamp(st.gasTempK, ambient, ambient + b.maxDeltaK);
      }
      var lift = (rho - rhoGas) * b.volumeM3 * g;
      force.y += lift;
      // Envelope drag, large and mostly vertical.
      var vr = V.sub(st.vel, wind);
      var sp = V.len(vr);
      if (sp > 0.01) {
        var dragN = 0.5 * rho * sp * sp * b.dragArea * (b.cd || 0.5) * dissipate;
        V.addTo(force, V.scale(vr, 1 / sp), -dragN);
      }
      if (b.vectored) {
        V.addTo(force, fwd, b.vectored * c.throttle);
        moment.y += c.yaw * (ac.control.yaw || 1) * 0.8;
        moment.z += c.pitch * (ac.control.pitch || 1) * 0.5;
      }
    }

    // ---------------------------------------------------------------- rotor
    if (ac.rotor) {
      var r = ac.rotor;
      var powered = r.powered && c.throttle > 0.02 && (st.fuel > 0 || !ac.fuelKg);
      var targetRPM;
      if (powered) {
        targetRPM = r.nominalRPM * (0.6 + 0.4 * c.throttle);
      } else {
        // Autorotation. The rotor is driven by the descent, not the engine.
        var descent = Math.max(0, -st.vel.y);
        targetRPM = M.clamp(r.nominalRPM * (0.25 + descent / (r.autoDescent || 14)), 0, r.nominalRPM * 1.05);
      }
      st.rotorRPM = M.lerp(st.rotorRPM, targetRPM, 1 - Math.exp(-(env.dt || F.SUBSTEP) / (r.inertiaTau || 3)));
      var rpmFrac = st.rotorRPM / r.nominalRPM;
      var transl = 1 + (r.translationalLift || 0.35) * M.clamp(speed / (r.etlSpeed || 12), 0, 1);
      var coll = r.fixedCollective !== undefined ? r.fixedCollective : c.collective;
      var thrustN = r.maxThrustN * coll * rpmFrac * rpmFrac * transl * (rho / 1.225);
      var discUp = up;
      if (r.cyclic) {
        var tiltP = c.cyclicPitch * r.tiltRad, tiltR = c.cyclicRoll * r.tiltRad;
        var tilted = { x: Math.sin(-tiltP), y: 1, z: Math.sin(-tiltR) };
        discUp = V.norm(Q.rotate(st.quat, tilted));
        moment.z += -c.cyclicPitch * r.hubMoment;
        moment.x += -c.cyclicRoll * r.hubMoment;
      }
      V.addTo(force, discUp, thrustN);
      if (r.torqueYaw) {
        moment.y += r.torqueYaw * (powered ? c.throttle : 0) + c.yaw * (ac.control.yaw || 1);
      }
      if (r.rotorDragArea) {
        var vr2 = V.sub(st.vel, wind), sp2 = V.len(vr2);
        if (sp2 > 0.01) {
          V.addTo(force, V.scale(vr2, 1 / sp2), -0.5 * rho * sp2 * sp2 * r.rotorDragArea * dissipate);
        }
      }
    }

    // ------------------------------------------------------------- reaction
    // Direct body frame force with no aerodynamic dependence. No stall, no
    // airspeed term, nothing to trim.
    if (ac.reaction) {
      var rc = ac.reaction;
      var fb = {
        x: (c.liftZ || 0) * rc.forwardN,
        y: ((c.throttle || 0) + (c.liftY || 0)) * rc.upN,
        z: (c.liftX || 0) * rc.lateralN
      };
      var fw = Q.rotate(st.quat, fb);
      force.x += fw.x; force.y += fw.y; force.z += fw.z;
      moment.x += -c.roll * (ac.control.roll || 200);
      moment.z += c.pitch * (ac.control.pitch || 200);
      moment.y += c.yaw * (ac.control.yaw || 200);
      if (rc.dragK) {
        var vv = V.sub(st.vel, wind), sv = V.len(vv);
        if (sv > 0.01) { V.addTo(force, V.scale(vv, 1 / sv), -rc.dragK * sv * sv * dissipate); }
      }
    }

    // ------------------------------------------------------------- flapping
    if (ac.flapping) {
      var fl = ac.flapping;
      var rate = fl.baseHz + fl.hzPerThrottle * c.throttle;
      st.flapPhase += rate * Math.PI * 2 * (env.dt || F.SUBSTEP);
      if (st.flapPhase > Math.PI * 2) { st.flapPhase -= Math.PI * 2; }
      var beat = Math.sin(st.flapPhase);
      var power = (beat > 0 ? beat * beat : 0);
      var impulse = fl.peakN * power * (0.4 + 0.6 * c.throttle);
      V.addTo(force, fwd, impulse * (fl.forwardFrac || 0.5));
      V.addTo(force, up, impulse * (fl.upFrac || 1.0));
      moment.z += fl.pitchCouple * beat;
    }

    // ------------------------------------------------------ ground contact
    st.contactCount = 0;
    var gh = env.groundHeight ? env.groundHeight(st.pos.x, st.pos.z) : 0;
    if (ac.contacts) {
      for (var i = 0; i < ac.contacts.length; i++) {
        var cp = ac.contacts[i];
        if (cp.gear && (c.gear || 0) < 0.5) { continue; }
        var lp = { x: cp.p[0], y: cp.p[1], z: cp.p[2] };
        var wp = V.add(st.pos, Q.rotate(st.quat, lp));
        var h = env.groundHeight ? env.groundHeight(wp.x, wp.z) : 0;
        var pen = h - wp.y;
        if (pen <= 0) { continue; }
        st.contactCount++;
        var r2 = V.sub(wp, st.pos);
        var pointVel = V.add(st.vel, V.cross(Q.rotate(st.quat, st.omega), r2));
        var k = cp.k || ac.massKg * 40;
        var cdamp = cp.c || ac.massKg * 6;
        var normalN = M.clamp(k * pen - cdamp * pointVel.y, 0, ac.massKg * g * 40);
        var fN = { x: 0, y: normalN, z: 0 };
        // Friction, split into rolling and sliding. A wheel rolls easily along
        // the direction it points and resists hard across it. A skid resists
        // both ways. Without this split a wheeled aircraft cannot accelerate.
        var horiz = { x: pointVel.x, y: 0, z: pointVel.z };
        var hs = V.len(horiz);
        if (hs > 0.01) {
          var fh = V.norm({ x: fwd.x, y: 0, z: fwd.z });
          if (V.len2(fh) < 1e-6) { fh = { x: 0, y: 0, z: 1 }; }
          var lh = { x: -fh.z, y: 0, z: fh.x };
          var vRoll = horiz.x * fh.x + horiz.z * fh.z;
          var vSide = horiz.x * lh.x + horiz.z * lh.z;
          var muRoll = cp.gear
            ? ((cp.brake ? 0.02 + 0.62 * (c.brake || 0) : 0.02) + (cp.skid || 0))
            : (cp.sideMu || 0.7);
          var muSide = cp.sideMu || (cp.gear ? 0.85 : 0.7);
          var fRoll = Math.min(normalN * muRoll, Math.abs(vRoll) * ac.massKg * 3);
          var fSide = Math.min(normalN * muSide, Math.abs(vSide) * ac.massKg * 4);
          V.addTo(fN, fh, -Math.sign(vRoll) * fRoll * dissipate);
          V.addTo(fN, lh, -Math.sign(vSide) * fSide * dissipate);
        }
        force.x += fN.x; force.y += fN.y; force.z += fN.z;
        var mBody = Q.invRotate(st.quat, V.cross(r2, fN));
        moment.x += mBody.x; moment.y += mBody.y; moment.z += mBody.z;

        if (pointVel.y < -(ac.crashVsMps || 8) && pen > 0.05 && !st.crashed) {
          st.crashed = true; st.crashReason = 'HARD CONTACT';
        }
      }
    }
    st.onGround = st.contactCount > 0;
    if (!st.crashed && st.pos.y < gh - (ac.hullClearM || 1.2)) {
      st.crashed = true; st.crashReason = 'TERRAIN';
    }

    out.force = force;
    out.moment = moment;
    out.alpha = alpha;
    out.beta = beta;
    out.qbar = qbar;
    out.CL = CL;
    out.CD = CD;
    out.speed = speed;
    out.vb = vb;
    out.rho = rho;
    return out;
  };

  var scratch = {};

  // Semi implicit Euler at a fixed substep. Lift stays perpendicular to the
  // relative wind, so an undamped glider conserves energy to within tolerance.
  F.step = function (st, env, dt) {
    if (st.crashed) {
      st.vel = V.scale(st.vel, 0.90);
      st.omega = V.scale(st.omega, 0.85);
      return st;
    }
    var ac = st.ac;
    env.dt = dt;
    F.forces(st, env, scratch);
    var invM = 1 / ac.massKg;
    var a = V.scale(scratch.force, invM);
    st.accel = a;
    st.vel.x += a.x * dt; st.vel.y += a.y * dt; st.vel.z += a.z * dt;
    st.pos.x += st.vel.x * dt; st.pos.y += st.vel.y * dt; st.pos.z += st.vel.z * dt;

    var I = ac.inertia;
    var m = scratch.moment;
    // Rigid body: I w' = M - w x (I w)
    var Iw = { x: I.x * st.omega.x, y: I.y * st.omega.y, z: I.z * st.omega.z };
    var gyro = V.cross(st.omega, Iw);
    st.omega.x += (m.x - gyro.x) / I.x * dt;
    st.omega.y += (m.y - gyro.y) / I.y * dt;
    st.omega.z += (m.z - gyro.z) / I.z * dt;
    st.quat = Q.integrate(st.quat, st.omega, dt);

    if (ac.fuelKg && st.fuel > 0 && ac.propulsion) {
      st.fuel = Math.max(0, st.fuel - ac.propulsion.burnKgPerSec * st.controls.throttle * dt);
    }
    st.time += dt;
    return st;
  };

  F.advance = function (st, env, dt) {
    var steps = Math.min(F.MAX_STEPS, Math.max(1, Math.round(dt / F.SUBSTEP)));
    var h = dt / steps;
    for (var i = 0; i < steps; i++) { F.step(st, env, h); }
    F.derive(st, env);
    return st;
  };

  // ---------------------------------------------------------------- derived
  F.derive = function (st, env) {
    var d = st.derived;
    var att = Q.attitude(st.quat);
    var wind = (env && env.wind) ? env.wind : V.zero();
    var rel = V.sub(st.vel, wind);
    var vb = Q.invRotate(st.quat, rel);
    var speed = V.len(rel);
    d.heading = att.heading;
    d.pitch = att.pitch;
    d.bank = att.bank;
    d.airspeed = speed;
    d.groundspeed = Math.sqrt(st.vel.x * st.vel.x + st.vel.z * st.vel.z);
    d.altitude = st.pos.y;
    d.agl = st.pos.y - (env && env.groundHeight ? env.groundHeight(st.pos.x, st.pos.z) : 0);
    d.vsi = st.vel.y;
    d.alpha = speed > 0.2 ? Math.atan2(-vb.y, Math.abs(vb.x) < 0.05 ? 0.05 : vb.x) : 0;
    d.beta = speed > 0.2 ? Math.asin(M.clamp(vb.z / speed, -1, 1)) : 0;
    d.mach = speed / 340;
    d.load = st.ac.massKg > 0 ? (V.len(st.accel) / AERO.atmos.G) : 0;
    d.rpm = st.rpm;
    d.rotorRPM = st.rotorRPM;
    d.fuel = st.fuel;
    d.gasTempK = st.gasTempK;
    d.energy = st.ac.massKg * AERO.atmos.G * st.pos.y + 0.5 * st.ac.massKg * V.len2(st.vel);
    var stallA = st.ac.wing ? (st.ac.wing.stallAlpha || M.rad(15)) : Math.PI;
    d.stallMargin = st.ac.wing ? M.clamp(1 - Math.abs(d.alpha) / stallA, -1, 1) : 1;
    d.stalled = st.ac.wing ? (Math.abs(d.alpha) > stallA && speed > 3) : false;
    return d;
  };

  // Energy of the translational state, used by the conservation assertion.
  F.energy = function (st) {
    return st.ac.massKg * AERO.atmos.G * st.pos.y + 0.5 * st.ac.massKg * V.len2(st.vel);
  };

  // Run the model forward with an optional controller. Used by the self test
  // to prove each aircraft settles from its documented entry condition.
  F.settle = function (st, env, seconds, controller, sampleFn) {
    var t = 0, dt = F.SUBSTEP;
    while (t < seconds) {
      if (controller) { controller(st, t, dt); }
      F.step(st, env, dt);
      if (sampleFn) { sampleFn(st, t); }
      t += dt;
    }
    F.derive(st, env);
    return st;
  };

  // A deliberately simple attitude hold, enough to demonstrate trim without
  // pretending to be an autopilot.
  F.holdController = function (targetPitchRad, targetBank, throttle) {
    return function (st) {
      var d = F.derive(st, F.stillAir());
      var c = st.controls;
      c.pitch = M.clamp((targetPitchRad - d.pitch) * 2.6 - st.omega.z * 0.9, -1, 1);
      c.roll = M.clamp(((targetBank || 0) - d.bank) * 2.2 + st.omega.x * 0.8, -1, 1);
      c.yaw = M.clamp(-d.beta * 2.0 - st.omega.y * 0.6, -1, 1);
      if (throttle !== undefined) { c.throttle = throttle; }
    };
  };

})(typeof window !== 'undefined' ? window : globalThis);
