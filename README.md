# AERODROME

<!-- AERODROME :: README.md :: v1.11.0 -->

A browser flight simulator that renders as if it were running on a Sega Genesis.
Software rasterizer, 320 by 224 framebuffer, 64 colors on screen drawn from a
512 color space, flat shaded convex polygons, ordered dithering instead of
blending, sprite cells that flicker when the scanline budget runs out, and FM
audio shaped like a YM2612 synthesized in WebAudio.

Twelve aircraft, one flight model, no special cases. A trainer, a warbird, a
jet, a sailplane, a hot air balloon, a blimp, a flying saucer, a helicopter,
an autogyro, an ornithopter, a paper airplane and a lifting body rocket all run
through the same integrator. What differs between them is data.

Version 1.11.0. License GPL-3.0.

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

1.11.0 is the input pass: gamepad rebinding that listens for the gamepad,
dead zones, response curves, inversion, several pads, and conflict reporting.

1.10.0 makes the cockpit real geometry, so you can look around it.

1.9.0 is the light and the air: hillsides that fall into shadow when the sun
goes behind the ridge, cloud shadows drifting on the wind, glare around the
sun, glint on the water, and haze that thickens in the low ground.

1.8.0 puts things in the valley worth flying over: barns, silos, a church, a
water tower, a radio mast, power lines, fences, six new sprites, and woodland
that clusters into woods instead of confetti.

1.7.0 gives the valley drainage, farmland, shorelines and stone on the steep
ground, which is Phase B of the same plan.

1.6.0 gives the renderer a depth buffer, which is the first phase of
`docs/GRAPHICS-PLAN.md` and the end of a whole class of bug.

1.5.0 puts the whole flight deck on one screen and adds a fullscreen cockpit.

1.4.2 is a legibility pass on the picture itself: banded skies instead of
checkerboards, haze that suggests distance instead of shouting it, a palette
that follows the light, sprites that stand on the ground and are sized by how
far away they actually are, and a chase camera that keeps up with a jet.

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
    tools/run-tests.js    the assertion suite, headless
    tools/screenshot.js   renders a named scene to an image, headless

### Load order

Files load in the numeric order of their names, as classic `<script>` tags.
That is deliberate. ES modules do not load from `file://` without a server, so
the project uses one global namespace, `AERO`, and each file attaches its own
section to it. There are no `import` or `export` statements anywhere, no
`fetch` of local files, and no Web Workers.

If you add a file, give it the next number, add the tag to `index.html` in the
right place, and add it to `tests.html` if the tests need it.

## The interface

The flight deck is exactly one screen tall and never scrolls. The header, the
roster, the viewport, the quickbar and the key legend always fit the window,
whatever size it is, and the settings drawers live below the fold where you go
looking for them on purpose.

The framebuffer is only ever scaled by a whole number. The application
measures the space it has been given, picks the largest whole scale that fits,
and sizes the canvas to exactly that many pixels. Nothing is ever scaled by a
fraction, which is why the picture stays sharp at any window size. It keeps
measuring, too: a font arriving, a hint being dismissed or a drawer opening
all change the box, and none of them fire a resize event.

Whole pixel scaling can leave up to half a step of empty space, since three
times is three times and there is no such thing as three and a half. If you
would rather have the size, the View drawer has a Picture scaling setting:
Fill the space stretches the final blit to the room available. The rendering
is identical either way, only the last step to the screen changes.

Press Enter, or the Fullscreen button, and the viewport takes the whole
screen with nothing else on it. Escape comes back. The scale is recalculated
on the way in and on the way out, so fullscreen is a bigger picture rather
than a stretched one.

The rest of the chrome follows the aircraft rather than listing everything the
simulator can do:

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

Every action below is remappable in the Controls drawer, to a key or to the
gamepad. Press Key or Pad and then press what you want; Escape cancels. The
map is saved locally and travels inside the export file, and if two actions
end up on the same control the drawer says so rather than letting you find out
in the air.

Analogue axes have a dead zone, a response curve and an inversion, set per
axis. The dead zone is how far the stick moves before the aeroplane does, the
curve softens the middle of the travel without touching either end, and both
apply to the gamepad only, since a key is already either pressed or not. If
several pads are plugged in, the drawer lists them and you pick.

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
| Fullscreen cockpit | Enter |
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

The ground is made of what it is doing. Slope decides stone: shallow ground is
grass, steep is scree, steepest is rock. The waterline decides sand. A field
grid at an angle to the terrain grid decides farmland, with hedgerows on the
boundaries and a crop chosen per field, so the country around the town reads
as country.

The landform has drainage. Fractal noise on its own has none, which is why it
reads as lumps: water has nowhere to go. One flow accumulation pass at build
time routes every cell downhill into its lowest neighbour, and where a lot of
water passes, the ground is lower. Gullies join, because that is what flow
does. It is computed once, cached in a grid, and sampled bilinearly, so it
costs the flight model nothing.

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

## Depth

The renderer keeps an inverse depth buffer, one float per pixel, cleared to
zero every frame. Reciprocal depth is linear in screen space, so a scanline
interpolates it between the two edge crossings and each pixel is a compare and
a store. Sprites test against a single depth taken at their anchor.

It is not what the hardware did, and it is not visible in a frame. What is
visible is everything it fixed: trees that stood in front of the hills they
were on, sprites painted across the aircraft, polygons swapping as you flew
past. Measured, the depth path costs nothing against the old one, and retiring
the build time subdivision that existed to hide sorting errors halved the face
count near the field.

## Light

The valley has a skyline map. At build time, every cell of the coarse terrain
grid records how high the horizon stands in each of eight directions, and a
hillside is in shadow when the sun is lower than its own horizon. That is why
the east side of the ridge goes dark in the evening while the top is still
lit, instead of the whole valley simply dimming together.

Over the top of that, a field of cloud shade drifts with the wind, the water
glints where it would reflect the sun toward you, the sky brightens into a
dithered halo around the sun, and haze thickens in the low ground so the
valley floor washes out before the ridge line does.

None of it costs anything at runtime worth measuring: the skyline is eight
bytes a cell computed once over an array, and everything else is arithmetic on
a tile that was being drawn anyway.

## Looking at the picture

`tools/screenshot.js` renders a scene headless and writes a PPM, with no
dependencies and no browser:

    node tools/screenshot.js                 list the scenes
    node tools/screenshot.js ridge out.ppm   render one

Every graphics bug fixed in 1.4.2 was invisible in the numbers and obvious in a
frame: a canopy glare that sampled the wrong pixel and painted a black
rectangle across the sky, trees standing on six metre invisible stalks, sprites
tiered by how far ahead of the camera they were rather than how far away, and a
chase camera two hundred metres behind a jet. If you change the renderer, look
at a frame.

## Self test

The Diagnostics drawer has a self test button, and `tests.html` runs the same
suite. As of v1.11.0 it is 228 assertions, all passing, covering:

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
* sprite tiers are chosen by true distance, so a tree far below the aircraft is
  not drawn as a near one
* scatter sprites are anchored on the ground rather than floating above it
* the sky reads as bands rather than as static, and haze is capped well below a
  checkerboard
* dimming the palette never inverts a hue, and full daylight leaves it exactly
  as authored
* the canopy glare never paints white over the sky
* the HUD horizon shows sky over ground
* the framebuffer is only ever scaled by a whole number, the result always
  fits the box it was given, and it is the largest scale that does
* fill mode stays inside the box, does not distort the picture, and is never
  smaller than whole pixel mode
* the nearer polygon wins the pixel, and the frame is identical whichever
  order the faces were submitted in
* a sprite behind a wall draws nothing and a sprite in front of one draws
* a marking lifted in depth survives the surface it is painted on
* every land material exists and names a real ramp, and no two world palette
  entries are the same color
* the river bed is water, the bank is sand, and steep ground shows stone
* there are fields around the town and none out on the ridge
* erosion never raises the ground, cuts deeper where water collects, and
  leaves the runway flat and the ridge high
* every structure type builds, every scattered sprite names a cell that
  exists, and nothing grows in the river or on the runway
* the scatter is clustered rather than sprinkled, measured against what pure
  chance would give
* the cattle are in their fields
* the lee of the ridge falls into shadow before the top does, and after sunset
  nothing is lit
* cloud shade stays in range, varies across the ground, drifts with the wind
  and is the same field every time it is asked
* the low ground hazes out before the high ground does
* glare brightens the sky around the sun without leaving the sky ramp
* every aircraft has an interior and none of it is inside the pilot, an open
  cockpit has nothing over your head and a closed one has a roof
* the cockpit hides part of the world behind it
* an edge on sliver at arm reach is not drawn, but thin geometry further out
  still is
* the panel covers the bottom of the screen, and still covers it when head
  look slides it
* rest maps to exactly zero and full deflection to exactly one, the response
  curve is monotone at every setting, and inversion flips the sign and nothing
  else
* stick response survives a save and load, and absurd values are clamped
* a pad binding survives a save and load, direction and all
* the stock map has no conflicts in it, and two actions on one control are
  reported

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
* **Nine bit color has eight levels a channel, and dimming can flatten a
  hue.** The palette darkens by shifting levels rather than by multiplying, so
  hues never invert, but a colour that is already dim has nowhere left to go
  and can go grey at dusk. That is the hardware, not a bug.
* **The instrument panel is still screen space, on purpose.** The structure
  around it, coaming, posts, roof, sills and the bulkhead behind you, is real
  geometry in the depth pass. The panel itself is a flat plane about a metre
  in front of the eye, and under a small head rotation such a plane simply
  slides across the view, so sliding it is both the cheap answer and the
  correct one. Instruments are read, not inhabited.
* **Ground effect is the classic empirical factor**, not a panel method. It is
  right in shape and about right in magnitude, which is what matters for the
  flare.
* **The flight model is a point mass with a stability derivative wing.** It is
  built to feel right and to be inspectable, not to be a certified aerodynamic
  prediction. Do not plan a real flight with it.
* **Tower camera sites are fixed points from the world file.** The camera
  picks the nearest one, smooths its aim and zooms to frame the aircraft, but
  it does not track along a dolly or choose a shot for dramatic effect.
* **No PWA layer.** The application already works offline from `file://`, so a
  service worker would add moving parts without adding capability. Deferred
  rather than declined, and additive only if it ships.
* **The gust process and the camera shake call `Math.random` directly.** No two
  flights are alike, which is fine until replay exists. Seeding them is the
  first task of the Logbook milestone rather than an afterthought inside it.
* **Gamepad rebinding is keyboard first.** The default pad map is sensible, but
  the rebinding capture in the Controls drawer listens for keys. This is the
  next milestone.
* **There are no touch flight controls.** The interface chrome is sized for
  touch, but flying still needs a keyboard or a gamepad. An on screen stick and
  throttle is the milestone after that.
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
