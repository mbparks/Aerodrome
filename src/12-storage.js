// AERODROME :: src/12-storage.js :: v1.5.1
// Local first storage. One JSON file in, one JSON file out, schema versioned,
// validated on import and never evaluated.
// Depends on 00-core.js, 06-aircraft.js, 11-input.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var AC = AERO.aircraft, IN = AERO.input;

  var S = AERO.storage = {};

  S.KEY = 'aerodrome.state.v1';
  S.available = (function () {
    try {
      if (typeof localStorage === 'undefined') { return false; }
      localStorage.setItem('aerodrome.probe', '1');
      localStorage.removeItem('aerodrome.probe');
      return true;
    } catch (e) { return false; }
  })();

  S.defaults = function () {
    return {
      app: 'AERODROME',
      schema: AERO.SCHEMA_VERSION,
      version: AERO.VERSION,
      build: 0,
      savedAt: null,
      settings: {
        resolution: 224,
        scaleMode: 'whole',
        theme: 'night',
        aircraft: 'trainer',
        cameraMode: 'cockpit',
        hud: true,
        muted: false,
        volume: 0.6,
        reducedMotion: false,
        spriteFlicker: true,
        debug: false,
        wireframe: false,
        showForces: false,
        towerCamera: true,
        weather: {
          hour: 9.5, hourRate: 0.06, meanDirDeg: 265, meanSpeed: 6.5,
          gustiness: 0.45, turbulence: 0.5, thermalStrength: 1, ridgeStrength: 1, enabled: true
        },
        camera: { dist: 16, up: 4, lag: 3.2, lead: 0.9, damping: 1.35, bankMix: 0.35 }
      },
      bindings: IN ? IN.defaultBindings() : {},
      tuning: {},
      userAircraft: [],
      logs: [],
      // A loaded world file, or null for the valley that ships in the box.
      // Files written before v1.4 simply do not have this field.
      world: null
    };
  };

  S.state = S.defaults();

  // ------------------------------------------------------------- validation
  // Everything imported is checked field by field. Anything unexpected is
  // dropped rather than merged, and nothing is ever evaluated.
  function num(v, lo, hi, dflt) {
    if (typeof v !== 'number' || !isFinite(v)) { return dflt; }
    return Math.min(hi, Math.max(lo, v));
  }
  function bool(v, dflt) { return (typeof v === 'boolean') ? v : dflt; }
  function str(v, allowed, dflt) {
    if (typeof v !== 'string') { return dflt; }
    if (allowed && allowed.indexOf(v) < 0) { return dflt; }
    return v.slice(0, 64);
  }

  S.validate = function (input) {
    var out = S.defaults();
    if (!input || typeof input !== 'object') { return { ok: false, reason: 'Not an object', data: out }; }
    if (input.app !== 'AERODROME') { return { ok: false, reason: 'Not an AERODROME file', data: out }; }
    if (typeof input.schema !== 'number') { return { ok: false, reason: 'Missing schema version', data: out }; }
    if (input.schema > AERO.SCHEMA_VERSION) {
      return { ok: false, reason: 'File is schema ' + input.schema + ', this build reads ' + AERO.SCHEMA_VERSION, data: out };
    }
    var s = input.settings || {};
    var d = out.settings;
    d.resolution = (s.resolution === 240) ? 240 : 224;
    d.scaleMode = (s.scaleMode === 'fill') ? 'fill' : 'whole';
    d.theme = str(s.theme, ['night', 'day', 'contrast'], 'night');
    d.aircraft = str(s.aircraft, AC ? AC.ORDER.concat((input.userAircraft || []).map(function (u) { return u && u.id; })) : null, 'trainer');
    d.cameraMode = str(s.cameraMode, ['cockpit', 'chase', 'tower'], 'cockpit');
    d.hud = bool(s.hud, true);
    d.muted = bool(s.muted, false);
    d.volume = num(s.volume, 0, 1, 0.6);
    d.reducedMotion = bool(s.reducedMotion, false);
    d.spriteFlicker = bool(s.spriteFlicker, true);
    d.debug = bool(s.debug, false);
    d.wireframe = bool(s.wireframe, false);
    d.showForces = bool(s.showForces, false);
    d.towerCamera = bool(s.towerCamera, true);
    var w = s.weather || {};
    d.weather = {
      hour: num(w.hour, 0, 24, 9.5),
      hourRate: num(w.hourRate, 0, 2, 0.06),
      meanDirDeg: num(w.meanDirDeg, 0, 360, 265),
      meanSpeed: num(w.meanSpeed, 0, 40, 6.5),
      gustiness: num(w.gustiness, 0, 2, 0.45),
      turbulence: num(w.turbulence, 0, 3, 0.5),
      thermalStrength: num(w.thermalStrength, 0, 3, 1),
      ridgeStrength: num(w.ridgeStrength, 0, 3, 1),
      enabled: bool(w.enabled, true)
    };
    var c = s.camera || {};
    d.camera = {
      dist: num(c.dist, 1, 200, 16), up: num(c.up, -10, 60, 4),
      lag: num(c.lag, 0.4, 12, 3.2), lead: num(c.lead, 0, 3, 0.9),
      damping: num(c.damping, 0.2, 4, 1.35), bankMix: num(c.bankMix, 0, 1, 0.35)
    };

    if (input.bindings && typeof input.bindings === 'object' && IN) {
      var fresh = IN.defaultBindings();
      Object.keys(fresh).forEach(function (id) {
        var m = input.bindings[id];
        if (!m || typeof m !== 'object') { return; }
        if (typeof m.key === 'string') { fresh[id].key = m.key.slice(0, 24); }
        else if (m.key === null) { fresh[id].key = null; }
        if (m.pad && m.pad.type === 'axis') {
          fresh[id].pad = { type: 'axis', index: num(m.pad.index, 0, 31, 0) | 0, dir: m.pad.dir === -1 ? -1 : 1 };
        } else if (m.pad && m.pad.type === 'button') {
          fresh[id].pad = { type: 'button', index: num(m.pad.index, 0, 31, 0) | 0 };
        } else { fresh[id].pad = null; }
      });
      out.bindings = fresh;
    }

    out.tuning = {};
    if (input.tuning && typeof input.tuning === 'object') {
      Object.keys(input.tuning).slice(0, 64).forEach(function (acId) {
        var block = input.tuning[acId];
        if (!block || typeof block !== 'object') { return; }
        var clean = {};
        AC.TUNABLE.forEach(function (t) {
          var v = block[t.path];
          if (typeof v === 'number' && isFinite(v)) { clean[t.path] = num(v, t.min, t.max, v); }
        });
        if (Object.keys(clean).length) { out.tuning[str(acId, null, 'unknown')] = clean; }
      });
    }

    out.userAircraft = [];
    if (Array.isArray(input.userAircraft)) {
      input.userAircraft.slice(0, 64).forEach(function (u) {
        if (!u || typeof u !== 'object') { return; }
        var base = str(u.base, AC ? AC.ORDER : null, 'trainer');
        var rec = {
          id: str(u.id, null, 'user-' + Math.random().toString(36).slice(2, 8)),
          base: base,
          name: str(u.name, null, 'UNTITLED').toUpperCase(),
          values: {},
          archived: bool(u.archived, false),
          deletedAt: (typeof u.deletedAt === 'string') ? u.deletedAt.slice(0, 40) : null
        };
        if (u.values && typeof u.values === 'object') {
          AC.TUNABLE.forEach(function (t) {
            var v = u.values[t.path];
            if (typeof v === 'number' && isFinite(v)) { rec.values[t.path] = num(v, t.min, t.max, v); }
          });
        }
        out.userAircraft.push(rec);
      });
    }

    out.logs = [];
    if (Array.isArray(input.logs)) {
      input.logs.slice(-200).forEach(function (l) {
        if (!l || typeof l !== 'object') { return; }
        out.logs.push({
          at: str(l.at, null, ''),
          aircraft: str(l.aircraft, null, ''),
          seconds: num(l.seconds, 0, 1e7, 0),
          maxAltM: num(l.maxAltM, -500, 100000, 0),
          maxSpeedMps: num(l.maxSpeedMps, 0, 2000, 0),
          landings: num(l.landings, 0, 10000, 0) | 0,
          crashes: num(l.crashes, 0, 10000, 0) | 0
        });
      });
    }
    out.world = null;
    if (input.world && typeof input.world === 'object' && AERO.world) {
      var wres = AERO.world.validateWorld(input.world);
      if (wres.ok) { out.world = wres.data; }
    }
    out.build = num(input.build, 0, 1e9, 0) | 0;
    out.savedAt = (typeof input.savedAt === 'string') ? input.savedAt.slice(0, 40) : null;
    return { ok: true, reason: '', data: out };
  };

  // ------------------------------------------------------------------- disk
  S.load = function () {
    if (!S.available) { S.state = S.defaults(); return S.state; }
    try {
      var text = localStorage.getItem(S.KEY);
      if (!text) { S.state = S.defaults(); return S.state; }
      var parsed = JSON.parse(text);
      var res = S.validate(parsed);
      S.state = res.data;
      S.lastLoadError = res.ok ? null : res.reason;
    } catch (e) {
      S.state = S.defaults();
      S.lastLoadError = 'Saved state was unreadable, defaults restored';
    }
    return S.state;
  };

  S.save = function () {
    S.state.app = 'AERODROME';
    S.state.schema = AERO.SCHEMA_VERSION;
    S.state.version = AERO.VERSION;
    S.state.savedAt = new Date().toISOString();
    if (!S.available) { return false; }
    try {
      localStorage.setItem(S.KEY, JSON.stringify(S.state));
      return true;
    } catch (e) { return false; }
  };

  S.bumpBuild = function () {
    S.state.build = (S.state.build || 0) + 1;
    AERO.BUILD = S.state.build;
    return AERO.BUILD;
  };

  S.exportText = function () {
    S.state.savedAt = new Date().toISOString();
    return JSON.stringify(S.state, null, 2);
  };

  S.importText = function (text) {
    var parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, reason: 'That file is not valid JSON' }; }
    var res = S.validate(parsed);
    if (!res.ok) { return res; }
    S.state = res.data;
    S.save();
    return { ok: true, reason: '', data: res.data };
  };

  // -------------------------------------------------------- user aircraft
  S.saveUserAircraft = function (baseId, name, values) {
    var id = 'user-' + Date.now().toString(36);
    S.state.userAircraft.push({
      id: id, base: baseId, name: String(name || 'UNTITLED').toUpperCase().slice(0, 24),
      values: values || {}, archived: false, deletedAt: null
    });
    S.save();
    return id;
  };

  // Archive and soft delete only. Nothing here removes a record.
  S.archiveUserAircraft = function (id, archived) {
    S.state.userAircraft.forEach(function (u) {
      if (u.id === id) { u.archived = !!archived; }
    });
    S.save();
  };

  S.softDeleteUserAircraft = function (id) {
    S.state.userAircraft.forEach(function (u) {
      if (u.id === id) { u.deletedAt = new Date().toISOString(); u.archived = true; }
    });
    S.save();
  };

  S.restoreUserAircraft = function (id) {
    S.state.userAircraft.forEach(function (u) {
      if (u.id === id) { u.deletedAt = null; u.archived = false; }
    });
    S.save();
  };

  S.activeUserAircraft = function () {
    return S.state.userAircraft.filter(function (u) { return !u.deletedAt; });
  };

  S.addLog = function (entry) {
    S.state.logs.push({
      at: new Date().toISOString(),
      aircraft: String(entry.aircraft || ''),
      seconds: entry.seconds || 0,
      maxAltM: entry.maxAltM || 0,
      maxSpeedMps: entry.maxSpeedMps || 0,
      landings: entry.landings || 0,
      crashes: entry.crashes || 0
    });
    if (S.state.logs.length > 200) { S.state.logs = S.state.logs.slice(-200); }
    S.save();
  };

  // Apply stored tuning onto the live aircraft table.
  S.applyTuning = function () {
    if (!AC) { return; }
    Object.keys(S.state.tuning).forEach(function (acId) {
      var def = AC.byId(acId);
      if (!def) { return; }
      var block = S.state.tuning[acId];
      Object.keys(block).forEach(function (path) { AC.setPath(def, path, block[path]); });
    });
  };

  S.recordTuning = function (acId, path, value) {
    if (!S.state.tuning[acId]) { S.state.tuning[acId] = {}; }
    S.state.tuning[acId][path] = value;
  };

  S.clearTuning = function (acId) {
    if (acId) { delete S.state.tuning[acId]; } else { S.state.tuning = {}; }
    S.save();
  };

})(typeof window !== 'undefined' ? window : globalThis);
