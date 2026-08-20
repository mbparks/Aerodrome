// AERODROME :: src/02-raster.js :: v1.8.0
// Software rasterizer writing palette indices into a fixed framebuffer.
// Depends on 00-core.js, 01-palette.js.
// GPL-3.0
(function (root) {
  'use strict';
  var AERO = root.AERO = root.AERO || {};
  var P = AERO.palette;

  var R = AERO.raster = {};

  R.W = 320;
  R.H = 224;
  R.buf = new Uint8Array(320 * 240);
  R.spriteLoad = new Uint8Array(240);   // sprites already committed per scanline
  R.SPRITES_PER_LINE = 16;              // hardware style budget, overflow flickers
  R.flickerEnabled = true;
  R.overflowCount = 0;

  // ------------------------------------------------------------- depth
  // Inverse depth, one float a pixel. Larger is nearer, so the buffer clears
  // to zero and anything in front of the sky passes. Reciprocal depth is
  // linear in screen space, which is why a scanline can interpolate it.
  R.zbuf = new Float32Array(1);
  R.depthEnabled = true;

  R.setSize = function (w, h) {
    R.W = w; R.H = h;
    if (R.buf.length < w * h) { R.buf = new Uint8Array(w * h); }
    if (R.zbuf.length < w * h) { R.zbuf = new Float32Array(w * h); }
  };

  R.clear = function (idx) {
    var n = R.W * R.H;
    R.buf.fill(idx || 0, 0, n);
    R.spriteLoad.fill(0, 0, R.H);
    R.overflowCount = 0;
  };

  R.clearDepth = function () {
    R.zbuf.fill(0, 0, R.W * R.H);
  };

  // A span with depth. iz runs from iz0 at x0 to iz1 at x1.
  R.hlineZ = function (y, x0, x1, idx, iz0, iz1, ditherB, ditherT, pattern) {
    if (y < 0 || y >= R.H) { return; }
    if (x1 < x0) { var t = x0; x0 = x1; x1 = t; var ti = iz0; iz0 = iz1; iz1 = ti; }
    var span = x1 - x0;
    var step = (span > 0) ? (iz1 - iz0) / span : 0;
    if (x0 < 0) { iz0 += step * -x0; x0 = 0; }
    if (x1 >= R.W) { x1 = R.W - 1; }
    var base = y * R.W;
    var iz = iz0;
    var dithered = (ditherB !== undefined && ditherB !== null);
    for (var x = x0; x <= x1; x++, iz += step) {
      var i = base + x;
      if (iz > R.zbuf[i]) {
        R.zbuf[i] = iz;
        R.buf[i] = dithered
          ? P.ditherPick(idx, ditherB, ditherT, x, y, pattern)
          : idx;
      }
    }
  };

  R.px = function (x, y, idx) {
    if (x < 0 || y < 0 || x >= R.W || y >= R.H) { return; }
    R.buf[y * R.W + x] = idx;
  };

  R.get = function (x, y) {
    if (x < 0 || y < 0 || x >= R.W || y >= R.H) { return 0; }
    return R.buf[y * R.W + x];
  };

  R.hline = function (y, x0, x1, idx) {
    if (y < 0 || y >= R.H) { return; }
    if (x1 < x0) { var t = x0; x0 = x1; x1 = t; }
    if (x1 < 0 || x0 >= R.W) { return; }
    if (x0 < 0) { x0 = 0; }
    if (x1 >= R.W) { x1 = R.W - 1; }
    var base = y * R.W;
    for (var x = x0; x <= x1; x++) { R.buf[base + x] = idx; }
  };

  R.hlineDither = function (y, x0, x1, idxA, idxB, t, pattern) {
    if (y < 0 || y >= R.H) { return; }
    if (x1 < x0) { var s = x0; x0 = x1; x1 = s; }
    if (x0 < 0) { x0 = 0; }
    if (x1 >= R.W) { x1 = R.W - 1; }
    var base = y * R.W;
    for (var x = x0; x <= x1; x++) {
      R.buf[base + x] = P.ditherPick(idxA, idxB, t, x, y, pattern);
    }
  };

  R.vline = function (x, y0, y1, idx) {
    if (x < 0 || x >= R.W) { return; }
    if (y1 < y0) { var t = y0; y0 = y1; y1 = t; }
    if (y0 < 0) { y0 = 0; }
    if (y1 >= R.H) { y1 = R.H - 1; }
    for (var y = y0; y <= y1; y++) { R.buf[y * R.W + x] = idx; }
  };

  R.line = function (x0, y0, x1, y1, idx) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    var dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    var err = dx + dy, guard = 0;
    while (guard++ < 4096) {
      R.px(x0, y0, idx);
      if (x0 === x1 && y0 === y1) { break; }
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };

  R.rect = function (x, y, w, h, idx) {
    for (var j = 0; j < h; j++) { R.hline(y + j, x, x + w - 1, idx); }
  };

  R.frame = function (x, y, w, h, idx) {
    R.hline(y, x, x + w - 1, idx);
    R.hline(y + h - 1, x, x + w - 1, idx);
    R.vline(x, y, y + h - 1, idx);
    R.vline(x + w - 1, y, y + h - 1, idx);
  };

  R.circle = function (cx, cy, r, idx, filled) {
    var x = r, y = 0, err = 1 - r;
    while (x >= y) {
      if (filled) {
        R.hline(cy + y, cx - x, cx + x, idx);
        R.hline(cy - y, cx - x, cx + x, idx);
        R.hline(cy + x, cx - y, cx + y, idx);
        R.hline(cy - x, cx - y, cx + y, idx);
      } else {
        R.px(cx + x, cy + y, idx); R.px(cx - x, cy + y, idx);
        R.px(cx + x, cy - y, idx); R.px(cx - x, cy - y, idx);
        R.px(cx + y, cy + x, idx); R.px(cx - y, cy + x, idx);
        R.px(cx + y, cy - x, idx); R.px(cx - y, cy - x, idx);
      }
      y++;
      if (err < 0) { err += 2 * y + 1; } else { x--; err += 2 * (y - x) + 1; }
    }
  };

  // --------------------------------------------------------- polygon filling
  // Convex polygons only, flat shaded, no z buffer. Painter order is the
  // caller's problem, exactly as it was on the hardware.
  var xs = new Float32Array(16);
  var izs = new Float32Array(16);   // inverse depth at each edge crossing

  R.fillPoly = function (pts, idx, ditherB, ditherT, pattern) {
    var n = pts.length;
    if (n < 3) { return; }
    // Depth is used when the caller supplied it and the buffer is on.
    var depth = R.depthEnabled && (pts[0].iz !== undefined);
    var ymin = 1e9, ymax = -1e9, i;
    for (i = 0; i < n; i++) {
      if (pts[i].y < ymin) { ymin = pts[i].y; }
      if (pts[i].y > ymax) { ymax = pts[i].y; }
    }
    var y0 = Math.max(0, Math.ceil(ymin));
    var y1 = Math.min(R.H - 1, Math.floor(ymax));
    if (y1 < y0) { return; }
    for (var y = y0; y <= y1; y++) {
      var count = 0;
      var sy = y + 0.5;
      for (i = 0; i < n; i++) {
        var a = pts[i], b = pts[(i + 1) % n];
        var ay = a.y, by = b.y;
        if ((ay <= sy && by > sy) || (by <= sy && ay > sy)) {
          var t = (sy - ay) / (by - ay);
          if (count < 16) {
            if (depth) { izs[count] = a.iz + (b.iz - a.iz) * t; }
            xs[count++] = a.x + (b.x - a.x) * t;
          }
        }
      }
      if (count < 2) { continue; }
      var lo = xs[0], hi = xs[0], loI = 0, hiI = 0;
      for (i = 1; i < count; i++) {
        if (xs[i] < lo) { lo = xs[i]; loI = i; }
        if (xs[i] > hi) { hi = xs[i]; hiI = i; }
      }
      var px0 = Math.ceil(lo - 0.5), px1 = Math.floor(hi - 0.5);
      if (px1 < px0) { px1 = px0; }
      if (!depth) {
        if (ditherB === undefined || ditherB === null) {
          R.hline(y, px0, px1, idx);
        } else {
          R.hlineDither(y, px0, px1, idx, ditherB, ditherT, pattern);
        }
      } else {
        // Interpolate inverse depth to the ends of the span, then across it.
        var izLo = izs[loI], izHi = izs[hiI];
        var wide = hi - lo;
        var f0 = (wide > 0) ? (px0 + 0.5 - lo) / wide : 0;
        var f1 = (wide > 0) ? (px1 + 0.5 - lo) / wide : 0;
        R.hlineZ(y, px0, px1, idx,
          izLo + (izHi - izLo) * f0, izLo + (izHi - izLo) * f1,
          ditherB, ditherT, pattern);
      }
    }
  };

  R.polyOutline = function (pts, idx) {
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      R.line(a.x, a.y, b.x, b.y, idx);
    }
  };

  // ------------------------------------------------------------------ cells
  // Sprite cells are hand defined as character maps. '.' is transparent, the
  // digits index into the cell's own color list. Horizontal flip only, no
  // rotation, which is what the hardware offered.
  R.cells = {};

  R.defineCell = function (name, rows, colors) {
    var h = rows.length, w = rows[0].length;
    var data = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ch = rows[y][x];
        data[y * w + x] = (ch === '.' || ch === ' ') ? 0 : colors[parseInt(ch, 16)] || 0;
      }
    }
    R.cells[name] = { w: w, h: h, data: data };
    return R.cells[name];
  };

  // Returns false when the scanline budget rejected the sprite.
  R.drawCell = function (name, x, y, flipH, tintShift, iz) {
    var c = R.cells[name];
    if (!c) { return false; }
    var test = R.depthEnabled && (iz !== undefined);
    x = Math.round(x); y = Math.round(y);
    if (x + c.w < 0 || x >= R.W || y + c.h < 0 || y >= R.H) { return false; }
    // Budget check first. A sprite is accepted or dropped whole, per line.
    var accepted = true;
    for (var sy = 0; sy < c.h; sy++) {
      var ly = y + sy;
      if (ly < 0 || ly >= R.H) { continue; }
      if (R.spriteLoad[ly] >= R.SPRITES_PER_LINE) { accepted = false; break; }
    }
    if (!accepted) {
      R.overflowCount++;
      if (R.flickerEnabled) { return false; }
      return false;
    }
    for (var yy = 0; yy < c.h; yy++) {
      var py = y + yy;
      if (py < 0 || py >= R.H) { continue; }
      R.spriteLoad[py]++;
      var base = py * R.W;
      for (var xx = 0; xx < c.w; xx++) {
        var src = c.data[yy * c.w + (flipH ? (c.w - 1 - xx) : xx)];
        if (src === 0) { continue; }
        var px = x + xx;
        if (px < 0 || px >= R.W) { continue; }
        var i = base + px;
        if (test && iz <= R.zbuf[i]) { continue; }
        if (test) { R.zbuf[i] = iz; }
        R.buf[i] = tintShift ? (src + tintShift) : src;
      }
    }
    return true;
  };

  // A cell drawn at an integer scale. Sprite hardware of this era doubled
  // cells rather than filtering them, so scale 2 is pixel replication and
  // nothing else. Still one sprite per scanline against the budget.
  R.drawCellScaled = function (name, x, y, flipH, scale, tintShift, iz) {
    scale = Math.max(1, Math.round(scale || 1));
    if (scale === 1) { return R.drawCell(name, x, y, flipH, tintShift, iz); }
    var c = R.cells[name];
    if (!c) { return false; }
    var test = R.depthEnabled && (iz !== undefined);
    x = Math.round(x); y = Math.round(y);
    var w = c.w * scale, h = c.h * scale;
    if (x + w < 0 || x >= R.W || y + h < 0 || y >= R.H) { return false; }
    var accepted = true;
    for (var sy = 0; sy < h; sy++) {
      var ly = y + sy;
      if (ly < 0 || ly >= R.H) { continue; }
      if (R.spriteLoad[ly] >= R.SPRITES_PER_LINE) { accepted = false; break; }
    }
    if (!accepted) { R.overflowCount++; return false; }
    for (var yy = 0; yy < h; yy++) {
      var py = y + yy;
      if (py < 0 || py >= R.H) { continue; }
      R.spriteLoad[py]++;
      var base = py * R.W;
      var srcRow = ((yy / scale) | 0) * c.w;
      for (var xx = 0; xx < w; xx++) {
        var sx = (xx / scale) | 0;
        var src = c.data[srcRow + (flipH ? (c.w - 1 - sx) : sx)];
        if (src === 0) { continue; }
        var px = x + xx;
        if (px < 0 || px >= R.W) { continue; }
        var si = base + px;
        if (test && iz <= R.zbuf[si]) { continue; }
        if (test) { R.zbuf[si] = iz; }
        R.buf[si] = tintShift ? (src + tintShift) : src;
      }
    }
    return true;
  };

  // The far tier. Past the distance where a cell is legible, a sprite is a
  // couple of pixels, which is what the hardware would have done anyway.
  R.drawSpeck = function (x, y, idx, size, iz) {
    x = Math.round(x); y = Math.round(y);
    size = Math.max(1, size | 0);
    var test = R.depthEnabled && (iz !== undefined);
    if (y < 0 || y >= R.H) { return false; }
    if (R.spriteLoad[y] >= R.SPRITES_PER_LINE) { R.overflowCount++; return false; }
    for (var yy = 0; yy < size; yy++) {
      var py = y + yy;
      if (py < 0 || py >= R.H) { continue; }
      if (yy > 0) {
        if (R.spriteLoad[py] >= R.SPRITES_PER_LINE) { continue; }
      }
      R.spriteLoad[py]++;
      for (var xx = 0; xx < size; xx++) {
        var px = x + xx;
        if (px < 0 || px >= R.W) { continue; }
        var di = py * R.W + px;
        if (test && iz <= R.zbuf[di]) { continue; }
        if (test) { R.zbuf[di] = iz; }
        R.buf[di] = idx;
      }
    }
    return true;
  };

  // ------------------------------------------------------------------- font
  // 4 x 6 bitmap font. Six nibbles per glyph, high bit leftmost.
  var FONT = {
    '0': [6, 9, 9, 9, 9, 6], '1': [2, 6, 2, 2, 2, 7], '2': [14, 1, 1, 6, 8, 15],
    '3': [14, 1, 6, 1, 1, 14], '4': [9, 9, 15, 1, 1, 1], '5': [15, 8, 14, 1, 1, 14],
    '6': [6, 8, 14, 9, 9, 6], '7': [15, 1, 2, 4, 4, 4], '8': [6, 9, 6, 9, 9, 6],
    '9': [6, 9, 9, 7, 1, 6],
    'A': [6, 9, 9, 15, 9, 9], 'B': [14, 9, 14, 9, 9, 14], 'C': [6, 9, 8, 8, 9, 6],
    'D': [14, 9, 9, 9, 9, 14], 'E': [15, 8, 14, 8, 8, 15], 'F': [15, 8, 14, 8, 8, 8],
    'G': [6, 8, 11, 9, 9, 6], 'H': [9, 9, 15, 9, 9, 9], 'I': [7, 2, 2, 2, 2, 7],
    'J': [3, 1, 1, 1, 9, 6], 'K': [9, 10, 12, 12, 10, 9], 'L': [8, 8, 8, 8, 8, 15],
    'M': [9, 15, 15, 9, 9, 9], 'N': [9, 13, 13, 11, 11, 9], 'O': [6, 9, 9, 9, 9, 6],
    'P': [14, 9, 9, 14, 8, 8], 'Q': [6, 9, 9, 11, 10, 5], 'R': [14, 9, 9, 14, 10, 9],
    'S': [7, 8, 6, 1, 1, 14], 'T': [15, 4, 4, 4, 4, 4], 'U': [9, 9, 9, 9, 9, 6],
    'V': [9, 9, 9, 9, 6, 6], 'W': [9, 9, 9, 15, 15, 9], 'X': [9, 9, 6, 6, 9, 9],
    'Y': [9, 9, 6, 4, 4, 4], 'Z': [15, 1, 2, 4, 8, 15],
    ' ': [0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 4], ',': [0, 0, 0, 0, 4, 8],
    '-': [0, 0, 0, 14, 0, 0], '_': [0, 0, 0, 0, 0, 15], '/': [1, 2, 2, 4, 4, 8],
    ':': [0, 4, 0, 0, 4, 0], '+': [0, 4, 4, 14, 4, 4], '%': [9, 2, 2, 4, 4, 9],
    '<': [1, 2, 4, 4, 2, 1], '>': [8, 4, 2, 2, 4, 8], '(': [2, 4, 4, 4, 4, 2],
    ')': [4, 2, 2, 2, 2, 4], '!': [4, 4, 4, 4, 0, 4], '?': [6, 9, 2, 4, 0, 4],
    '*': [0, 10, 4, 10, 0, 0], '=': [0, 0, 15, 0, 15, 0], '\u00b0': [4, 10, 4, 0, 0, 0]
  };

  R.FONT_W = 4;
  R.FONT_H = 6;

  R.text = function (str, x, y, idx, spacing) {
    spacing = (spacing === undefined) ? 1 : spacing;
    str = String(str).toUpperCase();
    var cx = x;
    for (var i = 0; i < str.length; i++) {
      var g = FONT[str[i]];
      if (g) {
        for (var r = 0; r < 6; r++) {
          var bits = g[r];
          for (var c = 0; c < 4; c++) {
            if (bits & (8 >> c)) { R.px(cx + c, y + r, idx); }
          }
        }
      }
      cx += 4 + spacing;
    }
    return cx - x;
  };

  R.textWidth = function (str, spacing) {
    spacing = (spacing === undefined) ? 1 : spacing;
    return String(str).length * (4 + spacing) - spacing;
  };

  R.textCentered = function (str, cx, y, idx, spacing) {
    R.text(str, Math.round(cx - R.textWidth(str, spacing) / 2), y, idx, spacing);
  };

  // ---------------------------------------------------------------- present
  // Integer scale, nearest neighbor, no smoothing. The only place the engine
  // touches a 2D context.
  R.attach = function (canvas) {
    R.canvas = canvas;
    R.ctx = canvas.getContext('2d', { alpha: false });
    R.ctx.imageSmoothingEnabled = false;
    R.inner = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (R.inner) {
      R.inner.width = R.W; R.inner.height = R.H;
      R.innerCtx = R.inner.getContext('2d', { alpha: false });
      R.image = R.innerCtx.createImageData(R.W, R.H);
      R.image32 = new Uint32Array(R.image.data.buffer);
    }
  };

  R.resizeInner = function () {
    if (!R.inner) { return; }
    R.inner.width = R.W; R.inner.height = R.H;
    R.image = R.innerCtx.createImageData(R.W, R.H);
    R.image32 = new Uint32Array(R.image.data.buffer);
  };

  R.present = function () {
    if (!R.ctx || !R.image32) { return; }
    if (P.dirty) { P.rebuild(); }
    var n = R.W * R.H, lut = P.rgba, buf = R.buf, out = R.image32;
    for (var i = 0; i < n; i++) { out[i] = lut[buf[i]]; }
    R.innerCtx.putImageData(R.image, 0, 0);

    var cw = R.canvas.width, ch = R.canvas.height;
    var scale = Math.max(1, Math.floor(Math.min(cw / R.W, ch / R.H)));
    var dw = R.W * scale, dh = R.H * scale;
    var dx = Math.floor((cw - dw) / 2), dy = Math.floor((ch - dh) / 2);
    R.ctx.imageSmoothingEnabled = false;
    R.ctx.fillStyle = '#000';
    R.ctx.fillRect(0, 0, cw, ch);
    R.ctx.drawImage(R.inner, 0, 0, R.W, R.H, dx, dy, dw, dh);
    R.lastScale = scale;
  };

  // --------------------------------------------------------- stock sprites
  var C = AERO.palette.RAMP;
  R.defineCell('bird', [
    '................',
    '................',
    '................',
    '.....1..........',
    '....1.1.........',
    '...1...1........',
    '..1.....1.......',
    '.1.......1......',
    '1.........1.....',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ], { 1: C.black.start });

  // Conifer: darker, narrower, and it belongs higher up the hill.
  R.defineCell('conifer', [
    '................',
    '.......1........',
    '.......11.......',
    '......111.......',
    '......1111......',
    '.....11111......',
    '.....111111.....',
    '....1111111.....',
    '....11111111....',
    '...111111111....',
    '...1111111111...',
    '..111111111111..',
    '.......22.......',
    '.......22.......',
    '.......22.......',
    '.......22.......'
  ], { 1: C.grass.start + 1, 2: C.rock.start });

  // A dead tree is a silhouette, which is why it reads at distance.
  R.defineCell('deadtree', [
    '................',
    '................',
    '.....1....1.....',
    '......1..1......',
    '....1..11..1....',
    '.....1.11.1.....',
    '.......11.......',
    '....1..11..1....',
    '.....1.11.1.....',
    '.......11.......',
    '.......11.......',
    '.......11.......',
    '.......11.......',
    '.......11.......',
    '......1111......',
    '................'
  ], { 1: C.rock.start });

  R.defineCell('boulder', [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....11111......',
    '....1122211.....',
    '...112222211....',
    '...112222111....',
    '..11122211111...',
    '..11111111111...',
    '...111111111....',
    '................'
  ], { 1: C.rock.start + 1, 2: C.rock.start + 2 });

  R.defineCell('haybale', [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.....22222......',
    '....2111112.....',
    '....2111112.....',
    '....2111112.....',
    '.....22222......',
    '................'
  ], { 1: C.crop.start, 2: C.rock.start + 2 });

  R.defineCell('cow', [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '....11111111....',
    '...1112211111...',
    '...1111111111...',
    '....1.1..1.1....',
    '....1.1..1.1....',
    '................',
    '................'
  ], { 1: C.mark.start, 2: C.rock.start });

  R.defineCell('post', [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......1........',
    '.......1........',
    '.......1........',
    '.......1........',
    '.......1........',
    '.......1........',
    '................'
  ], { 1: C.rock.start });

  R.defineCell('tree', [
    '................',
    '.......11.......',
    '......1111......',
    '.....112211.....',
    '....11222211....',
    '...1122222211...',
    '....11222211....',
    '.....112211.....',
    '......1111......',
    '.......33.......',
    '.......33.......',
    '.......33.......',
    '......3333......',
    '................',
    '................',
    '................'
  ], { 1: C.grass.start + 1, 2: C.grass.start + 3, 3: C.rock.start });

  R.defineCell('traffic', [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......1........',
    '.......1........',
    '.1111111111111..',
    '.......1........',
    '......111.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................'
  ], { 1: C.hull.start + 1 });

  R.defineCell('bush', [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '......111.......',
    '.....11211......',
    '....1122211.....',
    '....1222221.....',
    '.....112211.....',
    '................',
    '................',
    '................',
    '................',
    '................'
  ], { 1: C.grass.start + 1, 2: C.grass.start + 3 });

})(typeof window !== 'undefined' ? window : globalThis);
