# The Constraint Is the Feature: Building a Flight Simulator With 64 Colors

<!-- AERODROME :: docs/blog-post.md :: v1.0.0 -->

*Draft for Gears of Resistance*

I built a flight simulator that runs by double clicking a file. No installer,
no account, no launcher, no patcher, no shader cache, no 90 gigabyte download.
One HTML file, sixteen JavaScript files, and a folder you can read start to
finish in an afternoon. It is called AERODROME, it is GPL-3.0, and it renders
like a Sega Genesis because I told it to.

That last part is the whole story, so let me explain why a self imposed
limitation turned out to be the most productive engineering decision in the
project.

## Why a Genesis

Modern 3D is a negotiation with somebody else's stack. You want a triangle on
the screen, and you get a graphics API, a driver, a shader compiler, a texture
pipeline, an asset toolchain, and eleven layers you did not write and cannot
inspect. That is a fine trade when you are shipping a product. It is a bad
trade when the point is to understand the thing.

So I put the whole renderer inside a box I could hold: a 320 by 224
framebuffer of palette indices, 64 colors on screen chosen from a 512 color
space, four palettes of sixteen with index zero reserved for transparency, flat
shaded convex polygons only, and ordered dithering instead of alpha blending
because the hardware I am imitating could not blend. Sprites are 16 by 16 and
32 by 32 cells with a per scanline budget, and when the budget is exceeded the
sprites drop out and flicker, exactly as they did in 1992.

Every one of those constraints eliminated an entire category of decision.

No blending means no sort by transparency, no premultiplied alpha, no
half of the arguments about compositing. You want a haze on a distant ridge?
Dither between the polygon color and the horizon band. Two colors, a 4 by 4
Bayer matrix, done. It looks correct, it looks period, and it costs a compare.

Sixty four colors means the palette is a design document. When you have
sixteen million colors you have no palette, you have a color picker and a lot
of drift. When you have four banks of sixteen you have named ramps: sky, grass,
rock, water, hull, glass. Time of day is not a post processing pass, it is a
recomputation of the sky ramp. The entire day night cycle is one function that
returns quantized entries and an ambient scalar.

And a fixed framebuffer scaled by whole numbers with nearest neighbor sampling
means the picture is never soft, never smeared, never at the mercy of somebody's
upscaler. Every pixel I wrote is a pixel you see.

## Twelve aircraft, one integrator

The other rule I set was harder to keep. There is exactly one flight model, and
every aircraft is data fed into it.

The roster is a trainer, a warbird, a jet, a sailplane, a hot air balloon, a
blimp, a flying saucer, a helicopter, an autogyro, an ornithopter, a paper
airplane, and a lifting body rocket. Those things do not obviously share a
physics engine. A balloon has no wing. A saucer has no aerodynamics worth
speaking of. An ornithopter gets its lift from a beat cycle. The lazy version of
this project has a switch statement with twelve arms in it, and by the third
aircraft the arms have started lying to each other.

Instead there are capability blocks. An aircraft may declare a wing, a
propulsion unit, a buoyancy envelope, a rotor, a reaction thruster, or a
flapping mechanism, in any combination. The integrator runs at a fixed 1/240
second substep and asks only what capabilities are present. The autogyro
declares an unpowered rotor and a powered propeller and a small wing, and it
behaves like an autogyro without a single line that knows the word "autogyro."
The helicopter declares a powered rotor with cyclic control, and when you cut
the engine with the O key it autorotates, because rotor inertia and the
autorotation descent rate were already in the block.

This is not aesthetic purity. It is the reason I could add the ornithopter in
about twenty minutes, and it is the reason the self test can assert that all
twelve settle from their documented entry conditions using the same code path.

## The test that mattered most

Forty one assertions run in the browser and in CI. Most are what you would
expect: palette quantization stays inside the 512 space, index zero is
transparent everywhere, the sprite budget genuinely overflows, save and load
survive a round trip, a foreign settings file gets refused instead of guessed
at.

The one that earned its keep is energy conservation. Take a glider, delete drag
from its parameter block, put it in still air, and integrate for thirty
seconds. Kinetic plus potential energy should not move. Mine drifts by 0.056
percent, which is honest semi implicit Euler behavior and well inside where I
wanted it.

That assertion found two real bugs. The first was a sign convention error: my
Euler angle constructor was building a body forward axis pointing east while my
attitude readout measured heading from north, which meant every aircraft
politely flew itself into the terrain on the first frame. The second was
subtler and I would never have found it by flying. Bank angle was being measured
against the world vertical rather than about the nose axis, so at sixty degrees
of pitch the instrument was reporting nineteen degrees of bank that did not
exist. The attitude indicator looked plausible. It was wrong.

A simulator that looks plausible and is wrong is the failure mode of the whole
genre. That is what tests are for.

## Local first, still

Everything the application knows about you lives in your browser. Settings, key
bindings, aircraft tunings, saved airframes, flight log. The export is one JSON
file with a schema version. Import validates it field by field and drops
anything it does not recognize, and the interface builds every element with
textContent so an imported string can never become markup. Deleting a saved
airframe is a soft delete with a timestamp, because I have never once regretted
keeping a record and I have frequently regretted destroying one.

There is no telemetry. There is no network call at runtime, not one, not even
for a font. The 4 by 6 bitmap font is defined in the source.

## Go fly it

Clone it, unzip it, open index.html. Push the throttle with W. Take the CADET
150 off the runway, get some altitude, then switch to the sailplane and go find
the ridge west of the field, because the lift is real and the wind model knows
which side of the hill it is on.

Then open src/06-aircraft.js and change a number. That is the actual invitation.
The whole thing is legible on purpose. Owning your data and understanding your
tools is worth the learning curve, and a tool you can read all the way down is
a tool nobody can take away from you.

Make. Hack. Learn. Share. Repeat.
