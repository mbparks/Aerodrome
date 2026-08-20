// AERODROME :: src/11-input.js :: v1.5.0
// Keyboard, mouse and Gamepad API. Every action is remappable and the map is
// saved locally and included in the export.
// Depends on 00-core.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math;

  var IN = AERO.input = {};

  // Actions are grouped for the control panel. Axis actions are held, event
  // actions fire once on the press.
  IN.ACTIONS = [
    { id: 'pitchUp', label: 'Pitch up', group: 'Flight', axis: 'pitch', dir: 1, key: 'ArrowDown' },
    { id: 'pitchDown', label: 'Pitch down', group: 'Flight', axis: 'pitch', dir: -1, key: 'ArrowUp' },
    { id: 'rollLeft', label: 'Roll left', group: 'Flight', axis: 'roll', dir: -1, key: 'ArrowLeft' },
    { id: 'rollRight', label: 'Roll right', group: 'Flight', axis: 'roll', dir: 1, key: 'ArrowRight' },
    { id: 'yawLeft', label: 'Rudder left', group: 'Flight', axis: 'yaw', dir: -1, key: 'KeyZ' },
    { id: 'yawRight', label: 'Rudder right', group: 'Flight', axis: 'yaw', dir: 1, key: 'KeyC' },
    { id: 'throttleUp', label: 'Throttle or collective up', group: 'Power', axis: 'throttle', dir: 1, key: 'KeyW' },
    { id: 'throttleDown', label: 'Throttle or collective down', group: 'Power', axis: 'throttle', dir: -1, key: 'KeyS' },
    { id: 'burner', label: 'Burner', group: 'Power', axis: 'burner', dir: 1, key: 'Space', hold: true },
    { id: 'vent', label: 'Vent', group: 'Power', axis: 'vent', dir: 1, key: 'KeyX', hold: true },
    { id: 'thrustFwd', label: 'Reaction thrust forward', group: 'Power', axis: 'liftZ', dir: 1, key: 'KeyE', hold: true },
    { id: 'thrustBack', label: 'Reaction thrust back', group: 'Power', axis: 'liftZ', dir: -1, key: 'KeyQ', hold: true },
    { id: 'brake', label: 'Wheel brake', group: 'Ground', axis: 'brake', dir: 1, key: 'KeyB', hold: true },
    { id: 'gear', label: 'Gear toggle', group: 'Ground', event: true, key: 'KeyG' },
    { id: 'flaps', label: 'Flaps step', group: 'Ground', event: true, key: 'KeyF' },
    { id: 'spoiler', label: 'Airbrake or spoiler', group: 'Ground', axis: 'spoiler', dir: 1, key: 'KeyH', hold: true },
    { id: 'engineCut', label: 'Engine cut and restart', group: 'Power', event: true, key: 'KeyO' },
    { id: 'tow', label: 'Call for tow, then release', group: 'Power', event: true, key: 'KeyT' },
    { id: 'camera', label: 'Cycle camera', group: 'View', event: true, key: 'KeyV' },
    { id: 'fullscreen', label: 'Fullscreen cockpit', group: 'View', event: true, key: 'Enter' },
    { id: 'lookSnap', label: 'Snap view forward', group: 'View', event: true, key: 'KeyN' },
    { id: 'lookUp', label: 'Look up', group: 'View', axis: 'lookY', dir: 1, key: 'KeyI', hold: true },
    { id: 'lookDown', label: 'Look down', group: 'View', axis: 'lookY', dir: -1, key: 'KeyK', hold: true },
    { id: 'lookLeft', label: 'Look left', group: 'View', axis: 'lookX', dir: -1, key: 'KeyJ', hold: true },
    { id: 'lookRight', label: 'Look right', group: 'View', axis: 'lookX', dir: 1, key: 'KeyL', hold: true },
    { id: 'hud', label: 'Toggle HUD', group: 'System', event: true, key: 'KeyU' },
    { id: 'pause', label: 'Pause', group: 'System', event: true, key: 'KeyP' },
    { id: 'mute', label: 'Mute audio', group: 'System', event: true, key: 'KeyM' },
    { id: 'reset', label: 'Reset to entry condition', group: 'System', event: true, key: 'KeyR' }
  ];

  IN.defaultBindings = function () {
    var b = {};
    IN.ACTIONS.forEach(function (a) { b[a.id] = { key: a.key, pad: null }; });
    // A conventional gamepad layout, all of it remappable.
    b.rollLeft.pad = { type: 'axis', index: 0, dir: -1 };
    b.rollRight.pad = { type: 'axis', index: 0, dir: 1 };
    b.pitchDown.pad = { type: 'axis', index: 1, dir: -1 };
    b.pitchUp.pad = { type: 'axis', index: 1, dir: 1 };
    b.yawLeft.pad = { type: 'axis', index: 2, dir: -1 };
    b.yawRight.pad = { type: 'axis', index: 2, dir: 1 };
    b.throttleUp.pad = { type: 'button', index: 7 };
    b.throttleDown.pad = { type: 'button', index: 6 };
    b.burner.pad = { type: 'button', index: 0 };
    b.camera.pad = { type: 'button', index: 3 };
    b.lookSnap.pad = { type: 'button', index: 10 };
    b.gear.pad = { type: 'button', index: 1 };
    b.flaps.pad = { type: 'button', index: 2 };
    b.lookLeft.pad = { type: 'axis', index: 2, dir: -1 };
    b.lookRight.pad = { type: 'axis', index: 2, dir: 1 };
    b.lookUp.pad = { type: 'axis', index: 3, dir: -1 };
    b.lookDown.pad = { type: 'axis', index: 3, dir: 1 };
    return b;
  };

  IN.bindings = IN.defaultBindings();
  IN.down = {};
  IN.events = [];
  IN.mouse = { active: false, dx: 0, dy: 0, stick: false, x: 0, y: 0, buttons: 0 };
  IN.padIndex = null;
  IN.capture = null;
  IN.enabled = true;
  IN.mouseLookEnabled = true;

  IN.axes = {
    pitch: 0, roll: 0, yaw: 0, throttle: 0, burner: 0, vent: 0,
    brake: 0, spoiler: 0, liftZ: 0, liftX: 0, liftY: 0, lookX: 0, lookY: 0
  };
  var raw = {};
  var mAccX = 0, mAccY = 0;   // mouse movement collected between frames

  function actionById(id) {
    for (var i = 0; i < IN.ACTIONS.length; i++) { if (IN.ACTIONS[i].id === id) { return IN.ACTIONS[i]; } }
    return null;
  }
  IN.actionById = actionById;

  IN.init = function (target) {
    if (typeof document === 'undefined') { return false; }
    IN.target = target || document.body;
    document.addEventListener('keydown', function (e) {
      if (IN.capture) {
        e.preventDefault();
        var cb = IN.capture; IN.capture = null;
        cb({ key: e.code });
        return;
      }
      if (!IN.enabled) { return; }
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) { return; }
      if (!IN.down[e.code]) { IN.fireEvents(e.code); }
      IN.down[e.code] = true;
      if (IN.usesKey(e.code)) { e.preventDefault(); }
    });
    document.addEventListener('keyup', function (e) { IN.down[e.code] = false; });
    window.addEventListener('blur', function () { IN.down = {}; });

    if (IN.target.addEventListener) {
      IN.target.addEventListener('mousedown', function (e) {
        IN.mouse.buttons = e.buttons;
        // The right button is head look. It is a hold, not a toggle.
        if (e.button === 2 && IN.mouseLookEnabled) { IN.mouse.stick = true; e.preventDefault(); }
        IN.mouse.active = true;
      });
      IN.target.addEventListener('mouseup', function (e) {
        IN.mouse.buttons = e.buttons;
        if (e.button === 2) { IN.mouse.stick = false; }
      });
      IN.target.addEventListener('mousemove', function (e) {
        var r = IN.target.getBoundingClientRect();
        IN.mouse.x = (e.clientX - r.left) / r.width * 2 - 1;
        IN.mouse.y = (e.clientY - r.top) / r.height * 2 - 1;
        mAccX += e.movementX || 0;
        mAccY += e.movementY || 0;
      });
      IN.target.addEventListener('mouseleave', function () {
        IN.mouse.active = false;
        IN.mouse.stick = false;
      });
      IN.target.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }
    window.addEventListener('gamepadconnected', function (e) { IN.padIndex = e.gamepad.index; });
    window.addEventListener('gamepaddisconnected', function () { IN.padIndex = null; });
    return true;
  };

  IN.usesKey = function (code) {
    for (var id in IN.bindings) {
      if (IN.bindings[id] && IN.bindings[id].key === code) { return true; }
    }
    return false;
  };

  IN.fireEvents = function (code) {
    IN.ACTIONS.forEach(function (a) {
      if (!a.event) { return; }
      var b = IN.bindings[a.id];
      if (b && b.key === code) { IN.events.push(a.id); }
    });
  };

  IN.takeEvents = function () {
    var e = IN.events;
    IN.events = [];
    return e;
  };

  IN.pad = function () {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) { return null; }
    var pads = navigator.getGamepads();
    for (var i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) { return pads[i]; }
    }
    return null;
  };

  var prevPadButtons = {};

  IN.update = function (dt) {
    var a, i, key;
    for (key in IN.axes) { raw[key] = 0; }

    var pad = IN.pad();
    for (i = 0; i < IN.ACTIONS.length; i++) {
      a = IN.ACTIONS[i];
      var b = IN.bindings[a.id];
      if (!b) { continue; }
      var v = 0;
      if (b.key && IN.down[b.key]) { v = 1; }
      if (pad && b.pad) {
        if (b.pad.type === 'axis') {
          var av = pad.axes[b.pad.index] || 0;
          if (Math.abs(av) > 0.12) {
            var signed = av * (b.pad.dir || 1);
            if (signed > 0) { v = Math.max(v, Math.min(1, signed)); }
          }
        } else if (b.pad.type === 'button') {
          var btn = pad.buttons[b.pad.index];
          var pressed = btn && (btn.pressed || btn.value > 0.4);
          if (pressed) { v = Math.max(v, btn.value || 1); }
          if (a.event) {
            var wasDown = prevPadButtons[a.id];
            if (pressed && !wasDown) { IN.events.push(a.id); }
            prevPadButtons[a.id] = pressed;
          }
        }
      }
      if (a.axis && v > 0) { raw[a.axis] += v * (a.dir || 1); }
    }

    // Mouse as a stick when the left button is held over the viewport.
    if (IN.mouse.active && (IN.mouse.buttons & 1)) {
      raw.roll += M.clamp(IN.mouse.x * 1.6, -1, 1);
      raw.pitch += M.clamp(-IN.mouse.y * 1.6, -1, 1);
    }
    // Right button looks around in the cockpit.
    if (IN.mouseLookEnabled && IN.mouse.active && (IN.mouse.buttons & 2)) {
      raw.lookX += M.clamp(IN.mouse.x * 2, -1, 1);
      raw.lookY += M.clamp(-IN.mouse.y * 2, -1, 1);
    }

    // Smooth the digital axes so keyboard flying is not a set of steps.
    var rate = 4.6, center = 3.4;
    ['pitch', 'roll', 'yaw', 'lookX', 'lookY'].forEach(function (k) {
      var target = M.clamp(raw[k], -1, 1);
      var r = (Math.abs(target) > 0.01) ? rate : center;
      IN.axes[k] = M.approach(IN.axes[k], target, r, dt);
    });
    // Throttle and collective integrate rather than snap.
    IN.axes.throttle = M.clamp(IN.axes.throttle + M.clamp(raw.throttle, -1, 1) * dt * 0.55, 0, 1);
    ['burner', 'vent', 'brake', 'spoiler'].forEach(function (k) {
      IN.axes[k] = M.clamp(raw[k], 0, 1);
    });
    IN.mouse.dx = mAccX; mAccX = 0;
    IN.mouse.dy = mAccY; mAccY = 0;
    IN.axes.liftZ = M.clamp(raw.liftZ, -1, 1);
    IN.axes.liftX = M.clamp(raw.liftX, -1, 1);
    IN.axes.liftY = M.clamp(raw.liftY, -1, 1);
    return IN.axes;
  };

  IN.setThrottle = function (v) { IN.axes.throttle = M.clamp(v, 0, 1); };

  IN.bind = function (actionId, binding) {
    if (!IN.bindings[actionId]) { IN.bindings[actionId] = { key: null, pad: null }; }
    if (binding.key !== undefined) { IN.bindings[actionId].key = binding.key; }
    if (binding.pad !== undefined) { IN.bindings[actionId].pad = binding.pad; }
    return IN.bindings[actionId];
  };

  IN.resetBindings = function () { IN.bindings = IN.defaultBindings(); };

  IN.describeBinding = function (actionId) {
    var b = IN.bindings[actionId];
    if (!b) { return 'unbound'; }
    var parts = [];
    if (b.key) { parts.push(IN.keyLabel(b.key)); }
    if (b.pad) { parts.push(b.pad.type === 'axis' ? ('pad axis ' + b.pad.index + (b.pad.dir < 0 ? ' -' : ' +')) : ('pad button ' + b.pad.index)); }
    return parts.length ? parts.join(' / ') : 'unbound';
  };

  IN.keyLabel = function (code) {
    if (!code) { return 'unbound'; }
    return code
      .replace(/^Key/, '')
      .replace(/^Digit/, '')
      .replace(/^Arrow/, '')
      .replace(/^Numpad/, 'num ');
  };

  IN.captureNext = function (cb) { IN.capture = cb; };

  IN.exportMap = function () { return AERO.util.deepCopy(IN.bindings); };

  IN.importMap = function (map) {
    if (!map || typeof map !== 'object') { return false; }
    var fresh = IN.defaultBindings();
    Object.keys(fresh).forEach(function (id) {
      var m = map[id];
      if (!m) { return; }
      if (typeof m.key === 'string' || m.key === null) { fresh[id].key = m.key; }
      if (m.pad && typeof m.pad === 'object' && m.pad.type === 'axis') {
        fresh[id].pad = { type: 'axis', index: m.pad.index | 0, dir: m.pad.dir === -1 ? -1 : 1 };
      } else if (m.pad && typeof m.pad === 'object' && m.pad.type === 'button') {
        fresh[id].pad = { type: 'button', index: m.pad.index | 0 };
      } else { fresh[id].pad = null; }
    });
    IN.bindings = fresh;
    return true;
  };

})(typeof window !== 'undefined' ? window : globalThis);
