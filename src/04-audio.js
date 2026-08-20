// AERODROME :: src/04-audio.js :: v1.0.0
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
    var p = this.nodes.patch, t = A.ctx.currentTime;
    for (var i = 0; i < 4; i++) {
      this.nodes.ops[i].frequency.setTargetAtTime(this.freq * p.ops[i].mul, t, 0.03);
    }
    if (this.nodes.fb) { this.nodes.fb.frequency.setTargetAtTime(this.freq * p.ops[0].mul, t, 0.03); }
  };

  Voice.prototype.setLevel = function (l) {
    this.level = M.clamp(l, 0, 1);
    if (!this.nodes) { return; }
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
    this.nodes.out.gain.cancelScheduledValues(t);
    this.nodes.out.gain.setValueAtTime(0.0001, t);
    this.nodes.out.gain.linearRampToValueAtTime(0.35, t + 0.005);
    this.nodes.out.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
    for (var i = 0; i < 4; i++) {
      this.nodes.gains[i].gain.setValueAtTime(this.nodes.patch.ops[i].lvl, t);
    }
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

  Noise.prototype.set = function (level, cutoff) {
    this.level = M.clamp(level, 0, 1);
    if (!this.nodes) { return; }
    var t = A.ctx.currentTime;
    this.nodes.gain.gain.setTargetAtTime(this.level * 0.5, t, 0.08);
    if (cutoff) { this.nodes.filt.frequency.setTargetAtTime(M.clamp(cutoff, 80, 12000), t, 0.1); }
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
      A.channels.aux = new Voice('hum');
      A.channels.ui = new Voice('blip');
      A.channels.air = new Noise();
      A.channels.rotor = new Noise();
      A.channels.engine.build();
      A.channels.aux.build();
      A.channels.air.build();
      A.channels.rotor.build();
      A.ready = true;
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

  // Swap the engine patch when the aircraft changes.
  A.setEnginePatch = function (name) {
    if (!A.ready) { return; }
    if (A.channels.engine && A.channels.engine.patch === name) { return; }
    var old = A.channels.engine;
    if (old && old.nodes) {
      old.nodes.out.gain.setTargetAtTime(0, A.ctx.currentTime, 0.05);
      var dead = old;
      setTimeout(function () {
        try {
          for (var i = 0; i < 4; i++) { dead.nodes.ops[i].stop(); }
          if (dead.nodes.fb) { dead.nodes.fb.stop(); }
          dead.nodes.out.disconnect();
        } catch (e) { /* already torn down */ }
      }, 400);
    }
    A.channels.engine = new Voice(name);
    A.channels.engine.build();
  };

  // Called once per frame with the current flight state.
  A.update = function (snap) {
    if (!A.ready || !snap) { return; }
    var e = A.channels.engine;
    if (e) {
      e.setFreq(snap.engineHz || 60);
      e.setLevel(snap.engineLevel || 0);
    }
    if (A.channels.air) {
      A.channels.air.set(M.clamp((snap.airspeed || 0) / 90, 0, 1) * 0.8, 300 + (snap.airspeed || 0) * 12);
    }
    if (A.channels.rotor) {
      A.channels.rotor.set(snap.rotorLevel || 0, 220 + (snap.rotorHz || 0) * 40);
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
