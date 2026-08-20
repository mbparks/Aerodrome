// AERODROME :: src/14-ui.js :: v1.4.1
// The HTML chrome around the viewport. Real elements, keyboard operable, no
// innerHTML anywhere so imported data can never become markup.
// Depends on 00-core.js through 13-tests.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math, AC = AERO.aircraft, IN = AERO.input, S = AERO.storage, X = AERO.weather;

  var U = AERO.ui = {};
  var app = null;
  var refs = {};

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') { e.textContent = attrs[k]; }
        else if (k === 'class') { e.className = attrs[k]; }
        else if (k.slice(0, 2) === 'on') { e.addEventListener(k.slice(2).toLowerCase(), attrs[k]); }
        else { e.setAttribute(k, attrs[k]); }
      });
    }
    (kids || []).forEach(function (c) { if (c) { e.appendChild(c); } });
    return e;
  }

  function drawer(title, open) {
    var body = el('div', { class: 'drawer-body' });
    var id = title.toLowerCase().replace(/[^a-z]+/g, '-');
    var d = el('details', { class: 'drawer' }, [el('summary', { text: title }), body]);
    d.setAttribute('data-drawer', id);
    var remembered = S.state.settings.openDrawers;
    var isOpen = remembered ? (remembered.indexOf(id) >= 0) : open;
    if (isOpen) { d.setAttribute('open', 'open'); }
    d.addEventListener('toggle', function () {
      var ids = [];
      var all = document.querySelectorAll('details[data-drawer]');
      for (var i = 0; i < all.length; i++) {
        if (all[i].open) { ids.push(all[i].getAttribute('data-drawer')); }
      }
      S.state.settings.openDrawers = ids;
      S.save();
    });
    document.getElementById('drawers').appendChild(d);
    return body;
  }

  function slider(parent, label, value, min, max, step, onInput, fmt) {
    var out = el('span', { class: 'value', text: fmt ? fmt(value) : String(value) });
    var id = 'sl-' + label.replace(/[^a-z0-9]/gi, '');
    var input = el('input', {
      type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), id: id,
      oninput: function (e) {
        var v = parseFloat(e.target.value);
        out.textContent = fmt ? fmt(v) : String(v);
        onInput(v);
      }
    });
    parent.appendChild(el('div', { class: 'row' }, [el('label', { text: label, for: id }), input, out]));
    return { input: input, out: out, set: function (v) { input.value = String(v); out.textContent = fmt ? fmt(v) : String(v); } };
  }

  function toggle(parent, label, value, onChange) {
    var id = 'tg-' + label.replace(/[^a-z0-9]/gi, '');
    var input = el('input', {
      type: 'checkbox', id: id,
      onchange: function (e) { onChange(e.target.checked); }
    });
    input.checked = !!value;
    parent.appendChild(el('div', { class: 'row' }, [el('label', { text: label, for: id }), input]));
    return input;
  }

  function picker(parent, label, options, value, onChange) {
    var id = 'pk-' + label.replace(/[^a-z0-9]/gi, '');
    var sel = el('select', { id: id, onchange: function (e) { onChange(e.target.value); } });
    options.forEach(function (o) {
      var opt = el('option', { value: o.value, text: o.label });
      sel.appendChild(opt);
    });
    sel.value = value;
    parent.appendChild(el('div', { class: 'row' }, [el('label', { text: label, for: id }), sel]));
    return sel;
  }

  function button(parent, label, onClick, pressed) {
    var b = el('button', { type: 'button', text: label, onclick: onClick });
    if (pressed !== undefined) { b.setAttribute('aria-pressed', pressed ? 'true' : 'false'); }
    parent.appendChild(b);
    return b;
  }

  // ------------------------------------------------------- key legend
  // The footer used to be a fixed list of keys, half of which did nothing on
  // the aircraft you were flying. It is built per aircraft now, and it reads
  // the live bindings, so rebinding a key changes the legend.
  U.legendFor = function (ac) {
    if (!ac) { return []; }
    var out = [];
    // The footer shows keys, not the full binding description. Pad bindings
    // live in the Controls drawer where there is room to read them.
    function keyOf(action) {
      var b = IN.bindings[action];
      return (b && b.key) ? IN.keyLabel(b.key) : 'unbound';
    }
    function add(action, label, pair) {
      var keys = keyOf(action);
      if (pair) {
        var second = keyOf(pair);
        if (second !== keys) { keys += ' ' + second; }
      }
      out.push({ action: action, actions: pair ? [action, pair] : [action], key: keys, label: label });
    }
    // The stick is four keys. If they are still the four arrows, say so.
    function addStick() {
      var stickKeys = ['pitchUp', 'pitchDown', 'rollLeft', 'rollRight'].map(function (a) {
        var b = IN.bindings[a];
        return b && b.key ? b.key : '';
      });
      var allArrows = stickKeys.every(function (k) { return k.indexOf('Arrow') === 0; });
      out.push({
        action: 'pitchUp', actions: ['pitchUp', 'pitchDown', 'rollLeft', 'rollRight'],
        key: allArrows ? 'Arrows' : (keyOf('pitchUp') + ' ' + keyOf('rollLeft')),
        label: 'stick'
      });
    }
    var hasGear = (ac.contacts || []).some(function (c) { return c.gear; });
    var hasBrake = (ac.contacts || []).some(function (c) { return c.brake; });

    if (ac.buoyancy && !ac.wing) {
      add('burner', 'burner');
      add('vent', 'vent');
      if (ac.buoyancy.vectored) { add('throttleUp', 'throttle', 'throttleDown'); }
    } else if (ac.rotor && ac.rotor.powered) {
      addStick();
      add('throttleUp', 'collective', 'throttleDown');
      add('yawLeft', 'pedals', 'yawRight');
    } else if (ac.reaction) {
      addStick();
      add('throttleUp', 'lift', 'throttleDown');
      add('thrustFwd', 'thrust', 'thrustBack');
    } else {
      addStick();
      if (ac.propulsion) { add('throttleUp', 'throttle', 'throttleDown'); }
      add('yawLeft', 'rudder', 'yawRight');
    }
    if (ac.towable) { add('tow', 'tow'); }
    if (ac.propulsion || (ac.rotor && ac.rotor.powered)) { add('engineCut', 'engine'); }
    if (hasGear) { add('gear', 'gear'); }
    if (ac.wing && ac.wing.flapCl) { add('flaps', 'flaps'); }
    if (ac.wing && ac.wing.spoilerCd) { add('spoiler', 'airbrake'); }
    if (hasBrake) { add('brake', 'brake'); }
    add('camera', 'camera');
    add('reset', 'reset');
    add('pause', 'pause');
    return out;
  };

  // Capability tags on the roster. Wing and power are on almost everything, so
  // only the things that make an airframe unusual earn a tag.
  U.tagsFor = function (ac) {
    var tags = [];
    if (ac.buoyancy) { tags.push('BUOYANT'); }
    if (ac.rotor) { tags.push(ac.rotor.powered ? 'ROTOR' : 'AUTOROTATES'); }
    if (ac.reaction) { tags.push('REACTION'); }
    if (ac.flapping) { tags.push('FLAPPING'); }
    if (ac.towable) { tags.push('NEEDS A TOW'); }
    if (!tags.length && !ac.propulsion) { tags.push('UNPOWERED'); }
    return tags;
  };

  // Tuning is grouped rather than presented as one long undifferentiated
  // column of sliders.
  U.TUNE_GROUPS = [
    { id: 'mass', label: 'Mass and inertia', match: ['massKg', 'inertia.', 'fuelKg'] },
    { id: 'wing', label: 'Wing', match: ['wing.'] },
    { id: 'power', label: 'Power', match: ['propulsion.', 'buoyancy.', 'rotor.', 'reaction.', 'flapping.'] },
    { id: 'control', label: 'Control and stability', match: ['control.'] },
    { id: 'gear', label: 'Ground and limits', match: ['contacts', 'crashVs', 'hullClear', 'limits.'] },
    { id: 'view', label: 'Camera defaults', match: ['chase.', 'eye'] }
  ];

  U.groupFor = function (path) {
    for (var i = 0; i < U.TUNE_GROUPS.length; i++) {
      var g = U.TUNE_GROUPS[i];
      for (var j = 0; j < g.match.length; j++) {
        if (path.indexOf(g.match[j]) === 0) { return g.id; }
      }
    }
    return 'other';
  };

  // A single line of orientation on a first launch, dismissed for good once
  // it has been read. It is not a tour and it does not come back.
  U.showFirstRun = function () {
    var gate = document.getElementById('gate');
    if (!gate) { return; }
    var box = el('p', { class: 'hint firstrun' });
    box.appendChild(document.createTextNode('New here? Click the viewport, hold '));
    box.appendChild(el('kbd', { text: IN.describeBinding('throttleUp') }));
    box.appendChild(document.createTextNode(' for power, ease back with '));
    box.appendChild(el('kbd', { text: IN.describeBinding('pitchUp') }));
    box.appendChild(document.createTextNode(' around 27 m/s, and press '));
    box.appendChild(el('kbd', { text: IN.describeBinding('camera') }));
    box.appendChild(document.createTextNode(' to look at yourself from outside. '));
    box.appendChild(el('button', {
      type: 'button', class: 'tiny', text: 'Got it',
      onclick: function () { box.parentNode.removeChild(box); }
    }));
    gate.appendChild(box);
  };

  U.setStatus = function (text, kind) {
    var s = document.getElementById('status');
    if (!s) { return; }
    s.textContent = text;
    s.setAttribute('data-kind', kind || 'ok');
    clearTimeout(U._statusTimer);
    U._statusTimer = setTimeout(function () { s.textContent = ''; }, 6000);
  };

  // ------------------------------------------------------------------ roster
  function buildRoster() {
    var list = document.getElementById('roster');
    while (list.firstChild) { list.removeChild(list.firstChild); }
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'Aircraft');
    AC.list().forEach(function (ac) {
      var selected = app.aircraftId === ac.id;
      var capRow = el('span', { class: 'caps' }, U.tagsFor(ac).map(function (c) {
        return el('span', { class: 'cap', text: c });
      }));
      var b = el('button', {
        type: 'button',
        role: 'radio',
        'aria-checked': selected ? 'true' : 'false',
        'aria-pressed': selected ? 'true' : 'false',
        tabindex: selected ? '0' : '-1',
        onclick: function () { app.selectAircraft(ac.id); },
        onkeydown: rosterKey
      }, [
        el('span', { class: 'name', text: ac.name }),
        el('span', { class: 'kind', text: ac.kind }),
        capRow
      ]);
      b.setAttribute('data-ac', ac.id);
      list.appendChild(el('li', { class: 'tag' }, [b]));
    });
    refs.roster = list;
  }

  // Arrow keys walk the roster, which is what a radio group is supposed to do.
  function rosterKey(e) {
    var keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
    if (keys.indexOf(e.key) < 0) { return; }
    e.preventDefault();
    var buttons = refs.roster.querySelectorAll('button[data-ac]');
    var i = 0;
    for (var k = 0; k < buttons.length; k++) { if (buttons[k] === e.target) { i = k; } }
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { i = (i + 1) % buttons.length; }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { i = (i - 1 + buttons.length) % buttons.length; }
    else if (e.key === 'Home') { i = 0; }
    else { i = buttons.length - 1; }
    buttons[i].focus();
    app.selectAircraft(buttons[i].getAttribute('data-ac'));
  }

  U.markRoster = function (id) {
    if (!refs.roster) { return; }
    var buttons = refs.roster.querySelectorAll('button[data-ac]');
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].getAttribute('data-ac') === id;
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      buttons[i].setAttribute('aria-checked', on ? 'true' : 'false');
      buttons[i].setAttribute('tabindex', on ? '0' : '-1');
    }
  };

  // ---------------------------------------------------------------- quickbar
  function buildQuickbar() {
    var q = document.getElementById('quickbar');
    while (q.firstChild) { q.removeChild(q.firstChild); }
    refs.camBtn = button(q, 'Camera: cockpit', function () { app.cycleCamera(); });
    refs.startBtn = button(q, 'Start on the runway', function () { app.respawn('runway'); });
    button(q, 'Start airborne', function () { app.respawn('air'); });
    // Contextual controls. They exist only for the aircraft that has them,
    // rather than sitting greyed out on everything else.
    refs.towBtn = button(q, 'Call for tow', function () { app.toggleTow(); });
    refs.engineBtn = button(q, 'Cut engine', function () { app.toggleEngine(); });
    refs.pauseBtn = button(q, 'Pause', function () { app.togglePause(); }, false);
    refs.muteBtn = button(q, 'Mute', function () { app.toggleMute(); }, S.state.settings.muted);
    U.markContextual();
  }

  // Show or hide the aircraft specific buttons and keep their labels honest.
  U.markContextual = function () {
    if (!app.state) { return; }
    var ac = app.state.ac;
    if (refs.towBtn) {
      refs.towBtn.hidden = !ac.towable;
      refs.towBtn.textContent = app.tow.active ? 'Release tow' : 'Call for tow';
    }
    if (refs.engineBtn) {
      var powered = !!(ac.propulsion || (ac.rotor && ac.rotor.powered));
      refs.engineBtn.hidden = !powered;
      var stateName = app.state.engineState;
      refs.engineBtn.textContent = stateName === 'running' ? 'Cut engine'
        : (stateName === 'starting' ? 'Cranking...' : 'Start engine');
      refs.engineBtn.disabled = stateName === 'starting';
    }
    if (refs.startBtn) {
      refs.startBtn.hidden = !ac.contacts;
    }
  };

  // The key legend under the viewport, rebuilt per aircraft and after any
  // rebinding, so it never advertises a key that does nothing.
  U.buildLegend = function () {
    var host = document.getElementById('legend');
    if (!host || !app.state) { return; }
    while (host.firstChild) { host.removeChild(host.firstChild); }
    U.legendFor(app.state.ac).forEach(function (item) {
      var span = el('span', {}, [el('kbd', { text: item.key })]);
      span.appendChild(document.createTextNode(' ' + item.label));
      host.appendChild(span);
    });
  };

  U.markCamera = function (mode) {
    if (refs.camBtn) { refs.camBtn.textContent = 'Camera: ' + mode; }
  };
  U.markPause = function (p) {
    if (refs.pauseBtn) {
      refs.pauseBtn.setAttribute('aria-pressed', p ? 'true' : 'false');
      refs.pauseBtn.textContent = p ? 'Resume' : 'Pause';
    }
  };
  U.markMute = function (m) {
    if (refs.muteBtn) {
      refs.muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
      refs.muteBtn.textContent = m ? 'Unmute' : 'Mute';
    }
  };

  // ------------------------------------------------------------------- view
  function buildView() {
    var b = drawer('View and display', true);
    var s = S.state.settings;
    b.appendChild(el('p', { class: 'hint', text: 'The viewport is a 320 by 224 framebuffer scaled by whole numbers with no smoothing. Everything inside it lives in 64 colors drawn from a 512 color space.' }));
    picker(b, 'Camera', [
      { value: 'cockpit', label: 'Cockpit' },
      { value: 'chase', label: 'Trailing chase' },
      { value: 'tower', label: 'Tower and flyby' }
    ], s.cameraMode, function (v) { app.setCamera(v); });
    picker(b, 'Internal resolution', [
      { value: '224', label: '320 x 224' },
      { value: '240', label: '320 x 240' }
    ], String(s.resolution), function (v) { app.setResolution(parseInt(v, 10)); });
    picker(b, 'Chrome theme', [
      { value: 'night', label: 'Night' },
      { value: 'day', label: 'Day' },
      { value: 'contrast', label: 'High contrast' }
    ], s.theme, function (v) { app.setTheme(v); });
    toggle(b, 'Chase HUD', s.hud, function (v) { app.setHud(v); });
    toggle(b, 'Sprite flicker over budget', s.spriteFlicker, function (v) {
      s.spriteFlicker = v; AERO.raster.flickerEnabled = v; S.save();
    });
    toggle(b, 'Reduced motion', s.reducedMotion, function (v) { app.setReducedMotion(v); });
    slider(b, 'Cockpit field of view', app.rig.fovCockpit, 40, 100, 1, function (v) { app.rig.fovCockpit = v; }, function (v) { return v + ' deg'; });
    slider(b, 'Chase field of view', app.rig.fovChase, 30, 95, 1, function (v) { app.rig.fovChase = v; }, function (v) { return v + ' deg'; });

    b.appendChild(el('h3', { class: 'placard', text: 'Chase camera' }));
    b.appendChild(el('p', { class: 'hint', text: 'The chase camera is a spring and damper chasing a point behind the aircraft, so it sags under acceleration and swings wide in a hard turn. Each aircraft ships its own defaults.' }));
    var cs = app.rig.settings;
    refs.chaseSliders = [
      slider(b, 'Distance', cs.dist, 1, 120, 0.5, function (v) { cs.dist = v; app.persistCamera(); }, function (v) { return v.toFixed(1) + ' m'; }),
      slider(b, 'Height', cs.up, -6, 40, 0.2, function (v) { cs.up = v; app.persistCamera(); }, function (v) { return v.toFixed(1) + ' m'; }),
      slider(b, 'Spring rate', cs.lag, 0.4, 12, 0.1, function (v) { cs.lag = v; app.persistCamera(); }, function (v) { return v.toFixed(1); }),
      slider(b, 'Lead', cs.lead, 0, 3, 0.05, function (v) { cs.lead = v; app.persistCamera(); }, function (v) { return v.toFixed(2); }),
      slider(b, 'Damping', cs.damping, 0.2, 4, 0.05, function (v) { cs.damping = v; app.persistCamera(); }, function (v) { return v.toFixed(2); }),
      slider(b, 'Bank follow', cs.bankMix, 0, 1, 0.05, function (v) { cs.bankMix = v; app.persistCamera(); }, function (v) { return v.toFixed(2); })
    ];
    var siteRow = el('div', { class: 'row' });
    button(siteRow, 'Next tower camera site', function () {
      var v = AERO.camera.nextView(app.rig);
      app.setCamera('tower');
      U.setStatus(v ? ('Camera site ' + v.name) : 'No camera sites in this world');
    });
    b.appendChild(siteRow);

    var row = el('div', { class: 'row' });
    button(row, 'Use this aircraft defaults', function () {
      AERO.camera.applyAircraftDefaults(app.rig, app.state.ac);
      U.syncChaseSliders();
      app.persistCamera();
      U.setStatus('Chase camera reset to the aircraft defaults');
    });
    b.appendChild(row);
  }

  U.syncChaseSliders = function () {
    if (!refs.chaseSliders) { return; }
    var cs = app.rig.settings;
    var vals = [cs.dist, cs.up, cs.lag, cs.lead, cs.damping, cs.bankMix];
    refs.chaseSliders.forEach(function (s, i) { s.set(vals[i]); });
  };

  // ---------------------------------------------------------------- weather
  function buildWeather() {
    var b = drawer('Weather and time');
    var w = X.state;
    b.appendChild(el('p', { class: 'hint', text: 'Ridge lift builds on the upwind slope west of the field. Thermals form over the town and the open ground and follow the sun. The balloon and the sailplane depend on both.' }));
    refs.windReadout = el('p', { class: 'hint', text: '' });
    b.appendChild(refs.windReadout);
    toggle(b, 'Weather enabled', w.enabled, function (v) { w.enabled = v; app.persistWeather(); });
    refs.hourSlider = slider(b, 'Hour of day', w.hour, 0, 24, 0.25, function (v) { w.hour = v; app.persistWeather(); }, function (v) {
      var h = Math.floor(v), m = Math.round((v - h) * 60);
      return AERO.util.pad(h, 2) + ':' + AERO.util.pad(m, 2);
    });
    slider(b, 'Day speed', w.hourRate, 0, 1, 0.01, function (v) { w.hourRate = v; app.persistWeather(); }, function (v) { return v === 0 ? 'frozen' : (24 / v).toFixed(0) + ' s per day'; });
    slider(b, 'Wind from', w.meanDirDeg, 0, 360, 1, function (v) { w.meanDirDeg = v; app.persistWeather(); }, function (v) { return AERO.util.pad(v, 3) + ' deg'; });
    slider(b, 'Wind speed', w.meanSpeed, 0, 25, 0.5, function (v) { w.meanSpeed = v; app.persistWeather(); }, function (v) { return v.toFixed(1) + ' m/s'; });
    slider(b, 'Gustiness', w.gustiness, 0, 1.5, 0.05, function (v) { w.gustiness = v; app.persistWeather(); }, function (v) { return v.toFixed(2); });
    slider(b, 'Turbulence', w.turbulence, 0, 2, 0.05, function (v) { w.turbulence = v; app.persistWeather(); }, function (v) { return v.toFixed(2); });
    slider(b, 'Thermal strength', w.thermalStrength, 0, 2, 0.05, function (v) { w.thermalStrength = v; app.persistWeather(); }, function (v) { return v.toFixed(2); });
    slider(b, 'Ridge strength', w.ridgeStrength, 0, 2, 0.05, function (v) { w.ridgeStrength = v; app.persistWeather(); }, function (v) { return v.toFixed(2); });
  }

  U.tickReadouts = function () {
    if (refs.windReadout) {
      var d = X.describe();
      refs.windReadout.textContent = 'Wind now ' + d.label + ', local time '
        + AERO.util.pad(Math.floor(d.hour), 2) + ':' + AERO.util.pad((d.hour % 1) * 60, 2);
    }
    if (refs.hourSlider) { refs.hourSlider.set(Math.round(X.state.hour * 4) / 4); }
  };

  // ----------------------------------------------------------------- tuning
  function buildTuning() {
    var b = drawer('Aircraft tuning');
    b.appendChild(el('p', { class: 'hint', text: 'Aircraft are data, not code. Edit any value here, fly it, then save it as your own airframe or put it back to stock.' }));
    refs.tuneHost = el('div', {});
    b.appendChild(refs.tuneHost);

    var nameInput = el('input', { type: 'text', id: 'userName', value: 'MY AIRFRAME' });
    var row = el('div', { class: 'row' }, [el('label', { text: 'Save as', for: 'userName' }), nameInput]);
    b.appendChild(row);
    var actions = el('div', { class: 'row' });
    button(actions, 'Save this tuning', function () {
      var values = {};
      AC.TUNABLE.forEach(function (t) {
        var v = AC.getPath(app.state.ac, t.path);
        if (typeof v === 'number') { values[t.path] = v; }
      });
      S.saveUserAircraft(app.aircraftId, nameInput.value, values);
      U.buildUserList();
      U.setStatus('Saved as a user airframe');
    });
    button(actions, 'Reset this aircraft to stock', function () {
      AC.resetToStock(app.aircraftId);
      S.clearTuning(app.aircraftId);
      U.buildTuneRows();
      app.respawn('keep');
      U.setStatus('Stock values restored');
    });
    b.appendChild(actions);

    b.appendChild(el('h3', { class: 'placard', text: 'Your airframes' }));
    b.appendChild(el('p', { class: 'hint', text: 'Archived and deleted airframes stay in the file. Nothing here is removed for good.' }));
    refs.userList = el('div', {});
    b.appendChild(refs.userList);
    U.buildTuneRows();
    U.buildUserList();
  }

  U.buildTuneRows = function () {
    if (!refs.tuneHost) { return; }
    while (refs.tuneHost.firstChild) { refs.tuneHost.removeChild(refs.tuneHost.firstChild); }
    var ac = app.state.ac;
    var stock = AC.stockValues ? AC.stockValues(app.aircraftId) : null;
    refs.tuneHost.appendChild(el('h3', { class: 'placard', text: ac.name }));

    // One section per group, and only the groups this aircraft actually has.
    U.TUNE_GROUPS.concat([{ id: 'other', label: 'Other', match: [] }]).forEach(function (group) {
      var rows = AC.TUNABLE.filter(function (t) {
        return U.groupFor(t.path) === group.id && typeof AC.getPath(ac, t.path) === 'number';
      });
      if (!rows.length) { return; }
      var body = el('div', { class: 'drawer-body' });
      var section = el('details', { class: 'drawer sub' },
        [el('summary', { text: group.label }), body]);
      rows.forEach(function (t) { tuneRow(body, ac, t, stock); });
      refs.tuneHost.appendChild(section);
    });
  };

  function tuneRow(host, ac, t, stock) {
    var v = AC.getPath(ac, t.path);
    var stockV = (stock && typeof stock[t.path] === 'number') ? stock[t.path] : undefined;
    var mark = el('span', { class: 'mark', text: '' });
    var fmt = function (x) { return (Math.abs(x) < 10 ? x.toFixed(3) : x.toFixed(1)); };
    var ctl = slider(host, t.label, v, t.min, t.max, t.step, function (nv) {
      AC.setPath(ac, t.path, nv);
      S.recordTuning(app.aircraftId, t.path, nv);
      S.save();
      mark.textContent = (stockV !== undefined && Math.abs(nv - stockV) > 1e-9) ? 'changed' : '';
      if (t.path.indexOf('chase.') === 0) {
        AERO.camera.applyAircraftDefaults(app.rig, ac);
        U.syncChaseSliders();
      }
    }, fmt);
    mark.textContent = (stockV !== undefined && Math.abs(v - stockV) > 1e-9) ? 'changed' : '';
    var row = ctl.input.parentNode;
    row.appendChild(mark);
    if (stockV !== undefined) {
      row.appendChild(el('button', {
        type: 'button', class: 'tiny', text: 'stock', title: 'Back to ' + fmt(stockV),
        onclick: function () {
          AC.setPath(ac, t.path, stockV);
          ctl.set(stockV);
          mark.textContent = '';
          if (S.state.tuning[app.aircraftId]) { delete S.state.tuning[app.aircraftId][t.path]; }
          S.save();
        }
      }));
    }
  }

  U.buildUserList = function () {
    if (!refs.userList) { return; }
    while (refs.userList.firstChild) { refs.userList.removeChild(refs.userList.firstChild); }
    var list = S.state.userAircraft;
    if (!list.length) {
      refs.userList.appendChild(el('p', { class: 'hint', text: 'No saved airframes yet.' }));
      return;
    }
    var table = el('table', { class: 'map' });
    var head = el('tr', {}, [
      el('th', { text: 'Name' }), el('th', { text: 'Based on' }), el('th', { text: 'State' }), el('th', { text: 'Actions' })
    ]);
    table.appendChild(head);
    list.forEach(function (u) {
      var actions = el('td', {});
      button(actions, 'Load', function () { app.loadUserAircraft(u.id); });
      if (u.deletedAt) {
        button(actions, 'Restore', function () { S.restoreUserAircraft(u.id); U.buildUserList(); });
      } else {
        button(actions, u.archived ? 'Unarchive' : 'Archive', function () {
          S.archiveUserAircraft(u.id, !u.archived); U.buildUserList();
        });
        button(actions, 'Delete', function () { S.softDeleteUserAircraft(u.id); U.buildUserList(); });
      }
      table.appendChild(el('tr', {}, [
        el('td', { text: u.name }),
        el('td', { text: u.base }),
        el('td', { text: u.deletedAt ? 'deleted' : (u.archived ? 'archived' : 'active') }),
        actions
      ]));
    });
    refs.userList.appendChild(table);
  };

  // --------------------------------------------------------------- controls
  function buildControls() {
    var b = drawer('Controls');
    b.appendChild(el('p', { class: 'hint', text: 'Every action is remappable. Press Rebind, then press the key you want. The map is saved locally and travels with the export file.' }));
    toggle(b, 'Mouse look with the right button', IN.mouseLookEnabled, function (v) { IN.mouseLookEnabled = v; });
    refs.mapHost = el('div', {});
    b.appendChild(refs.mapHost);
    var row = el('div', { class: 'row' });
    button(row, 'Reset all bindings', function () {
      IN.resetBindings();
      S.state.bindings = IN.exportMap();
      S.save();
      U.buildBindingTable();
      U.buildLegend();
      U.setStatus('Bindings reset');
    });
    b.appendChild(row);
    U.buildBindingTable();
  }

  U.buildBindingTable = function () {
    if (!refs.mapHost) { return; }
    while (refs.mapHost.firstChild) { refs.mapHost.removeChild(refs.mapHost.firstChild); }
    var groups = {};
    IN.ACTIONS.forEach(function (a) { (groups[a.group] = groups[a.group] || []).push(a); });
    Object.keys(groups).forEach(function (g) {
      refs.mapHost.appendChild(el('h3', { class: 'placard', text: g }));
      var table = el('table', { class: 'map' });
      table.appendChild(el('tr', {}, [
        el('th', { text: 'Action' }), el('th', { text: 'Bound to' }), el('th', { text: '' })
      ]));
      groups[g].forEach(function (a) {
        var cell = el('td', { text: IN.describeBinding(a.id) });
        var actions = el('td', {});
        button(actions, 'Rebind', function (e) {
          var btn = e.target;
          btn.textContent = 'Press a key';
          IN.captureNext(function (res) {
            IN.bind(a.id, { key: res.key });
            S.state.bindings = IN.exportMap();
            S.save();
            cell.textContent = IN.describeBinding(a.id);
            btn.textContent = 'Rebind';
            U.buildLegend();
          });
        });
        table.appendChild(el('tr', {}, [el('td', { text: a.label }), cell, actions]));
      });
      refs.mapHost.appendChild(table);
    });
  };

  // ------------------------------------------------------------------- data
  function buildData() {
    var b = drawer('Data');
    b.appendChild(el('p', { class: 'hint', text: 'Everything this build stores lives on this machine. The export is one JSON file with a schema version: settings, bindings, tunings, saved airframes and the flight log.' }));
    var row = el('div', { class: 'row' });
    button(row, 'Export settings file', function () {
      var text = S.exportText();
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'aerodrome-state.json' });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      U.setStatus('Exported aerodrome-state.json');
    });
    var file = el('input', {
      type: 'file', accept: 'application/json,.json',
      onchange: function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) { return; }
        var reader = new FileReader();
        reader.onload = function () {
          var res = S.importText(String(reader.result));
          if (!res.ok) { U.setStatus('Import refused: ' + res.reason, 'warn'); return; }
          app.applySettings();
          U.setStatus('Settings imported');
        };
        reader.onerror = function () { U.setStatus('That file could not be read', 'warn'); };
        reader.readAsText(f);
        e.target.value = '';
      }
    });
    row.appendChild(file);
    b.appendChild(row);
    var row2 = el('div', { class: 'row' });
    button(row2, 'Clear all local data', function () {
      if (S.available) {
        try { localStorage.removeItem(S.KEY); } catch (e) { /* nothing to clear */ }
      }
      S.state = S.defaults();
      app.applySettings();
      U.setStatus('Local data cleared, defaults restored');
    });
    b.appendChild(row2);
    b.appendChild(el('h3', { class: 'placard', text: 'World' }));
    refs.worldName = el('p', { class: 'hint', text: '' });
    b.appendChild(refs.worldName);
    b.appendChild(el('p', { class: 'hint', text: 'The valley is a data file, not code. Export it, edit it in any text editor, load it back. Unknown structure types are dropped and out of range numbers are clamped rather than trusted.' }));
    var wrow = el('div', { class: 'row' });
    button(wrow, 'Export world file', function () {
      var blob = new Blob([AERO.world.exportWorld()], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a', { href: url, download: 'aerodrome-world.json' });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      U.setStatus('Exported aerodrome-world.json');
    });
    var wfile = el('input', {
      type: 'file', accept: 'application/json,.json',
      onchange: function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) { return; }
        var reader = new FileReader();
        reader.onload = function () {
          var parsed;
          try { parsed = JSON.parse(String(reader.result)); }
          catch (err) { U.setStatus('That world file is not valid JSON', 'warn'); return; }
          app.loadWorldFile(parsed);
        };
        reader.onerror = function () { U.setStatus('That file could not be read', 'warn'); };
        reader.readAsText(f);
        e.target.value = '';
      }
    });
    wrow.appendChild(wfile);
    b.appendChild(wrow);
    var wrow2 = el('div', { class: 'row' });
    button(wrow2, 'Back to the stock valley', function () { app.resetWorldFile(); });
    b.appendChild(wrow2);

    b.appendChild(el('h3', { class: 'placard', text: 'Flight log' }));
    refs.logHost = el('pre', { class: 'log', text: '' });
    b.appendChild(refs.logHost);
    U.buildLog();
  }

  U.markWorld = function () {
    if (!refs.worldName) { return; }
    refs.worldName.textContent = 'Loaded world: ' + AERO.world.params.name
      + ', ' + AERO.world.params.structures.length + ' structures, '
      + AERO.world.params.views.length + ' camera sites.';
  };

  U.buildLog = function () {
    if (!refs.logHost) { return; }
    var logs = S.state.logs.slice(-24).reverse();
    if (!logs.length) { refs.logHost.textContent = 'No flights logged yet.'; return; }
    refs.logHost.textContent = logs.map(function (l) {
      return l.at.slice(0, 19).replace('T', ' ') + '  ' + l.aircraft
        + '  ' + Math.round(l.seconds) + ' s'
        + '  max alt ' + Math.round(l.maxAltM) + ' m'
        + '  max speed ' + l.maxSpeedMps.toFixed(1) + ' m/s'
        + '  landings ' + l.landings + '  crashes ' + l.crashes;
    }).join('\n');
  };

  // ------------------------------------------------------------ diagnostics
  function buildDiagnostics() {
    var b = drawer('Diagnostics');
    var s = S.state.settings;
    b.appendChild(el('p', { class: 'hint', text: 'Debug drawing is a switch in here, not a flag in the source.' }));
    toggle(b, 'Debug overlay', s.debug, function (v) { s.debug = v; S.save(); });
    toggle(b, 'Wireframe', s.wireframe, function (v) { s.wireframe = v; AERO.render.wireframe = v; S.save(); });
    toggle(b, 'Force vectors', s.showForces, function (v) { s.showForces = v; S.save(); });
    var row = el('div', { class: 'row' });
    button(row, 'Run self test', function () { U.runTests(); });
    b.appendChild(row);
    refs.testHost = el('pre', { class: 'log', text: 'Self test has not run in this session.' });
    b.appendChild(refs.testHost);
  }

  U.runTests = function () {
    if (!refs.testHost) { return; }
    refs.testHost.textContent = 'Running...';
    setTimeout(function () {
      var wasPaused = app.paused;
      app.paused = true;
      var r;
      try { r = AERO.tests.runAll(); } finally { app.paused = wasPaused; app.applySettings(); }
      while (refs.testHost.firstChild) { refs.testHost.removeChild(refs.testHost.firstChild); }
      refs.testHost.appendChild(el('div', {
        class: r.failed ? 'fail' : 'pass',
        text: r.summary + (r.failed ? ' with ' + r.failed + ' failing' : ', all green')
      }));
      r.results.forEach(function (x) {
        refs.testHost.appendChild(el('div', {
          class: x.pass ? 'pass' : 'fail',
          text: (x.pass ? 'pass  ' : 'FAIL  ') + x.name + (x.detail ? '  [' + x.detail + ']' : '')
        }));
      });
      U.setStatus(r.summary, r.failed ? 'warn' : 'ok');
    }, 20);
  };

  // ------------------------------------------------------------------ about
  function buildAbout() {
    var b = drawer('About');
    b.appendChild(el('h3', { class: 'placard', text: 'AERODROME' }));
    var v = el('p', {});
    v.appendChild(document.createTextNode('Version ' + AERO.VERSION + ', build ' + AERO.BUILD + ', save schema ' + AERO.SCHEMA_VERSION + '.'));
    b.appendChild(v);
    b.appendChild(el('p', { text: 'A browser flight simulator rendered as if it were running on a Sega Genesis. Software rasterizer, 320 by 224, 64 colors on screen from a 512 color space, flat shaded convex polygons, ordered dithering, FM audio synthesized in the browser.' }));
    b.appendChild(el('p', { text: 'License: GPL-3.0' }));
    b.appendChild(el('p', { text: 'Vendored libraries: none. No frameworks, no bundler, no network calls at runtime. Art is procedural geometry and hand defined sprite cells, audio is WebAudio synthesis, the font is a 4 by 6 bitmap defined in src/02-raster.js. All assets are original to this project.' }));
    var feedback = el('p', {}, [
      document.createTextNode('Feedback and issues: '),
      el('a', { href: 'https://github.com/mbparks/aerodrome/issues', target: '_blank', rel: 'noreferrer noopener', text: 'project issue tracker' })
    ]);
    b.appendChild(feedback);
    b.appendChild(el('p', { class: 'hint', text: 'Known limitations for this revision are listed in the README that ships with the project tree.' }));
  }

  // ------------------------------------------------------------------- init
  U.init = function (application) {
    app = application;
    document.getElementById('versionStamp').textContent = 'v' + AERO.VERSION + ' build ' + AERO.BUILD;
    buildRoster();
    buildQuickbar();
    buildView();
    buildTuning();
    buildWeather();
    buildControls();
    buildData();
    buildDiagnostics();
    buildAbout();
    U.markWorld();
    U.buildLegend();
    return U;
  };

  U.refreshAircraft = function () {
    U.markRoster(app.aircraftId);
    U.buildTuneRows();
    U.syncChaseSliders();
    U.markContextual();
    U.buildLegend();
  };

})(typeof window !== 'undefined' ? window : globalThis);
