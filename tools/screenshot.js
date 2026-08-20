// AERODROME :: tools/screenshot.js :: v1.4.2
// Renders a named scene headless and writes a PPM. Development tool only:
// nothing in src/ depends on it and the simulator never loads it. It exists
// because the graphics bugs fixed in v1.4.2 were all invisible in the numbers
// and obvious in a picture.
//
//   node tools/screenshot.js                 list the scenes
//   node tools/screenshot.js ridge out.ppm   render one
//
// PPM opens in most image viewers, and converts with anything.
// GPL-3.0
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var srcDir = path.join(__dirname, '..', 'src');
var store = {};
var sandbox = {
  console: console,
  performance: { now: function () { return Date.now(); } },
  setTimeout: setTimeout,
  localStorage: {
    getItem: function (k) { return store[k] === undefined ? null : store[k]; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
  }
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

// The UI and the main loop want a document. The renderer does not.
fs.readdirSync(srcDir).filter(function (f) {
  return f.slice(-3) === '.js' && f.indexOf('14-') !== 0 && f.indexOf('15-') !== 0;
}).sort().forEach(function (f) {
  vm.runInContext(fs.readFileSync(path.join(srcDir, f), 'utf8'), sandbox, { filename: f });
});

var AERO = sandbox.AERO;
var V = AERO.vec3, Q = AERO.quat, M = AERO.math;
var R = AERO.raster, P = AERO.palette, G = AERO.render;
var F = AERO.flight, AC = AERO.aircraft, W = AERO.world, X = AERO.weather;
var C = AERO.camera, I = AERO.instruments;

// Each scene is an aircraft, a place, an hour and a camera.
var SCENES = {
  runway: { ac: 'trainer', hour: 9.5, mode: 'cockpit', pos: [0, 1.2, -440], vel: [0, 0, 0] },
  climb: { ac: 'trainer', hour: 9.5, mode: 'chase', pos: [0, 260, 200], vel: [0, 4, 48] },
  ridge: { ac: 'sailplane', hour: 13, mode: 'cockpit', pos: [-1450, 520, -200], vel: [0, -2, 26] },
  town: { ac: 'jet', hour: 15, mode: 'chase', pos: [1150, 320, 200], vel: [0, 0, 180] },
  dusk: { ac: 'saucer', hour: 19.6, mode: 'chase', pos: [-200, 700, -300], vel: [0, 0, 6] },
  night: { ac: 'trainer', hour: 22.5, mode: 'chase', pos: [0, 340, -600], vel: [0, 2, 50] },
  tower: { ac: 'warbird', hour: 11, mode: 'tower', pos: [180, 220, -300], vel: [0, 0, 90] }
};

function render(name) {
  var scene = SCENES[name];
  if (!scene) { return null; }
  R.setSize(320, 224);
  X.state.hour = scene.hour;
  X.state.hourRate = 0;
  var env = X.tick(0.016);

  var ac = AC.byId(scene.ac);
  var st = F.createState(ac, {
    pos: V.make(scene.pos[0], scene.pos[1] + (scene.pos[1] < 5 ? W.RUNWAY.elev : 0), scene.pos[2]),
    vel: V.make(scene.vel[0], scene.vel[1], scene.vel[2])
  });
  var rig = C.create();
  C.applyAircraftDefaults(rig, ac);
  C.setMode(rig, scene.mode);
  // Let the physics and the camera settle so the frame is a real one.
  for (var i = 0; i < 90; i++) {
    env.wind = X.windAt(st.pos, i * 0.016, ac.gustFactor || 1);
    F.step(st, env, 1 / 60);
    F.derive(st, env);
    C.update(rig, st, 1 / 60, {});
  }

  var cam = rig.cam;
  R.clear(P.RAMP.sky.start);
  G.drawSkyPlane(cam, env);
  G.drawStars(cam, env);
  G.drawSun(cam, env);
  G.drawClouds(cam, env, 12);
  G.drawGroundGrid(cam, 400, 9000);
  G.resetQueue();
  W.emit(cam, env, 12, 0);
  G.submitMesh(cam, ac.mesh, st.pos, st.quat, { light: env.sunDir, ambient: env.ambient });
  if (st.derived.agl < 260) {
    G.submitShadow(cam, ac.mesh, st.pos, st.quat, W.heightAt(st.pos.x, st.pos.z) + 0.12,
      { light: env.sunDir, ambient: env.ambient });
  }
  G.flushQueue();
  W.emitSprites(cam, env, 12, 0);
  var opts = { gear: 1, flap: 0, brake: 0, spoiler: 0, burner: 0 };
  if (rig.mode === 'cockpit') {
    I.drawPanel(ac, st.derived, 12, opts);
    I.drawCanopy(ac, rig, st.derived);
  } else {
    I.drawHUD(ac, st.derived, opts);
  }
  return R;
}

function writePPM(file) {
  if (P.dirty) { P.rebuild(); }
  var head = Buffer.from('P6\n' + R.W + ' ' + R.H + '\n255\n');
  var body = Buffer.alloc(R.W * R.H * 3);
  for (var i = 0; i < R.W * R.H; i++) {
    var e = P.expand(P.codes[R.buf[i]]);
    body[i * 3] = e.r; body[i * 3 + 1] = e.g; body[i * 3 + 2] = e.b;
  }
  fs.writeFileSync(file, Buffer.concat([head, body]));
}

var which = process.argv[2];
if (!which) {
  console.log('scenes: ' + Object.keys(SCENES).join(', '));
  console.log('usage:  node tools/screenshot.js <scene> [out.ppm]');
  process.exit(0);
}
if (!SCENES[which]) {
  console.error('no scene called ' + which);
  process.exit(1);
}
render(which);
var out = process.argv[3] || (which + '.ppm');
writePPM(out);
console.log('wrote ' + out + ' at ' + R.W + ' by ' + R.H);
