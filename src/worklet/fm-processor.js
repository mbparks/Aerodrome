// AERODROME :: src/worklet/fm-processor.js :: v1.3.0
// Four operator FM with real operator 1 feedback, computed one sample at a
// time. This is the only file in the project that is fetched at runtime, it is
// only fetched when the page is served over http or https, and the simulator
// runs without it. See the Known Limitations section of the README.
// GPL-3.0

class FMProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'frequency', defaultValue: 220, minValue: 8, maxValue: 8000, automationRate: 'k-rate' },
      { name: 'level', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'feedback', defaultValue: 0, minValue: 0, maxValue: 4, automationRate: 'k-rate' }
    ];
  }

  constructor(options) {
    super();
    var p = (options && options.processorOptions) || {};
    this.ops = p.ops || [
      { mul: 1, lvl: 1, out: true },
      { mul: 1, lvl: 0, out: false },
      { mul: 1, lvl: 0, out: false },
      { mul: 1, lvl: 0, out: false }
    ];
    this.mods = p.mods || [];
    this.carriers = p.carriers || [0];
    this.wave = p.wave || 'sine';
    this.phase = [0, 0, 0, 0];
    this.out = [0, 0, 0, 0];
    this.prev = [0, 0, 0, 0];
    this.smoothLevel = 0;
    this.running = true;
    this.port.onmessage = (e) => {
      if (e.data && e.data.stop) { this.running = false; }
    };
  }

  shape(phase) {
    var t = phase - Math.floor(phase);
    if (this.wave === 'square') { return t < 0.5 ? 1 : -1; }
    if (this.wave === 'sawtooth') { return 2 * t - 1; }
    return Math.sin(t * 2 * Math.PI);
  }

  process(inputs, outputs, params) {
    var out = outputs[0];
    if (!out || !out.length) { return this.running; }
    var chan = out[0];
    var sr = sampleRate;
    var freq = params.frequency[0];
    var level = params.level[0];
    var fb = params.feedback[0];
    var ops = this.ops, mods = this.mods, carriers = this.carriers;
    var i, j, n = chan.length;

    for (i = 0; i < n; i++) {
      // Level is smoothed here rather than by a gain node so the worklet and
      // the fallback path behave the same way under a fast throttle change.
      this.smoothLevel += (level - this.smoothLevel) * 0.0008;

      // Operator 1 feedback, the thing this file exists for. The previous two
      // output samples are averaged, which is what the hardware did.
      var fbIn = fb * (this.prev[0] + this.out[0]) * 0.5;

      for (j = 0; j < 4; j++) {
        var mod = (j === 0) ? fbIn : 0;
        for (var m = 0; m < mods.length; m++) {
          if (mods[m][1] === j) { mod += this.out[mods[m][0]]; }
        }
        this.phase[j] += (freq * ops[j].mul) / sr;
        if (this.phase[j] > 1e6) { this.phase[j] -= 1e6; }
        this.prev[j] = this.out[j];
        this.out[j] = this.shape(this.phase[j] + mod) * ops[j].lvl;
      }

      var sum = 0;
      for (j = 0; j < carriers.length; j++) { sum += this.out[carriers[j]]; }
      chan[i] = (sum / Math.max(1, carriers.length)) * this.smoothLevel * 0.5;
    }
    for (var c = 1; c < out.length; c++) { out[c].set(chan); }
    return this.running;
  }
}

registerProcessor('aerodrome-fm', FMProcessor);
