# AERODROME

<!-- AERODROME :: README.md :: v1.0.0 -->

A browser flight simulator that renders as if it were running on a Sega Genesis.
Software rasterizer, 320 by 224 framebuffer, 64 colors on screen drawn from a
512 color space, flat shaded convex polygons, ordered dithering instead of
blending, sprite cells that flicker when the scanline budget runs out, and FM
audio shaped like a YM2612 synthesized in WebAudio.

Twelve aircraft, one flight model, no special cases. A trainer, a warbird, a
jet, a sailplane, a hot air balloon, a blimp, a flying saucer, a helicopter,
an autogyro, an ornithopter, a paper airplane and a lifting body rocket all run
through the same integrator. What differs between them is data.

Version 1.0.0. License GPL-3.0.

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
| Engine cut and restart | O |
| Cycle camera | V |
| Snap view forward | N |
| Look around | I, J, K, L, or hold the right mouse button |
| Toggle HUD | U |
| Pause | P |
| Mute | M |
| Reset to the entry condition | R |

Chop the engine with O in the helicopter and it will autorotate. The autogyro
cannot stall, which is the entire point of an autogyro.

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

One valley. A ridge to the west that works for soaring when the wind has any
west in it, a river, an airfield with a marked runway and a windsock that
actually reads the wind, a blocky town to the southeast, a bridge, and two
rings on the ridge line that exist purely to be flown through.

Weather is a mean wind vector plus a mean reverting gust process, terrain
turbulence, ridge lift with lee side sink, and thermal columns that follow the
sun. Time of day drives the sky ramp through the same 512 color space.

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
suite. As of v1.0.0 it is 41 assertions, all passing, covering:

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

## Known limitations

* **FM feedback is approximated.** WebAudio cannot close a tight per sample
  modulation loop without a worklet, and worklets need a network fetch of a
  module file, which this project does not do. Operator 1 feedback is emulated
  with a shadow oscillator. It sounds close to the real thing on the noisy
  patches and slightly cleaner than the real thing on the bright ones.
* **The rasterizer is honest, not fast.** Every pixel goes through JavaScript.
  On a slow machine, the 320 by 240 mode and a crowded view over the town will
  cost frames. The frame budget readout in the Diagnostics drawer tells you
  where the time goes.
* **Sorting is painter order by face centroid.** Large intersecting polygons
  can pop. This is period accurate and also a genuine limitation.
* **No clipping against the side of the screen in 3D.** Faces are clipped
  against the near plane only, then clamped in screen space. Extremely close
  geometry can distort.
* **The flight model is a point mass with a stability derivative wing.** It is
  built to feel right and to be inspectable, not to be a certified aerodynamic
  prediction. Do not plan a real flight with it.
* **The tower camera is basic.** It watches from the field and does not
  reposition for a proper flyby.
* **No PWA layer in v1.0.** The application already works offline from
  `file://`, so a service worker would add moving parts without adding
  capability. If it ships later it will be additive only.
* **Gamepad rebinding is keyboard first.** The default pad map is sensible, but
  the rebinding capture in the Controls drawer listens for keys.

## Accessibility

Night is the default theme, with Day and High Contrast alternatives. Interface
chrome meets WCAG AA contrast in all three, and chrome is exempt from the 64
color rule on purpose since it is not part of the console illusion. Every
control is a real element, reachable by keyboard, with a restyled focus outline
and a 44 pixel minimum target. `prefers-reduced-motion` is honored on load: it
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
