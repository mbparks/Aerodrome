# The AERODROME world file

<!-- AERODROME :: docs/world-format.md :: v1.8.0 -->

A world file is one JSON object describing a place to fly. The valley that
ships in the box is not special: it is `W.STOCK` in `src/07-world.js`, which is
the same shape as anything you write.

Export the current world from the Data drawer, edit it in any text editor, load
it back. A loaded world is saved with your settings and comes back next time.

## Validation

Every field is checked on the way in, exactly the way the settings file is:

* the file must have `"world": "AERODROME"` and a numeric `schema`
* a `schema` higher than this build reads is refused rather than guessed at
* unknown structure types are dropped, not built
* unknown mover kinds are dropped
* every number is clamped to a sane range instead of being trusted
* anything missing falls back to the stock value

Nothing in a world file is ever evaluated, and the interface builds every
element with `textContent`, so a world file cannot become markup or code.

## Shape

    {
      "world": "AERODROME",
      "schema": 1,
      "name": "LONG MEADOW VALLEY",

      "terrain": {
        "floor": 42,              metres above sea level for the valley floor
        "ridgeX": -1650,          the soaring ridge, running north to south
        "ridgeH": 400,            its height above the floor
        "ridgeW": 620,            its half width, larger is a gentler hill
        "shoulderX": 2600,        a second rise to the east
        "shoulderH": 180,
        "shoulderW": 1100,
        "riverBase": 430,         the river wanders around this x
        "riverAmpA": 210,         first meander, amplitude and period
        "riverPeriodA": 900,
        "riverAmpB": 70,          second meander, for a less regular line
        "riverPeriodB": 310,
        "coarseAmp": 46,          large scale noise on the landform
        "fineAmp": 9,             small scale noise
        "waterDrop": 3.4,         water sits this far below the floor
        "channelDepth": 7,        how deeply the river is cut
        "channelHalfWidth": 78
      },

      "runway": {
        "x": 0, "z": 0,
        "halfLen": 500,           so a 1000 metre runway
        "halfWid": 17,
        "elev": 42,
        "headingDeg": 0
      },

      "field": { "halfX": 260, "halfZ": 740 },

      "town":    { "x": 1150, "z": 520, "r": 420, "count": 34, "seed": 8171 },
      "scatter": { "count": 420, "seed": 5150, "spread": 5200, "birds": 14 },

      "structures": [ ... ],
      "views":      [ ... ],
      "movers":     [ ... ]
    }

The town and the scatter are seeds, not lists. Change the seed and you get a
different town of the same character, which is a lot less typing than placing
thirty four buildings by hand.

## Structures

Thirteen types. Anything else is dropped.

| Type | Fields | Notes |
| --- | --- | --- |
| `hangar` | `x`, `z`, `rotDeg` | |
| `tower` | `x`, `z`, `beacon` | `beacon` lights a rotating lamp at night |
| `sock` | `x`, `z` | the windsock, which reads the actual wind |
| `bridge` | `z` | finds its own x by following the river |
| `ring` | `x`, `z`, `radius`, `tiltDeg` | the things worth flying through |
| `block` | `x`, `z`, `w`, `h`, `d`, `mat` | `mat` is `hull`, `rock` or `accent` |
| `barn` | `x`, `z`, `rotDeg` | pitched roof, big door |
| `silo` | `x`, `z` | put two next to a barn |
| `watertower` | `x`, `z` | legs and a tank, visible for miles |
| `church` | `x`, `z`, `rotDeg` | the spire is the landmark |
| `mast` | `x`, `z`, `height` | carries a lamp at night |
| `powerline` | `x`, `z`, `rotDeg`, `count`, `span` | poles with sagging wires between them |
| `fence` | `x`, `z`, `rotDeg`, `length` | follows the ground it crosses |

## Camera sites

    "views": [
      { "name": "TOWER", "x": -70, "z": 120, "height": 17 },
      { "name": "PAD",   "x": 46,  "z": -180, "height": 6 }
    ]

The tower camera picks whichever site is nearest the aircraft, with hysteresis
so it does not flip back and forth, and the View drawer can step through them
by hand. `height` is metres above the ground at that point.

## Movers

    "movers": [
      { "kind": "car",  "road": "field",  "speed": 11, "offset": 0 },
      { "kind": "boat", "road": "river",  "speed": 6,  "offset": 0.1 }
    ]

`kind` is `car` or `boat`. `road` is `field` for the loop around the apron,
`bridge` for the crossing, or `river` for the water. `offset` is where on the
loop the mover starts, from 0 to 1. Movers are sprite cells, so they cost the
per scanline sprite budget rather than the polygon budget, and they will
flicker out in a crowded view exactly like the trees do.

## Things a world file cannot do yet

* Move the airfield off the origin and have the runway markings follow. The
  runway honours `x` and `z`, but `headingDeg` is stored and not yet used.
* Change the material palette. Ramps are fixed in `src/01-palette.js`.
* Add new mesh shapes. The six structure types above are the vocabulary.
* Carry its own sprite cells. Trees are trees.

Make. Hack. Learn. Share. Repeat.
