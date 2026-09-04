export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function hexToRgb(h: string): [number, number, number] {
  const m = h.replace('#', '');
  return [
    parseInt(m.substring(0, 2), 16),
    parseInt(m.substring(2, 4), 16),
    parseInt(m.substring(4, 6), 16),
  ];
}

export function solve3(A: number[][], B: number[]): [number, number, number] | null {
  function det3(m: number[][]) {
    return (
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
    );
  }
  function repl(m: number[][], c: number, v: number[]) {
    return m.map((r, i) => r.map((x, j) => (j === c ? v[i] : x)));
  }
  const d = det3(A);
  if (Math.abs(d) < 1e-9) return null;
  return [det3(repl(A, 0, B)) / d, det3(repl(A, 1, B)) / d, det3(repl(A, 2, B)) / d];
}

export function pathLen(pts: Array<{ x: number; y: number }>): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

export function fitLine(pts: Array<{ x: number; y: number }>): { maxDev: number } {
  const n = pts.length,
    sx = pts.reduce((s, p) => s + p.x, 0),
    sy = pts.reduce((s, p) => s + p.y, 0),
    mx = sx / n,
    my = sy / n;
  let sxx = 0,
    syy = 0,
    sxy = 0;
  pts.forEach((p) => {
    const dx = p.x - mx,
      dy = p.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  });
  const t = 0.5 * Math.atan2(2 * sxy, sxx - syy),
    nx = -Math.sin(t),
    ny = Math.cos(t);
  let md = 0;
  pts.forEach((p) => {
    const d = Math.abs((p.x - mx) * nx + (p.y - my) * ny);
    if (d > md) md = d;
  });
  return { maxDev: md };
}

export function fitCircle(pts: Array<{ x: number; y: number }>): {
  cx: number;
  cy: number;
  r: number;
  maxDev: number;
  avgDev: number;
} | null {
  const n = pts.length;
  let sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0,
    sxz = 0,
    syz = 0,
    sz = 0;
  pts.forEach((p) => {
    const x = p.x,
      y = p.y,
      z = x * x + y * y;
    sx += x;
    sy += y;
    sxx += x * x;
    syy += y * y;
    sxy += x * y;
    sxz += x * z;
    syz += y * z;
    sz += z;
  });
  const sol = solve3(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, n],
    ],
    [-sxz, -syz, -sz]
  );
  if (!sol) return null;
  const [D, E, F] = sol,
    cx = -D / 2,
    cy = -E / 2,
    r2 = cx * cx + cy * cy - F;
  if (r2 <= 0) return null;
  const r = Math.sqrt(r2);
  let md = 0,
    sd = 0;
  pts.forEach((p) => {
    const d = Math.abs(dist(p, { x: cx, y: cy }) - r);
    if (d > md) md = d;
    sd += d;
  });
  return { cx, cy, r, maxDev: md, avgDev: sd / n };
}

export function rectEdgeScore(
  pts: Array<{ x: number; y: number }>,
  box: { x: number; y: number; w: number; h: number }
): number {
  const tol = Math.max(9, 0.06 * Math.max(box.w, box.h));
  let on = 0;
  pts.forEach((p) => {
    const dMin = Math.min(
      Math.abs(p.x - box.x),
      Math.abs(p.x - (box.x + box.w)),
      Math.abs(p.y - box.y),
      Math.abs(p.y - (box.y + box.h))
    );
    if (dMin < tol) on++;
  });
  return on / pts.length;
}

export function perpDist(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = Math.hypot(dx, dy) || 1e-6;
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

export function rdp(pts: Array<{ x: number; y: number }>, eps: number): Array<{ x: number; y: number }> {
  if (pts.length < 3) return pts;
  let md = 0,
    idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = perpDist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > md) {
      md = d;
      idx = i;
    }
  }
  if (md > eps) {
    const l = rdp(pts.slice(0, idx + 1), eps),
      r = rdp(pts.slice(idx), eps);
    return l.slice(0, -1).concat(r);
  }
  return [pts[0], pts[pts.length - 1]];
}

export function dedupe(pts: Array<{ x: number; y: number }>, tol: number): Array<{ x: number; y: number }> {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) if (dist(pts[i], out[out.length - 1]) > tol) out.push(pts[i]);
  if (out.length > 2 && dist(out[0], out[out.length - 1]) < tol) out.pop();
  return out;
}

export function classifyStroke(pts: Array<{ x: number; y: number }>): any {
  const n = pts.length;
  if (n < 5) return { kind: 'freehand', pts };
  let minX = pts[0].x,
    maxX = pts[0].x,
    minY = pts[0].y,
    maxY = pts[0].y;
  for (let i = 1; i < n; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const bw = maxX - minX,
    bh = maxY - minY,
    diag = Math.hypot(bw, bh),
    len = pathLen(pts),
    p0 = pts[0],
    pN = pts[n - 1];
  const closeTol = Math.max(18, 0.12 * diag),
    closed = dist(p0, pN) < closeTol && diag > 25;

  if (!closed) {
    const lf = fitLine(pts),
      lineTol = Math.max(6, len * 0.03);
    if (lf.maxDev < lineTol) {
      let ang = Math.atan2(pN.y - p0.y, pN.x - p0.x);
      const nearest = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
      if (Math.abs(angDiff(ang, nearest)) < (4 * Math.PI) / 180) ang = nearest;
      const L = dist(p0, pN),
        mx = (p0.x + pN.x) / 2,
        my = (p0.y + pN.y) / 2;
      return {
        kind: 'line',
        x1: mx - (Math.cos(ang) * L) / 2,
        y1: my - (Math.sin(ang) * L) / 2,
        x2: mx + (Math.cos(ang) * L) / 2,
        y2: my + (Math.sin(ang) * L) / 2,
      };
    }
  }
  const cf = fitCircle(pts);
  if (closed) {
    if (cf) {
      const re = cf.avgDev / cf.r;
      if (re < 0.12 && cf.r < diag * 2 && cf.r > 10) return { kind: 'circle', cx: cf.cx, cy: cf.cy, r: cf.r };
    }
    if (rectEdgeScore(pts, { x: minX, y: minY, w: bw, h: bh }) > 0.72 && bw > 14 && bh > 14) {
      let w = bw,
        h = bh;
      if (Math.abs(w - h) < 0.14 * Math.max(w, h)) {
        const s = (w + h) / 2;
        w = s;
        h = s;
      }
      return { kind: 'rect', x: minX, y: minY, w, h };
    }
    const ep = Math.max(10, 0.05 * diag),
      sp = dedupe(rdp(pts, ep), ep);
    if (sp.length === 3) return { kind: 'triangle', p1: sp[0], p2: sp[1], p3: sp[2] };
    return { kind: 'freehandClosed', pts };
  }
  if (cf) {
    const re = cf.avgDev / cf.r;
    let pa = Math.atan2(pts[0].y - cf.cy, pts[0].x - cf.cx),
      uw = pa;
    for (let i = 1; i < n; i++) {
      let a = Math.atan2(pts[i].y - cf.cy, pts[i].x - cf.cx);
      let d = a - pa;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      uw += d;
      pa = a;
    }
    const sa = Math.atan2(pts[0].y - cf.cy, pts[0].x - cf.cx),
      ea = uw,
      span = (Math.abs(ea - sa) * 180) / Math.PI;
    if (re < 0.1 && cf.r < diag * 3 && span > 10 && span < 340 && cf.r > 8)
      return { kind: 'arc', cx: cf.cx, cy: cf.cy, r: cf.r, start: sa, end: ea, anticlockwise: ea < sa };
  }
  return { kind: 'freehand', pts };
}

export function distPtSeg(
  p: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = clamp(t, 0, 1);
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function polylineDist(p: { x: number; y: number }, pts: Array<{ x: number; y: number }>, closed: boolean): number {
  let md = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distPtSeg(p, pts[i], pts[i + 1]);
    if (d < md) md = d;
  }
  if (closed && pts.length > 2) {
    const d = distPtSeg(p, pts[pts.length - 1], pts[0]);
    if (d < md) md = d;
  }
  return md;
}

export function normAngle(a: number): number {
  while (a < 0) a += 2 * Math.PI;
  while (a >= 2 * Math.PI) a -= 2 * Math.PI;
  return a;
}

export function angleInArc(ang: number, start: number, end: number, ccw: boolean): boolean {
  const s = normAngle(start),
    e = normAngle(end),
    a = normAngle(ang);
  if (!ccw) {
    let span = e - s;
    if (span < 0) span += 2 * Math.PI;
    let off = a - s;
    if (off < 0) off += 2 * Math.PI;
    return off <= span + 0.05;
  }
  let span = s - e;
  if (span < 0) span += 2 * Math.PI;
  let off = s - a;
  if (off < 0) off += 2 * Math.PI;
  return off <= span + 0.05;
}

export const RECOLORABLE = new Set([
  'line',
  'arrow',
  'circle',
  'rect',
  'triangle',
  'arc',
  'freehand',
  'freehandClosed',
  'number',
  'text',
  'silk',
]);

export function shapeAnchors(sh: any): Array<{ x: number; y: number }> {
  switch (sh.kind) {
    case 'line':
    case 'arrow':
      return [
        { x: sh.x1, y: sh.y1 },
        { x: sh.x2, y: sh.y2 },
      ];
    case 'arc':
      return [
        { x: sh.cx + sh.r * Math.cos(sh.start), y: sh.cy + sh.r * Math.sin(sh.start) },
        { x: sh.cx + sh.r * Math.cos(sh.end), y: sh.cy + sh.r * Math.sin(sh.end) },
      ];
    case 'circle':
      return [
        { x: sh.cx + sh.r, y: sh.cy },
        { x: sh.cx - sh.r, y: sh.cy },
        { x: sh.cx, y: sh.cy + sh.r },
        { x: sh.cx, y: sh.cy - sh.r },
      ];
    case 'rect':
      return [
        { x: sh.x, y: sh.y },
        { x: sh.x + sh.w, y: sh.y },
        { x: sh.x + sh.w, y: sh.y + sh.h },
        { x: sh.x, y: sh.y + sh.h },
      ];
    case 'triangle':
      return [sh.p1, sh.p2, sh.p3];
    case 'freehand':
      if (!sh.pts || !sh.pts.length) return [];
      return [sh.pts[0], sh.pts[sh.pts.length - 1]];
    case 'freehandClosed':
      return sh.pts && sh.pts.length ? sh.pts.slice() : [];
    default:
      return [];
  }
}

export function shapesConnected(a: any, b: any, tol: number): boolean {
  const aa = shapeAnchors(a),
    bb = shapeAnchors(b);
  for (const p of aa) {
    for (const q of bb) {
      if (dist(p, q) <= tol) return true;
    }
    if (shapeDist(p, b) <= tol) return true;
  }
  for (const q of bb) {
    if (shapeDist(q, a) <= tol) return true;
  }
  return false;
}

export function shapeDist(p: { x: number; y: number }, sh: any): number {
  switch (sh.kind) {
    case 'line':
    case 'arrow':
      return distPtSeg(p, { x: sh.x1, y: sh.y1 }, { x: sh.x2, y: sh.y2 });
    case 'circle': {
      const d = dist(p, { x: sh.cx, y: sh.cy });
      if (sh.filled || !sh.width) return Math.max(0, d - sh.r);
      return Math.abs(d - sh.r);
    }
    case 'rect': {
      const { x, y, w, h } = sh;
      if (sh.filled || sh.fabric || sh.weave) {
        const dx = Math.max(x - p.x, 0, p.x - (x + w));
        const dy = Math.max(y - p.y, 0, p.y - (y + h));
        return Math.hypot(dx, dy);
      }
      return polylineDist(
        p,
        [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
        ],
        true
      );
    }
    case 'triangle':
      return polylineDist(p, [sh.p1, sh.p2, sh.p3], true);
    case 'arc': {
      const inRange = angleInArc(Math.atan2(p.y - sh.cy, p.x - sh.cx), sh.start, sh.end, sh.anticlockwise);
      const rd = Math.abs(dist(p, { x: sh.cx, y: sh.cy }) - sh.r);
      if (inRange) return rd;
      const e1 = { x: sh.cx + sh.r * Math.cos(sh.start), y: sh.cy + sh.r * Math.sin(sh.start) };
      const e2 = { x: sh.cx + sh.r * Math.cos(sh.end), y: sh.cy + sh.r * Math.sin(sh.end) };
      return Math.min(dist(p, e1), dist(p, e2));
    }
    case 'freehand':
      return polylineDist(p, sh.pts, false);
    case 'freehandClosed':
      return polylineDist(p, sh.pts, true);
    case 'number': {
      const s = sh.size || 12;
      return Math.max(0, dist(p, { x: sh.x, y: sh.y }) - s * 0.72);
    }
    case 'text': {
      const s = sh.size || 14;
      const w = Math.max(s, String(sh.text || '').length * s * 0.55);
      const dx = Math.abs(p.x - sh.x),
        dy = Math.abs(p.y - sh.y);
      if (dx <= w / 2 && dy <= s * 0.7) return 0;
      return Math.hypot(Math.max(0, dx - w / 2), Math.max(0, dy - s * 0.7));
    }
    case 'silk':
    case 'needlePath':
      return polylineDist(p, sh.pts, false);
    default:
      return Infinity;
  }
}

export function arcTightBBox(sh: any): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts: Array<{ x: number; y: number }> = [];
  const add = (a: number) => pts.push({ x: sh.cx + sh.r * Math.cos(a), y: sh.cy + sh.r * Math.sin(a) });
  add(sh.start);
  add(sh.end);
  [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach((a) => {
    if (angleInArc(a, sh.start, sh.end, sh.anticlockwise)) add(a);
  });
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

export function shapeBBox(sh: any): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const hw = (sh.width != null ? sh.width : 4) / 2;
  switch (sh.kind) {
    case 'line':
    case 'arrow':
      return {
        minX: Math.min(sh.x1, sh.x2) - hw,
        minY: Math.min(sh.y1, sh.y2) - hw,
        maxX: Math.max(sh.x1, sh.x2) + hw,
        maxY: Math.max(sh.y1, sh.y2) + hw,
      };
    case 'circle':
      return {
        minX: sh.cx - sh.r - hw,
        minY: sh.cy - sh.r - hw,
        maxX: sh.cx + sh.r + hw,
        maxY: sh.cy + sh.r + hw,
      };
    case 'rect':
      return {
        minX: sh.x - hw,
        minY: sh.y - hw,
        maxX: sh.x + sh.w + hw,
        maxY: sh.y + sh.h + hw,
      };
    case 'triangle': {
      const xs = [sh.p1.x, sh.p2.x, sh.p3.x],
        ys = [sh.p1.y, sh.p2.y, sh.p3.y];
      return {
        minX: Math.min(...xs) - hw,
        minY: Math.min(...ys) - hw,
        maxX: Math.max(...xs) + hw,
        maxY: Math.max(...ys) + hw,
      };
    }
    case 'arc': {
      const b = arcTightBBox(sh);
      return {
        minX: b.minX - hw,
        minY: b.minY - hw,
        maxX: b.maxX + hw,
        maxY: b.maxY + hw,
      };
    }
    case 'freehand':
    case 'freehandClosed':
    case 'eraser': {
      const pts = sh.pts || [];
      if (!pts.length) return null;
      let minX = pts[0].x,
        maxX = pts[0].x,
        minY = pts[0].y,
        maxY = pts[0].y;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      return { minX: minX - hw, minY: minY - hw, maxX: maxX + hw, maxY: maxY + hw };
    }
    case 'fill': {
      if (sh.geo) {
        const g = sh.geo;
        if (g.type === 'rect') return { minX: g.x, minY: g.y, maxX: g.x + g.w, maxY: g.y + g.h };
        if (g.type === 'circle') return { minX: g.cx - g.r, minY: g.cy - g.r, maxX: g.cx + g.r, maxY: g.cy + g.r };
        if (g.type === 'triangle' && g.p1) {
          const xs = [g.p1.x, g.p2.x, g.p3.x],
            ys = [g.p1.y, g.p2.y, g.p3.y];
          return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
        }
        if (g.type === 'poly' && g.pts && g.pts.length) {
          let minX = g.pts[0].x,
            maxX = g.pts[0].x,
            minY = g.pts[0].y,
            maxY = g.pts[0].y;
          for (let i = 1; i < g.pts.length; i++) {
            const p = g.pts[i];
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
          return { minX, minY, maxX, maxY };
        }
      }
      return { minX: (sh.x || 0) - 1, minY: (sh.y || 0) - 1, maxX: (sh.x || 0) + 1, maxY: (sh.y || 0) + 1 };
    }
    case 'number': {
      const s = sh.size || 12,
        r = s * 0.72;
      return { minX: sh.x - r, minY: sh.y - r, maxX: sh.x + r, maxY: sh.y + r };
    }
    case 'text': {
      const s = sh.size || 14;
      const w = Math.max(s, String(sh.text || '').length * s * 0.55);
      return { minX: sh.x - w / 2, minY: sh.y - s * 0.7, maxX: sh.x + w / 2, maxY: sh.y + s * 0.7 };
    }
    case 'silk':
    case 'needlePath': {
      const pts = sh.pts || [];
      if (!pts.length) return null;
      let minX = pts[0].x,
        maxX = pts[0].x,
        minY = pts[0].y,
        maxY = pts[0].y;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      const hw2 = (sh.width || 10) / 2 + 2;
      return { minX: minX - hw2, minY: minY - hw2, maxX: maxX + hw2, maxY: maxY + hw2 };
    }
    default:
      return null;
  }
}

export function unionBBox(shapesList: any[], withPad?: boolean): any {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  let maxW = 0;
  for (const sh of shapesList) {
    const b = shapeBBox(sh);
    if (!b) continue;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
    if (sh.width) maxW = Math.max(maxW, sh.width);
  }
  if (minX === Infinity) return null;
  const strokePad = Math.ceil(maxW / 2) || 0;
  const pad = withPad === true ? strokePad : 0;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
    strokePad,
    pad,
    inkMinX: minX,
    inkMinY: minY,
    inkMaxX: maxX,
    inkMaxY: maxY,
  };
}

export function bboxWithin(b: any, rect: { x: number; y: number; w: number; h: number }, tol?: number): boolean {
  if (!b) return false;
  tol = tol || 4;
  return b.minX >= rect.x - tol && b.minY >= rect.y - tol && b.maxX <= rect.x + rect.w + tol && b.maxY <= rect.y + rect.h + tol;
}

export function offsetFillGeo(g: any, dx: number, dy: number): any {
  const ng = { ...g };
  if (g.type === 'rect') {
    ng.x = g.x + dx;
    ng.y = g.y + dy;
  } else if (g.type === 'circle') {
    ng.cx = g.cx + dx;
    ng.cy = g.cy + dy;
  } else if (g.type === 'triangle') {
    ng.p1 = { x: g.p1.x + dx, y: g.p1.y + dy };
    ng.p2 = { x: g.p2.x + dx, y: g.p2.y + dy };
    ng.p3 = { x: g.p3.x + dx, y: g.p3.y + dy };
  } else if (g.type === 'poly' && g.pts) {
    ng.pts = g.pts.map((p: any) => ({ x: p.x + dx, y: p.y + dy }));
  }
  return ng;
}

export function transformFillGeo(g: any, fn: any): any {
  const ng = { ...g };
  if (g.type === 'rect') {
    const a = fn({ x: g.x, y: g.y }),
      b = fn({ x: g.x + g.w, y: g.y + g.h });
    ng.x = Math.min(a.x, b.x);
    ng.y = Math.min(a.y, b.y);
    ng.w = Math.abs(b.x - a.x);
    ng.h = Math.abs(b.y - a.y);
  } else if (g.type === 'circle') {
    const p = fn({ x: g.cx, y: g.cy });
    ng.cx = p.x;
    ng.cy = p.y;
    if (fn._scale != null) ng.r = g.r * fn._scale;
  } else if (g.type === 'triangle') {
    ng.p1 = fn(g.p1);
    ng.p2 = fn(g.p2);
    ng.p3 = fn(g.p3);
  } else if (g.type === 'poly' && g.pts) {
    ng.pts = g.pts.map((p: any) => fn(p));
  }
  return ng;
}

export function cloneShapeOffset(sh: any, dx: number, dy: number): any {
  const c = { ...sh };
  delete c.id;
  switch (sh.kind) {
    case 'line':
    case 'arrow':
      c.x1 += dx;
      c.y1 += dy;
      c.x2 += dx;
      c.y2 += dy;
      break;
    case 'circle':
      c.cx += dx;
      c.cy += dy;
      break;
    case 'rect':
      c.x += dx;
      c.y += dy;
      break;
    case 'triangle':
      c.p1 = { x: sh.p1.x + dx, y: sh.p1.y + dy };
      c.p2 = { x: sh.p2.x + dx, y: sh.p2.y + dy };
      c.p3 = { x: sh.p3.x + dx, y: sh.p3.y + dy };
      break;
    case 'arc':
      c.cx += dx;
      c.cy += dy;
      break;
    case 'freehand':
    case 'freehandClosed':
    case 'eraser':
      c.pts = sh.pts.map((p: any) => ({ x: p.x + dx, y: p.y + dy }));
      break;
    case 'fill':
      if (c.x != null) c.x += dx;
      if (c.y != null) c.y += dy;
      if (sh.geo) c.geo = offsetFillGeo(sh.geo, dx, dy);
      break;
    case 'number':
    case 'text':
      c.x += dx;
      c.y += dy;
      break;
    case 'silk':
    case 'needlePath':
      c.pts = sh.pts.map((p: any) => ({ x: p.x + dx, y: p.y + dy }));
      break;
  }
  return c;
}

export function rotPt(p: { x: number; y: number }, cx: number, cy: number, ang: number): { x: number; y: number } {
  const cos = Math.cos(ang),
    sin = Math.sin(ang);
  const dx = p.x - cx,
    dy = p.y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

export function rotateShape(sh: any, cx: number, cy: number, ang: number): any {
  if (Math.abs(ang) < 1e-9) return cloneShapeOffset(sh, 0, 0);
  const c = { ...sh };
  delete c.id;
  switch (sh.kind) {
    case 'line':
    case 'arrow': {
      const a = rotPt({ x: sh.x1, y: sh.y1 }, cx, cy, ang),
        b = rotPt({ x: sh.x2, y: sh.y2 }, cx, cy, ang);
      c.x1 = a.x;
      c.y1 = a.y;
      c.x2 = b.x;
      c.y2 = b.y;
      break;
    }
    case 'circle': {
      const p = rotPt({ x: sh.cx, y: sh.cy }, cx, cy, ang);
      c.cx = p.x;
      c.cy = p.y;
      break;
    }
    case 'rect': {
      const pts = [
        { x: sh.x, y: sh.y },
        { x: sh.x + sh.w, y: sh.y },
        { x: sh.x + sh.w, y: sh.y + sh.h },
        { x: sh.x, y: sh.y + sh.h },
      ].map((p) => rotPt(p, cx, cy, ang));
      c.kind = 'freehandClosed';
      c.pts = pts;
      delete c.x;
      delete c.y;
      delete c.w;
      delete c.h;
      break;
    }
    case 'triangle': {
      c.p1 = rotPt(sh.p1, cx, cy, ang);
      c.p2 = rotPt(sh.p2, cx, cy, ang);
      c.p3 = rotPt(sh.p3, cx, cy, ang);
      break;
    }
    case 'arc': {
      const p = rotPt({ x: sh.cx, y: sh.cy }, cx, cy, ang);
      c.cx = p.x;
      c.cy = p.y;
      c.start = sh.start + ang;
      c.end = sh.end + ang;
      break;
    }
    case 'freehand':
    case 'freehandClosed':
    case 'eraser':
      c.pts = sh.pts.map((p: any) => rotPt(p, cx, cy, ang));
      break;
    case 'fill': {
      const p = rotPt({ x: sh.x || 0, y: sh.y || 0 }, cx, cy, ang);
      c.x = p.x;
      c.y = p.y;
      if (sh.geo) c.geo = transformFillGeo(sh.geo, (pt: any) => rotPt(pt, cx, cy, ang));
      break;
    }
    case 'number':
    case 'text': {
      const p = rotPt({ x: sh.x, y: sh.y }, cx, cy, ang);
      c.x = p.x;
      c.y = p.y;
      break;
    }
    case 'silk':
      c.pts = sh.pts.map((p: any) => rotPt(p, cx, cy, ang));
      break;
  }
  return c;
}

export function scalePt(p: { x: number; y: number }, cx: number, cy: number, s: number): { x: number; y: number } {
  return { x: cx + (p.x - cx) * s, y: cy + (p.y - cy) * s };
}

export function scaleShape(sh: any, cx: number, cy: number, s: number): any {
  if (Math.abs(s - 1) < 1e-6) return cloneShapeOffset(sh, 0, 0);
  const c = { ...sh };
  delete c.id;
  switch (sh.kind) {
    case 'line':
    case 'arrow': {
      const a = scalePt({ x: sh.x1, y: sh.y1 }, cx, cy, s),
        b = scalePt({ x: sh.x2, y: sh.y2 }, cx, cy, s);
      c.x1 = a.x;
      c.y1 = a.y;
      c.x2 = b.x;
      c.y2 = b.y;
      break;
    }
    case 'circle': {
      const p = scalePt({ x: sh.cx, y: sh.cy }, cx, cy, s);
      c.cx = p.x;
      c.cy = p.y;
      c.r = sh.r * s;
      break;
    }
    case 'rect': {
      c.x = cx + (sh.x - cx) * s;
      c.y = cy + (sh.y - cy) * s;
      c.w = sh.w * s;
      c.h = sh.h * s;
      break;
    }
    case 'triangle': {
      c.p1 = scalePt(sh.p1, cx, cy, s);
      c.p2 = scalePt(sh.p2, cx, cy, s);
      c.p3 = scalePt(sh.p3, cx, cy, s);
      break;
    }
    case 'arc': {
      const p = scalePt({ x: sh.cx, y: sh.cy }, cx, cy, s);
      c.cx = p.x;
      c.cy = p.y;
      c.r = sh.r * s;
      break;
    }
    case 'freehand':
    case 'freehandClosed':
    case 'eraser':
      c.pts = sh.pts.map((p: any) => scalePt(p, cx, cy, s));
      break;
    case 'fill': {
      const p = scalePt({ x: sh.x || 0, y: sh.y || 0 }, cx, cy, s);
      c.x = p.x;
      c.y = p.y;
      if (sh.geo) {
        const fn = (pt: any) => scalePt(pt, cx, cy, s);
        (fn as any)._scale = s;
        c.geo = transformFillGeo(sh.geo, fn);
      }
      break;
    }
    case 'number':
    case 'text': {
      const p = scalePt({ x: sh.x, y: sh.y }, cx, cy, s);
      c.x = p.x;
      c.y = p.y;
      c.size = (sh.size || 18) * s;
      break;
    }
    case 'silk':
      c.pts = sh.pts.map((p: any) => scalePt(p, cx, cy, s));
      c.width = (sh.width || 10) * s;
      break;
  }
  return c;
}

export function buildSemiArc(
  a: { x: number; y: number },
  b: { x: number; y: number }
): { cx: number; cy: number; r: number; start: number; end: number; anticlockwise: boolean } | null {
  const cx = (a.x + b.x) / 2,
    cy = (a.y + b.y) / 2;
  const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
  if (r < 3) return null;
  const a1 = Math.atan2(a.y - cy, a.x - cx),
    a2 = Math.atan2(b.y - cy, b.x - cx);
  let span = a2 - a1;
  while (span <= 0) span += 2 * Math.PI;
  const midCcw = a1 + span / 2;
  const midCw = a1 - (2 * Math.PI - span) / 2;
  const yCcw = cy + r * Math.sin(midCcw),
    yCw = cy + r * Math.sin(midCw);
  const anticlockwise = yCcw <= yCw;
  return { cx, cy, r, start: a1, end: a2, anticlockwise };
}

export function arcMidpoint(sh: any): { x: number; y: number } {
  let s = sh.start,
    e = sh.end,
    span = e - s;
  if (sh.anticlockwise) {
    if (span > 0) span -= 2 * Math.PI;
  } else {
    if (span < 0) span += 2 * Math.PI;
  }
  const a = s + span / 2;
  return { x: sh.cx + sh.r * Math.cos(a), y: sh.cy + sh.r * Math.sin(a) };
}

export function arcEndPoints(sh: any): { a: { x: number; y: number }; b: { x: number; y: number } } {
  return {
    a: { x: sh.cx + sh.r * Math.cos(sh.start), y: sh.cy + sh.r * Math.sin(sh.start) },
    b: { x: sh.cx + sh.r * Math.cos(sh.end), y: sh.cy + sh.r * Math.sin(sh.end) },
  };
}

export function arcBetweenPoints(p1: { x: number; y: number }, p2: { x: number; y: number }, color: string, width: number): any {
  const arc = buildSemiArc(p1, p2);
  if (!arc) return null;
  return {
    kind: 'arc',
    cx: arc.cx,
    cy: arc.cy,
    r: arc.r,
    start: arc.start,
    end: arc.end,
    anticlockwise: arc.anticlockwise,
    color,
    width,
  };
}

export function flipPt(p: { x: number; y: number }, cx: number, cy: number, flipH: boolean, flipV: boolean): { x: number; y: number } {
  return { x: flipH ? 2 * cx - p.x : p.x, y: flipV ? 2 * cy - p.y : p.y };
}

export function flipShape(sh: any, cx: number, cy: number, flipH: boolean, flipV: boolean): any {
  if (!flipH && !flipV) return cloneShapeOffset(sh, 0, 0);
  const c = { ...sh };
  delete c.id;
  switch (sh.kind) {
    case 'line':
    case 'arrow': {
      const a = flipPt({ x: sh.x1, y: sh.y1 }, cx, cy, flipH, flipV),
        b = flipPt({ x: sh.x2, y: sh.y2 }, cx, cy, flipH, flipV);
      c.x1 = a.x;
      c.y1 = a.y;
      c.x2 = b.x;
      c.y2 = b.y;
      break;
    }
    case 'circle': {
      const p = flipPt({ x: sh.cx, y: sh.cy }, cx, cy, flipH, flipV);
      c.cx = p.x;
      c.cy = p.y;
      break;
    }
    case 'rect': {
      const x2 = sh.x + sh.w,
        y2 = sh.y + sh.h;
      const nx1 = flipH ? 2 * cx - x2 : sh.x,
        nx2 = flipH ? 2 * cx - sh.x : x2;
      const ny1 = flipV ? 2 * cy - y2 : sh.y,
        ny2 = flipV ? 2 * cy - sh.y : y2;
      c.x = Math.min(nx1, nx2);
      c.y = Math.min(ny1, ny2);
      c.w = Math.abs(nx2 - nx1);
      c.h = Math.abs(ny2 - ny1);
      break;
    }
    case 'triangle': {
      c.p1 = flipPt(sh.p1, cx, cy, flipH, flipV);
      c.p2 = flipPt(sh.p2, cx, cy, flipH, flipV);
      c.p3 = flipPt(sh.p3, cx, cy, flipH, flipV);
      break;
    }
    case 'arc': {
      const p = flipPt({ x: sh.cx, y: sh.cy }, cx, cy, flipH, flipV);
      c.cx = p.x;
      c.cy = p.y;
      let s = sh.start,
        e = sh.end,
        ccw = sh.anticlockwise;
      if (flipH) {
        s = Math.PI - s;
        e = Math.PI - e;
        ccw = !ccw;
      }
      if (flipV) {
        s = -s;
        e = -e;
        ccw = !ccw;
      }
      c.start = s;
      c.end = e;
      c.anticlockwise = ccw;
      break;
    }
    case 'freehand':
    case 'freehandClosed':
    case 'eraser':
      c.pts = sh.pts.map((p: any) => flipPt(p, cx, cy, flipH, flipV));
      break;
    case 'fill': {
      const p = flipPt({ x: sh.x || 0, y: sh.y || 0 }, cx, cy, flipH, flipV);
      c.x = p.x;
      c.y = p.y;
      if (sh.geo) c.geo = transformFillGeo(sh.geo, (pt: any) => flipPt(pt, cx, cy, flipH, flipV));
      break;
    }
    case 'number':
    case 'text': {
      const p = flipPt({ x: sh.x, y: sh.y }, cx, cy, flipH, flipV);
      c.x = p.x;
      c.y = p.y;
      break;
    }
    case 'silk':
      c.pts = sh.pts.map((p: any) => flipPt(p, cx, cy, flipH, flipV));
      break;
  }
  return c;
}
