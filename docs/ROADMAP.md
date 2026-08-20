# AERODROME roadmap

<!-- AERODROME :: docs/ROADMAP.md :: v1.4.1 -->

Nothing below is committed work. It is the ordered list of what the v1.0 build
deferred, what the known limitations imply, and what would make the thing
better without breaking the rules it was built under.

## The rules that do not change

These are the constraints every milestone below has to live inside. If a
feature cannot be built without breaking one of them, the feature loses.

* Runs by double clicking `index.html` from `file://`. No install, no build
  step, no bundler, no CDN, no network call at runtime.
* Classic script tags, one `AERO` namespace, no `import` or `export`, no Web
  Workers.
* The Genesis budget holds: 320 by 224, 64 colors on screen from 512, flat
  shaded convex polygons, ordered dithering, per scanline sprite budget.
* One flight integrator. Capability flags, never aircraft names.
* Local first. No telemetry, no accounts, one exportable JSON file with a
  schema version.
* Every milestone lands with its assertions, and the suite stays green.

## v1.0.1 - Review pass

The one milestone that is definitely happening, because it is your first hours
in the seat. Whatever the build got wrong about *feel* goes here.

* Fix whatever the hands on review turns up.
* Correct the About panel feedback URL once the repository path is real.
* Re-check the takeoff and landing envelope for each of the twelve after any
  tuning changes, since trim assertions catch divergence but not unpleasantness.

## v1.1 - Airmanship - SHIPPED

Flight model and ground handling. All of it landed, with fifteen new
assertions, and the suite went from 41 to 56.

* Ground effect. Induced drag collapses inside one wingspan of the surface and
  has faded entirely a wingspan and a half up.
* Slipstream over the tail. Elevator and rudder sit in the propeller wash and
  keep working at a speed where the ailerons have gone soft. Ailerons do not
  get the benefit, because they are not in the wash.
* Steerable wheels with speed washout, and differential braking off the pedals.
  A wheel behind the centre of gravity gets its geometry reversed so that right
  pedal still turns right, which is what a taildragger actually does.
* Brake friction capped at 0.85, which is roughly a tyre on dry pavement.
* Surface wind gradient on a log profile referenced to 200 metres.
* Crash taxonomy: hard contact, gear overload, overspeed, rotor strike, nose
  over and terrain, each reported as itself.
* Engine as a state machine in the flight model: running, off, starting. The
  starter cranks for 2.4 seconds and refuses on a dry tank.

Found along the way: rear-mounted steering wheels need reversed geometry, and
uncapped brake friction will flip a taildragger onto its nose at taxi speed.

## v1.2 - Optics - SHIPPED

Renderer quality, all of it inside the palette budget. Fourteen new
assertions, suite now at 70.

* Sutherland Hodgman clipping against the screen rectangle, replacing the old
  coordinate clamp. Two thirds of the fill work in a typical view was being
  spent on polygons that were entirely off screen.
* Painter order now keys on 0.6 of the nearest vertex depth plus 0.4 of the
  centroid, with an explicit bias for coplanar work like runway markings.
* Large static faces are split at build time, and the split mesh is used
  inside 700 metres where the sorting errors are actually visible.
* The contact shadow is the convex hull of the aircraft's own footprint
  dropped onto the ground, so it turns as the aircraft turns.
* Three sprite tiers: a doubled cell close in, the plain cell at middle
  distance, a speck beyond legibility. Doubling is pixel replication, which is
  what the hardware did.
* An 8 x 8 ordered pattern for soft edges, used on the clouds, since Bayer at
  4 x 4 reads as a visible grid when the framebuffer is scaled up three times.

A full BSP was on the table and turned out not to be needed. Build time
subdivision plus a better sort key covers the cases that actually popped, at a
fraction of the complexity.

Measured after the change, over the town at 320 by 224: about 2,080 faces
submitted, 96 drawn, 424 rejected by the screen clipper.

## v1.3 - Cabinet - SHIPPED

Audio. The biggest single known limitation is now conditional rather than
permanent. Twenty new assertions, suite at 90.

* `src/worklet/fm-processor.js` computes four operator FM with real operator 1
  feedback one sample at a time. It is loaded only when `location.protocol` is
  http or https, so opening `index.html` from disk still fetches nothing. The
  shadow oscillator remains the offline path, and both read the same patch
  format. A Blob URL fallback would have made the worklet work offline too and
  was rejected: it is runtime code generation, which this project does not do.
* The PSG is modelled as arithmetic rather than as an audio graph: sixteen
  attenuation steps of two decibels with the last one silent, the three fixed
  noise dividers off a 3.579545 MHz clock, the fourth mode following tone
  three, and periodic noise at a fifteenth of the white rate. Levels are
  snapped to steps, so a fade is a staircase.
* A four stage envelope stepped in attenuation units, pure enough to assert
  without an audio context.
* A second engine voice on seven aircraft: prop tone over the pistons, a
  compressor whine over the jet at 8.4 times core speed, a turbine under the
  helicopter rotor.
* Doppler between listener and source, bounded to 0.55 and 1.9. In the cockpit
  the listener is the source and it stays at 1.
* Stall buffet and gear rumble on quantized noise channels.

Found along the way: swapping aircraft tore down the engine voice assuming an
oscillator graph, which threw the moment the worklet path was live. Voices now
dispose of themselves whichever engine they ended up using.

## v1.4 - The field - SHIPPED

World content, on top of the enabling change. Twenty six new assertions, suite
at 116.

* The valley is a data file. Terrain shape, runway, field, town and scatter
  seeds, structures, camera sites and movers all live in `W.params`, loaded
  from a world file and validated field by field. Unknown structure types are
  dropped, out of range numbers are clamped, a foreign file or a newer schema
  is refused. The format is documented in `docs/world-format.md`, and a loaded
  world is saved with the settings file as an additive field, so files written
  before v1.4 still load.
* Night lighting: runway edge lights with green and red ends, a rotating
  beacon that is only visible while the lamp is pointing at you, and town
  windows lit on a fixed per building pattern. All flat unshaded faces, so
  they read as light sources rather than as surfaces catching one.
* An aerotow for the sailplane on the T key. The rope is a spring that pulls
  and never pushes, the tug eases off when it feels strain, and the weak link
  parts at 12 kN.
* Cars on the field road and the bridge, a boat on the river, all sprite cells
  so they cost the sprite budget rather than the polygon budget.
* The tower camera picks the nearest site from the world file with hysteresis,
  smooths its aim with a little lead, and zooms to hold the aircraft at a
  constant size in frame out to 1800 metres.

Found along the way: the tug gated its climb on altitude, so it could never
start climbing, and the glider just kited on the end of the rope at exactly one
rope length above the runway. It rotates on airspeed now, like an aeroplane.

## v1.4.1 - Cleanup and interface pass - SHIPPED

Not originally on the roadmap. Four milestones of features had accumulated in
an interface that still assumed one aeroplane and a fixed list of keys.

* The key legend, the quickbar and the tuning drawer are built from the
  selected aircraft and the live bindings rather than hard coded.
* Tuning is grouped, marks what you have changed, and every row has a stock
  button, so one number can be undone without resetting the airframe.
* Twelve more tunables covering buoyancy, rotor, reaction and flapping, so the
  tuning drawer is useful on the aircraft that are not aeroplanes.
* The roster is a keyboard operable radio group with trimmed tags.
* Open drawers are remembered, the status line moved next to the viewport, and
  a single first run line explains the three keys that matter.
* Dead members removed: a render flag with no implementation and two palette
  functions nothing called. The remaining unused exports were checked one by
  one and kept deliberately, and the README now says so.
* Small inline controls grow to a full 44 pixel target on a touch screen.

Sixteen new assertions, suite at 132. The UI module is loaded by the headless
runner now, because the decisions it makes are pure functions and deserve to be
asserted like everything else.

Still missing and now written down as a known limitation: there are no touch
flight controls. The chrome is sized for touch, but flying needs a keyboard or
a gamepad.

## v1.5 - Logbook

Structure around the flying, using what is already stored.

* Deterministic replay. The integrator is fixed step already, so recording the
  input stream plus the seed is enough to replay a flight exactly. This is
  cheap and it is the foundation for everything else in this milestone.
* Spot landing and ring course scoring, written into the existing flight log.
* Exportable flight recordings, which means two people can compare runs without
  a server existing anywhere. Local first multiplayer, more or less.
* A ghost: replay a previous flight alongside the current one.
* Assertions: a recorded flight replayed twice produces bit identical state.

## Deliberately not doing

* Networked multiplayer. It would require a server and would break the first
  rule on the list.
* Textures, smooth shading, or anything above 64 colors in the viewport. That
  is a different project.
* A physics engine dependency. The integrator being readable is the point.
* Accounts, cloud sync, or any storage that is not a file you hold.
* Procedural infinite terrain. The valley is small on purpose, and a place you
  learn is worth more than a place you have never seen before.

## Version and schema policy

* Patch versions fix behavior and never change the save schema.
* Minor versions may add fields to the save file, and the importer keeps
  accepting every older schema it has ever accepted.
* The schema version only increments when an old file genuinely cannot be read
  forward, and that has not happened yet.

Make. Hack. Learn. Share. Repeat.
