// AERODROME :: src/15-main.js :: v1.0.0
// The application: one fixed step loop, one render order, one control map.
// Depends on every other file. Loads last.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math, V = AERO.vec3, Q = AERO.quat;
  var P = AERO.palette, R = AERO.raster, G = AERO.render, A = AERO.audio;
  var F = AERO.flight, AC = AERO.aircraft, W = AERO.world, X = AERO.weather;
  var C = AERO.camera, I = AERO.instruments, IN = AERO.input, S = AERO.storage, U = AERO.ui;

  var app = AERO.app = {
    aircraftId: 'trainer',
    paused: false,
    time: 0,
    frame: 0,
    fps: 60,
    frameMs: 0,
    engineOn: true,
    rig: null,
    state: null,
    env: null,
    log: { seconds: 0, maxAltM: 0, maxSpeedMps: 0, landings: 0, crashes: 0 },
    lastGround: true
  };

  // ------------------------------------------------------------------ setup
  app.init = function () {
    S.load();
    S.bumpBuild();
    S.applyTuning();
    X.buildThermals();

    var canvas = document.getElementById('screen');
    R.setSize(320, S.state.settings.resolution);
    R.attach(canvas);
    R.resizeInner();

    app.rig = C.create();
    app.env = X.env;
    app.selectAircraft(S.state.settings.aircraft, true);

    IN.init(canvas);
    if (S.state.bindings) { IN.importMap(S.state.bindings); }

    U.init(app);
    app.applySettings();
    U.refreshAircraft();

    // Audio needs a gesture before the browser will let it make a sound.
    var wake = function () {
      A.init();
      A.resume();
      A.setMuted(S.state.settings.muted);
      A.setVolume(S.state.settings.volume);
      if (app.state) { A.setEnginePatch(app.state.ac.audio.patch); }
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      S.state.settings.reducedMotion = true;
      app.setReducedMotion(true);
    }

    canvas.focus();
    app.last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    requestAnimationFrame(app.frameStep);
    U.setStatus('Ready. Click the viewport, then push the throttle with W.');
  };

  app.applySettings = function () {
    var s = S.state.settings;
    document.documentElement.setAttribute('data-theme', s.theme);
    R.setSize(320, s.resolution);
    R.resizeInner();
    document.getElementById('screen').classList.toggle('tall', s.resolution === 240);
    R.flickerEnabled = s.spriteFlicker;
    G.wireframe = s.wireframe;
    I.hudVisible = s.hud;
    A.setMuted(s.muted);
    A.setVolume(s.volume);
    app.rig.reducedMotion = s.reducedMotion;
    C.setMode(app.rig, s.cameraMode);
    Object.keys(s.camera).forEach(function (k) { app.rig.settings[k] = s.camera[k]; });
    Object.keys(s.weather).forEach(function (k) { X.state[k] = s.weather[k]; });
    if (S.state.bindings) { IN.importMap(S.state.bindings); }
    U.markCamera(app.rig.mode);
    U.markMute(s.muted);
  };

  app.persistCamera = function () {
    var s = S.state.settings.camera, r = app.rig.settings;
    s.dist = r.dist; s.up = r.up; s.lag = r.lag; s.lead = r.lead;
    s.damping = r.damping; s.bankMix = r.bankMix;
    S.save();
  };

  app.persistWeather = function () {
    var w = S.state.settings.weather;
    Object.keys(w).forEach(function (k) { w[k] = X.state[k]; });
    S.save();
  };

  // -------------------------------------------------------------- aircraft
  app.selectAircraft = function (id, quiet) {
    var ac = AC.byId(id);
    if (!ac) { ac = AC.byId('trainer'); id = 'trainer'; }
    app.closeLog();
    app.aircraftId = id;
    S.state.settings.aircraft = id;
    C.applyAircraftDefaults(app.rig, ac);
    app.respawn(ac.contacts ? 'runway' : 'air', ac);
    A.setEnginePatch(ac.audio.patch);
    S.save();
    if (!quiet) {
      U.refreshAircraft();
      U.setStatus(ac.name + '. ' + ac.blurb);
      A.blip(880, 0.05);
    }
  };

  app.loadUserAircraft = function (userId) {
    var rec = null;
    S.state.userAircraft.forEach(function (u) { if (u.id === userId) { rec = u; } });
    if (!rec) { return; }
    var base = AC.byId(rec.base);
    if (!base) { return; }
    AC.resetToStock(rec.base);
    Object.keys(rec.values).forEach(function (path) { AC.setPath(base, path, rec.values[path]); });
    app.selectAircraft(rec.base);
    U.setStatus('Loaded ' + rec.name + ' over the ' + base.name + ' airframe');
  };

  // Spawn modes: runway puts the aircraft on the numbers, air uses the entry
  // condition documented in its parameter block, keep reuses the current one.
  app.respawn = function (mode, acOverride) {
    var ac = acOverride || AC.byId(app.aircraftId);
    if (mode === 'keep' && app.state) { mode = app.lastSpawn || 'air'; }
    app.lastSpawn = mode;
    app.closeLog();
    var e = ac.entry;
    var st;
    if (mode === 'runway') {
      var lowest = 0;
      (ac.contacts || []).forEach(function (c) { lowest = Math.min(lowest, c.p[1]); });
      var y = W.RUNWAY.elev - lowest + 0.02;
      st = F.createState(ac, { pos: V.make(0, y, -W.RUNWAY.halfLen + 60), vel: V.zero(), heading: 0 });
      st.controls.throttle = 0;
      st.onGround = true;
    } else {
      st = F.createState(ac, {
        pos: V.make(0, W.RUNWAY.elev + e.alt, -900),
        vel: V.make(0, Math.sin(e.pitch || 0) * e.speed, Math.cos(e.pitch || 0) * e.speed),
        heading: 0, pitch: e.pitch || 0, throttle: e.throttle || 0
      });
      if (e.collective !== undefined) { st.controls.collective = e.collective; }
    }
    st.controls.gear = 1;
    app.state = st;
    app.engineOn = true;
    app.rig.chaseInit = false;
    app.log = { seconds: 0, maxAltM: 0, maxSpeedMps: 0, landings: 0, crashes: 0 };
    app.lastGround = st.onGround;
    if (U.buildTuneRows) { U.buildTuneRows(); }
  };

  app.closeLog = function () {
    if (app.state && app.log.seconds > 10) {
      S.addLog({
        aircraft: app.state.ac.name,
        seconds: app.log.seconds,
        maxAltM: app.log.maxAltM,
        maxSpeedMps: app.log.maxSpeedMps,
        landings: app.log.landings,
        crashes: app.log.crashes
      });
      if (U.buildLog) { U.buildLog(); }
    }
  };

  // ---------------------------------------------------------------- toggles
  app.setCamera = function (mode) {
    C.setMode(app.rig, mode);
    S.state.settings.cameraMode = app.rig.mode;
    S.save();
    U.markCamera(app.rig.mode);
  };
  app.cycleCamera = function () {
    C.cycle(app.rig, S.state.settings.towerCamera);
    S.state.settings.cameraMode = app.rig.mode;
    S.save();
    U.markCamera(app.rig.mode);
  };
  app.togglePause = function () {
    app.paused = !app.paused;
    U.markPause(app.paused);
  };
  app.toggleMute = function () {
    S.state.settings.muted = !S.state.settings.muted;
    A.setMuted(S.state.settings.muted);
    S.save();
    U.markMute(S.state.settings.muted);
  };
  app.setHud = function (v) {
    S.state.settings.hud = v; I.hudVisible = v; S.save();
  };
  app.setTheme = function (v) {
    S.state.settings.theme = v;
    document.documentElement.setAttribute('data-theme', v);
    S.save();
  };
  app.setResolution = function (v) {
    S.state.settings.resolution = v;
    R.setSize(320, v);
    R.resizeInner();
    document.getElementById('screen').classList.toggle('tall', v === 240);
    S.save();
  };
  app.setReducedMotion = function (v) {
    S.state.settings.reducedMotion = v;
    app.rig.reducedMotion = v;
    R.flickerEnabled = v ? false : S.state.settings.spriteFlicker;
    S.save();
  };

  // ---------------------------------------------------------- control map
  // One mapping, driven by capability flags. No aircraft is special cased.
  function applyControls(st, axes, dt) {
    var ac = st.ac, c = st.controls;
    c.pitch = axes.pitch;
    c.roll = axes.roll;
    c.yaw = axes.yaw;
    c.brake = axes.brake;
    c.spoiler = axes.spoiler;
    c.burner = axes.burner;
    c.vent = axes.vent;
    c.throttle = axes.throttle;

    if (ac.rotor) {
      if (ac.rotor.cyclic) {
        c.cyclicPitch = axes.pitch;
        c.cyclicRoll = axes.roll;
      }
      if (ac.rotor.powered) {
        c.collective = axes.throttle;
        c.throttle = app.engineOn ? 1 : 0;
      }
    }
    if (ac.reaction) {
      c.liftZ = axes.liftZ;
      c.liftX = axes.liftX;
      c.liftY = axes.liftY;
    }
    if (!app.engineOn && !ac.rotor) { c.throttle = 0; }
    if (ac.flapping) { c.throttle = axes.throttle; }
  }

  function handleEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var id = events[i];
      var st = app.state, c = st.controls;
      if (id === 'camera') { app.cycleCamera(); }
      else if (id === 'lookSnap') { C.snapForward(app.rig); }
      else if (id === 'pause') { app.togglePause(); }
      else if (id === 'mute') { app.toggleMute(); }
      else if (id === 'hud') { app.setHud(!S.state.settings.hud); }
      else if (id === 'reset') { app.respawn(app.lastSpawn === 'runway' ? 'runway' : 'air'); U.setStatus('Reset'); }
      else if (id === 'gear') { c.gear = c.gear > 0.5 ? 0 : 1; A.blip(520, 0.06); }
      else if (id === 'flaps') { c.flap = (c.flap >= 0.99) ? 0 : Math.min(1, c.flap + 0.34); A.blip(700, 0.05); }
      else if (id === 'engineCut') {
        app.engineOn = !app.engineOn;
        U.setStatus(app.engineOn ? 'Engine running' : 'Engine cut. Fly it down.');
        A.blip(app.engineOn ? 900 : 300, 0.09);
      }
    }
  }

  // ---------------------------------------------------------------- render
  function drawScene() {
    var st = app.state, rig = app.rig, cam = rig.cam, env = app.env;
    R.clear(P.RAMP.sky.start);
    G.drawSkyPlane(cam, env);
    G.drawStars(cam, env);
    G.drawSun(cam, env);
    G.drawClouds(cam, env, app.time);
    G.drawGroundGrid(cam, 400, 9000);

    G.resetQueue();
    W.emit(cam, env, app.time, app.frame);
    G.submitMesh(cam, st.ac.mesh, st.pos, st.quat, { light: env.sunDir, ambient: env.ambient });
    // A cheap contact shadow so low passes read as low passes.
    var agl = st.derived.agl;
    if (agl < 240) {
      var gh = W.heightAt(st.pos.x, st.pos.z) + 0.15;
      var r = 2 + (st.ac.wing ? st.ac.wing.spanM * 0.35 : 3);
      G.submitFace(cam, [
        { x: st.pos.x - r, y: gh, z: st.pos.z - r * 1.6 },
        { x: st.pos.x + r, y: gh, z: st.pos.z - r * 1.6 },
        { x: st.pos.x + r, y: gh, z: st.pos.z + r * 1.6 },
        { x: st.pos.x - r, y: gh, z: st.pos.z + r * 1.6 }
      ], 'shadow', { twoSided: true, noHaze: false });
    }
    G.flushQueue();
    W.emitSprites(cam, env, app.time, app.frame);

    var d = st.derived;
    var opts = {
      gear: st.controls.gear, flap: st.controls.flap, brake: st.controls.brake,
      spoiler: st.controls.spoiler, burner: st.controls.burner,
      lowFuel: st.ac.fuelKg ? (st.fuel / st.ac.fuelKg) < 0.15 : false,
      onGround: st.onGround, engineOn: app.engineOn
    };
    if (rig.mode === 'cockpit') {
      I.drawPanel(st.ac, d, app.time, opts);
      I.drawCanopy(st.ac, rig, d);
    } else {
      I.drawHUD(st.ac, d, opts);
    }
    if (S.state.settings.showForces && rig.mode !== 'cockpit') { I.drawForces(cam, st); }
    if (S.state.settings.debug) {
      I.drawDebug(st, env, G.stats, app.fps, 'FRAME ' + app.frameMs.toFixed(1) + ' MS  MODE ' + rig.mode);
    }
    if (st.crashed) {
      R.textCentered('WRECKED  ' + st.crashReason.toUpperCase(), R.W / 2, 30, P.RAMP.red.start);
      R.textCentered('PRESS R', R.W / 2, 40, P.RAMP.white.start);
    }
    if (app.paused) { R.textCentered('PAUSED', R.W / 2, R.H / 2 - 4, P.RAMP.white.start); }
    R.present();
  }

  // ------------------------------------------------------------------ loop
  var accum = 0, uiTimer = 0, saveTimer = 0;

  app.frameStep = function (now) {
    requestAnimationFrame(app.frameStep);
    var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var dt = Math.min(0.1, Math.max(0, (now - app.last) / 1000));
    app.last = now;
    app.frame++;
    app.fps = app.fps * 0.92 + (1 / Math.max(0.0005, dt)) * 0.08;

    var axes = IN.update(dt);
    handleEvents(IN.takeEvents());

    var st = app.state;
    if (!app.paused) {
      app.time += dt;
      var env = X.tick(dt);
      env.wind = X.windAt(st.pos, app.time, st.ac.gustFactor || 1);
      app.env = env;
      applyControls(st, axes, dt);
      // Fixed step physics with an accumulator so the model does not care
      // what the display is doing.
      accum += dt;
      var guard = 0;
      while (accum >= F.SUBSTEP && guard < 600) {
        F.step(st, env, F.SUBSTEP);
        accum -= F.SUBSTEP;
        guard++;
      }
      if (accum > 0.5) { accum = 0; }
      F.derive(st, env);

      app.log.seconds += dt;
      app.log.maxAltM = Math.max(app.log.maxAltM, st.derived.altitude);
      app.log.maxSpeedMps = Math.max(app.log.maxSpeedMps, st.derived.airspeed);
      // A landing only counts after the aircraft has actually been airborne.
      app.airborneTime = st.onGround ? 0 : (app.airborneTime || 0) + dt;
      if (st.onGround && !app.lastGround && !st.crashed && (app.airborneTime || 0) > 2) {
        app.log.landings++;
      }
      if (st.crashed && !app.wasCrashed) { app.log.crashes++; A.blip(120, 0.3); }
      app.wasCrashed = st.crashed;
      app.lastGround = st.onGround;
    }

    if (IN.mouse.stick) { C.lookAround(app.rig, IN.mouse.dx * 0.004, -IN.mouse.dy * 0.004); }
    C.lookAround(app.rig, axes.lookX * app.rig.lookRate * dt, axes.lookY * app.rig.lookRate * dt);
    if (Math.abs(axes.lookX) < 0.01 && Math.abs(axes.lookY) < 0.01 && !IN.mouse.stick && app.rig.mode === 'cockpit') {
      app.rig.look.yaw = M.approach(app.rig.look.yaw, 0, 0.9, dt);
      app.rig.look.pitch = M.approach(app.rig.look.pitch, 0, 0.9, dt);
    }
    C.update(app.rig, st, dt, { shake: st.derived.load, onGround: st.onGround });

    drawScene();

    var d = st.derived, ac = st.ac;
    A.update({
      engineHz: (ac.audio.base || 20) + st.rpm * (ac.audio.hzPerRPM || 0.05),
      engineLevel: app.paused ? 0 : (ac.audio.level || 0.5) * (0.25 + 0.75 * st.controls.throttle) * (app.engineOn ? 1 : 0),
      airspeed: d.airspeed,
      rotorLevel: ac.rotor ? 0.5 * M.clamp(st.rotorRPM / (ac.rotor.nominalRPM || 400), 0, 1.2) : 0,
      rotorHz: ac.rotor ? st.rotorRPM / 60 : 0,
      auxHz: 90 + st.controls.burner * 120,
      auxLevel: st.controls.burner * 0.5
    });

    uiTimer += dt;
    if (uiTimer > 0.4) { uiTimer = 0; U.tickReadouts(); }
    saveTimer += dt;
    if (saveTimer > 15) { saveTimer = 0; app.persistWeather(); }

    app.frameMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', app.init);
    } else {
      app.init();
    }
    window.addEventListener('beforeunload', function () { app.closeLog(); S.save(); });
  }

})(typeof window !== 'undefined' ? window : globalThis);
