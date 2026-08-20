// AERODROME :: src/15-main.js :: v1.5.1
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
    if (S.state.world) { W.loadWorld(S.state.world); } else { W.build(); }
    X.buildThermals();

    var canvas = document.getElementById('screen');
    R.setSize(320, S.state.settings.resolution);
    R.attach(canvas);
    R.resizeInner();
    app.fitCanvas();

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
      if (app.state) {
        A.setEnginePatch(app.state.ac.audio.patch);
        A.setEngineLayer(app.state.ac.audio.layer ? app.state.ac.audio.layer.patch : null);
      }
      window.removeEventListener('pointerdown', wake);
      window.removeEventListener('keydown', wake);
    };
    window.addEventListener('pointerdown', wake);
    window.addEventListener('keydown', wake);

    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      S.state.settings.reducedMotion = true;
      app.setReducedMotion(true);
    }

    if (S.state.build <= 1) {
      U.showFirstRun();
    }
    // Resizing the window, or entering and leaving fullscreen, both mean the
    // whole number scale has to be worked out again.
    var refit = function () {
      app.fitCanvas(true);
      var stage = document.getElementById('stage');
      var full = document.fullscreenElement === stage || document.webkitFullscreenElement === stage;
      document.documentElement.setAttribute('data-fullscreen', full ? 'on' : 'off');
      U.markFullscreen(full);
      if (full) { canvas.focus(); }
    };
    window.addEventListener('resize', function () { app.fitCanvas(true); refit(); });
    document.addEventListener('fullscreenchange', refit);
    document.addEventListener('webkitfullscreenchange', refit);
    refit();
    // Layout is not final on the first pass. Measure again once the browser
    // has drawn, which is what the old single measurement got wrong: the
    // picture was sized from a box that had not settled yet.
    requestAnimationFrame(function () {
      app.fitCanvas(true);
      requestAnimationFrame(function () { app.fitCanvas(true); });
    });

    canvas.focus();
    app.last = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    requestAnimationFrame(app.frameStep);
    U.setStatus('Ready. Click the viewport, then push the throttle with W.');
  };

  // -------------------------------------------------------------- fitting
  // The canvas is sized in whole framebuffer pixels, every time, so the
  // picture is never scaled by a fraction and the deck never overflows the
  // window. This is also what makes fullscreen sharp rather than smeared.
  app.fitCanvas = function (force) {
    var canvas = document.getElementById('screen');
    var stage = document.getElementById('stage');
    if (!canvas || !stage) { return 1; }
    var full = document.fullscreenElement === stage || document.webkitFullscreenElement === stage;
    var boxW = full ? window.innerWidth : stage.clientWidth;
    var boxH = full ? window.innerHeight : stage.clientHeight;
    // Before the first layout the stage can measure zero. Fall back to the
    // window rather than picking a scale from nothing.
    if (boxW < 8) { boxW = window.innerWidth - 40; }
    if (boxH < 8) { boxH = Math.max(180, window.innerHeight * 0.6); }

    var scale = U.fitScale(boxW, boxH, R.W, R.H);
    var fill = S.state.settings.scaleMode === 'fill';
    // In fill mode the backing store still moves in whole steps, so the
    // rendering is unchanged. Only the final blit to the screen is stretched,
    // and only by the fraction left over above the last whole step.
    var cssW = R.W * scale, cssH = R.H * scale;
    if (fill) {
      var size = U.fillSize(boxW, boxH, R.W, R.H);
      cssW = size.w;
      cssH = size.h;
    }
    var key = scale + ':' + cssW + 'x' + cssH + ':' + R.W + 'x' + R.H;
    if (!force && key === app.fitKey) { return scale; }
    app.fitKey = key;

    canvas.width = R.W * scale;
    canvas.height = R.H * scale;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    R.attach(canvas);
    R.resizeInner();
    app.scale = scale;
    return scale;
  };

  app.setScaleMode = function (mode) {
    S.state.settings.scaleMode = (mode === 'fill') ? 'fill' : 'whole';
    S.save();
    app.fitCanvas(true);
  };

  app.toggleFullscreen = function () {
    var stage = document.getElementById('stage');
    if (!stage) { return; }
    var doc = document;
    var full = doc.fullscreenElement === stage || doc.webkitFullscreenElement === stage;
    try {
      if (full) {
        if (doc.exitFullscreen) { doc.exitFullscreen(); }
        else if (doc.webkitExitFullscreen) { doc.webkitExitFullscreen(); }
      } else if (stage.requestFullscreen) {
        stage.requestFullscreen({ navigationUI: 'hide' });
      } else if (stage.webkitRequestFullscreen) {
        stage.webkitRequestFullscreen();
      } else {
        U.setStatus('This browser will not give us the whole screen', 'warn');
      }
    } catch (e) {
      U.setStatus('Fullscreen was refused by the browser', 'warn');
    }
  };

  app.applySettings = function () {
    var s = S.state.settings;
    document.documentElement.setAttribute('data-theme', s.theme);
    R.setSize(320, s.resolution);
    app.fitCanvas();
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

  // World files. Loading one rebuilds the valley and puts the aircraft back
  // on the runway, since the runway it was standing on may have moved.
  app.loadWorldFile = function (parsed) {
    var res = W.loadWorld(parsed);
    if (!res.ok) {
      U.setStatus('World refused: ' + res.reason, 'warn');
      return res;
    }
    S.state.world = AERO.util.deepCopy(W.params);
    S.save();
    app.rig.viewAim = null;
    app.rig.viewIndex = 0;
    app.respawn('runway');
    U.markWorld();
    U.setStatus('Loaded ' + W.params.name);
    return res;
  };

  app.resetWorldFile = function () {
    W.resetWorld();
    S.state.world = null;
    S.save();
    app.rig.viewAim = null;
    app.rig.viewIndex = 0;
    app.respawn('runway');
    U.markWorld();
    U.setStatus('Back in the stock valley');
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
    A.setEngineLayer(ac.audio.layer ? ac.audio.layer.patch : null);
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
    app.rig.chaseInit = false;
    app.releaseTow(true);
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
    app.fitCanvas();
    S.save();
  };
  app.setReducedMotion = function (v) {
    S.state.settings.reducedMotion = v;
    app.rig.reducedMotion = v;
    R.flickerEnabled = v ? false : S.state.settings.spriteFlicker;
    S.save();
  };

  // ------------------------------------------------------------------ tow
  // An aerotow for the sailplane. The tug flies a scripted profile and the
  // rope is a spring that pulls and never pushes, so it goes slack in a climb
  // and snatches when the glider falls behind.
  app.tow = { active: false, pos: null, vel: null, quat: null, time: 0, tension: 0 };

  app.startTow = function () {
    var st = app.state;
    if (!st.ac.towable || app.tow.active) { return false; }
    var fwd = Q.rotate(st.quat, { x: 1, y: 0, z: 0 });
    var spec = st.ac.towable;
    app.tow.active = true;
    app.tow.time = 0;
    app.tow.pos = V.add(st.pos, V.scale(V.norm(fwd), spec.restLen));
    app.tow.vel = V.copy(st.vel);
    app.tow.quat = Q.copy(st.quat);
    app.tow.tension = 0;
    U.setStatus('Tug rolling. Keep it straight, press T to release.');
    A.blip(660, 0.08);
    return true;
  };

  app.releaseTow = function (quiet) {
    if (!app.tow.active) { return; }
    app.tow.active = false;
    app.env.extraForce = null;
    if (!quiet) {
      U.setStatus('Released. Go and find the ridge.');
      A.blip(420, 0.1);
    }
  };

  function updateTow(st, dt) {
    if (!app.tow.active) { return; }
    var spec = st.ac.towable;
    app.tow.time += dt;
    // Tug profile: accelerate down the runway, rotate, then a steady climb
    // into wind at a fixed rate.
    // The tug feels the rope. If the glider is dragging, the tug eases off
    // rather than tearing the rope out of it, which is what a tug pilot does.
    var strain = M.clamp(app.tow.tension / spec.maxN, 0, 1);
    var ease = M.clamp((strain - 0.45) / 0.55, 0, 1);
    var target = M.clamp(app.tow.time * 9, 0, 33) * (1 - 0.35 * ease);
    // The tug rotates when it has flying speed, not when it has height. The
    // earlier version gated the climb on altitude, which meant it could never
    // start climbing, and the glider just kited on the end of the rope.
    var tugSpeed = Math.sqrt(app.tow.vel.x * app.tow.vel.x + app.tow.vel.z * app.tow.vel.z);
    var climb = (tugSpeed > 24) ? 4.2 * (1 - 0.7 * ease) : 0;
    var dir = V.norm({ x: app.tow.vel.x, y: 0, z: app.tow.vel.z });
    if (V.len2(dir) < 1e-6) { dir = Q.rotate(app.tow.quat, { x: 1, y: 0, z: 0 }); dir.y = 0; dir = V.norm(dir); }
    var want = { x: dir.x * target, y: climb, z: dir.z * target };
    var k = M.clamp(dt * 1.4, 0, 1);
    app.tow.vel = {
      x: M.lerp(app.tow.vel.x, want.x, k),
      y: M.lerp(app.tow.vel.y, want.y, k),
      z: M.lerp(app.tow.vel.z, want.z, k)
    };
    app.tow.pos = V.add(app.tow.pos, V.scale(app.tow.vel, dt));
    if (app.tow.pos.y < W.heightAt(app.tow.pos.x, app.tow.pos.z) + 1.4) {
      app.tow.pos.y = W.heightAt(app.tow.pos.x, app.tow.pos.z) + 1.4;
    }
    app.tow.quat = Q.fromBasis(V.len2(app.tow.vel) > 1 ? app.tow.vel : dir, { x: 0, y: 1, z: 0 });

    var f = F.ropeForce(st.pos, st.vel, app.tow.pos, app.tow.vel,
      spec.restLen, spec.k, spec.c, spec.maxN);
    app.tow.tension = V.len(f);
    app.env.extraForce = f;
    // The rope breaks if the glider gets badly out of position, and the tug
    // lets go once the glider is high enough to be someone else's problem.
    if (app.tow.tension >= spec.maxN * 0.999) {
      app.releaseTow(true);
      U.setStatus('Rope parted. That is what the weak link is for.');
    } else if (st.pos.y - W.RUNWAY.elev > spec.releaseAltM) {
      app.releaseTow(true);
      U.setStatus('Tug waved you off at ' + Math.round(st.pos.y) + ' m.');
    }
  }

  // Two small wrappers so the quickbar buttons and the key events go through
  // exactly the same path.
  app.toggleTow = function () {
    var st = app.state;
    if (app.tow.active) { app.releaseTow(); }
    else if (!st.ac.towable) { U.setStatus('Nothing here needs a tow.'); }
    else if (!st.onGround) { U.setStatus('Land first. A tug cannot reach you up there.'); }
    else { app.startTow(); }
    U.markContextual();
  };

  app.toggleEngine = function () {
    var st = app.state;
    if (st.engineState === 'running') {
      F.cutEngine(st);
      U.setStatus('Engine cut. Fly it down.');
      A.blip(300, 0.12);
    } else if (st.engineState === 'off') {
      F.startEngine(st);
      U.setStatus('Cranking. Give it a couple of seconds.');
      A.blip(420, 0.08);
    }
    U.markContextual();
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
        c.throttle = 1;
      }
    }
    if (ac.reaction) {
      c.liftZ = axes.liftZ;
      c.liftX = axes.liftX;
      c.liftY = axes.liftY;
    }
    if (ac.flapping) { c.throttle = axes.throttle; }
  }

  function handleEvents(events) {
    for (var i = 0; i < events.length; i++) {
      var id = events[i];
      var st = app.state, c = st.controls;
      if (id === 'camera') { app.cycleCamera(); }
      else if (id === 'fullscreen') { app.toggleFullscreen(); }
      else if (id === 'lookSnap') { C.snapForward(app.rig); }
      else if (id === 'pause') { app.togglePause(); }
      else if (id === 'mute') { app.toggleMute(); }
      else if (id === 'hud') { app.setHud(!S.state.settings.hud); }
      else if (id === 'reset') { app.respawn(app.lastSpawn === 'runway' ? 'runway' : 'air'); U.setStatus('Reset'); }
      else if (id === 'gear') { c.gear = c.gear > 0.5 ? 0 : 1; A.blip(520, 0.06); }
      else if (id === 'flaps') { c.flap = (c.flap >= 0.99) ? 0 : Math.min(1, c.flap + 0.34); A.blip(700, 0.05); }
      else if (id === 'tow') { app.toggleTow(); }
      else if (id === 'engineCut') { app.toggleEngine(); }
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
    // The tug and the rope, drawn only while a tow is running.
    if (app.tow.active) {
      var tug = AC.byId('trainer');
      G.submitMesh(cam, tug.mesh, app.tow.pos, app.tow.quat, { light: env.sunDir, ambient: env.ambient });
      var a = st.pos, b = app.tow.pos;
      var side = V.norm(V.cross(V.sub(b, a), { x: 0, y: 1, z: 0 }));
      G.submitFace(cam, [
        { x: a.x + side.x * 0.09, y: a.y + 0.2, z: a.z + side.z * 0.09 },
        { x: b.x + side.x * 0.09, y: b.y - 0.6, z: b.z + side.z * 0.09 },
        { x: b.x - side.x * 0.09, y: b.y - 0.6, z: b.z - side.z * 0.09 },
        { x: a.x - side.x * 0.09, y: a.y + 0.2, z: a.z - side.z * 0.09 }
      ], 'dark', { twoSided: true, noHaze: true, ambient: 1, bias: 1 });
    }
    // Contact shadow, drawn as the aircraft's own silhouette on the ground.
    var agl = st.derived.agl;
    if (agl < 260 && agl > -2) {
      G.submitShadow(cam, st.ac.mesh, st.pos, st.quat,
        W.heightAt(st.pos.x, st.pos.z) + 0.12, { light: env.sunDir, ambient: env.ambient });
    }
    G.flushQueue();
    W.emitSprites(cam, env, app.time, app.frame);

    var d = st.derived;
    var opts = {
      gear: st.controls.gear, flap: st.controls.flap, brake: st.controls.brake,
      spoiler: st.controls.spoiler, burner: st.controls.burner,
      lowFuel: st.ac.fuelKg ? (st.fuel / st.ac.fuelKg) < 0.15 : false,
      onGround: st.onGround,
      engineOff: st.engineState === 'off',
      starting: st.engineState === 'starting',
      groundEffect: d.groundEffect
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
      W.tickMovers(dt);
      env.wind = X.windAt(st.pos, app.time, st.ac.gustFactor || 1);
      app.env = env;
      applyControls(st, axes, dt);
      app.env.extraForce = null;
      updateTow(st, dt);
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
    // Listener velocity, so a chase pass actually shifts in pitch. In the
    // cockpit the listener and the source are the same thing and this is 1.
    var camPos = app.rig.cam.pos;
    if (!app.lastCamPos) { app.lastCamPos = V.copy(camPos); }
    var camVel = V.scale(V.sub(camPos, app.lastCamPos), 1 / Math.max(0.001, dt));
    app.lastCamPos = V.copy(camPos);
    var engineHz = (ac.audio.base || 20) + st.rpm * (ac.audio.hzPerRPM || 0.05);
    var running = st.engineState === 'running' ? 1 : (st.engineState === 'starting' ? 0.35 : 0);
    var layer = ac.audio.layer;
    A.update({
      listener: { pos: camPos, vel: camVel },
      source: { pos: st.pos, vel: st.vel },
      layerHz: layer ? engineHz * layer.mul : 0,
      layerLevel: layer ? layer.level * (0.3 + 0.7 * st.controls.throttle) * running * (app.paused ? 0 : 1) : 0,
      // Buffet builds as the wing runs out of margin, rumble is the wheels.
      buffet: app.paused ? 0 : M.clamp((d.stalled ? 1 : 0) * 0.8
        + M.clamp(1 - d.stallMargin * 1.6, 0, 1) * 0.5, 0, 1),
      rumble: (!app.paused && st.onGround)
        ? M.clamp(d.groundspeed / 34, 0, 1) * (1 - 0.5 * (st.controls.gear < 0.5 ? 1 : 0)) : 0,
      engineHz: engineHz,
      engineLevel: app.paused ? 0
        : (ac.audio.level || 0.5) * (0.25 + 0.75 * st.controls.throttle) * running,
      airspeed: d.airspeed,
      rotorLevel: ac.rotor ? 0.5 * M.clamp(st.rotorRPM / (ac.rotor.nominalRPM || 400), 0, 1.2) : 0,
      rotorHz: ac.rotor ? st.rotorRPM / 60 : 0,
      auxHz: 90 + st.controls.burner * 120,
      auxLevel: st.controls.burner * 0.5
    });

    uiTimer += dt;
    if (uiTimer > 0.4) {
      uiTimer = 0;
      U.tickReadouts();
      U.markContextual();
      // The box can change without a resize event: a font arrives, the first
      // run hint is dismissed, a drawer opens. Measuring costs nothing and
      // nothing happens unless the answer changed.
      app.fitCanvas();
    }
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
