# AERODROME roadmap

<!-- AERODROME :: docs/ROADMAP.md :: v1.5.1 -->

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

## v1.0.1 - Review pass (open)

Still open, because the hands on review has not happened yet. Whatever the
first real hours in the seat say about feel goes here, plus the About panel
feedback URL once the repository path is real.

## v1.6 - Trim

Input. It is the layer everything else is played through and the one that has
had the least attention. Small, and overdue.

* Gamepad rebinding that actually listens for the gamepad. The capture in the
  Controls drawer is keyboard only today, so the sensible default pad map is
  the only pad map anyone can have.
* Per axis dead zone, so a worn stick does not fly the aeroplane on its own.
* Per axis response curve, because a linear stick on a warbird is unflyable
  and a curved one is fine.
* Per axis inversion, saved with everything else.
* Multiple pads and hot plug: notice them, list them, let the person pick.
* Conflict detection when two actions land on the same key, shown in the
  Controls drawer rather than discovered in the air.
* Assertions: a captured pad binding round trips through the save file; dead
  zone maps rest to exactly zero and full deflection to exactly one; the
  response curve is monotone and passes through both ends unchanged; a
  duplicate binding is reported.

## v1.7 - Fingertips

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

## v1.8 - Frontal

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

## v1.9 - Logbook

Structure around the flying. Moved back from v1.5 because the groundwork below
is real work, not a footnote.

* Seed everything in the frame path first. The gust process and the camera
  shake both call `Math.random` today, so nothing is reproducible until they
  do not. This is the milestone's first task, not its last.
* Moved back once already. Do not move it back again without saying why.
* Deterministic replay from the input stream plus the seed. The integrator is
  already fixed step, so once the randomness is seeded this is close to free.
* Scoring for spot landings and the ring course, written into the flight log
  that already exists.
* Ghosts, and exportable recordings, so two people can compare runs without a
  server existing anywhere. Local first multiplayer, more or less.
* Assertions: a recorded flight replayed twice is bit identical; and a replay
  step still completes with `Math.random` replaced by a function that throws,
  which is the only honest way to prove the frame path is seeded.

## v1.10 - Cartography

A world editor, last, because a world is already a text file and the format is
documented. This is about making it pleasant, and about closing the loose ends
the format left behind.

* A map view with structures you can place and drag, and terrain parameters
  with a live preview.
* Honour `runway.headingDeg`, which is currently stored and ignored.
* More structure types, since six is a small vocabulary.
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
