// AERODROME :: tools/run-tests.js :: v1.0.0
// Runs the same assertions as tests.html, without a browser. Development tool
// only. Nothing in src/ depends on this file, and the simulator never loads it.
// Usage: node tools/run-tests.js
// GPL-3.0
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var srcDir = path.join(__dirname, '..', 'src');
var files = fs.readdirSync(srcDir).filter(function (f) { return f.slice(-3) === '.js'; }).sort();

// The UI and the main loop need a document. Everything else is pure logic.
var skip = { '14-ui.js': 1, '15-main.js': 1 };

var store = {};
var sandbox = {
  console: console, Math: Math, Date: Date, JSON: JSON, Object: Object, Array: Array,
  String: String, Number: Number, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat,
  Uint8Array: Uint8Array, Uint16Array: Uint16Array, Uint32Array: Uint32Array, Float32Array: Float32Array,
  setTimeout: setTimeout,
  performance: { now: function () { return Date.now(); } },
  localStorage: {
    getItem: function (k) { return store[k] === undefined ? null : store[k]; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

files.forEach(function (f) {
  if (skip[f]) { return; }
  try {
    vm.runInContext(fs.readFileSync(path.join(srcDir, f), 'utf8'), sandbox, { filename: f });
  } catch (e) {
    console.error('failed to load ' + f + ': ' + e.message);
    process.exit(1);
  }
});

sandbox.AERO.storage.load();
var r = sandbox.AERO.tests.runAll();
r.results.forEach(function (x) {
  console.log((x.pass ? '  ok   ' : '  FAIL ') + x.name + (x.detail ? '  [' + x.detail + ']' : ''));
});
console.log(r.summary);
process.exit(r.failed ? 1 : 0);
