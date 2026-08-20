# AERODROME roadmap

<!-- AERODROME :: docs/ROADMAP.md :: v1.11.0 -->

Revised after v1.5.0. Everything planned moved up one number, because a
fullscreen cockpit and a deck that fits the window turned out to matter more
than any of it and took the v1.5 slot.

Revised after v1.4.1. The ordering below is the current one, not the original:
input and touch moved to the front, replay moved back once it turned out to
need groundwork first, and the world editor moved to last now that a world is
a text file anybody can edit without one.

Nothing below is committed work.

## The rules that do not change

Every milestone has to live inside these. If a feature cannot be built without
breaking one, the feature loses.

* Runs by double clicking `index.html` from `file://`. No install, no build
  step, no bundler, no CDN, no network call at runtime. The one exception is
  the FM worklet, which is fetched only when the page is served over http and
  which the simulator runs without.
* Classic script tags, one `AERO` namespace, no `import` or `export`, no Web
  Workers.
* The Genesis budget holds: 320 by 224, 64 colors on screen from 512, flat
  shaded convex polygons, ordered dithering, per scanline sprite budget.
* One flight integrator. Capability flags, never aircraft names.
* Local first. No telemetry, no accounts, one exportable JSON file with a
  schema version.
* Every milestone lands with its assertions, and the suite stays green.

# Ahead

Planned milestones are no longer given version numbers. Reality has taken the
next number three times running now, and renumbering the list each time was
churn that told nobody anything. They are in order; the next one to ship gets
the next number.

The graphics work is done. `docs/GRAPHICS-PLAN.md` ran as five milestones,
Depth through Air plus the cockpit interior, from v1.6.0 to v1.10.0. The only
thing left of it is the **living world** dropped from Populate, which is
content rather than rendering and is listed below with everything else.

Trim shipped as v1.11.0. The order from here is the living world, then
Fingertips.

## v1.0.1 - Review pass (open)

Still open, because the hands on review has not happened yet. Whatever the
first real hours in the seat say about feel goes here, plus the About panel
feedback URL once the repository path is real.

## The living world

Left out of Populate. The valley has things in it now; it does not have much
happening in it.

* A train that runs a line on a schedule, which needs a railway in the world
  file first.
* Cattle that wander their field rather than standing in it forever.
* A tug taxiing on the apron, and chimney smoke over the town.
* Flocks that hold a formation instead of circling independently.
* The mover system already takes a path and a speed, so most of this is new
  path types rather than new machinery.

## Fingertips

Touch. The chrome is already sized for it, the aircraft is not, and a browser
flight simulator that cannot be flown on a phone is missing most of the people
who could open it.

* An on screen stick and throttle, drawn as chrome rather than inside the
  framebuffer, so they cost no polygons and break no palette rule.
* Both feed `IN.axes` like every other input. Nothing downstream learns that
  touch exists, which keeps remapping and, later, replay honest.
* Contextual touch buttons driven by the same `legendFor` logic the key legend
  uses, so a balloon gets a burner and a vent and a jet does not.
* Portrait and landscape layouts, and a control layer that appears under a
  coarse pointer without stealing the screen from a mouse.
* Assertions: a touch vector maps into the same axis range as a key or a pad;
  the layer appears only under a coarse pointer or an explicit override; the
  buttons offered match the legend for that aircraft.

## Frontal

Weather with a shape to it. Today the wind is a mean vector plus gusts plus
terrain effects, which is good, and it never changes its mind, which is not.

* Fronts crossing the valley: a wind shift and a speed change arriving over
  minutes, so the landing you planned twenty minutes ago is the wrong landing.
* Shear layers with altitude, distinct from the surface gradient already in.
* Visibility tied to conditions, spent through the existing haze dither rather
  than through any new colors.
* A cloud base that actually occludes, so the ridge disappears into it.
* Assertions: the shear profile is continuous and bounded; a front rotates the
  wind through the angle it says it will, over the time it says; reduced
  visibility only shortens the haze distance and never adds a palette entry.

## Logbook

Structure around the flying. Moved back from v1.5 because the groundwork below
is real work, not a footnote. Moved back once. Do not move it again without
saying why.

* Seed everything in the frame path first. The gust process and the camera
  shake both call `Math.random` today, so nothing is reproducible until they
  do not. This is the milestone's first task, not its last.
* Deterministic replay from the input stream plus the seed. The integrator is
  already fixed step, so once the randomness is seeded this is close to free.
* Scoring for spot landings and the ring course, written into the flight log
  that already exists.
* Ghosts, and exportable recordings, so two people can compare runs without a
  server existing anywhere. Local first multiplayer, more or less.
* Assertions: a recorded flight replayed twice is bit identical; and a replay
  step still completes with `Math.random` replaced by a function that throws,
  which is the only honest way to prove the frame path is seeded.

## Cartography

A world editor, last, because a world is already a text file and the format is
documented. This is about making it pleasant, and about closing the loose ends
the format left behind.

* A map view with structures you can place and drag, and terrain parameters
  with a live preview.
* Honour `runway.headingDeg`, which is currently stored and ignored.
* More structure types. Thirteen is a decent vocabulary now, but there is no
  railway, no quarry and no dam in it.
* Several worlds kept in the settings file rather than one at a time.
* Assertions: anything the editor writes passes the same validator an imported
  file does; a rotated runway rotates its markings and its lights with it.

# Deferred, not declined

* **PWA layer.** It has never once been the thing standing in the way, since
  the application already works offline from `file://`. Still worth doing at
  some point, and additive only when it happens.
* **Tower camera on a dolly.** The fixed sites from the world file frame the
  aircraft well. Moving shots would be nicer and are not necessary.

# Deliberately not doing

* Networked multiplayer. It would need a server and would break the first rule
  on the list.
* Textures, smooth shading, or anything above 64 colors in the viewport. That
  is a different project.
* A physics engine dependency. The integrator being readable is the point.
* Accounts, cloud sync, or any storage that is not a file you hold.
* Procedural infinite terrain. A place you learn is worth more than a place
  you have never seen before.

# Shipped

## v1.11.0 - Trim

Input, and the oldest item on the list. A stick is not a switch, and until now
the simulator treated it like one.

* Gamepad rebinding that listens for the gamepad. Press Pad and then move the
  control; rest positions are snapshotted first, because a trigger at rest
  reads minus one and a worn stick never reads exactly zero. Escape cancels.
* Per axis dead zone, response curve and inversion, set on the axis rather
  than on the binding, so they apply however that axis is driven. Rest maps to
  exactly zero and full deflection to exactly one at every curve setting, and
  the curve is monotone, because a stick that reverses halfway through its
  travel is worse than no curve at all.
* Several pads, listed by name, with hot plug. A pad arriving while nothing is
  chosen becomes the choice; a pad leaving only clears it if it was the one in
  use.
* A Clear button, so an action can be genuinely unbound.
* Conflict reporting in the Controls drawer.
* Twenty four new assertions, suite at 228.

Found by the new conflict assertion, within a minute of writing it: the stock
gamepad map drove both the rudder and the view from the right stick, so
looking right also fed in right rudder. The rudder is on the shoulder buttons
now. That map has been wrong since v1.0 and nobody noticed, because nobody had
asked the question in a form a machine could answer.

## v1.10.0 - Cockpit

The last item of Phase A, deferred from v1.6.0 because it looked like a
re-authoring job on twelve panels.

* The interior is generated from a nine number spec measured from the eye, so
  nobody had to author twelve cockpits. The defaults are an aeroplane; ten
  aircraft override part of it. The warbird is open with high sills, the
  glider is thin posts and glass, the balloon is a basket, the helicopter is a
  bubble.
* It is real geometry in the depth pass, so it occludes the world and moves
  against it when you look around.
* The panel stayed in screen space and slides with head look, because a panel
  a metre from your eye is a plane, and a plane under a small rotation slides.
  That is the correct answer, not a shortcut.
* Nine new assertions, suite at 204.

Two bugs found by looking at it, both old:

The black line up the middle of every forward view was a flat panel in the
plane that contains the eye, projecting to a sliver one pixel wide and the
full height of the screen. Faces that close and that thin are culled now. The
first suspect was the scrolling ground grid, which turned out to be innocent
but was also drawn at sea level, permanently underground since the terrain
gained a floor, so it went too.

The first cockpit had posts half a metre from the pilot's face, which fills a
third of the windscreen. They are where a windscreen post actually is now.

## v1.9.0 - Air

Phase D of the graphics plan, and the last of the four.

* A skyline map. Every cell of the coarse terrain grid records how high the
  horizon stands in eight directions, computed once by ray marching over the
  array rather than over the noise field, which is three orders of magnitude
  cheaper. A hillside is in shadow when the sun is lower than its own horizon,
  with a degree of softness at the terminator.
* Cloud shade drifting with the wind, as a field rather than as geometry.
* Sun glare as a dithered halo that brightens the sky it sits in rather than
  painting a disc on it, and glint on water where it would reflect the sun
  toward the camera.
* Height haze, so the valley floor washes out before the ridge line does.
* Twelve new assertions, suite at 195. Frame cost still three milliseconds.

## v1.8.0 - Populate

Phase C of the graphics plan. The valley had six structure types and four
sprites in it, which is not a place, it is a test scene.

* Seven new structures: barn, silo, water tower, church with a spire, radio
  mast, power line runs with sagging wires between the poles, and fences that
  follow the ground they cross. All of them are world file data.
* Six new sprite cells: conifer, dead tree, boulder, hay bale, cow, fence post.
* Scatter placed by a density field instead of uniformly at random, with a
  thinning tree line as the ground rises and the species chosen by what the
  ground is made of. Conifers and boulders on the scree, cattle in the fields,
  hay bales only in the ripe crop.
* Ten new assertions, suite at 183, including one that measures the clustering
  against what pure chance would give: variance 10.9 against a mean of 5.2,
  where a uniform sprinkle would put them equal.

Not done: the living world from 3.3. The movers still run their original
three paths, and there is no train, no taxiing tug and no chimney smoke.

Learned: the first clustering assertion was measured wrong. Counting only the
bins that had something in them truncates the distribution and hides exactly
the property being tested, and clustering is a statement about a scale, so the
bin has to match the scale of the feature.

## v1.7.0 - Land

Phase B of the graphics plan. The ground was one noise field and three
materials, which is why it read as a green sheet with a bump on it.

* Material by what the ground is doing: slope for scree and rock, the
  waterline for sand, a field grid for farmland with hedgerows on the
  boundaries and a crop per field.
* Drainage. Fractal noise has none, so one flow accumulation pass at build
  time routes every cell into its lowest neighbour and lowers the ground where
  the water collects. Gullies join. Cached in a grid and sampled bilinearly,
  so the flight model pays nothing for it.
* Level of detail skirts, so the seam between tile bands can no longer be a
  slot of sky in a hillside.
* The palette decision from Part 5 went with option 1 and paid for two entries
  rather than four: grass had a duplicate shade after quantization and the
  shadow did not need a slot of its own. The other four new materials came
  from a bias field that reads an existing ramp high or low, and cost nothing.
* The noise hash was a closure allocated on every call. Terrain sampling calls
  it millions of times a second now, so it is hoisted, and tile corners are
  served from a small direct mapped cache.

Fourteen new assertions, suite at 173. Frame cost unchanged at three
milliseconds.

Learned: my benchmark harness runs code inside a node vm context, which is
roughly a hundred times slower than plain node. Every timing measured through
it is pessimistic, and the real figures are better than anything reported here.

## v1.6.0 - Depth

Phase A of the graphics plan. The renderer sorted whole faces and hoped, and
sprites were painted over the finished scene with no depth test at all, which
is why a tree could stand in front of the hill it was growing on.

* An inverse depth buffer, one float a pixel, cleared to zero each frame.
  Reciprocal depth is linear in screen space, so a scanline interpolates it
  between the two edge crossings and each pixel is one compare and one store.
* Sprites test a single depth taken at their anchor and keep their per
  scanline budget and their flicker.
* Both sort biases became small lifts in depth, which is what they were always
  trying to be.
* The build time subdivision from v1.2 is retired. It existed only to make a
  sorting error smaller, and the error is now impossible. Face count near the
  field fell from about 2,080 to 929.
* Nine new assertions, suite at 159, including the one that matters: a frame
  is identical whichever order its faces were submitted in.

Measured: three milliseconds a frame before, three after, with half the
geometry. Depth was free the whole time.

Not done: the cockpit is still drawn in screen space. That turned out to be a
re-authoring job on twelve panels rather than a renderer change, so it left
Phase A and became its own milestone.

## v1.5.0 - Cockpit

Asked for from the seat, which is where the useful complaints come from. The
deck did not fit on a laptop screen: the panel was below the fold and you had
to scroll to see your own instruments.

* The flight deck is one viewport tall and never scrolls. Header, roster,
  viewport, quickbar and legend always fit; settings live below the fold.
* The canvas is sized by the application in whole framebuffer pixels rather
  than by CSS percentages. It measures the box, takes the largest whole scale
  that fits, and sets the canvas to exactly that. Nothing is scaled by a
  fraction at any window size.
* A fullscreen cockpit on Enter or the quickbar button. Only the framebuffer
  goes fullscreen, so there is nothing on the screen but the aeroplane, and
  the scale is recalculated on the way in and the way out.
* The roster scrolls inside its own rail rather than stretching the page.

Five new assertions on the fitting rule, suite at 147. Checked at seven window
sizes from 1920 by 1080 down to a phone.

Condensed. Each entry keeps the one thing the work taught, because that is the
part worth rereading.

## v1.5.1 - Fit, again

The first fit measured the stage once, during startup, before the browser had
finished laying the page out. It then never measured again unless the window
was resized, so the picture was sized from a box that did not exist yet and
stayed two whole steps smaller than it could have been.

* Measure again after the first two frames, and keep measuring four times a
  second. It costs a property read and does nothing unless the answer changed.
* Chrome trimmed: the status line moved into the quickbar row, the header and
  the footer lost a few pixels each. On a 1899 by 953 window that was the
  difference between a two times picture and a three times one.
* A Picture scaling setting, because whole pixel scaling can leave up to half
  a step of empty space and some people would rather have the size. Fill mode
  stretches only the final blit; the framebuffer and the backing store still
  move in whole steps.

Learned: a layout measured once at startup is a layout measured at the wrong
time.

## v1.4.2 - Legibility

Also not on the roadmap. Four milestones of engineering had never been looked
at through a screenshot, and it showed. Ten new assertions, suite at 142, and a
headless screenshot tool so the next renderer change gets looked at.

* The canopy glare sampled one pixel at the left edge of the screen to decide
  what to brighten. By then that pixel was the canopy frame, so the glare was
  a large black and white rectangle bolted to the sky.
* The sky dithered across the whole of every band, and the gradient was so
  narrow that nine bit quantization collapsed eight entries into four. Wider
  ramps, solid bands, thin seams, and a curve so the pale sky stays near the
  horizon.
* Haze started at 1200 metres and reached ninety percent, which is a
  checkerboard. It starts at 2600 and stops at thirty two percent.
* Every tree in the valley stood on a six metre invisible stalk.
* Sprite tiers used forward distance rather than true distance, so a tree
  seven hundred metres below the aircraft was drawn as a doubled near sprite.
  That is what was standing in front of the flying saucer.
* Time of day only ever recoloured the sky, so at dusk the grass went dark and
  the river stayed noon blue. The world and craft banks follow the light now,
  by shifting palette levels rather than multiplying, because multiplying and
  requantizing turns a mid green into olive and a tan ridge into pink.
* The HUD attitude ball was two shades of dark. It is sky over ground.
* The chase camera spring was tuned for a trainer and left the jet two hundred
  metres ahead of it, out of frame. It stiffens with speed now and has a hard
  leash measured from the aircraft.

Learned: none of this was visible in 132 passing assertions. A renderer needs
to be looked at, and now there is a tool for looking at it.

## v1.1 - Airmanship

Ground effect, propeller slipstream over the tail, steerable wheels with speed
washout, differential braking capped at what a tyre can do on dry pavement, a
surface wind gradient on a log profile, a crash taxonomy of six named failures,
and the engine as a state machine with a starter that cranks and refuses on a
dry tank. 41 assertions to 56.

Learned: a steering wheel behind the centre of gravity needs reversed geometry,
or right pedal turns you left. Uncapped brake friction will flip a taildragger
onto its nose at taxi speed.

## v1.2 - Optics

Sutherland Hodgman clipping against the screen rectangle, a painter key
weighted toward the nearest vertex with an explicit bias for coplanar work,
build time subdivision of large static faces used inside 700 metres, a contact
shadow that is the aircraft's own convex footprint, three sprite tiers by
distance, and an 8 x 8 dither pattern for soft edges. 56 to 70.

Learned: two thirds of the fill work in a typical view was being spent on
polygons that were entirely off screen. The full BSP that was planned turned
out not to be needed at all.

## v1.3 - Cabinet

An AudioWorklet computing real operator 1 feedback, loaded only over http, with
the shadow oscillator still serving `file://`. The PSG modelled as arithmetic:
sixteen two decibel steps, three noise dividers, periodic noise at a fifteenth
of the white rate. A four stage envelope. A second engine voice on seven
aircraft. Doppler, stall buffet and gear rumble. 70 to 90.

Learned: a Blob URL would have made the worklet work offline too and was
rejected, because it is runtime code generation. Voices had to learn to dispose
of themselves whichever engine they ended up using.

## v1.4 - The field

The valley became a validated data file with its own documented format. Night
lighting on the runway, the tower beacon and the town. An aerotow for the
sailplane on a rope that pulls and never pushes. Traffic and a boat. A tower
camera that picks a site from the world file, smooths its aim and zooms to
frame the aircraft. 90 to 116.

Learned: the tug gated its climb on altitude, so it could never start climbing,
and the glider just kited on the end of the rope at exactly one rope length
above the runway.

## v1.4.1 - Cleanup and interface pass

Not originally on the roadmap. The key legend, the quickbar and the tuning
drawer are built from the selected aircraft and the live bindings. Tuning is
grouped, marks what changed, and every row has a stock button. Twelve more
tunables for the aircraft that are not aeroplanes. The roster became a keyboard
operable radio group. Dead members removed and the deliberate ones documented.
116 to 132.

Learned: four milestones of features had accumulated in an interface that still
assumed one aeroplane and a fixed list of keys.

## Version and schema policy

* Patch versions fix behavior and never change the save schema.
* Minor versions may add fields to the save file, and the importer keeps
  accepting every older schema it has ever accepted.
* The schema version only increments when an old file genuinely cannot be read
  forward. That has not happened yet, through four minor versions.

Make. Hack. Learn. Share. Repeat.
