# AERODROME graphics plan

<!-- AERODROME :: docs/GRAPHICS-PLAN.md :: v1.10.0 -->

A plan for making the picture both correct and worth looking at. Written after
v1.5.1, against the code as it stands, with measurements rather than guesses.

## What is not up for negotiation

* 320 by 224, scaled by whole numbers, nearest neighbour.
* 64 colors on screen drawn from a 512 color space, four banks of sixteen.
* Flat shaded convex polygons. No textures, no smooth shading, no blending.
* Ordered dithering wherever a blend would be wanted.
* Sprite cells with a per scanline budget that visibly drops sprites.
* Zero dependencies, no build step, runs from `file://`.

## The distinction this plan rests on

The Genesis constraint is a constraint on the **output**: what a frame is
allowed to contain. It has never been a constraint on the **method** used to
produce that frame. We already use IEEE doubles for the flight model, a
quaternion for attitude and a convex hull for the shadow, none of which a
Genesis could do, because none of them are visible in the frame.

Sorting is the same kind of thing. Painter order is not a look. It is an
implementation, and right now it is the implementation responsible for most of
what is wrong with the picture.

## Part 1 - Correctness

Everything here is a defect, not an enhancement.

**Status after v1.10.0: all of Part 1 is done.**

### 1.1 There is no depth buffer - DONE in v1.6.0

The renderer sorts whole faces by a key of 0.6 of the nearest vertex depth
plus 0.4 of the centroid, draws them back to front, and hopes. Sprites are not
sorted at all: `W.emitSprites` runs after `G.flushQueue`, so every tree, bird
and car is painted over the finished 3D scene with no depth test whatsoever.

What that produces, all of it visible in the current build:

* a tree standing in front of the hill it is actually behind
* a tree painted over the aircraft in chase view
* sprites drawn across the cockpit interior
* large polygons swapping over each other as you fly past
* runway markings that need an explicit sort bias to stay on the runway
* a contact shadow that needs another bias to stay on the ground
* build time subdivision of the town and the bridge, added in v1.2 purely to
  make the sorting error smaller

**The fix is a depth buffer.** A `Float32Array` of 320 by 224 is 71,680
entries. Interpolate reciprocal depth across each span, test, write.

Measured on this machine, in the same JavaScript the simulator runs in:

| Operation | Cost |
| --- | --- |
| One full screen flat fill, current rasterizer | 0.194 ms |
| One full screen fill with depth interpolation, test and write | 0.107 ms |
| Clearing the whole depth buffer | 0.007 ms |

The depth tested loop is *faster* than the current one, because the current
one carries per scanline edge setup and dither branches that dominate the
per-pixel work. At a typical three screens of overdraw, depth costs well under
half a millisecond a frame against a 16 ms budget, and the current frame costs
three to four.

Depth is free. It has been free the whole time.

What it lets us delete: both sort biases, the special case that keeps the
shadow down, the near-distance mesh subdivision, and the entire class of bug
where the answer depends on submission order.

What it lets us add: sprites that go behind hills, a cockpit that occludes the
world properly, and geometry that can safely interpenetrate.

**Assertions:** a small near quad occludes a large far one submitted after it;
a sprite behind a hill draws no pixels; the cockpit interior occludes every
outside pixel it covers; a scene renders identically whatever order its faces
are submitted in. That last one is the real prize, and it is not currently
true of anything.

**What shipped.** An inverse depth buffer, one float a pixel, cleared to zero.
Reciprocal depth interpolated across each scanline between the two edge
crossings. Sprites test a single depth at their anchor. Both sort biases
replaced by a small lift in depth, which is what they were trying to be. The
build time subdivision retired: face count near the field went from about
2,080 to 929, and the frame stayed at three milliseconds. The order
independence assertion passes, so the prize is collected.

### 1.2 Sprites become depth tested

Once there is a depth buffer, a sprite cell tests against a single depth taken
at its anchor. That is one compare per pixel and it fixes trees in front of
hills, birds inside the aircraft, and cars visible through the ridge.

Sprites keep the per scanline budget and keep flickering when it is exceeded,
because that is output, and output is period.

### 1.3 The cockpit becomes geometry - DONE in v1.10.0

Today the canopy frame and the panel are drawn in screen space after
everything else, which is why they cannot be flown around and why head look
does not move them relative to the view. Once there is depth, the cockpit
interior becomes part of the aircraft mesh: coaming, frame members, side
rails, the wing root where you would actually see it.

That gives real parallax when you look around, correct occlusion of everything
outside, and a per aircraft interior that is data rather than a cut polygon.

The instrument faces stay in screen space, because instruments are read, not
inhabited.

**What shipped, and how the re-authoring problem went away.** The interior is
generated from a nine number spec measured from the eye: cabin half width,
sill, roof, nose, coaming, bulkhead, post thickness, post offset, and two
materials. Ten of the twelve aircraft override some of it, so the warbird has
an open cockpit with high sills, the glider has thin posts and a lot of glass,
the balloon has a basket, and the helicopter has a bubble. Nobody had to
author twelve cockpits: the defaults are an aeroplane and the overrides are
what makes each one itself.

The instrument panel stayed in screen space, and that turned out to be right
rather than a compromise. A panel a metre from your eye is a plane, and under
a small head rotation a plane slides across the view. Sliding it is both the
cheap answer and the correct one.

**The original reasoning, kept because it was wrong in an instructive way.** The twelve panels are
authored in screen space as polygon outlines in framebuffer coordinates, with
gauge positions in pixels. Turning that into interior geometry is not a
renderer change, it is re-authoring twelve cockpits in three dimensions and
keeping the instruments lined up with the hole they sit in. That is a
milestone of its own and it should be planned as one rather than smuggled in
at the end of another. Nothing paints over the cockpit today, because it is
drawn last with depth off, so this is a realism item and not a correctness
one.

## Part 2 - Terrain that looks like land

**Status after v1.7.0: 2.1, 2.2, 2.3, 2.4 and 2.6 are done. 2.5 is done as
terrain materials rather than as separate geometry, which turned out to be
both cheaper and better.**

Current terrain is one noise field, three materials, and uniform tiles. It
reads as a green sheet with a bump on it.

### 2.1 Material by slope and altitude

Grass on shallow ground, meadow in the flats, scree on steep slopes, rock on
the steepest, sand along the riverbank, and a snow line on the ridge in
winter light. Chosen per face from the normal and the height, which the world
already computes.

This is the single largest visual return per line of code in the whole plan.

### 2.2 Level of detail with skirts

Two fixed bands today, which is why there is a visible seam. Replace with
three or four bands sized by distance, each tile carrying a downward skirt at
its edges so a crack between bands is never a hole into the sky.

### 2.3 A landform with history

The heightfield is fractal noise, which is why it has no drainage. One cheap
flow accumulation pass at build time carves gullies that run downhill and join,
which is what makes a valley read as a valley. Done once, cached, costs
nothing at runtime.

Add a lake basin, a plateau above the ridge and a saddle worth flying through.

### 2.4 Cliffs

Where the slope exceeds a threshold, emit a rock face rather than a stretched
grass one. Cliffs give a silhouette, and silhouette is most of what you see
from the air.

### 2.5 Fields and hedgerows

Agricultural patches near the town as tinted quads on a grid at an angle to
the terrain grid, separated by hedgerow sprite lines. Farmland is the most
recognisable thing you can put under a light aircraft.

### 2.6 Water with a shore

A dithered shallow band along the bank, a distinct shoreline, and a specular
glint band on the water in the direction of the sun. Water is currently a flat
blue quad, which is why it reads as a hole rather than a surface.

## Part 3 - Things to look at

**Status after v1.8.0: 3.1, 3.2 and 3.4 are done. 3.3, the world with things
happening in it, is not: the movers still run their original three paths.**

Variety is what makes a valley feel like a place. The current world has six
structure types and four sprite cells.

### 3.1 Structures

Barn, silo, water tower, church with a spire, radio mast with a blinking lamp,
power line runs with catenary wires between poles, fences, a dam, a quarry, a
railway with its own bridge, a second grass strip, parked aircraft on the
apron, a control caravan, a car park.

All of it is data in the world file, and all of it needs new entries in
`W.BUILDERS`.

### 3.2 Sprite cells

Conifer, dead tree, boulder, three bush variants, cow, sheep, deer, fence
post, road sign, hay bale, a wind turbine as spinning geometry rather than a
cell.

### 3.3 A world with things happening in it

Flocks that hold formation, cattle that wander a field, a train that runs the
line on a schedule, a tug taxiing on the apron, chimney smoke over the town.
The mover system already exists and takes a path and a speed; most of this is
new path types.

### 3.4 Clustering, which is why the ridge looks like static

The 420 scatter sprites are placed uniformly at random, so they read as
confetti rather than as woodland. Place them by a density field: woods where
the noise is high, clearings where it is low, none above the tree line, more
along watercourses. Same sprite count, completely different picture.

## Part 4 - Light and air

**Status after v1.9.0: all four are done.**

### 4.1 Terrain shadowing

The sun already has a position through the day. A cheap horizon angle per tile,
computed at build time for eight sun azimuths, gives hillsides that fall into
shadow when the sun is behind the ridge. One byte per tile per azimuth.

### 4.2 Cloud shadows

A scrolling noise field that darkens a terrain face by one ramp step. Cheap,
and it is what makes an aerial view read as weather rather than as a diagram.

### 4.3 Sun glare and water glint

A brightening toward the sun in the sky plane, and a glint band on water where
the reflection angle lines up. Both are dither, both are free.

### 4.4 Height haze

Distance haze exists. Add a thin haze layer near the ground so the valley
floor washes out slightly at distance while the ridge tops stay sharp, which
is what real air does.

## Part 5 - The palette is the binding constraint

This is the part that is easy to miss, so it goes in its own section.

Geometry is cheap and colors are not. The world bank is sixteen entries and
fourteen of them are spent:

    grass 6, rock 3, water 2, tarmac 2, mark 1, shadow 1

Every new material in Part 2 wants entries that do not exist. Scree, sand,
snow, crop green, crop gold, ploughed earth, hedgerow, shoreline: that is
eight more in a bank with two free.

Three ways out, and we have to choose one before Part 2 starts:

1. **Re-budget the banks.** The craft bank has sixteen and the panel bank has
   fifteen in use. Some of that can move. Cheapest option, smallest gain.
2. **Swap the world bank by region.** A palette per area of the map, changed as
   you fly between them, which is exactly what a Genesis game did between
   levels. Gains a lot; needs a rule for the transition so it does not snap in
   front of you. A dither crossfade over half a second would do it.
3. **Spend the sky bank harder.** The sky is eight entries plus three cloud,
   three sun and a star. In a daylight scene that is generous.

Recommendation: option 1 now for the four highest value materials, option 2
when Part 2 lands properly. Both keep the 64 entry ceiling, which is the rule
that actually matters and is already asserted.

**What was decided, in v1.7.0: option 1, and it paid for two entries rather
than four.** Grass gave one back, because two of its six shades landed on the
same nine bit color and one of them was decoration. The shadow gave one back
by sharing the darkest grass rather than owning a slot. That bought sand and
crop.

The rest came free, from a `bias` field on the material rather than a new
palette entry: scree is the rock ramp read high, hedgerow is the grass ramp
read low, ploughed earth is the rock ramp read low, meadow is the grass ramp
read high. Four materials, no entries. There is now an assertion that no two
world entries are the same color, so the trick that paid for this cannot be
undone by accident.

Snow still has nowhere to live, and that is what option 2 is for.

## Sequencing

**Phase A - Depth.** SHIPPED. The z-buffer, sprite occlusion and the deletion
of every sorting workaround in v1.6.0; the cockpit interior in v1.10.0.

**Phase B - Land.** SHIPPED in v1.7.0. Slope and altitude materials, LOD
skirts, cliffs by slope, the flow accumulation pass, sand shorelines and
farmland. Snow waits on the palette decision in Part 5.

**Phase C - Populate.** SHIPPED in v1.8.0, except the living world in 3.3.
Seven new structure types, six new sprite cells, and scatter placed by a
density field with a tree line, so the ridge grows woods rather than confetti.

**Phase D - Air.** SHIPPED in v1.9.0. Terrain shadowing from an eight
direction skyline map, drifting cloud shade, sun glare, water glint and height
haze.

The plan is complete except for the living world in 3.3, which is content
rather than rendering.

Then back to Trim and Fingertips, which are still the right next milestones
for everything that is not the picture.

## How we will know it worked

* **Frame budget.** Three to four milliseconds headless today. The target is
  under eight with everything in this plan switched on, at 320 by 224. Measured
  every phase, in the same scenes.
* **Scenes.** `tools/screenshot.js` grows a scene per feature. Every phase
  ships with pictures, because every graphics bug found so far was invisible in
  the numbers and obvious in a frame.
* **Assertions.** Each phase adds its own. The palette ceiling, the 512 space
  and the whole number scaling assertions already guard the rules that must not
  break, and they stay green throughout or the phase is not done.
* **The order independence test.** When a scene renders identically regardless
  of submission order, Phase A is finished. Not before.

Make. Hack. Learn. Share. Repeat.
