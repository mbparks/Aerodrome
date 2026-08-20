// AERODROME :: src/04-audio.js :: v1.3.0
// Four operator FM in the shape of a YM2612, plus a PSG style noise channel.
// Everything is synthesized. No samples, no network, no assets.
// Depends on 00-core.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var M = AERO.math;

  var A = AERO.audio = {};

  A.ready = false;
  A.muted = false;
  A.volume = 0.6;
  A.ctx = null;

  // Operator routing. Each entry lists modulator to carrier pairs and which
  // operators reach the output. Indices are zero based operators 1 through 4.
  A.ALGORITHMS = [
    { mods: [[0, 1], [1, 2], [2, 3]], carriers: [3] },              // 0 serial
    { mods: [[0, 2], [1, 2], [2, 3]], carriers: [3] },              // 1
    { mods: [[0, 3], [1, 2], [2, 3]], carriers: [3] },              // 2
    { mods: [[0, 1], [1, 3], [2, 3]], carriers: [3] },              // 3
    { mods: [[0, 1], [2, 3]], carriers: [1, 3] },                   // 4 two chains
    { mods: [[0, 1], [0, 2], [0, 3]], carriers: [1, 2, 3] },        // 5 one to three
    { mods: [[0, 1]], carriers: [1, 2, 3] },                        // 6
    { mods: [], carriers: [0, 1, 2, 3] }                            // 7 parallel
  ];

  // A patch is four operators with a frequency multiple, output level and
  // envelope, plus an algorithm and a feedback amount on operator 1.
  A.PATCHES = {
    piston: { alg: 2, fb: 0.6, wave: 'sawtooth', ops: [
      { mul: 1, lvl: 420, a: 0.02, d: 0.4, s: 0.9 },
      { mul: 2.01, lvl: 260, a: 0.02, d: 0.4, s: 0.7 },
      { mul: 0.5, lvl: 180, a: 0.03, d: 0.5, s: 0.8 },
      { mul: 1, lvl: 0.5, a: 0.02, d: 0.3, s: 1.0 }] },
    turbine: { alg: 5, fb: 0.2, wave: 'sine', ops: [
      { mul: 1, lvl: 900, a: 0.2, d: 0.6, s: 0.9 },
      { mul: 3.02, lvl: 0.28, a: 0.2, d: 0.6, s: 1.0 },
      { mul: 5.03, lvl: 0.2, a: 0.3, d: 0.6, s: 1.0 },
      { mul: 7.01, lvl: 0.12, a: 0.4, d: 0.6, s: 1.0 }] },
    rotor: { alg: 4, fb: 0.4, wave: 'square', ops: [
      { mul: 1, lvl: 300, a: 0.05, d: 0.4, s: 0.9 },
      { mul: 1.005, lvl: 0.5, a: 0.05, d: 0.4, s: 1.0 },
      { mul: 2, lvl: 200, a: 0.05, d: 0.4, s: 0.8 },
      { mul: 2.01, lvl: 0.3, a: 0.05, d: 0.4, s: 1.0 }] },
    hum: { alg: 7, fb: 0.0, wave: 'sine', ops: [
      { mul: 1, lvl: 0.35, a: 0.6, d: 0.8, s: 1.0 },
      { mul: 1.5, lvl: 0.18, a: 0.8, d: 0.8, s: 1.0 },
      { mul: 2.5, lvl: 0.09, a: 1.0, d: 0.8, s: 1.0 },
      { mul: 4.01, lvl: 0.04, a: 1.2, d: 0.8, s: 1.0 }] },
    blip: { alg: 3, fb: 0.3, wave: 'square', ops: [
      { mul: 1, lvl: 500, a: 0.001, d: 0.08, s: 0.0 },
      { mul: 2, lvl: 300, a: 0.001, d: 0.06, s: 0.0 },
      { mul: 3, lvl: 200, a: 0.001, d: 0.05, s: 0.0 },
      { mul: 1, lvl: 0.5, a: 0.001, d: 0.12, s: 0.0 }] },
    rocket: { alg: 6, fb: 0.9, wave: 'sawtooth', ops: [
      { mul: 0.5, lvl: 800, a: 0.1, d: 0.5, s: 1.0 },
      { mul: 1.01, lvl: 0.4, a: 0.1, d: 0.5, s: 1.0 },
      { mul: 1.99, lvl: 0.25, a: 0.1, d: 0.5, s: 1.0 },
      { mul: 3.03, lvl: 0.12, a: 0.1, d: 0.5, s: 1.0 }] }
  };

  // ------------------------------------------------------------------- PSG
  // The SN76489 in a Genesis had four bit attenuation, sixteen steps of two
  // decibels each with the last step silent, three fixed noise dividers and a
  // fourth mode that followed tone channel three. All of that is modelled here
  // as plain numbers so it can be asserted without an audio context.
  A.PSG = {
    CLOCK_HZ: 3579545,
    LEVELS: 16,
    DIVIDERS: [512, 1024, 2048],

    // Level 0 is full output, level 15 is off, every step between is 2 dB.
    gainFor: function (level) {
      level = Math.max(0, Math.min(15, Math.round(level)));
      if (level >= 15) { return 0; }
      return Math.pow(10, (-2 * level) / 20);
    },

    // Snap an arbitrary gain onto the nearest attenuation step, which is what
    // makes a PSG sound like a PSG rather than like a fader.
    quantize: function (gain) {
      if (gain <= A.PSG.gainFor(14) * 0.5) { return { level: 15, gain: 0 }; }
      var best = 0, bestErr = Infinity;
      for (var l = 0; l < 15; l++) {
        var err = Math.abs(A.PSG.gainFor(l) - gain);
        if (err < bestErr) { bestErr = err; best = l; }
      }
      return { level: best, gain: A.PSG.gainFor(best) };
    },

    // Noise shift rate. Modes 0 to 2 are the fixed dividers, mode 3 follows
    // the third tone channel.
    noiseHz: function (mode, tone3Hz) {
      if (mode >= 3) { return Math.max(1, tone3Hz || 100); }
      var d = A.PSG.DIVIDERS[Math.max(0, Math.min(2, mode | 0))];
      return A.PSG.CLOCK_HZ / (16 * d);
    },

    // White noise is the fifteen bit tapped shift register, periodic noise is
    // the same register with a single tap, which buzzes at a musical pitch.
    period: function (mode, periodic, tone3Hz) {
      var hz = A.PSG.noiseHz(mode, tone3Hz);
      return periodic ? hz / 15 : hz;
    }
  };

  // A four stage envelope stepped in PSG attenuation units. Returns the new
  // state, so it can be run without any audio hardware present.
  A.envelope = function (state, dt, gate, params) {
    var p = params || {};
    var atkRate = 15 / Math.max(0.001, p.attack || 0.02);
    var decRate = 15 / Math.max(0.001, p.decay || 0.2);
    var relRate = 15 / Math.max(0.001, p.release || 0.4);
    var sustain = Math.max(0, Math.min(15, (p.sustain === undefined) ? 4 : p.sustain));
    var lvl = (state && typeof state.level === 'number') ? state.level : 15;
    var phase = (state && state.phase) || 'off';
    if (gate) {
      if (phase === 'off' || phase === 'release') { phase = 'attack'; }
      if (phase === 'attack') {
        lvl -= atkRate * dt;
        if (lvl <= 0) { lvl = 0; phase = 'decay'; }
      } else if (phase === 'decay') {
        lvl += decRate * dt;
        if (lvl >= sustain) { lvl = sustain; phase = 'sustain'; }
      } else {
        lvl = sustain;
      }
    } else {
      phase = (lvl >= 15) ? 'off' : 'release';
      lvl += relRate * dt;
      if (lvl >= 15) { lvl = 15; phase = 'off'; }
    }
    return { level: Math.max(0, Math.min(15, lvl)), phase: phase, gain: A.PSG.gainFor(lvl) };
  };

  // Doppler between a listener and a source, both moving. Returns a frequency
  // multiplier. Only the chase and tower cameras ever see anything but 1.
  A.SPEED_OF_SOUND = 340;

  A.doppler = function (lisPos, lisVel, srcPos, srcVel, c) {
    c = c || A.SPEED_OF_SOUND;
    var dx = srcPos.x - lisPos.x, dy = srcPos.y - lisPos.y, dz = srcPos.z - lisPos.z;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.5) { return 1; }
    dx /= d; dy /= d; dz /= d;
    // Positive means closing.
    var lisTowardSrc = (lisVel.x * dx + lisVel.y * dy + lisVel.z * dz);
    var srcAwaySrc = (srcVel.x * dx + srcVel.y * dy + srcVel.z * dz);
    var ratio = (c + lisTowardSrc) / Math.max(1, c + srcAwaySrc);
    return M.clamp(ratio, 0.55, 1.9);
  };

  // ----------------------------------------------------------- worklet path
  // The only runtime fetch in the project, and it only happens when the page
  // is served over http or https. From file:// the shadow oscillator below is
  // used instead and nothing is requested.
  A.WORKLET_PATH = 'src/worklet/fm-processor.js';
  A.workletReady = false;

  A.workletEligible = function () {
    if (typeof location === 'undefined') { return false; }
    return location.protocol === 'http:' || location.protocol === 'https:';
  };

  A.loadWorklet = function () {
    if (!A.ctx || !A.ctx.audioWorklet || !A.workletEligible()) {
      return Promise.resolve(false);
    }
    return A.ctx.audioWorklet.addModule(A.WORKLET_PATH).then(function () {
      A.workletReady = true;
      return true;
    }, function () {
      A.workletReady = false;
      return false;
    });
  };

  function Voice(patch) {
    this.patch = A.PATCHES[patch] ? patch : 'hum';
    this.nodes = null;
    this.freq = 220;
    this.level = 0;
  }

  Voice.prototype.build = function () {
    if (!A.ctx || this.nodes) { return; }
    var ctx = A.ctx, p = A.PATCHES[this.patch];
    var alg = A.ALGORITHMS[p.alg] || A.ALGORITHMS[7];
    // Preferred path: one worklet node running the whole operator bank with
    // real feedback. Falls back to the node graph below on any failure.
    if (A.workletReady && root.AudioWorkletNode) {
      try {
        var node = new root.AudioWorkletNode(ctx, 'aerodrome-fm', {
          numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [1],
          processorOptions: {
            wave: p.wave, mods: alg.mods, carriers: alg.carriers,
            ops: p.ops.map(function (o, i) {
              return { mul: o.mul, lvl: (alg.carriers.indexOf(i) >= 0) ? 1 : o.lvl / 300 };
            })
          }
        });
        node.parameters.get('frequency').value = this.freq;
        node.parameters.get('level').value = 0;
        node.parameters.get('feedback').value = p.fb;
        node.connect(A.bus);
        this.worklet = node;
        this.nodes = { worklet: node, alg: alg, patch: p, ops: [], gains: [] };
        return;
      } catch (e) {
        this.worklet = null; // fall through to the oscillator graph
      }
    }
    var ops = [], gains = [], i;
    for (i = 0; i < 4; i++) {
      var osc = ctx.createOscillator();
      osc.type = p.wave;
      osc.frequency.value = this.freq * p.ops[i].mul;
      var g = ctx.createGain();
      g.gain.value = 0;
      osc.connect(g);
      osc.start();
      ops.push(osc); gains.push(g);
    }
    var out = ctx.createGain();
    out.gain.value = 0;
    for (i = 0; i < alg.mods.length; i++) {
      gains[alg.mods[i][0]].connect(ops[alg.mods[i][1]].frequency);
    }
    for (i = 0; i < alg.carriers.length; i++) {
      gains[alg.carriers[i]].connect(out);
    }
    // Feedback approximation. WebAudio cannot close a tight modulation loop,
    // so operator 1 is shadowed by a second oscillator at the same pitch that
    // modulates it. Close enough in character, documented in the README.
    var fb = null;
    if (p.fb > 0) {
      fb = ctx.createOscillator();
      fb.type = p.wave;
      fb.frequency.value = this.freq * p.ops[0].mul;
      var fbg = ctx.createGain();
      fbg.gain.value = p.fb * 120;
      fb.connect(fbg);
      fbg.connect(ops[0].frequency);
      fb.start();
      this.fbGain = fbg;
    }
    out.connect(A.bus);
    this.nodes = { ops: ops, gains: gains, out: out, fb: fb, alg: alg, patch: p };
  };

  Voice.prototype.setFreq = function (f) {
    this.freq = M.clamp(f, 12, 6000);
    if (!this.nodes) { return; }
    if (this.worklet) {
      this.worklet.parameters.get('frequency').setTargetAtTime(this.freq, A.ctx.currentTime, 0.03);
      return;
    }
    var p = this.nodes.patch, t = A.ctx.currentTime;
    for (var i = 0; i < 4; i++) {
      this.nodes.ops[i].frequency.setTargetAtTime(this.freq * p.ops[i].mul, t, 0.03);
    }
    if (this.nodes.fb) { this.nodes.fb.frequency.setTargetAtTime(this.freq * p.ops[0].mul, t, 0.03); }
  };

  Voice.prototype.setLevel = function (l) {
    this.level = M.clamp(l, 0, 1);
    if (!this.nodes) { return; }
    if (this.worklet) {
      this.worklet.parameters.get('level').setTargetAtTime(this.level, A.ctx.currentTime, 0.05);
      return;
    }
    var p = this.nodes.patch, t = A.ctx.currentTime, i;
    for (i = 0; i < 4; i++) {
      var isCarrier = this.nodes.alg.carriers.indexOf(i) >= 0;
      var target = isCarrier ? p.ops[i].lvl * this.level : p.ops[i].lvl * (0.35 + 0.65 * this.level);
      this.nodes.gains[i].gain.setTargetAtTime(target, t, 0.05);
    }
    this.nodes.out.gain.setTargetAtTime(this.level * 0.5, t, 0.05);
  };

  Voice.prototype.ping = function (freq, dur) {
    if (!A.ctx) { return; }
    this.build();
    this.setFreq(freq);
    var t = A.ctx.currentTime;
    if (this.worklet) {
      var lp = this.worklet.parameters.get('level');
      lp.cancelScheduledValues(t);
      lp.setValueAtTime(0.5, t);
      lp.linearRampToValueAtTime(0, t + (dur || 0.12));
      return;
    }
    this.nodes.out.gain.cancelScheduledValues(t);
    this.nodes.out.gain.setValueAtTime(0.0001, t);
    this.nodes.out.gain.linearRampToValueAtTime(0.35, t + 0.005);
    this.nodes.out.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
    for (var i = 0; i < 4; i++) {
      this.nodes.gains[i].gain.setValueAtTime(this.nodes.patch.ops[i].lvl, t);
    }
  };

  // Tear down whichever engine this voice ended up using. Both paths fade to
  // silence first so swapping aircraft never clicks.
  Voice.prototype.dispose = function () {
    var n = this.nodes;
    if (!n || !A.ctx) { return; }
    var t = A.ctx.currentTime;
    if (this.worklet) {
      try { this.worklet.parameters.get('level').setTargetAtTime(0, t, 0.05); } catch (e) { /* gone */ }
      var wk = this.worklet;
      setTimeout(function () {
        try { if (wk.port) { wk.port.postMessage({ stop: true }); } wk.disconnect(); } catch (e) { /* gone */ }
      }, 400);
    } else if (n.out) {
      n.out.gain.setTargetAtTime(0, t, 0.05);
      var dead = n;
      setTimeout(function () {
        try {
          for (var i = 0; i < dead.ops.length; i++) { dead.ops[i].stop(); }
          if (dead.fb) { dead.fb.stop(); }
          dead.out.disconnect();
        } catch (e) { /* already torn down */ }
      }, 400);
    }
    this.nodes = null;
    this.worklet = null;
  };

  A.Voice = Voice;

  // ---------------------------------------------------------- noise channel
  function Noise() { this.nodes = null; this.level = 0; }

  Noise.prototype.build = function () {
    if (!A.ctx || this.nodes) { return; }
    var ctx = A.ctx;
    var len = Math.floor(ctx.sampleRate * 2);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var rnd = AERO.rng(4242);
    // Coarse quantization so it reads as a PSG noise register, not white noise.
    var hold = 0, step = 0;
    for (var i = 0; i < len; i++) {
      if (step-- <= 0) { hold = rnd() * 2 - 1; step = 2; }
      d[i] = Math.round(hold * 7) / 7;
    }
    var src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    var filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 900;
    filt.Q.value = 0.8;
    var g = ctx.createGain();
    g.gain.value = 0;
    src.connect(filt); filt.connect(g); g.connect(A.bus);
    src.start();
    this.nodes = { src: src, filt: filt, gain: g };
  };

  // Levels are snapped to the sixteen PSG attenuation steps rather than set
  // continuously, so a fade is a staircase, which is the point.
  Noise.prototype.set = function (level, cutoff) {
    this.level = M.clamp(level, 0, 1);
    var q = A.PSG.quantize(this.level);
    this.psgLevel = q.level;
    if (!this.nodes) { return; }
    var t = A.ctx.currentTime;
    this.nodes.gain.gain.setTargetAtTime(q.gain * 0.5, t, 0.08);
    if (cutoff) { this.nodes.filt.frequency.setTargetAtTime(M.clamp(cutoff, 80, 12000), t, 0.1); }
  };

  // Pick one of the four PSG noise rates and set the filter to match, so the
  // noise channel has four voices rather than a continuous sweep.
  Noise.prototype.setMode = function (mode, periodic, tone3Hz) {
    this.mode = mode;
    var hz = A.PSG.period(mode, periodic, tone3Hz);
    if (!this.nodes) { return hz; }
    this.nodes.filt.frequency.setTargetAtTime(M.clamp(hz, 80, 12000), A.ctx.currentTime, 0.1);
    return hz;
  };

  A.Noise = Noise;

  // ------------------------------------------------------------------- bank
  A.channels = {};

  A.init = function () {
    if (A.ready) { return true; }
    var Ctx = root.AudioContext || root.webkitAudioContext;
    if (!Ctx) { return false; }
    try {
      A.ctx = new Ctx();
      A.bus = A.ctx.createGain();
      A.bus.gain.value = A.muted ? 0 : A.volume;
      A.bus.connect(A.ctx.destination);
      A.channels.engine = new Voice('piston');
      A.channels.layer = new Voice('hum');
      A.channels.aux = new Voice('hum');
      A.channels.ui = new Voice('blip');
      A.channels.air = new Noise();
      A.channels.rotor = new Noise();
      A.channels.buffet = new Noise();
      A.channels.rumble = new Noise();
      A.ready = true;
      // If the worklet is eligible it is loaded first and the voices are
      // built afterwards, so they pick up the better engine. On file:// this
      // resolves immediately with false and nothing is requested.
      A.loadWorklet().then(function () {
        A.channels.engine.build();
        A.channels.layer.build();
        A.channels.aux.build();
        A.channels.air.build();
        A.channels.rotor.build();
        A.channels.buffet.build();
        A.channels.rumble.build();
        A.channels.buffet.setMode(1, false);
        A.channels.rumble.setMode(2, true, 60);
      });
      return true;
    } catch (e) {
      A.ready = false;
      return false;
    }
  };

  A.resume = function () {
    if (!A.ctx) { A.init(); }
    if (A.ctx && A.ctx.state === 'suspended') { A.ctx.resume(); }
  };

  A.setMuted = function (m) {
    A.muted = !!m;
    if (A.bus) { A.bus.gain.setTargetAtTime(A.muted ? 0 : A.volume, A.ctx.currentTime, 0.05); }
  };

  A.setVolume = function (v) {
    A.volume = M.clamp(v, 0, 1);
    if (A.bus && !A.muted) { A.bus.gain.setTargetAtTime(A.volume, A.ctx.currentTime, 0.05); }
  };

  // The second engine voice. A piston gets a prop tone over it, a turbine
  // gets a compressor whine that tracks its own multiple of engine speed.
  A.setEngineLayer = function (name) {
    if (!A.ready || !A.channels.layer) { return; }
    if (!name) {
      A.channels.layer.setLevel(0);
      A.layerPatch = null;
      return;
    }
    if (A.layerPatch === name) { return; }
    A.layerPatch = name;
    if (A.channels.layer) { A.channels.layer.dispose(); }
    A.channels.layer = new Voice(name);
    A.channels.layer.build();
  };

  // Swap the engine patch when the aircraft changes.
  A.setEnginePatch = function (name) {
    if (!A.ready) { return; }
    if (A.channels.engine && A.channels.engine.patch === name) { return; }
    if (A.channels.engine) { A.channels.engine.dispose(); }
    A.channels.engine = new Voice(name);
    A.channels.engine.build();
  };

  // Called once per frame with the current flight state.
  A.update = function (snap) {
    if (!A.ready || !snap) { return; }
    // Doppler is computed once and applied to everything that is attached to
    // the aircraft rather than to the listener.
    var shift = 1;
    if (snap.listener && snap.source) {
      shift = A.doppler(snap.listener.pos, snap.listener.vel, snap.source.pos, snap.source.vel);
    }
    A.lastDoppler = shift;
    var e = A.channels.engine;
    if (e) {
      e.setFreq((snap.engineHz || 60) * shift);
      e.setLevel(snap.engineLevel || 0);
    }
    if (A.channels.layer) {
      A.channels.layer.setFreq((snap.layerHz || snap.engineHz || 60) * shift);
      A.channels.layer.setLevel(snap.layerLevel || 0);
    }
    if (A.channels.buffet) {
      A.channels.buffet.set((snap.buffet || 0) * 0.8, 240 + (snap.airspeed || 0) * 6);
    }
    if (A.channels.rumble) {
      A.channels.rumble.set((snap.rumble || 0) * 0.7);
    }
    if (A.channels.air) {
      A.channels.air.set(M.clamp((snap.airspeed || 0) / 90, 0, 1) * 0.8, 300 + (snap.airspeed || 0) * 12);
    }
    if (A.channels.rotor) {
      A.channels.rotor.set(snap.rotorLevel || 0, (220 + (snap.rotorHz || 0) * 40) * shift);
    }
    if (A.channels.aux) {
      A.channels.aux.setFreq(snap.auxHz || 90);
      A.channels.aux.setLevel(snap.auxLevel || 0);
    }
  };

  A.blip = function (freq, dur) {
    if (!A.ready || A.muted) { return; }
    if (A.channels.ui) { A.channels.ui.ping(freq || 660, dur || 0.08); }
  };

})(typeof window !== 'undefined' ? window : globalThis);
