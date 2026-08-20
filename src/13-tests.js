// AERODROME :: src/13-tests.js :: v1.0.0
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
    var groups = ['palette', 'raster', 'attitude', 'camera', 'energy', 'trim', 'world', 'storage', 'roster'];
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
