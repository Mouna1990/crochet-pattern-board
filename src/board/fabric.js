import { shapeBBox, dist } from './geometry.ts';

export function attachFabricMethods(PatternBoard) {
  PatternBoard.prototype.rasterSilk = function(ctx, sh) {
    const raw = sh.pts || [];
    if (!raw || raw.length < 2) return;
    const nShapes = (this.shapes && this.shapes.length) || 0;
    const sc = (this.view && this.view.scale) || 1;
    const forceFull = !!(sh._finalMaterial || this._forceFullSilk || sh._fastSilk === false);
    const fast = !forceFull && (sc < 0.18 || nShapes > 3500 || !!sh._fastSilk);

    if (fast) {
      const base = this._normHex(sh.color || '#1e4fd6');
      const w = Math.max(3, sh.width || 12);
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.28)';
      ctx.lineWidth = w * 1.25;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.moveTo(raw[0].x + 1.8, raw[0].y + 2.2);
      for (let i = 1; i < raw.length; i++) ctx.lineTo(raw[i].x + 1.8, raw[i].y + 2.2);
      ctx.stroke();
      ctx.strokeStyle = this._shadeHex(base, -0.25);
      ctx.lineWidth = w * 1.15;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(raw[0].x, raw[0].y);
      for (let i = 1; i < raw.length; i++) ctx.lineTo(raw[i].x, raw[i].y);
      ctx.stroke();
      ctx.strokeStyle = base;
      ctx.lineWidth = w * 0.95;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(raw[0].x, raw[0].y);
      for (let i = 1; i < raw.length; i++) ctx.lineTo(raw[i].x, raw[i].y);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const pts = [];
    for (let i = 0; i < raw.length; i++) {
      if (i === 0) { pts.push({ x: raw[0].x, y: raw[0].y }); continue; }
      const a = raw[i - 1], b = raw[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y) || 0;
      const step = nShapes > 150 ? 1.6 : 1.25;
      const n = Math.max(1, Math.min(18, Math.ceil(seg / step)));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    if (pts.length < 2) return;

    const base = this._normHex(sh.color || '#1e4fd6');
    const R = Math.max(3.2, (sh.width || 12) / 2);
    const ts = Math.max(0, Math.min(3, sh.twistStrength != null ? Number(sh.twistStrength) : (sh.twist != null ? Math.min(3, Math.round(Number(sh.twist) / 1.1)) : 2)));
    const nPly = ts <= 0 ? 3 : ts === 1 ? 4 : ts === 2 ? 6 : 7;
    const plyR = R * (ts <= 1 ? 0.42 : 0.38);
    const twistRate = (0.25 + ts * 0.55) / Math.max(R, 1);

    const frames = pts.map((_, i) => {
      let tx, ty;
      if (i <= 0) { tx = pts[1].x - pts[0].x; ty = pts[1].y - pts[0].y; }
      else if (i >= pts.length - 1) { tx = pts[i].x - pts[i - 1].x; ty = pts[i].y - pts[i - 1].y; }
      else { tx = pts[i + 1].x - pts[i - 1].x; ty = pts[i + 1].y - pts[i - 1].y; }
      const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      return { tx, ty, nx: -ty, ny: tx };
    });

    {
      const wShadow = Math.max(4, R * 2.2);
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.lineWidth = wShadow;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(pts[0].x + 2.2, pts[0].y + 2.8);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + 2.2, pts[i].y + 2.8);
      ctx.stroke();
      ctx.globalAlpha = 0.22;
      ctx.lineWidth = wShadow * 1.35;
      ctx.beginPath();
      ctx.moveTo(pts[0].x + 3.5, pts[0].y + 4.2);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + 3.5, pts[i].y + 4.2);
      ctx.stroke();
      ctx.restore();
    }

    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(cum[i - 1] + (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 0));

    const overs = [];
    const minSep = Math.max(12, Math.floor(pts.length * 0.07));
    const step = Math.max(1, Math.floor(pts.length / 48));
    for (let i = 0; i < pts.length - 1; i += step) {
      const a1 = pts[i], a2 = pts[Math.min(i + step, pts.length - 1)];
      for (let j = i + minSep; j < pts.length - 1; j += step) {
        const b1 = pts[j], b2 = pts[Math.min(j + step, pts.length - 1)];
        const hit = this._segHit(a1, a2, b1, b2);
        if (!hit) continue;
        let i0 = j, i1 = Math.min(j + step, pts.length - 1);
        const need = R * 2.8;
        let acc = 0;
        while (i0 > 0 && acc < need) { acc += Math.hypot(pts[i0].x - pts[i0 - 1].x, pts[i0].y - pts[i0 - 1].y); i0--; }
        acc = 0;
        while (i1 < pts.length - 1 && acc < need) { acc += Math.hypot(pts[i1 + 1].x - pts[i1].x, pts[i1 + 1].y - pts[i1].y); i1++; }
        overs.push({ x: hit.x, y: hit.y, i0, i1 });
      }
    }

    const lightAng = -0.7;

    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = this._shadeHex(base, -0.6);
    ctx.lineWidth = R * 2.1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x + 1.2, pts[0].y + 2.0);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x + 1.2, pts[i].y + 2.0);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = this._shadeHex(base, -0.18);
    ctx.lineWidth = R * 1.55;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.strokeStyle = base;
    ctx.lineWidth = R * 1.25;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.restore();

    const strokePly = (iA, iB, plyIndex) => {
      if (iB - iA < 1) return;
      const baseAng = (plyIndex / nPly) * Math.PI * 2;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      for (let i = iA; i < iB; i++) {
        const s0 = cum[i], s1 = cum[i + 1];
        const th0 = baseAng + s0 * twistRate;
        const th1 = baseAng + s1 * twistRate;
        const depth0 = Math.sin(th0);
        const depth1 = Math.sin(th1);
        const depth = (depth0 + depth1) * 0.5;

        const rad = R * 0.52;
        const f0 = frames[i], f1 = frames[i + 1];
        const x0 = pts[i].x + f0.nx * Math.cos(th0) * rad;
        const y0 = pts[i].y + f0.ny * Math.cos(th0) * rad;
        const x0b = x0 - f0.tx * Math.sin(th0) * rad * 0.08;
        const y0b = y0 - f0.ty * Math.sin(th0) * rad * 0.08;
        const x1 = pts[i + 1].x + f1.nx * Math.cos(th1) * rad;
        const y1 = pts[i + 1].y + f1.ny * Math.cos(th1) * rad;
        const x1b = x1 - f1.tx * Math.sin(th1) * rad * 0.08;
        const y1b = y1 - f1.ty * Math.sin(th1) * rad * 0.08;

        const lit = 0.5 + 0.5 * Math.cos(th0 - lightAng);
        let amount;
        if (lit > 0.82) amount = 0.55 + (lit - 0.82) * 1.8;
        else if (lit > 0.55) amount = 0.1 + (lit - 0.55) * 1.2;
        else if (lit > 0.3) amount = -0.15 + (lit - 0.3) * 0.8;
        else amount = -0.5 + lit * 0.6;
        amount = Math.max(-0.55, Math.min(0.9, amount));

        const w = plyR * (1.05 + 0.25 * depth);
        ctx.globalAlpha = 0.92;
        ctx.strokeStyle = this._shadeHex(base, amount);
        ctx.lineWidth = Math.max(1.2, w);
        ctx.beginPath();
        ctx.moveTo(x0b, y0b);
        ctx.lineTo(x1b, y1b);
        ctx.stroke();

        if (lit > 0.85) {
          ctx.globalAlpha = 0.12 + 0.18 * (lit - 0.85);
          ctx.strokeStyle = this._shadeHex(base, 0.35);
          ctx.lineWidth = Math.max(0.4, w * 0.12);
          const hx0 = x0b + f0.nx * (-0.12 * w);
          const hy0 = y0b + f0.ny * (-0.12 * w);
          const hx1 = x1b + f1.nx * (-0.12 * w);
          const hy1 = y1b + f1.ny * (-0.12 * w);
          ctx.beginPath();
          ctx.moveTo(hx0, hy0);
          ctx.lineTo(hx1, hy1);
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    const drawRange = (iA, iB) => {
      if (iB - iA < 1) return;
      const midS = ((cum[iA] || 0) + (cum[iB] || 0)) * 0.5;
      const order = [];
      for (let p = 0; p < nPly; p++) {
        const th = (p / nPly) * Math.PI * 2 + midS * twistRate;
        order.push({ p, depth: Math.sin(th) });
      }
      order.sort((a, b) => a.depth - b.depth);
      for (const o of order) strokePly(iA, iB, o.p);
    };

    const segLen = Math.max(6, R * 1.8);
    let i0 = 0;
    while (i0 < pts.length - 1) {
      let i1 = i0;
      const c0 = cum[i0];
      while (i1 < pts.length - 1 && cum[i1] - c0 < segLen) i1++;
      if (i1 <= i0) i1 = i0 + 1;
      drawRange(i0, Math.min(i1, pts.length - 1));
      i0 = i1;
    }

    for (const o of overs) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(o.x + 0.5, o.y + 1.2, R * 0.95, R * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const o of overs) {
      drawRange(o.i0, o.i1);
    }
  };

  PatternBoard.prototype._segHit = function(a, b, c, d) {
    if (!a || !b || !c || !d) return null;
    const ax = a.x, ay = a.y, bx = b.x, by = b.y, cx = c.x, cy = c.y, dx = d.x, dy = d.y;
    const den = (ax - bx) * (cy - dy) - (ay - by) * (cx - dx);
    if (Math.abs(den) < 1e-9) return null;
    const t = ((ax - cx) * (cy - dy) - (ay - cy) * (cx - dx)) / den;
    const u = -((ax - bx) * (ay - cy) - (ay - by) * (ax - cx)) / den;
    if (t < 0.02 || t > 0.98 || u < 0.02 || u > 0.98) return null;
    return { x: ax + t * (bx - ax), y: ay + t * (by - ay), t, u };
  };

  PatternBoard.prototype.rasterRect = function(ctx, r, color, width) {
    const hasPinch = r.deformPinches && r.deformPinches.length;
    if (r.texData || r._texImg) {
      const img = this._ensureTexImage ? this._ensureTexImage(r) : r._texCanvas || r._texImg || null;
      const imgOk = img && ((img.complete && img.naturalWidth) || (img.width && img.height));
      if (imgOk) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, this.art.width, this.art.height);
        ctx.clip();
        if (hasPinch && this._deformedOutline) {
          const outline = this._deformedOutline(r, 64);
          if (outline && outline.length >= 3) {
            ctx.beginPath();
            ctx.moveTo(outline[0].x, outline[0].y);
            for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
            ctx.closePath();
            ctx.clip();
          } else {
            ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
          }
        } else {
          ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
        }
        ctx.drawImage(img, r.x, r.y, r.w, r.h);
        ctx.restore();
        return;
      }
    }
    if (r.fabric || r.weave) {
      if (hasPinch && this._deformedOutline) {
        const outline = this._deformedOutline(r, 64);
        if (outline && outline.length >= 3) {
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(outline[0].x, outline[0].y);
          for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
          ctx.closePath();
          ctx.clip();
          this.rasterWeaveFabric(ctx, r.x, r.y, r.w, r.h, color || r.color || '#4a2c20', r);
          ctx.restore();
          return;
        }
      }
      this.rasterWeaveFabric(ctx, r.x, r.y, r.w, r.h, color || r.color || '#4a2c20', r);
      return;
    }
    if (hasPinch && this._deformedOutline) {
      const outline = this._deformedOutline(r, 48);
      if (outline && outline.length >= 3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(outline[0].x, outline[0].y);
        for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
        ctx.closePath();
        if (r.filled || !width) {
          ctx.fillStyle = color || '#2b2820';
          ctx.fill();
        }
        if (width) {
          this.setStroke(ctx, color, width);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
    }
    if (r.filled || !width) {
      ctx.fillStyle = color || '#2b2820';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    } else {
      this.setStroke(ctx, color, width);
      ctx.strokeRect(r.x, r.y, r.w, r.h);
    }
  };

  PatternBoard.prototype.rasterWeaveFabric = function(outCtx, x, y, w, h, color, opts) {
    if (w < 2 || h < 2) return;
    opts = opts || {};
    const cacheKey = [
      Math.round(w), Math.round(h), this._normHex(color || opts.color || '#660000'),
      opts.weaveSeed, opts.weaveWarp, opts.weaveTwist, opts.weaveBulge,
      opts.weaveWarpFreq, opts.weaveAngle, opts.weaveCell,
      opts.weavePush ? JSON.stringify(opts.weavePush) : '',
    ].join('|');
    const PAD = 24;
    const rx = Math.round(x), ry = Math.round(y);
    if (opts._weaveCache && opts._weaveCacheKey === cacheKey) {
      outCtx.drawImage(opts._weaveCache, rx - PAD, ry - PAD);
      return;
    }
    let cacheCanvas = null;
    try {
      cacheCanvas = document.createElement('canvas');
      cacheCanvas.width = Math.max(1, Math.round(w + PAD * 2));
      cacheCanvas.height = Math.max(1, Math.round(h + PAD * 2));
    } catch (e) {
      cacheCanvas = null;
    }
    const ctx = cacheCanvas ? cacheCanvas.getContext('2d') : outCtx;
    if (cacheCanvas) ctx.translate(PAD - rx, PAD - ry);
    const base = this._normHex(color || opts.color || '#660000');
    const c0 = this._shadeHex(base, -0.55);
    const c3 = this._shadeHex(base, 0.62);
    const seed = (opts.weaveSeed != null ? Number(opts.weaveSeed) : (x * 13 + y * 97) | 0) | 0;
    const warp = Math.max(0, Math.min(40, opts.weaveWarp != null && !isNaN(Number(opts.weaveWarp)) ? Number(opts.weaveWarp) : 8));
    const twist = Math.max(0, Math.min(1.5, Number(opts.weaveTwist) || 0));
    const bulge = Math.max(0, Math.min(1.2, Number(opts.weaveBulge) || 0));
    const scale = 0.045 + (opts.weaveWarpFreq || 0.02);
    const detail = 2 + (twist > 0 ? 1 : 0);
    const distort = 0.2 + twist * 0.5;
    const cx0 = x + w * 0.5, cy0c = y + h * 0.5;
    const push = opts.weavePush || { tl: 0, tr: 0, bl: 0, br: 0 };
    const pTL = Math.max(0, Math.min(1, +push.tl || 0));
    const pTR = Math.max(0, Math.min(1, +push.tr || 0));
    const pBL = Math.max(0, Math.min(1, +push.bl || 0));
    const pBR = Math.max(0, Math.min(1, +push.br || 0));
    const hasPush = pTL + pTR + pBL + pBR > 0.01;
    const angle = opts.weaveAngle != null ? Number(opts.weaveAngle) : 0;

    const n2 = (a, b) => {
      const s = Math.sin(a * 127.1 + b * 311.7 + seed * 0.011) * 43758.5453;
      return s - Math.floor(s);
    };
    const noise = (px, py) => {
      let f = 0, amp = 1, sum = 0, fr = scale;
      for (let o = 0; o < detail; o++) {
        const dx = (n2(Math.floor(px * fr * 10 + o * 3), Math.floor(py * fr * 10)) - 0.5) * distort * 12;
        const dy = (n2(Math.floor(py * fr * 10 + o * 5), Math.floor(px * fr * 10)) - 0.5) * distort * 12;
        f += amp * n2((px + dx) * fr * 3, (py + dy) * fr * 3);
        sum += amp; amp *= 0.5; fr *= 2.1;
      }
      return f / sum;
    };

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 12; ctx.shadowOffsetX = 2; ctx.shadowOffsetY = 4;
    ctx.fillStyle = c0;
    ctx.fillRect(x, y, w, h);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

    const rr = Math.min(14, Math.min(w, h) * 0.12);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = c0;
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

    const diag = Math.hypot(w, h) * 1.15;
    const bx = cx0 - diag * 0.5, by = cy0c - diag * 0.5, bw = diag, bh = diag;
    let dens = opts.weaveCell;
    if (!(dens > 0)) dens = 1.6;
    dens = Math.max(0.9, Math.min(5, dens));
    const band = dens * 0.88;
    const rows = Math.ceil(bh / dens) + 4;
    const stepX = Math.max(2.5, bw / 220);

    ctx.save();
    ctx.translate(cx0, cy0c);
    ctx.rotate(angle);
    ctx.translate(-cx0, -cy0c);

    for (let r = -2; r <= rows + 1; r++) {
      const cy0 = by + (r + 0.5) * dens;
      const pts = [];
      for (let px = bx - 4; px <= bx + bw + 4; px += stepX) {
        let qx = px, qy = cy0;
        let foldD = 0;
        if (twist > 0.01 || bulge > 0.01) {
          const u = (px - x) / Math.max(1, w);
          const v = (cy0 - y) / Math.max(1, h);
          const folds = 1 + Math.floor(twist * 2);
          const wave = Math.sin(u * Math.PI * folds + seed * 0.01) * Math.cos(v * Math.PI * 0.9);
          const foldLine = 0.45 + 0.1 * Math.sin(seed * 0.02);
          const distFold = u - foldLine;
          foldD = Math.max(0, Math.min(1, 0.5 + 0.5 * wave)) * (0.35 + 0.65 * Math.max(twist, bulge));
          const sink = foldD * bulge * w * 0.06;
          qx = px - distFold * sink * 1.2;
          const ridge = Math.exp(-Math.pow(distFold * 4.5, 2));
          qy = cy0 - ridge * bulge * h * 0.07 * (0.5 + 0.5 * Math.sin(v * Math.PI)) + foldD * bulge * h * 0.03;
        }
        if (hasPush) {
          const u = (qx - x) / Math.max(1, w);
          const v = (qy - y) / Math.max(1, h);
          const wTL = (1 - u) * (1 - v) * pTL;
          const wTR = u * (1 - v) * pTR;
          const wBL = (1 - u) * v * pBL;
          const wBR = u * v * pBR;
          const pw = wTL + wTR + wBL + wBR;
          if (pw > 0.001) {
            const dx = cx0 - qx, dy = cy0c - qy;
            const sink = Math.min(1, pw * 1.4);
            qx += dx * sink * 0.45;
            qy += dy * sink * 0.45;
            foldD = Math.max(foldD, sink * 0.85);
          }
        }
        if (opts.deformPinches && opts.deformPinches.length) {
          for (const pin of opts.deformPinches) {
            const d = Math.hypot(qx - pin.x, qy - pin.y);
            const R = Math.max(8, pin.r || 40);
            if (d >= R) continue;
            const t = 1 - d / R;
            const ww = t * t * (3 - 2 * t);
            qx += (pin.dx || 0) * ww;
            qy += (pin.dy || 0) * ww;
            foldD = Math.max(foldD, ww * 0.7);
          }
        }
        const nv = noise(qx, qy);
        const macroAmp = Math.min(w, h) * 0.055;
        const macro = Math.sin(qx * 0.006 + seed * 0.021) * macroAmp + Math.sin(qx * 0.0022 - seed * 0.014) * macroAmp * 0.6;
        const microWave = Math.sin(qx * 0.018 + seed * 0.013) * dens * 0.28 + Math.sin(qx * 0.007 + seed * 0.031) * warp * 0.1;
        const yy = qy + (nv - 0.5) * dens * 0.35 + microWave + macro;
        const lift = Math.max(0, 1 - foldD);
        pts.push({ x: qx, y: yy, n: nv, lift, foldD, mac: macro });
      }
      if (pts.length < 2) continue;

      const avgL = pts.reduce((s, p) => s + (p.lift || 0), 0) / pts.length;
      const avgF = pts.reduce((s, p) => s + (p.foldD || 0), 0) / pts.length;
      const avgM = pts.reduce((s, p) => s + (p.mac || 0), 0) / pts.length;
      const macroAmpTot = Math.min(w, h) * 0.055 * 1.6;
      const macroNorm = Math.max(0, Math.min(1, (avgM / macroAmpTot) * 0.5 + 0.5));
      const strandRnd = n2(r * 3.7 + 11.3, seed * 0.53 + 91.2);
      const strandShade = Math.pow(strandRnd, 1.25);
      let col = this._shadeHex(base, -0.62 + strandShade * 1.02);
      if (macroNorm > 0.55) {
        const t = (macroNorm - 0.55) / 0.45;
        col = this._shadeHex(col, t * t * 0.55);
        if (macroNorm > 0.9 && strandShade > 0.5) col = this._shadeHex(c3, ((macroNorm - 0.9) / 0.1) * 0.4);
      } else if (macroNorm < 0.2) {
        col = this._shadeHex(col, -(0.2 - macroNorm) * 0.7);
      }
      if (avgL > 0.4) col = this._shadeHex(col, 0.15);
      if (avgF > 0.35) col = this._shadeHex(col, -0.18 * avgF);

      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = col;
      ctx.lineWidth = band * (1 + (avgL || 0) * 0.15) * (macroNorm > 0.86 ? 1.12 : 1);
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) * 0.5, my = (pts[i].y + pts[i + 1].y) * 0.5;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
    ctx.restore();

    for (let k = 0; k < 4; k++) {
      ctx.save();
      ctx.translate(cx0, cy0c);
      ctx.rotate(angle);
      ctx.translate(-cx0, -cy0c);
      const off = (-0.55 + k * 0.38) * diag;
      const sw = diag * (0.16 + n2(k, 7) * 0.05);
      const g = ctx.createLinearGradient(cx0 + off - sw, by, cx0 + off + sw, by);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.42, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, 'rgba(255,235,235,' + (0.14 + (k % 2) * 0.08) + ')');
      g.addColorStop(0.58, 'rgba(255,255,255,0)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(bx - diag * 0.4, by - diag * 0.4, bw + diag * 0.8, bh + diag * 0.8);
      ctx.restore();
    }

    ctx.restore();
    if (cacheCanvas) {
      opts._weaveCache = cacheCanvas;
      opts._weaveCacheKey = cacheKey;
      outCtx.drawImage(cacheCanvas, rx - PAD, ry - PAD);
    }
  };

  PatternBoard.prototype.rasterNeedlePath = function(ctx, sh) {
    if (this.stagePlaying) return;
    const pts = sh.pts || [];
    if (pts.length < 1) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(90,80,70,0.55)';
    ctx.lineWidth = Math.max(1.5, sh.width || 2.2);
    ctx.setLineDash([8, 6]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (pts.length === 1) {
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(180,60,50,0.7)'; ctx.fill();
    } else {
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(180,60,50,0.85)';
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  };

  PatternBoard.prototype.rasterNeedle3D = function(ctx, x, y, angle, scale, opts) {
    scale = Math.max(0.55, scale || 1.2);
    opts = opts || {};
    const emerge = opts.emerge != null ? opts.emerge : 1;
    const plunge = opts.plunge != null ? opts.plunge : 0;
    const pitch = opts.pitch || 0;
    const L = 52 * scale;
    const halfW = 1.15 * scale;
    const eyeLen = 6.5 * scale;
    const eyeHalf = 1.35 * scale;
    const visible = Math.max(0.1, Math.min(1, emerge)) * (1 - plunge * 0.78);
    const sinkY = plunge * 7 * scale;
    const sinkScaleY = 1 - plunge * 0.4;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.translate(0, sinkY);
    ctx.scale(1, Math.max(0.3, sinkScaleY));
    if (pitch) ctx.rotate(pitch);

    ctx.fillStyle = 'rgba(40,30,20,' + (0.1 + plunge * 0.25) + ')';
    ctx.beginPath();
    ctx.ellipse(L * 0.2, 2.8 * scale + plunge * 2, L * 0.22 * (1 - plunge * 0.25), 1.6 * scale * (1 + plunge * 0.5), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    const tipX = L * 0.95;
    const backVis = tipX - L * visible * 1.2;
    ctx.beginPath();
    ctx.rect(backVis - 2, -16 * scale, tipX - backVis + 10, 32 * scale);
    ctx.clip();

    const g = ctx.createLinearGradient(0, -halfW * 2.2, 0, halfW * 2.2);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.18, '#e2e8ef');
    g.addColorStop(0.38, '#9aa8b8');
    g.addColorStop(0.5, '#5a6a7a');
    g.addColorStop(0.62, '#b0bcc8');
    g.addColorStop(0.82, '#d8e0e8');
    g.addColorStop(1, '#6a7888');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-L * 0.22, halfW * 1.05);
    ctx.lineTo(L * 0.55, halfW * 0.95);
    ctx.lineTo(L * 0.78, halfW * 0.45);
    ctx.lineTo(L * 0.95, 0);
    ctx.lineTo(L * 0.78, -halfW * 0.45);
    ctx.lineTo(L * 0.55, -halfW * 0.95);
    ctx.lineTo(-L * 0.22, -halfW * 1.05);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(0.6, 0.7 * scale);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-L * 0.15, -halfW * 0.25);
    ctx.lineTo(L * 0.7, -halfW * 0.12);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(30,40,50,0.28)';
    ctx.lineWidth = Math.max(0.5, 0.55 * scale);
    ctx.beginPath();
    ctx.moveTo(-L * 0.15, halfW * 0.35);
    ctx.lineTo(L * 0.65, halfW * 0.22);
    ctx.stroke();

    const tipG = ctx.createLinearGradient(L * 0.72, -1, L * 0.96, 1);
    tipG.addColorStop(0, '#c8d0d8');
    tipG.addColorStop(0.45, '#ffffff');
    tipG.addColorStop(1, '#8a98a8');
    ctx.fillStyle = tipG;
    ctx.beginPath();
    ctx.moveTo(L * 0.72, halfW * 0.55);
    ctx.lineTo(L * 0.95, 0);
    ctx.lineTo(L * 0.72, -halfW * 0.55);
    ctx.closePath();
    ctx.fill();

    if (visible > 0.5) {
      const ex = -L * 0.12;
      const eg = ctx.createLinearGradient(ex, -eyeHalf * 1.6, ex, eyeHalf * 1.6);
      eg.addColorStop(0, '#f0f4f8');
      eg.addColorStop(0.5, '#7a8a9a');
      eg.addColorStop(1, '#3a4a5a');
      ctx.fillStyle = eg;
      ctx.beginPath();
      ctx.ellipse(ex, 0, eyeLen * 0.42, eyeHalf * 1.55, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(252,250,245,0.98)';
      ctx.beginPath();
      ctx.ellipse(ex, 0, eyeLen * 0.22, eyeHalf * 0.85, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = Math.max(0.5, 0.6 * scale);
      ctx.beginPath();
      ctx.ellipse(ex, 0, eyeLen * 0.42, eyeHalf * 1.55, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    if (plunge > 0.2) {
      ctx.fillStyle = 'rgba(25,20,15,' + (0.12 + plunge * 0.3) + ')';
      ctx.beginPath();
      ctx.ellipse(L * 0.35, 1.5 * scale, 3.2 * scale * plunge, 1.4 * scale * plunge, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  };

  PatternBoard.prototype._pointOnPath = function(pts, t) {
    if (!pts || !pts.length) return null;
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, angle: 0 };
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(cum[i - 1] + (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 0));
    const total = cum[cum.length - 1] || 1;
    const target = Math.max(0, Math.min(1, t)) * total;
    let i = 1;
    while (i < cum.length && cum[i] < target) i++;
    const i0 = Math.max(0, i - 1), i1 = Math.min(pts.length - 1, i);
    const seg = cum[i1] - cum[i0] || 1;
    const u = (target - cum[i0]) / seg;
    const x = pts[i0].x + (pts[i1].x - pts[i0].x) * u;
    const y = pts[i0].y + (pts[i1].y - pts[i0].y) * u;
    const angle = Math.atan2(pts[i1].y - pts[i0].y, pts[i1].x - pts[i0].x);
    return { x, y, angle };
  };

  PatternBoard.prototype._ensureTexImage = function(sh) {
    if (!sh) return null;
    if (sh._texCanvas && sh._texCanvas.width) return sh._texCanvas;
    if (sh._texImg && (sh._texImg.complete || sh._texImg.naturalWidth)) return sh._texImg;
    if (!sh.texData) return null;
    const img = new Image();
    img.src = sh.texData;
    sh._texImg = img;
    img.onload = () => {
      try { this.rebuildArt(); this.render(); } catch (_) {}
    };
    return img;
  };

  PatternBoard.prototype._rasterTexInShape = function(ctx, sh) {
    const img = this._ensureTexImage(sh);
    const okCanvas = img && img.width && !img.naturalWidth;
    const okImg = img && ((img.complete && img.naturalWidth) || okCanvas || (img.width && img.height));
    if (!img || !okImg) return false;
    const bb = shapeBBox(sh);
    if (!bb) return false;
    const x = bb.minX, y = bb.minY, w = Math.max(1, bb.maxX - bb.minX), h = Math.max(1, bb.maxY - bb.minY);
    ctx.save();
    ctx.beginPath();
    if (sh.kind === 'circle') {
      ctx.arc(sh.cx, sh.cy, sh.r, 0, Math.PI * 2);
    } else if (sh.kind === 'triangle' && sh.p1) {
      ctx.moveTo(sh.p1.x, sh.p1.y); ctx.lineTo(sh.p2.x, sh.p2.y); ctx.lineTo(sh.p3.x, sh.p3.y); ctx.closePath();
    } else if ((sh.kind === 'freehandClosed' || sh.kind === 'freehand') && sh.pts && sh.pts.length >= 3) {
      ctx.moveTo(sh.pts[0].x, sh.pts[0].y);
      for (let i = 1; i < sh.pts.length; i++) ctx.lineTo(sh.pts[i].x, sh.pts[i].y);
      ctx.closePath();
    } else if (sh.kind === 'rect') {
      ctx.rect(sh.x, sh.y, sh.w, sh.h);
    } else {
      ctx.rect(x, y, w, h);
    }
    ctx.clip();
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
    return true;
  };

  PatternBoard.prototype._displaceByPinches = function(sh, x, y) {
    const list = sh && sh.deformPinches;
    if (!list || !list.length) return { x, y };
    let ox = 0, oy = 0;
    for (const p of list) {
      const d = Math.hypot(x - p.x, y - p.y);
      const R = Math.max(8, p.r || 40);
      if (d >= R) continue;
      const t = 1 - d / R;
      const w = t * t * (3 - 2 * t);
      ox += (p.dx || 0) * w;
      oy += (p.dy || 0) * w;
    }
    return { x: x + ox, y: y + oy };
  };

  PatternBoard.prototype._deformedOutline = function(sh, density) {
    density = density || 48;
    const pts = [];
    if (sh.kind === 'rect') {
      const x = sh.x, y = sh.y, w = sh.w, h = sh.h;
      const per = 2 * (w + h) || 1;
      const n = Math.max(32, density);
      for (let i = 0; i < n; i++) {
        let t = (i / n) * per, px, py;
        if (t <= w) { px = x + t; py = y; }
        else if (t <= w + h) { px = x + w; py = y + (t - w); }
        else if (t <= 2 * w + h) { px = x + w - (t - w - h); py = y + h; }
        else { px = x; py = y + h - (t - 2 * w - h); }
        pts.push(this._displaceByPinches(sh, px, py));
      }
    } else if (sh.kind === 'circle') {
      const n = Math.max(36, density);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = sh.cx + Math.cos(a) * sh.r, py = sh.cy + Math.sin(a) * sh.r;
        pts.push(this._displaceByPinches(sh, px, py));
      }
    }
    return pts;
  };
}
