// AERODROME :: src/13-tests.js :: v1.5.1
// Assertions that must pass before a release is called done. Runs in the
// browser from the self test button, from tests.html, or headless.
// Depends on every engine file except the UI and the main loop.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math, V = AERO.vec3, Q = AERO.quat;
  var P = AERO.palette, R = AERO.raster, G = AERO.render;
  var F = AERO.flight, AC = AERO.aircraft, W = AERO.world, X = AERO.weather, S = AERO.storage;
  var IN = AERO.input, I = AERO.instruments;

  var T = AERO.tests = {};
  var results = [];

  function ok(name, pass, detail) {
    results.push({ name: name, pass: !!pass, detail: detail || '' });
    return !!pass;
  }

  function near(a, b, tol) { return Math.abs(a - b) <= tol; }

  function stats(arr) {
    var n = arr.length, sum = 0, i;
    for (i = 0; i < n; i++) { sum += arr[i]; }
    var mean = sum / n, ss = 0;
    for (i = 0; i < n; i++) { ss += (arr[i] - mean) * (arr[i] - mean); }
    return { mean: mean, std: Math.sqrt(ss / n) };
  }

  // ------------------------------------------------------------- palette
  T.palette = function () {
    var audit = P.audit();
    ok('palette holds exactly 64 on screen entries', audit.entries === 64 && audit.withinCeiling, audit.entries + ' entries');
    ok('every palette entry is inside the 512 color space', audit.inSpace);
    var bad = 0;
    for (var h = 0; h < 24; h += 0.5) {
      P.applyTimeOfDay(h);
      for (var i = 0; i < P.TOTAL; i++) {
        var c = P.codes[i];
        if (c < 0 || c > 511 || (c | 0) !== c) { bad++; }
      }
    }
    P.applyTimeOfDay(12);
    ok('time of day stays quantized across a full day', bad === 0, bad + ' out of range');
    var t = P.quant(200, 130, 40);
    var e = P.expand(t);
    ok('quantization is idempotent', P.quant(e.r, e.g, e.b) === t);
    var d1 = P.ditherPick(5, 6, 0.5, 0, 0), d2 = P.ditherPick(5, 6, 0.5, 1, 0);
    ok('dither returns only the two given entries', [5, 6].indexOf(d1) >= 0 && [5, 6].indexOf(d2) >= 0);
    var trans = true;
    for (var b = 0; b < 4; b++) { if (!P.isTransparent(b * 16)) { trans = false; } }
    ok('index zero of each bank is the transparency slot', trans);
  };

  // -------------------------------------------------------------- raster
  T.raster = function () {
    R.setSize(320, 224);
    R.clear(0);
    R.fillPoly([{ x: -200, y: -200 }, { x: 900, y: -200 }, { x: 900, y: 900 }, { x: -200, y: 900 }], 5);
    var covered = true, i;
    for (i = 0; i < R.W * R.H; i++) { if (R.buf[i] !== 5) { covered = false; break; } }
    ok('polygon fill clips to the framebuffer and covers it', covered);

    R.clear(0);
    R.text('AERODROME 123', -20, -4, 33);
    ok('text off the edge does not throw', true);

    R.clear(0);
    R.overflowCount = 0;
    for (i = 0; i < 40; i++) { R.drawCell('tree', 20 + i, 40, false); }
    ok('per scanline sprite budget overflows and flickers', R.overflowCount > 0, R.overflowCount + ' dropped');

    var inRange = true;
    for (i = 0; i < R.W * R.H; i++) { if (R.buf[i] > 63) { inRange = false; break; } }
    ok('no pixel references an index above 63', inRange);
  };

  // ------------------------------------------------------------ attitude
  T.attitude = function () {
    var worst = 0;
    for (var h = 0; h < 360; h += 37) {
      for (var p = -60; p <= 60; p += 30) {
        for (var b = -150; b <= 150; b += 50) {
          var q = Q.fromEuler(M.rad(h), M.rad(p), M.rad(b));
          var a = Q.attitude(q);
          var dh = Math.abs(M.wrapPi(a.heading - M.rad(h)));
          var dp = Math.abs(a.pitch - M.rad(p));
          var db = Math.abs(M.wrapPi(a.bank - M.rad(b)));
          worst = Math.max(worst, dh, dp, db);
        }
      }
    }
    ok('heading, pitch and bank round trip through the quaternion', worst < 1e-6, 'worst ' + worst.toExponential(2));
    var qq = Q.fromEuler(1.1, 0.3, -0.7);
    var vv = { x: 3, y: -2, z: 5 };
    var back = Q.invRotate(qq, Q.rotate(qq, vv));
    ok('body to world rotation inverts cleanly',
      near(back.x, vv.x, 1e-9) && near(back.y, vv.y, 1e-9) && near(back.z, vv.z, 1e-9));
  };

  // -------------------------------------------------------------- camera
  T.camera = function () {
    var cam = G.makeCamera();
    cam.pos = V.make(120, 330, -75);
    cam.quat = Q.fromEuler(M.rad(41), M.rad(-12), M.rad(23));
    G.updateCamera(cam);
    var worst = 0;
    var pts = [V.make(0, 0, 0), V.make(500, 40, 900), V.make(-220, 1200, 60)];
    for (var i = 0; i < pts.length; i++) {
      var back = G.fromView(cam, G.toView(cam, pts[i]));
      worst = Math.max(worst, Math.abs(back.x - pts[i].x), Math.abs(back.y - pts[i].y), Math.abs(back.z - pts[i].z));
    }
    ok('camera transform round trips world to view and back', worst < 1e-6, 'worst ' + worst.toExponential(2));

    var v = { x: 0, y: 0, z: 10 };
    var p = G.project(cam, v);
    ok('a point on the view axis projects to the screen centre',
      near(p.x, cam.cx, 1e-9) && near(p.y, cam.cy, 1e-9));

    var rig = AERO.camera.create();
    var st = F.createState(AC.byId('trainer'), { pos: V.make(0, 400, 0), vel: V.make(0, 0, 50) });
    AERO.camera.setMode(rig, 'chase');
    AERO.camera.update(rig, st, 0.016);
    for (var k = 0; k < 120; k++) { AERO.camera.update(rig, st, 1 / 60); }
    var d = V.len(V.sub(rig.cam.pos, st.pos));
    ok('chase camera settles near its commanded distance', d > 6 && d < 40, d.toFixed(1) + ' m');
  };

  // ---------------------------------------------------------- integrator
  T.energy = function () {
    var base = AC.byId('sailplane');
    var ac = {
      massKg: base.massKg, inertia: base.inertia, contacts: null, hullClearM: 1e6,
      control: base.control,
      wing: JSON.parse(JSON.stringify(base.wing))
    };
    ac.wing.cd0 = 0; ac.wing.k = 0; ac.wing.cdBeta = 0; ac.wing.cdStall = 0;
    var st = F.createState(ac, { pos: V.make(0, 1500, 0), vel: V.make(0, 0, 32) });
    var env = F.stillAir();
    env.noDissipation = true;
    env.groundHeight = function () { return -1e6; };
    var e0 = F.energy(st);
    for (var i = 0; i < 240 * 30; i++) { F.step(st, env, F.SUBSTEP); }
    var e1 = F.energy(st);
    var drift = Math.abs(e1 - e0) / e0;
    ok('unpowered glider conserves energy in still air', drift < 0.005,
      (drift * 100).toFixed(3) + ' percent over 30 s');
  };

  // Entry conditions used by the trim assertion. Each aircraft documents its
  // own, and the tolerance reflects what a settled state means for that type.
  T.TRIM = {
    trainer: { mode: 'aero', vs: 3, jitter: 1.2 },
    warbird: { mode: 'aero', vs: 8, jitter: 1.5 },
    jet: { mode: 'aero', vs: 22, jitter: 2.5 },
    sailplane: { mode: 'aero', vs: 4, jitter: 1.0 },
    balloon: { mode: 'buoyant', vs: 1.6, jitter: 0.9 },
    blimp: { mode: 'buoyant', vs: 5, jitter: 1.2 },
    saucer: { mode: 'hover', vs: 1.0, jitter: 0.6 },
    helicopter: { mode: 'hover', vs: 1.0, jitter: 0.6 },
    autogyro: { mode: 'aero', vs: 5, jitter: 1.2 },
    ornithopter: { mode: 'aero', vs: 4, jitter: 3.2 },
    paper: { mode: 'aero', vs: 3, jitter: 1.0 },
    rocket: { mode: 'aero', vs: 22, jitter: 2.5, entry: { alt: 3000, speed: 140, throttle: 0, pitch: -0.1 } }
  };

  T.trim = function () {
    AC.list().forEach(function (ac) {
      var spec = T.TRIM[ac.id] || { mode: 'aero', vs: 6, jitter: 2 };
      var e = spec.entry || ac.entry;
      var st = F.createState(ac, {
        pos: V.make(0, e.alt, 0), vel: V.make(0, 0, e.speed), heading: 0, pitch: e.pitch || 0
      });
      st.controls.throttle = e.throttle || 0;
      st.controls.gear = 0;
      if (e.collective !== undefined) { st.controls.collective = e.collective; }
      var env = F.stillAir();
      env.groundHeight = function () { return -1e6; }; // trim is an air exercise
      var hold = F.holdController(e.pitch || 0, 0, e.throttle);
      var target = e.alt;
      var controller = function (s) {
        if (spec.mode === 'hover') {
          hold(s);
          var cmd = M.clamp(0.5 + (target - s.pos.y) * 0.02 - s.vel.y * 0.06, 0, 1);
          if (ac.rotor) { s.controls.collective = cmd; }
          if (ac.reaction) { s.controls.throttle = cmd; }
        } else if (spec.mode === 'buoyant') {
          var err = target - s.pos.y;
          s.controls.burner = M.clamp(err * 0.02 - s.vel.y * 0.25, 0, 1);
          s.controls.vent = M.clamp(-err * 0.01 + s.vel.y * 0.2, 0, 1);
          s.controls.throttle = e.throttle || 0;
          hold(s);
        } else {
          hold(s);
        }
      };
      var vsi = [], spd = [];
      F.settle(st, env, 45, controller, function (s, t) {
        if (t > 42) { vsi.push(s.vel.y); spd.push(V.len(s.vel)); }
      });
      var sv = stats(vsi), ss = stats(spd);
      var finite = isFinite(st.pos.y) && isFinite(sv.mean) && isFinite(ss.mean);
      var pass = finite && !st.crashed && Math.abs(sv.mean) <= spec.vs
        && sv.std <= spec.jitter && ss.std <= Math.max(1.5, spec.jitter);
      ok('trim: ' + ac.name + ' settles from its entry condition', pass,
        'vs ' + sv.mean.toFixed(2) + ' +/- ' + sv.std.toFixed(2) + ', speed jitter ' + ss.std.toFixed(2));
    });
  };

  // ------------------------------------------------------------ airmanship
  // Everything added in v1.1 lives or dies by these.
  T.airmanship = function () {
    var ac = AC.byId('trainer');

    // Ground effect: same aircraft, same speed, same alpha, two heights.
    function dragAt(height) {
      // Held at approach attitude, where the wing is actually working and
      // induced drag is a real share of the total.
      var st = F.createState(ac, {
        pos: V.make(0, height, 0), vel: V.make(0, 0, 30), pitch: M.rad(8)
      });
      st.controls.throttle = 0;
      var env = F.stillAir();
      env.groundHeight = function () { return 0; };
      var out = {};
      F.forces(st, env, out);
      return out.CD;
    }
    var low = dragAt(1.6), high = dragAt(400);
    ok('ground effect cuts induced drag near the surface', low < high * 0.93,
      'CD ' + low.toFixed(4) + ' at 1.6 m against ' + high.toFixed(4) + ' at 400 m');
    var mid = dragAt(ac.wing.spanM * 1.4);
    ok('ground effect has faded a wingspan and a half up', Math.abs(mid - high) < 1e-6);

    // Slipstream: elevator authority with the engine at idle and at full power
    // at a speed where the ailerons are nearly useless.
    function pitchMoment(throttle) {
      var st = F.createState(ac, { pos: V.make(0, 500, 0), vel: V.make(0, 0, 14) });
      st.controls.throttle = throttle;
      st.controls.pitch = 1;
      var out = {};
      F.forces(st, F.stillAir(), out);
      return out.moment.z;
    }
    ok('the slipstream keeps the elevator working at low speed',
      pitchMoment(1) > pitchMoment(0) * 1.5,
      'idle ' + pitchMoment(0).toFixed(0) + ' Nm against full ' + pitchMoment(1).toFixed(0) + ' Nm');

    // Steering: hold right pedal with a little power and the aircraft comes
    // round within a sane radius instead of sliding straight on.
    var st = F.createState(ac, { pos: V.make(0, W.RUNWAY.elev + 1.1, 0), vel: V.make(0, 0, 4) });
    st.controls.throttle = 0.25;
    var env = F.stillAir();
    env.groundHeight = function (x, z) { return W.heightAt(x, z); };
    env.groundNormal = function (x, z) { return W.normalAt(x, z); };
    var h0 = F.derive(st, env).heading;
    F.settle(st, env, 12, function (s) { s.controls.yaw = 1; s.controls.throttle = 0.25; });
    var turned = M.deg(Math.abs(M.wrapPi(F.derive(st, env).heading - h0)));
    ok('a steerable wheel turns the aircraft while taxiing', turned > 20 && !st.crashed,
      turned.toFixed(0) + ' degrees in 12 s');

    // Differential braking has to bite in the commanded direction.
    function brakeMoment(pedal) {
      var b = F.createState(ac, { pos: V.make(0, W.RUNWAY.elev + 1.1, -200), vel: V.make(0, 0, 10) });
      b.controls.throttle = 0;
      var moment = 0;
      F.settle(b, env, 0.8, function (s) { s.controls.brake = 0.6; s.controls.yaw = pedal; },
        function (s, t) {
          if (t > 0.5 && !moment) {
            var o = {};
            F.forces(s, env, o);
            moment = o.moment.y;
          }
        });
      return moment;
    }
    var right = brakeMoment(1), left = brakeMoment(-1);
    ok('differential braking bites toward the pedal', right > 50 && left < -50,
      'right ' + right.toFixed(0) + ' Nm, left ' + left.toFixed(0) + ' Nm');
    ok('braking is symmetric', Math.abs(right + left) < Math.abs(right) * 0.05);
  };

  T.engine = function () {
    var ac = AC.byId('trainer');
    var st = F.createState(ac, { pos: V.make(0, 900, 0), vel: V.make(0, 0, 50) });
    st.controls.throttle = 1;
    var env = F.stillAir();
    env.groundHeight = function () { return -1e6; };
    var out = {};
    F.cutEngine(st);
    F.settle(st, env, 1, null);
    F.forces(st, env, out);
    ok('a cut engine makes no thrust', st.engineState === 'off' && st.rpm < ac.propulsion.idleRPM * 0.5,
      'rpm ' + st.rpm.toFixed(0));
    F.startEngine(st);
    F.settle(st, env, 1.0, null);
    ok('starting is a procedure, not a switch', st.engineState === 'starting');
    F.settle(st, env, 2.0, null);
    ok('the engine catches once the crank finishes',
      st.engineState === 'running' && st.rpm > ac.propulsion.idleRPM * 0.8, 'rpm ' + st.rpm.toFixed(0));

    var dry = F.createState(ac, { pos: V.make(0, 900, 0), vel: V.make(0, 0, 50) });
    dry.fuel = 0;
    F.cutEngine(dry);
    F.startEngine(dry);
    F.settle(dry, env, 3, null);
    ok('a dry tank refuses to start', dry.engineState === 'off');
  };

  T.damage = function () {
    var env = F.stillAir();
    env.groundHeight = function () { return -1e6; };
    // Overspeed. Put a light airframe far past its structural limit.
    var s1 = F.createState(AC.byId('sailplane'), { pos: V.make(0, 3000, 0), vel: V.make(0, 0, 140) });
    F.step(s1, env, F.SUBSTEP);
    ok('past the structural limit the airframe fails', s1.crashed && s1.crashReason === 'OVERSPEED',
      s1.crashReason || 'survived');
    // Gear overload. Level, but arriving far too fast for the legs.
    var ground = F.stillAir();
    var ac = AC.byId('trainer');
    var s2 = F.createState(ac, { pos: V.make(0, 0.4, 0), vel: V.make(0, -6.5, 30) });
    ground.groundHeight = function () { return 0; };
    F.settle(s2, ground, 1.2, null);
    ok('gear overload is its own failure, not a generic crash',
      s2.crashed && (s2.crashReason === 'GEAR OVERLOAD' || s2.crashReason === 'HARD CONTACT'),
      s2.crashReason || 'survived');
    // Rotor strike. Roll the helicopter well past level just off the deck.
    var heli = AC.byId('helicopter');
    var s3 = F.createState(heli, {
      pos: V.make(0, 2.0, 0), vel: V.zero(), heading: 0, pitch: 0, bank: M.rad(75)
    });
    s3.rotorRPM = heli.rotor.nominalRPM;
    F.step(s3, ground, F.SUBSTEP);
    ok('a tilted disc close to the deck is a rotor strike',
      s3.crashed && s3.crashReason === 'ROTOR STRIKE', s3.crashReason || 'survived');
  };

  T.gradient = function () {
    X.state.meanSpeed = 12; X.state.turbulence = 0; X.state.gustiness = 0;
    X.state.thermalStrength = 0; X.state.ridgeStrength = 0;
    X.tick(0.016);
    function speedAt(agl) {
      var w = X.windAt({ x: 0, y: W.RUNWAY.elev + agl, z: 0 }, 4, 1);
      return Math.sqrt(w.x * w.x + w.z * w.z);
    }
    var low = speedAt(3), mid = speedAt(60), high = speedAt(300);
    ok('the wind gradient weakens the surface wind', low < mid && mid < high,
      low.toFixed(1) + ' at 3 m, ' + mid.toFixed(1) + ' at 60 m, ' + high.toFixed(1) + ' at 300 m');
    ok('the profile stays within sane bounds', low > 0.5 && high < 20);
    X.state.thermalStrength = 1; X.state.ridgeStrength = 1; X.state.turbulence = 0.5;
    X.state.gustiness = 0.45;
  };

  // -------------------------------------------------------------- optics
  T.optics = function () {
    R.setSize(320, 224);
    var m = G.MARGIN;

    // Screen space clipping.
    var inside = [{ x: 10, y: 10 }, { x: 100, y: 10 }, { x: 100, y: 100 }];
    ok('a polygon fully on screen is passed through untouched', G.clipScreen(inside) === inside);
    ok('a polygon fully off screen is rejected',
      G.clipScreen([{ x: -900, y: 10 }, { x: -800, y: 10 }, { x: -800, y: 90 }]) === null);
    var big = G.clipScreen([
      { x: -4000, y: -4000 }, { x: 5000, y: -4000 }, { x: 5000, y: 5000 }, { x: -4000, y: 5000 }
    ]);
    var bounded = big && big.length >= 3;
    for (var i = 0; big && i < big.length; i++) {
      if (big[i].x < -m - 0.001 || big[i].x > R.W + m + 0.001
        || big[i].y < -m - 0.001 || big[i].y > R.H + m + 0.001) { bounded = false; }
    }
    ok('a polygon larger than the screen is clipped to the screen, not clamped', bounded);
    var half = G.clipScreen([{ x: -600, y: 20 }, { x: 200, y: 20 }, { x: 200, y: 120 }]);
    ok('a partly visible polygon keeps its shape at the cut',
      !!half && half.length === 4 && Math.abs(half[0].x + m) < 0.001);

    // Painter order: a small near face must land on top of a large far one.
    var cam = G.makeCamera();
    cam.pos = V.make(0, 0, 0);
    cam.quat = Q.fromEuler(0, 0, 0);
    G.updateCamera(cam);
    R.clear(0);
    G.resetQueue();
    var farQuad = [
      { x: -400, y: -400, z: 900 }, { x: 400, y: -400, z: 900 },
      { x: 400, y: 400, z: 900 }, { x: -400, y: 400, z: 900 }
    ];
    var nearQuad = [
      { x: -6, y: -6, z: 40 }, { x: 6, y: -6, z: 40 },
      { x: 6, y: 6, z: 40 }, { x: -6, y: 6, z: 40 }
    ];
    G.submitFace(cam, nearQuad, 'mark', { ambient: 1, noHaze: true, twoSided: true });
    G.submitFace(cam, farQuad, 'hull', { ambient: 1, noHaze: true, twoSided: true });
    G.flushQueue();
    var centre = R.get(Math.round(R.W / 2), Math.round(R.H / 2));
    ok('a near polygon draws over a far one whatever order they arrive in',
      centre === P.RAMP.mark.start, 'index ' + centre);

    // Build time subdivision.
    var longFace = { mat: 'hull', v: [[-48, 0, -3], [48, 0, -3], [48, 0, 3], [-48, 0, 3]] };
    var split = W.subdivideFace(longFace, 14);
    var quads = true, insideBox = true;
    for (var k = 0; k < split.length; k++) {
      if (split[k].v.length !== 4) { quads = false; }
      for (var j = 0; j < 4; j++) {
        var p = split[k].v[j];
        if (p[0] < -48.001 || p[0] > 48.001 || p[2] < -3.001 || p[2] > 3.001) { insideBox = false; }
      }
    }
    ok('a long face is split at build time', split.length > 1 && quads, split.length + ' pieces');
    ok('every piece stays inside the original face', insideBox);
    var small = W.subdivideFace({ mat: 'hull', v: [[0, 0, 0], [2, 0, 0], [2, 0, 2], [0, 0, 2]] }, 14);
    ok('a face already small enough is left alone', small.length === 1);

    // Sprite tiers.
    R.clear(0);
    R.spriteLoad.fill(0, 0, R.H);
    R.drawCell('tree', 40, 60, false);
    var plain = countPixels();
    R.clear(0);
    R.drawCellScaled('tree', 40, 60, false, 2);
    var doubled = countPixels();
    ok('the near sprite tier is a doubled cell, not a filtered one',
      doubled > plain * 3.4 && doubled < plain * 4.6, plain + ' pixels against ' + doubled);
    R.clear(0);
    R.drawSpeck(50, 50, 33, 2);
    ok('the far sprite tier is a speck', countPixels() === 4);

    // The second dither pattern has to average out to the requested mix.
    var lit = 0;
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        if (P.ditherPick(5, 6, 0.5, x, y, 'soft') === 6) { lit++; }
      }
    }
    ok('the soft dither pattern averages to the requested level', lit === 32, lit + ' of 64');
    var onlyTwo = true;
    for (var q = 0; q < 64; q++) {
      var v = P.ditherPick(5, 6, 0.37, q & 7, q >> 3, 'soft');
      if (v !== 5 && v !== 6) { onlyTwo = false; }
    }
    ok('the soft pattern still uses only the two given entries', onlyTwo);

    // The contact shadow is the aircraft's own footprint.
    R.clear(0);
    G.resetQueue();
    var ac = AC.byId('trainer');
    var st = F.createState(ac, { pos: V.make(0, 12, 60), vel: V.zero() });
    var scam = G.makeCamera();
    scam.pos = V.make(0, 60, -40);
    scam.quat = Q.fromEuler(0, M.rad(-40), 0);
    G.updateCamera(scam);
    G.submitShadow(scam, ac.mesh, st.pos, st.quat, 0, { ambient: 1 });
    G.flushQueue();
    ok('the shadow is drawn as one convex silhouette', countPixels() > 20, countPixels() + ' pixels');
    var wide = countPixels();
    R.clear(0);
    G.resetQueue();
    G.submitShadow(scam, ac.mesh, st.pos, Q.fromEuler(M.rad(90), 0, 0), 0, { ambient: 1 });
    G.flushQueue();
    ok('the silhouette turns with the aircraft', countPixels() !== wide,
      wide + ' pixels head on, ' + countPixels() + ' across');
  };

  function countPixels() {
    var n = 0;
    for (var i = 0; i < R.W * R.H; i++) { if (R.buf[i] !== 0) { n++; } }
    return n;
  }

  // -------------------------------------------------------------- cabinet
  // The audio model, asserted without an audio context. Everything here is
  // arithmetic, which is exactly why it was written as arithmetic.
  T.cabinet = function () {
    var AU = AERO.audio, PSG = AU.PSG;

    ok('the PSG has sixteen attenuation steps and the last one is silent',
      PSG.LEVELS === 16 && PSG.gainFor(15) === 0 && PSG.gainFor(0) === 1);
    var monotone = true, twoDb = true;
    for (var l = 1; l < 15; l++) {
      if (PSG.gainFor(l) >= PSG.gainFor(l - 1)) { monotone = false; }
      var ratio = PSG.gainFor(l) / PSG.gainFor(l - 1);
      if (Math.abs(ratio - 0.7943) > 0.001) { twoDb = false; }
    }
    ok('attenuation falls monotonically', monotone);
    ok('every step is two decibels', twoDb);

    var q = PSG.quantize(0.5);
    ok('an arbitrary gain snaps onto a real attenuation step',
      q.gain === PSG.gainFor(q.level) && q.level >= 0 && q.level <= 15,
      '0.5 became step ' + q.level + ' at ' + q.gain.toFixed(3));
    ok('silence quantizes to the off step', PSG.quantize(0).level === 15);
    var staircase = {};
    for (var g = 0; g <= 1.0001; g += 0.02) { staircase[PSG.quantize(g).level] = 1; }
    ok('a fade across the whole range is a staircase, not a ramp',
      Object.keys(staircase).length <= 16, Object.keys(staircase).length + ' distinct steps');

    var n0 = PSG.noiseHz(0), n1 = PSG.noiseHz(1), n2 = PSG.noiseHz(2);
    ok('the three fixed noise rates descend', n0 > n1 && n1 > n2,
      [n0, n1, n2].map(function (h) { return Math.round(h); }).join(' / ') + ' Hz');
    ok('the fourth noise mode follows tone three', PSG.noiseHz(3, 440) === 440);
    ok('periodic noise buzzes at a fifteenth of the white rate',
      Math.abs(PSG.period(0, true) - PSG.period(0, false) / 15) < 1e-6);

    // Envelope, stepped in attenuation units at a fixed rate.
    var st = { level: 15, phase: 'off' };
    var params = { attack: 0.05, decay: 0.2, sustain: 4, release: 0.3 };
    var i, opened = -1;
    for (i = 0; i < 60; i++) {
      st = AU.envelope(st, 1 / 120, true, params);
      if (opened < 0 && st.level <= 0.001) { opened = (i + 1) / 120; }
    }
    ok('the envelope opens within its attack time', opened > 0 && opened <= params.attack + 0.01,
      'fully open after ' + (opened * 1000).toFixed(0) + ' ms');
    for (i = 0; i < 120; i++) { st = AU.envelope(st, 1 / 120, true, params); }
    ok('it decays to the sustain level and holds',
      Math.abs(st.level - 4) < 0.01 && st.phase === 'sustain', 'level ' + st.level.toFixed(2));
    for (i = 0; i < 120; i++) { st = AU.envelope(st, 1 / 120, false, params); }
    ok('and releases back to silence', st.level === 15 && st.gain === 0);

    // Doppler.
    var still = { x: 0, y: 0, z: 0 };
    ok('a stationary source is not shifted',
      AU.doppler({ x: 0, y: 0, z: 0 }, still, { x: 0, y: 0, z: 100 }, still) === 1);
    var closing = AU.doppler({ x: 0, y: 0, z: 0 }, still, { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: -80 });
    var leaving = AU.doppler({ x: 0, y: 0, z: 0 }, still, { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: 80 });
    ok('an approaching aircraft rises in pitch and a departing one falls',
      closing > 1.1 && leaving < 0.95, closing.toFixed(2) + ' closing, ' + leaving.toFixed(2) + ' leaving');
    var silly = AU.doppler({ x: 0, y: 0, z: 0 }, still, { x: 0, y: 0, z: 100 }, { x: 0, y: 0, z: -400 });
    ok('the shift is bounded well short of a sonic boom', silly <= 1.9 && silly > 1);

    // Patches and layers.
    var patchesOk = true, badPatch = '';
    Object.keys(AU.PATCHES).forEach(function (name) {
      var p = AU.PATCHES[name];
      if (!p.ops || p.ops.length !== 4) { patchesOk = false; badPatch = name; }
      if (!AU.ALGORITHMS[p.alg]) { patchesOk = false; badPatch = name; }
      (p.ops || []).forEach(function (o) {
        if (!(o.mul > 0) || !(o.lvl >= 0)) { patchesOk = false; badPatch = name; }
      });
    });
    ok('every patch is four operators on a real algorithm', patchesOk, badPatch);
    var layersOk = true, missing = '';
    AC.list().forEach(function (ac) {
      if (!AU.PATCHES[ac.audio.patch]) { layersOk = false; missing = ac.id; }
      if (ac.audio.layer) {
        if (!AU.PATCHES[ac.audio.layer.patch] || !(ac.audio.layer.mul > 0)) {
          layersOk = false; missing = ac.id + ' layer';
        }
      }
    });
    ok('every aircraft names patches that exist', layersOk, missing);
    var layered = AC.list().filter(function (ac) { return !!ac.audio.layer; }).length;
    ok('the powered aircraft carry a second voice', layered >= 5, layered + ' layered');

    // The worklet is the only runtime fetch and must stay off from file://.
    ok('the worklet path is relative and inside the project',
      AU.WORKLET_PATH.indexOf('src/') === 0 && AU.WORKLET_PATH.indexOf('//') < 0);
    ok('nothing is fetched when there is no page to fetch from',
      AU.workletEligible() === false);
  };

  // ---------------------------------------------------------------- field
  T.field = function () {
    // The world is a file now, and it is validated like every other file.
    var text = W.exportWorld();
    var parsed = JSON.parse(text);
    var res = W.loadWorld(parsed);
    ok('the stock valley round trips through its own file format', res.ok, res.reason);
    ok('a round tripped world is unchanged', W.exportWorld() === text);

    ok('a foreign world file is refused',
      W.validateWorld({ world: 'SOMETHING ELSE', schema: 1 }).ok === false);
    ok('a newer world schema is refused rather than guessed at',
      W.validateWorld({ world: 'AERODROME', schema: 99 }).ok === false);
    ok('rubbish is refused without throwing', W.validateWorld(null).ok === false);

    var odd = JSON.parse(text);
    odd.structures.push({ type: 'death ray', x: 0, z: 0 });
    odd.structures.push({ type: 'ring', x: 'over there', z: 0, radius: 900000 });
    odd.movers.push({ kind: 'submarine', road: 'river', speed: 4 });
    var cleaned = W.validateWorld(odd);
    var hasJunk = cleaned.data.structures.some(function (st) { return st.type === 'death ray'; });
    var bigRing = cleaned.data.structures.some(function (st) { return st.radius > 400; });
    var sub = cleaned.data.movers.some(function (m) { return m.kind === 'submarine'; });
    ok('unknown structure types are dropped, not built', cleaned.ok && !hasJunk);
    ok('out of range values are clamped, not trusted', !bigRing);
    ok('unknown mover kinds are dropped', !sub);

    // A different world has to actually be a different world.
    var alt = JSON.parse(text);
    alt.terrain.floor = 120;
    alt.terrain.ridgeH = 700;
    alt.name = 'somewhere else';
    var loaded = W.loadWorld(alt);
    // Sampled well away from the ridge, the shoulder and the river, where the
    // floor is the only thing setting the height.
    ok('loading a world changes the ground under the aircraft',
      loaded.ok && Math.abs(W.heightAt(6000, -4000) - 120) < 40 && W.FLOOR === 120,
      'floor now ' + W.FLOOR + ', ground ' + W.heightAt(6000, -4000).toFixed(1));
    ok('the world name is carried through', W.params.name === 'SOMEWHERE ELSE');
    W.resetWorld();
    ok('reset restores the stock valley', W.FLOOR === 42 && W.params.name === W.STOCK.name);

    // Night lighting.
    ok('it is not night at noon', W.nightFactor({ hour: 12 }) === 0);
    ok('it is night at midnight', W.nightFactor({ hour: 0 }) === 1);
    ok('dusk arrives gradually', W.nightFactor({ hour: 18.9 }) > 0 && W.nightFactor({ hour: 18.9 }) < 1);
    var cam = G.makeCamera();
    cam.pos = V.make(0, W.RUNWAY.elev + 120, -300);
    cam.quat = Q.fromEuler(0, M.rad(-10), 0);
    G.updateCamera(cam);
    G.resetQueue();
    var dayLights = W.emitLights(cam, { hour: 12 }, 0);
    var nightLights = W.emitLights(cam, { hour: 23 }, 0);
    ok('nothing is lit in daylight', dayLights === 0);
    ok('the field lights up at night', nightLights > 20, nightLights + ' lamps');

    // Movers.
    W.buildMovers();
    var before = W.movers.map(function (m) { return m.t; });
    W.tickMovers(2);
    var moved = 0, finite = true, onWater = true;
    for (var i = 0; i < W.movers.length; i++) {
      var m = W.movers[i];
      if (m.t !== before[i]) { moved++; }
      if (!isFinite(m.x) || !isFinite(m.y) || !isFinite(m.z)) { finite = false; }
      if (m.kind === 'boat' && Math.abs(m.y - W.WATER_LEVEL - 0.5) > 0.01) { onWater = false; }
    }
    ok('every mover moves and stays finite', moved === W.movers.length && finite);
    ok('the boat stays on the river', onWater);
    var wrapped = true;
    W.tickMovers(600);
    for (i = 0; i < W.movers.length; i++) {
      if (W.movers[i].t < 0 || W.movers[i].t > 1) { wrapped = false; }
    }
    ok('movers loop rather than running off the map', wrapped);

    // The tow rope.
    var here = V.make(0, 100, 0), still = V.zero();
    var slack = F.ropeForce(here, still, V.make(0, 100, 30), still, 48, 1200, 800, 12000);
    ok('a slack rope pulls with nothing at all', V.len(slack) === 0);
    var taut = F.ropeForce(here, still, V.make(0, 100, 60), still, 48, 1200, 800, 12000);
    ok('a stretched rope pulls toward the tug', taut.z > 0 && Math.abs(taut.x) < 1e-9,
      Math.round(V.len(taut)) + ' N');
    var huge = F.ropeForce(here, still, V.make(0, 100, 400), still, 48, 1200, 800, 12000);
    ok('rope tension is capped at the weak link', Math.abs(V.len(huge) - 12000) < 1,
      Math.round(V.len(huge)) + ' N');
    var glider = AC.byId('sailplane');
    ok('the sailplane is the aircraft that can be towed',
      !!glider.towable && AC.list().filter(function (a) { return !!a.towable; }).length === 1);

    // The tower camera has to keep the aircraft in frame.
    var rig = AERO.camera.create();
    AERO.camera.setMode(rig, 'tower');
    var st = F.createState(AC.byId('trainer'), {
      pos: V.make(60, W.RUNWAY.elev + 90, -200), vel: V.make(0, 0, 50)
    });
    var framed = true, worst = 0;
    for (var d = 60; d <= 1800; d += 180) {
      st.pos = V.make(40, W.RUNWAY.elev + 60 + d * 0.15, -d);
      rig.viewAim = null;
      // The aim and the zoom are both smoothed, so give the camera operator a
      // second to settle before judging the shot.
      for (var f = 0; f < 60; f++) { AERO.camera.update(rig, st, 1 / 60, {}); }
      var view = G.toView(rig.cam, st.pos);
      var p = G.project(rig.cam, view);
      if (view.z < G.NEAR || p.x < 0 || p.x > R.W || p.y < 0 || p.y > R.H) { framed = false; worst = d; }
    }
    ok('the tower camera keeps the aircraft on screen at every range', framed,
      framed ? '' : 'lost it at ' + worst + ' m');
    ok('the tower camera zooms in as the aircraft goes away',
      rig.cam.fovDeg < 40, 'fov ' + rig.cam.fovDeg.toFixed(1));
    ok('camera sites come from the world file',
      W.params.views.length >= 2 && rig.viewIndex < W.params.views.length);
  };

  // --------------------------------------------------------------- chrome
  // The interface decides what to show from the aircraft and the live
  // bindings. Those decisions are pure functions, so they get asserted.
  T.chrome = function () {
    var U = AERO.ui;

    // Every tunable has to land in a named group, or it disappears from the
    // tuning drawer without anyone noticing.
    var ungrouped = [];
    AC.TUNABLE.forEach(function (t) {
      if (U.groupFor(t.path) === 'other') { ungrouped.push(t.path); }
    });
    ok('every tunable belongs to a named group', ungrouped.length === 0, ungrouped.join(', '));

    // Every group has to be reachable by at least one aircraft, or it is a
    // heading with nothing under it.
    var used = {};
    AC.list().forEach(function (ac) {
      AC.TUNABLE.forEach(function (t) {
        if (typeof AC.getPath(ac, t.path) === 'number') { used[U.groupFor(t.path)] = 1; }
      });
    });
    var empty = U.TUNE_GROUPS.filter(function (g) { return !used[g.id]; }).map(function (g) { return g.id; });
    ok('no tuning group is empty across the roster', empty.length === 0, empty.join(', '));

    // The key legend is per aircraft. It must not advertise a control the
    // aircraft does not have.
    function keys(id) {
      return U.legendFor(AC.byId(id)).map(function (l) { return l.action; });
    }
    var balloon = keys('balloon'), glider = keys('sailplane'), saucer = keys('saucer');
    var trainer = keys('trainer'), heli = keys('helicopter');
    ok('the balloon legend offers the burner and not the throttle',
      balloon.indexOf('burner') >= 0 && balloon.indexOf('vent') >= 0 && balloon.indexOf('throttleUp') < 0);
    ok('the balloon legend does not offer an engine it does not have',
      balloon.indexOf('engineCut') < 0);
    ok('only the sailplane is offered a tow',
      glider.indexOf('tow') >= 0 && trainer.indexOf('tow') < 0 && saucer.indexOf('tow') < 0);
    ok('the saucer legend offers reaction thrust', saucer.indexOf('thrustFwd') >= 0);
    ok('the helicopter legend calls the lever a collective',
      U.legendFor(AC.byId('helicopter')).some(function (l) {
        return l.action === 'throttleUp' && l.label === 'collective';
      }) && heli.indexOf('engineCut') >= 0);
    ok('the trainer legend offers gear, flaps and brakes',
      trainer.indexOf('gear') >= 0 && trainer.indexOf('flaps') >= 0 && trainer.indexOf('brake') >= 0);
    var everyone = true;
    AC.list().forEach(function (ac) {
      var k = U.legendFor(ac).map(function (l) { return l.action; });
      if (k.indexOf('camera') < 0 || k.indexOf('reset') < 0 || k.indexOf('pause') < 0) { everyone = false; }
      if (k.length < 4 || k.length > 14) { everyone = false; }
    });
    ok('every aircraft gets a legend of a sensible length with the basics on it', everyone);

    // The legend reads the live bindings rather than a hard coded list.
    function legendKey(id, action) {
      var hit = U.legendFor(AC.byId(id)).filter(function (l) { return l.action === action; })[0];
      return hit ? hit.key : 'missing';
    }
    var before = legendKey('trainer', 'camera');
    IN.bind('camera', { key: 'KeyY' });
    ok('the legend follows a rebound key', legendKey('trainer', 'camera') === 'Y',
      legendKey('trainer', 'camera'));
    IN.resetBindings();
    ok('and follows it back on reset', legendKey('trainer', 'camera') === before, before);
    ok('a paired control shows both of its keys',
      legendKey('trainer', 'throttleUp').split(' ').length === 2,
      legendKey('trainer', 'throttleUp'));
    ok('the stick reads as the arrows while it is on the arrows',
      legendKey('trainer', 'pitchUp') === 'Arrows');

    // Roster tags describe what makes an airframe unusual, not what every
    // aircraft has.
    var tagged = AC.list().map(function (ac) { return U.tagsFor(ac); });
    var noisy = tagged.some(function (t) { return t.length > 3; });
    ok('roster tags stay short', !noisy);
    ok('the tags name the odd ones out',
      U.tagsFor(AC.byId('balloon')).indexOf('BUOYANT') >= 0
      && U.tagsFor(AC.byId('sailplane')).indexOf('NEEDS A TOW') >= 0
      && U.tagsFor(AC.byId('helicopter')).indexOf('ROTOR') >= 0
      && U.tagsFor(AC.byId('autogyro')).indexOf('AUTOROTATES') >= 0);
    ok('an ordinary aeroplane carries no tags at all', U.tagsFor(AC.byId('trainer')).length === 0);

    // Fitting the framebuffer into whatever box it is given. Whole numbers
    // only, and it must never hand back something larger than the box, which
    // is what used to push the panel off the bottom of the window.
    var boxes = [[1664, 896], [1184, 716], [1024, 616], [640, 400], [406, 600], [1920, 1080]];
    var whole = true, fits = true, largest = true;
    for (var b = 0; b < boxes.length; b++) {
      var sc = U.fitScale(boxes[b][0], boxes[b][1], 320, 224);
      if (sc !== Math.floor(sc) || sc < 1) { whole = false; }
      if (sc > 1 && (320 * sc > boxes[b][0] || 224 * sc > boxes[b][1])) { fits = false; }
      if (320 * (sc + 1) <= boxes[b][0] && 224 * (sc + 1) <= boxes[b][1]) { largest = false; }
    }
    ok('the framebuffer is only ever scaled by a whole number', whole);
    ok('the scaled picture always fits the box it was given', fits);
    ok('and it takes the largest scale that fits', largest);
    ok('a box smaller than the framebuffer still gets scale one',
      U.fitScale(200, 150, 320, 224) === 1 && U.fitScale(0, 0, 320, 224) === 1);
    ok('the taller framebuffer is fitted on its own terms',
      U.fitScale(1000, 700, 320, 240) === 2 && U.fitScale(1000, 480, 320, 240) === 2);

    // Fill mode trades whole pixels for size. It must still respect the box
    // and must not distort the picture.
    var okFill = true, aspect = true;
    for (b = 0; b < boxes.length; b++) {
      var f = U.fillSize(boxes[b][0], boxes[b][1], 320, 224);
      if (f.w > boxes[b][0] || f.h > boxes[b][1]) { okFill = false; }
      if (Math.abs(f.w / f.h - 320 / 224) > 0.01) { aspect = false; }
    }
    ok('fill mode stays inside the box', okFill);
    ok('fill mode does not distort the picture', aspect);
    ok('fill mode is never smaller than whole pixel mode',
      U.fillSize(1659, 805, 320, 224).h >= 224 * U.fitScale(1659, 805, 320, 224));
  };

  // ----------------------------------------------------------- legibility
  // The picture is the product. These assertions exist because every one of
  // them failed at least once in a screenshot.
  T.legibility = function () {
    R.setSize(320, 224);

    // Sprite tiers go by true distance. A tree directly below the aircraft is
    // far away even though it is barely ahead of the camera.
    ok('sprite tiers are chosen by distance', G.tierFor(50) === 'near'
      && G.tierFor(600) === 'mid' && G.tierFor(1800) === 'far' && G.tierFor(4000) === 'cull');
    var cam = G.makeCamera();
    cam.pos = V.make(0, 700, 0);
    cam.quat = Q.fromEuler(0, M.rad(-12), 0);
    G.updateCamera(cam);
    var below = G.toView(cam, V.make(0, 0, 40));
    var trueDist = Math.sqrt(below.x * below.x + below.y * below.y + below.z * below.z);
    ok('a sprite far below the camera is not treated as a near one',
      G.tierFor(trueDist) !== 'near' && below.z < trueDist * 0.6,
      'forward ' + below.z.toFixed(0) + ' m, true ' + trueDist.toFixed(0) + ' m');

    // Scatter sprites sit on the ground rather than on an invisible stalk.
    var anchored = true, sampled = 0;
    var realDraw = G.drawBillboard;
    G.drawBillboard = function (c, name, world) {
      for (var i = 0; i < W.scatter.length; i++) {
        var sc = W.scatter[i];
        if (Math.abs(sc.x - world.x) < 0.001 && Math.abs(sc.z - world.z) < 0.001) {
          sampled++;
          if (Math.abs(world.y - sc.y) > 0.001) { anchored = false; }
        }
      }
      return false;
    };
    var scam = G.makeCamera();
    scam.pos = V.make(0, W.RUNWAY.elev + 30, 0);
    scam.quat = Q.fromEuler(0, 0, 0);
    G.updateCamera(scam);
    W.emitSprites(scam, X.env, 0, 0);
    G.drawBillboard = realDraw;
    ok('scatter sprites are anchored on the ground', anchored && sampled > 0,
      sampled + ' checked');

    // Haze suggests distance. It must never reach a fifty percent checker.
    ok('haze is capped well below a checkerboard', G.HAZE_MAX <= 0.35, G.HAZE_MAX);

    // The sky is banded, not stippled. Most of a sky column should be solid
    // runs of one entry, with thin dithered seams between them.
    R.clear(0);
    var scene = G.makeCamera();
    scene.pos = V.make(0, 400, 0);
    scene.quat = Q.fromEuler(0, 0, 0);
    G.updateCamera(scene);
    P.applyTimeOfDay(12);
    G.drawSkyPlane(scene, { hour: 12 });
    var x = 90, solid = 0, total = 0, runs = 0, last = -1, runLen = 0;
    for (var y = 0; y < 100; y++) {
      var v = R.buf[y * R.W + x];
      total++;
      if (v === last) { runLen++; } else { if (runLen > 2) { solid += runLen; } runs++; last = v; runLen = 1; }
    }
    if (runLen > 2) { solid += runLen; }
    ok('the sky reads as bands rather than as static', solid / total > 0.75,
      Math.round(solid / total * 100) + ' percent solid, ' + runs + ' runs');

    // Relighting the world palette must not change hue, and at full daylight
    // it must not change anything at all.
    P.applyTimeOfDay(12);
    var noon = P.codes.slice(0, 16);
    P.applyTimeOfDay(20);
    var dusk = P.codes.slice(0, 16);
    var darker = true, inverted = '';
    function order(a, b) { return a > b ? 1 : (a < b ? -1 : 0); }
    for (var i = 1; i < 15; i++) {
      var a = P.expand(noon[i]), b = P.expand(dusk[i]);
      if (b.r > a.r + 1 && b.g > a.g + 1 && b.b > a.b + 1) { darker = false; }
      // Hue is which channel leads. Nine bit color has eight levels a
      // channel, so a dim green like level (1,2,1) has nowhere left to go and
      // can flatten to grey. That is the hardware, and it is allowed. What is
      // never allowed is an inversion: a green that dims into a red.
      var pairs = [['r', 'g'], ['g', 'b'], ['r', 'b']];
      for (var q = 0; q < pairs.length; q++) {
        var oa = order(a[pairs[q][0]], a[pairs[q][1]]);
        var ob = order(b[pairs[q][0]], b[pairs[q][1]]);
        if (oa !== 0 && ob !== 0 && oa !== ob) {
          inverted = 'entry ' + i + ' ' + pairs[q].join('/');
        }
      }
    }
    ok('dusk darkens the world palette', darker);
    ok('dimming never inverts a hue', inverted === '', inverted);
    P.applyTimeOfDay(12);
    var again = P.codes.slice(0, 16);
    var identical = true;
    for (i = 0; i < 16; i++) { if (again[i] !== noon[i]) { identical = false; } }
    ok('full daylight leaves the world palette exactly as authored', identical);

    // The canopy glare brightens the sky rather than painting white on it.
    R.clear(P.RAMP.sky.start + 4);
    var ac = AC.byId('trainer');
    var rig = AERO.camera.create();
    I.drawCanopy(ac, rig, { });
    var whites = 0;
    for (i = 0; i < R.W * R.H; i++) { if (R.buf[i] === P.RAMP.white.start) { whites++; } }
    ok('the canopy glare never paints white over the sky', whites === 0, whites + ' white pixels');

    // The attitude ball in the HUD has to be sky over ground, not two darks.
    R.clear(0);
    I.hudVisible = true;
    I.drawHUD(ac, { airspeed: 40, altitude: 300, vsi: 0, heading: 0, bank: 0, pitch: 0, stalled: false }, {});
    var sky = 0, ground = 0;
    for (i = 0; i < R.W * R.H; i++) {
      if (R.buf[i] === P.RAMP.sky.start + 3) { sky++; }
      if (R.buf[i] === P.RAMP.grass.start + 1) { ground++; }
    }
    ok('the HUD horizon shows sky over ground', sky > 20 && ground > 20,
      sky + ' sky, ' + ground + ' ground');
  };

  // ---------------------------------------------------------- world model
  T.world = function () {
    var finite = true, i;
    for (i = 0; i < 400; i++) {
      var x = (Math.random() - 0.5) * 8000, z = (Math.random() - 0.5) * 8000;
      var h = W.heightAt(x, z);
      if (!isFinite(h) || h < -200 || h > 3000) { finite = false; break; }
    }
    ok('terrain height is finite everywhere sampled', finite);
    var flat = true;
    for (i = -400; i <= 400; i += 40) {
      if (Math.abs(W.heightAt(0, i) - W.RUNWAY.elev) > 0.6) { flat = false; break; }
    }
    ok('the runway is flat along its length', flat);
    var wind = X.windAt({ x: -1500, y: W.heightAt(-1500, 0) + 60, z: 0 }, 12, 1);
    ok('wind field returns finite vectors', isFinite(wind.x) && isFinite(wind.y) && isFinite(wind.z));
    X.state.meanSpeed = 10; X.state.meanDirDeg = 270; X.state.turbulence = 0;
    X.tick(0.016);
    var upwind = X.windAt({ x: W.RIDGE_X - 380, y: W.heightAt(W.RIDGE_X - 380, 0) + 40, z: 0 }, 5, 1);
    ok('the upwind slope produces ridge lift', upwind.y > 0.4, 'w ' + upwind.y.toFixed(2) + ' m/s');
  };

  // ------------------------------------------------------------- storage
  T.storage = function () {
    var before = S.exportText();
    S.state.settings.volume = 0.42;
    S.state.settings.weather.meanSpeed = 11.5;
    S.saveUserAircraft('trainer', 'Test Ship', { massKg: 999 });
    var text = S.exportText();
    var res = S.importText(text);
    ok('save and load survive a full round trip', res.ok, res.reason);
    var after = S.exportText();
    var a = JSON.parse(text), b = JSON.parse(after);
    a.savedAt = b.savedAt = null;
    ok('round tripped state is unchanged', JSON.stringify(a) === JSON.stringify(b));
    var bad = S.importText('{"app":"SOMETHING ELSE","schema":1}');
    ok('a foreign file is rejected', !bad.ok, bad.reason);
    var badJson = S.importText('{not json');
    ok('malformed JSON is rejected without throwing', !badJson.ok);
    var future = S.importText('{"app":"AERODROME","schema":99}');
    ok('a newer schema is refused rather than guessed at', !future.ok);
    S.importText(before);
  };

  // ------------------------------------------------------------ aircraft
  T.roster = function () {
    var list = AC.list();
    ok('at least twelve aircraft ship in this build', list.length >= 12, list.length + ' aircraft');
    var complete = true, missing = '';
    list.forEach(function (ac) {
      var needs = ['massKg', 'inertia', 'control', 'eye', 'chase', 'panel', 'mesh', 'entry'];
      needs.forEach(function (k) {
        if (ac[k] === undefined || ac[k] === null) { complete = false; missing = ac.id + '.' + k; }
      });
      if (!(ac.wing || ac.buoyancy || ac.rotor || ac.reaction || ac.flapping)) {
        complete = false; missing = ac.id + ' has no capability flag';
      }
    });
    ok('every aircraft has a complete parameter block', complete, missing);
    var kinds = {};
    list.forEach(function (ac) {
      if (ac.buoyancy) { kinds.buoyancy = 1; }
      if (ac.rotor) { kinds.rotor = 1; }
      if (ac.reaction) { kinds.reaction = 1; }
      if (ac.flapping) { kinds.flapping = 1; }
    });
    ok('all four capability flags are exercised by the roster',
      kinds.buoyancy && kinds.rotor && kinds.reaction && kinds.flapping);
    var before = AC.byId('trainer').massKg;
    AC.setPath(AC.byId('trainer'), 'massKg', 1234);
    AC.resetToStock('trainer');
    ok('reset to stock restores a tuned value', AC.byId('trainer').massKg === before);
  };

  // ---------------------------------------------------------------- runner
  T.runAll = function () {
    results = [];
    var groups = ['palette', 'raster', 'attitude', 'camera', 'energy', 'trim',
      'airmanship', 'engine', 'damage', 'gradient', 'optics', 'cabinet',
      'field', 'chrome', 'legibility', 'world', 'storage', 'roster'];
    groups.forEach(function (g) {
      try {
        T[g]();
      } catch (e) {
        ok(g + ' suite threw', false, String(e && e.message ? e.message : e));
      }
    });
    var passed = results.filter(function (r) { return r.pass; }).length;
    return {
      passed: passed,
      failed: results.length - passed,
      total: results.length,
      results: results.slice(),
      summary: passed + ' of ' + results.length + ' assertions passed'
    };
  };

})(typeof window !== 'undefined' ? window : globalThis);
