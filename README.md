# AERODROME

<!-- AERODROME :: README.md :: v1.4.1 -->

A browser flight simulator that renders as if it were running on a Sega Genesis.
Software rasterizer, 320 by 224 framebuffer, 64 colors on screen drawn from a
512 color space, flat shaded convex polygons, ordered dithering instead of
blending, sprite cells that flicker when the scanline budget runs out, and FM
audio shaped like a YM2612 synthesized in WebAudio.

Twelve aircraft, one flight model, no special cases. A trainer, a warbird, a
jet, a sailplane, a hot air balloon, a blimp, a flying saucer, a helicopter,
an autogyro, an ornithopter, a paper airplane and a lifting body rocket all run
through the same integrator. What differs between them is data.

Version 1.4.1. License GPL-3.0.

New in 1.1, the Airmanship milestone: ground effect, propeller slipstream over
the tail, steerable wheels and differential braking, a surface wind gradient, a
real crash taxonomy, and engine starting as a procedure rather than a switch.

New in 1.2, the Optics milestone: true screen space clipping, a painter order
that leans on the nearest vertex, large static faces split at build time, a
contact shadow drawn as the aircraft's own silhouette, three sprite tiers by
distance, and a second dither pattern for soft edges.

New in 1.3, the Cabinet milestone: real operator feedback when the page is
served over http, a proper PSG attenuation and noise model, a second engine
voice per aircraft, doppler on the chase camera, and stall buffet and gear
rumble on the noise channel.

New in 1.4, the Field milestone: the valley is a validated data file rather
than code, night lighting on the runway and the town, an aerotow for the
sailplane, traffic on the roads and a boat on the river, and a tower camera
that frames the aircraft instead of staring past it.

1.4.1 is a cleanup and interface pass: the key legend, the quickbar and the
tuning drawer are all built from the aircraft you are actually flying.

The roadmap for what comes next is in `docs/ROADMAP.md`.

## Running it

Double click `index.html`. That is the whole install.

There is no build step, no package manager, no bundler, no CDN and no network
call at runtime. The page runs from `file://` exactly as it runs from a web
server. Chrome, Firefox, Safari and Edge all work. A gamepad is optional.

`tests.html` runs the same assertion suite the in application self test button
runs. Open it the same way.

## Unpacking the archive

If you received this as a zip, unpack it with a command line tool:

    unzip aerodrome-v1.0.0.zip

or use 7-Zip on Windows. Several graphical unzip tools silently skip folders
whose names begin with a dot, which means `.github/` will quietly go missing.
The simulator itself does not need that folder, but the repository does.

## Project tree

    index.html            the application shell and the script load order
    tests.html            the browser test harness
    LICENSE               the full GPL-3.0 text
    README.md             this file
    docs/blog-post.md     draft writeup for Gears of Resistance
    .github/workflows/    a syntax check that runs on push
    src/00-core.js        namespace, math, vectors, quaternions, noise, atmosphere
    src/01-palette.js     9 bit color space, four banks of sixteen, Bayer dithering
    src/02-raster.js      the framebuffer, polygon fill, sprite cells, bitmap font
    src/03-render.js      camera, painter sort, flat shading, sky and ground planes
    src/04-audio.js       four operator FM voices and a PSG style noise channel
    src/worklet/          the optional FM worklet, loaded only over http
    src/05-flight.js      the single integrator and every capability block
    src/06-aircraft.js    meshes, panels and the twelve parameter blocks
    src/07-world.js       terrain, airfield, town, bridge, rings and scatter
    src/08-weather.js     wind, gusts, turbulence, ridge lift, thermals, time of day
    src/09-camera.js      cockpit eye, spring damper chase, tower view
    src/10-instruments.js gauges, panels, canopy, HUD, debug overlay
    src/11-input.js       remappable keyboard, mouse and gamepad
    src/12-storage.js     local first persistence and the export file
    src/13-tests.js       the assertions
    src/14-ui.js          the HTML chrome around the viewport
    src/15-main.js        the loop that ties it together

### Load order

Files load in the numeric order of their names, as classic `<script>` tags.
That is deliberate. ES modules do not load from `file://` without a server, so
the project uses one global namespace, `AERO`, and each file attaches its own
section to it. There are no `import` or `export` statements anywhere, no
`fetch` of local files, and no Web Workers.

If you add a file, give it the next number, add the tag to `index.html` in the
right place, and add it to `tests.html` if the tests need it.

## The interface

The chrome around the viewport follows the aircraft rather than listing
everything the simulator can do:

* the key legend under the viewport is built per aircraft from the live
  bindings, so a balloon offers the burner and the vent and never mentions a
  throttle, and rebinding a key changes the legend
* the quickbar only shows a tow button on an aircraft that needs a tow and an
  engine button on an aircraft that has an engine, and the engine button reads
  cut, cranking or start depending on what the engine is doing
* the tuning drawer is grouped into sections, only shows the groups this
  airframe has, marks every value you have changed, and puts a stock button on
  each row so you can undo one number without resetting the aircraft
* the roster is a keyboard operable radio group, and its tags name what makes
  an airframe unusual rather than repeating wing and power on everything
* which drawers you had open is remembered

## Controls

Every action below is remappable in the Controls drawer. The map is saved
locally and travels inside the export file.

| Action | Default |
| --- | --- |
| Pitch | Up and Down arrows |
| Roll | Left and Right arrows |
| Rudder | Z and C |
| Throttle, or collective on a powered rotor | W and S |
| Burner (balloon) | Space |
| Vent (balloon) | X |
| Reaction thrust forward and back (saucer) | E and Q |
| Wheel brake | B |
| Gear | G |
| Flaps step | F |
| Airbrake or spoiler | H |
| Engine cut, then crank to restart | O |
| Call for a tow, then release it | T |
| Cycle camera | V |
| Snap view forward | N |
| Look around | I, J, K, L, or hold the right mouse button |
| Toggle HUD | U |
| Pause | P |
| Mute | M |
| Reset to the entry condition | R |

Chop the engine with O in the helicopter and it will autorotate. Press O again
and the starter cranks for a couple of seconds before the engine catches, and
it will not catch at all on a dry tank. The autogyro cannot stall, which is the
entire point of an autogyro.

On the ground, the rudder pedals steer the tailwheel or nosewheel at taxi
speed and the steering washes out as you accelerate. Hold the brake and the
pedals bias it left or right, which is how you turn a taildragger in its own
length. Brake friction is capped at what a tyre can do on dry pavement, so
standing on it harder past that point buys you nothing except a nose over.

## The roster

| Aircraft | Kind | Notes |
| --- | --- | --- |
| CADET 150 | Trainer | Forgiving. Start here. |
| STANCHION P-4 | Warbird | Torque roll and a heavy nose. |
| PICKET F-9 | Jet | Fast, and slow to change its mind. |
| LONG MEADOW | Sailplane | Ridge lift lives west of the field. |
| SLOW ARGUMENT | Balloon | Burner and vent. No steering, only altitude. |
| CIVIC PATIENCE | Blimp | Near neutral buoyancy plus a small engine. |
| PLATE 6 | Saucer | Reaction thrust in three axes. No wing at all. |
| DERRICK 12 | Helicopter | Collective, cyclic, pedals, autorotation. |
| PENNY FARTHING | Autogyro | Unpowered rotor, powered prop. |
| MAYFLY | Ornithopter | Lift comes from the beat cycle. |
| FOLDED NOTE | Paper airplane | Two grams and a lot of opinions. |
| PARABOLA X | Lifting body rocket | Boost, coast, then glide it home. |

## The world

The valley is a data file. `docs/world-format.md` describes it, the Data drawer
exports and imports it, and a loaded world is saved with your settings. Every
field is range checked on the way in: unknown structure types are dropped, out
of range numbers are clamped, and a file that is not an AERODROME world is
refused outright.

One valley ships in the box. A ridge to the west that works for soaring when the wind has any
west in it, a river, an airfield with a marked runway and a windsock that
actually reads the wind, a blocky town to the southeast, a bridge, and two
rings on the ridge line that exist purely to be flown through.

Weather is a mean wind vector plus a mean reverting gust process, terrain
turbulence, ridge lift with lee side sink, and thermal columns that follow the
sun. Time of day drives the sky ramp through the same 512 color space.

## Aerotow

The sailplane cannot take off on its own, so press T on the runway and a tug
rolls out ahead of it. The rope is a spring that pulls and never pushes, so it
goes slack when you climb above the tug and snatches when you fall behind. Hold
station, let it take you up, and press T again to release. Get badly out of
position and the weak link parts, which is exactly what a weak link is for.

## Your data

Everything is stored on your machine in `localStorage`. Nothing is transmitted.

The Data drawer exports one JSON file with a schema version in it: settings,
key bindings, aircraft tunings, saved airframes and the flight log. Import
validates the file field by field and refuses anything it does not recognize.
Nothing imported is ever evaluated, and the interface builds every element with
`textContent`, never `innerHTML`, so an imported string cannot become markup.

Saved airframes can be archived or deleted. Delete is a soft delete: the record
stays in the file with a timestamp and can be restored. Nothing is destroyed
except by the explicit Clear all local data button.

## Self test

The Diagnostics drawer has a self test button, and `tests.html` runs the same
suite. As of v1.4.1 it is 132 assertions, all passing, covering:

* the palette stays inside the 512 color space and never exceeds 64 entries
* index 0 of each bank is the transparency slot
* the sprite budget genuinely overflows and drops sprites
* heading, pitch and bank round trip through the quaternion
* the camera transform round trips world to view and back
* an unpowered glider in still air conserves energy (0.056 percent drift over
  30 seconds of simulated flight)
* all twelve aircraft settle from their documented entry conditions
* the runway is flat and the upwind slope produces ridge lift
* save and load survive a full round trip, and a foreign or newer file is
  refused rather than guessed at
* ground effect cuts induced drag near the surface and has faded a wingspan and
  a half up
* the slipstream keeps the elevator alive at a speed where the ailerons are not
* a steerable wheel turns the aircraft while taxiing, and differential braking
  bites toward the pedal and is symmetric
* the wind is genuinely weaker on short final than at altitude
* overspeed, gear overload and rotor strike each report as themselves
* a cut engine makes no thrust, starting takes time, and a dry tank refuses
* polygons are clipped to the screen rather than clamped, and an offscreen one
  is rejected outright
* a near polygon draws over a far one whichever order they were submitted in
* long faces are split at build time and every piece stays inside the original
* the near sprite tier is a doubled cell and the far tier is a speck
* the soft dither pattern averages to the level it was asked for
* the contact shadow is one convex silhouette that turns with the aircraft
* the PSG has sixteen attenuation steps of two decibels, the last one silent,
  and an arbitrary gain snaps onto a real step
* the three fixed noise rates descend and the fourth follows tone three
* the envelope opens within its attack, holds at sustain, and releases to
  silence
* an approaching aircraft rises in pitch, a departing one falls, and the shift
  is bounded well short of a sonic boom
* every aircraft names patches that exist, and nothing is fetched from file://
* the valley round trips through its own file format, and a foreign world, a
  newer schema, an unknown structure type and an absurd number are all refused
  or clamped rather than trusted
* nothing is lit at noon and the field lights up at night
* movers loop rather than running off the map, and the boat stays on the river
* a slack rope pulls with nothing, a stretched one pulls toward the tug, and
  tension is capped at the weak link
* the tower camera keeps the aircraft on screen at every range out to 1800 m
* every tunable belongs to a named group and no group is empty across the
  roster
* the key legend never advertises a control the aircraft does not have, and it
  follows a rebound key

## Known limitations

* **FM feedback depends on how you opened the page.** Served over http or
  https, `src/worklet/fm-processor.js` is loaded and operator 1 feedback is
  computed one sample at a time, properly. Opened from `file://`, nothing is
  fetched and the shadow oscillator approximation is used instead: close in
  character, slightly cleaner than the real thing on the bright patches. This
  is the only runtime fetch anywhere in the project and the simulator is fully
  playable without it.
* **The rasterizer is honest, not fast.** Every pixel goes through JavaScript.
  On a slow machine, the 320 by 240 mode and a crowded view over the town will
  cost frames. The frame budget readout in the Diagnostics drawer tells you
  where the time goes.
* **Sorting is painter order, weighted toward the nearest vertex.** Genuinely
  intersecting polygons still cannot be resolved, because painter order sorts
  whole faces. Splitting the large static geometry at build time makes this
  rare rather than impossible.
* **Subdivided geometry is only used inside 700 metres.** Past that the plain
  mesh is drawn, since the sorting errors are not visible and the faces are not
  worth the transform cost.
* **Ground effect is the classic empirical factor**, not a panel method. It is
  right in shape and about right in magnitude, which is what matters for the
  flare.
* **The flight model is a point mass with a stability derivative wing.** It is
  built to feel right and to be inspectable, not to be a certified aerodynamic
  prediction. Do not plan a real flight with it.
* **Tower camera sites are fixed points from the world file.** The camera
  picks the nearest one, smooths its aim and zooms to frame the aircraft, but
  it does not track along a dolly or choose a shot for dramatic effect.
* **No PWA layer in v1.0.** The application already works offline from
  `file://`, so a service worker would add moving parts without adding
  capability. If it ships later it will be additive only.
* **Gamepad rebinding is keyboard first.** The default pad map is sensible, but
  the rebinding capture in the Controls drawer listens for keys.
* **There are no touch flight controls.** The interface chrome is sized for
  touch, but flying still needs a keyboard or a gamepad. An on screen stick and
  throttle would be a real addition and is not in yet.
* **A few exported members exist for people reading the source rather than for
  the simulator itself**: `P.hex`, `R.FONT_W`, `F.advance` and friends. They
  are deliberate, not leftovers.

## Accessibility

Night is the default theme, with Day and High Contrast alternatives. Interface
chrome meets WCAG AA contrast in all three, and chrome is exempt from the 64
color rule on purpose since it is not part of the console illusion. Every
control is a real element, reachable by keyboard, with a restyled focus
outline. Primary controls are 44 pixels tall everywhere, and the small inline
controls grow to 44 pixels on a touch screen, where that rule is the one that
matters. The roster is a radio group that walks under the arrow keys. `prefers-reduced-motion` is honored on load: it
damps camera shake and turns off sprite flicker, and both stay switchable by
hand afterward.

## License

GPL-3.0

The full text is in `LICENSE`.

## Credits

Written by M.B. Parks, Green Shoe Garage. No vendored libraries, no frameworks,
no external assets. Geometry is procedural, sprite cells and the 4 by 6 bitmap
font are defined in source, audio is synthesized at runtime.

Make. Hack. Learn. Share. Repeat.
