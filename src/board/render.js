import {
  distPtSeg, polylineDist, normAngle, angleInArc, RECOLORABLE,
  shapeAnchors, shapesConnected, shapeDist, shapeBBox, arcTightBBox,
  unionBBox, bboxWithin, cloneShapeOffset, offsetFillGeo, transformFillGeo,
  rotPt, rotateShape, scalePt, scaleShape, buildSemiArc, arcMidpoint,
  arcEndPoints, arcBetweenPoints, flipPt, flipShape, clamp, dist
} from './geometry.ts';
import { ART_MIN_W, ART_MIN_H, ART_MAX_W, ART_MAX_H, GUIDE_SP, SNAP_D } from './constants.ts';

export function attachRenderMethods(PatternBoard) {
  PatternBoard.prototype.paintTextLabel = function(ctx, x, y, txt, size, color) {
    if (!txt) return;
    ctx.save();
    ctx.font = '600 ' + size + 'px system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size * 0.12);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = color || '#1a1814';
    ctx.fillText(txt, x, y);
    ctx.restore();
  };

  PatternBoard.prototype.paintNumber = function(ctx, x, y, txt, size, color, withBadge) {
    ctx.save();
    ctx.font = '700 ' + size + 'px system-ui,-apple-system,"Segoe UI",Tahoma,Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (withBadge) {
      const r = size * 0.68;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = Math.max(1, size * 0.05);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.fillText(txt, x, y);
    } else {
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1.5, size * 0.28);
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(txt, x, y);
      ctx.fillStyle = color;
      ctx.fillText(txt, x, y);
    }
    ctx.restore();
  };

  PatternBoard.prototype.drawNumbersScreen = function() {
    const c = this.ctx;
    const sc = this.view.scale;
    for (const sh of this.shapes) {
      if (sh.hidden || sh.guide) continue;
      if (sh.color && this.hiddenColors.has(sh.color.toLowerCase())) continue;
      if (this.moveHideIds && this.moveHideIds.has(sh.id)) continue;
      if (sh.kind === 'number') {
        if (!this.numbersVisible) continue;
        const base = sh.size || 12;
        const size = Math.max(5.5, base * sc);
        const sp = this.w2s(sh.x, sh.y);
        const withBadge = size >= 16;
        this.paintNumber(c, sp.x, sp.y, String(sh.text), size, sh.color || '#1a1814', withBadge);
      } else if (sh.kind === 'text') {
        const base = sh.size || 14;
        const size = Math.max(8, base * sc);
        const sp = this.w2s(sh.x, sh.y);
        this.paintTextLabel(c, sp.x, sp.y, String(sh.text || ''), size, sh.color || '#1a1814');
      }
    }
  };

  PatternBoard.prototype.drawGuides = function(pr) {
    const c = this.ctx;
    c.save();
    c.beginPath();
    c.rect(pr.x, pr.y, pr.w, pr.h);
    c.clip();
    if (this.guideMode !== 'none') {
      c.strokeStyle = 'rgba(63,99,87,.28)';
      c.lineWidth = 1;
      const sp = GUIDE_SP * this.view.scale;
      for (let y = pr.y; y <= pr.y + pr.h; y += sp) {
        c.beginPath(); c.moveTo(pr.x, y); c.lineTo(pr.x + pr.w, y); c.stroke();
      }
      if (this.guideMode === 'grid' || this.guideMode === 'ruled') {
        for (let x = pr.x; x <= pr.x + pr.w; x += sp) {
          c.beginPath(); c.moveTo(x, pr.y); c.lineTo(x, pr.y + pr.h); c.stroke();
        }
      }
    }
    if (this.alignGuides && this.alignGuides.length) {
      c.setLineDash([6, 4]);
      c.lineWidth = 1.5;
      c.strokeStyle = 'rgba(124,58,237,0.85)';
      for (const g of this.alignGuides) {
        if (g.type === 'h') {
          const y = g.pos * this.view.scale + this.view.oy;
          c.beginPath(); c.moveTo(pr.x, y); c.lineTo(pr.x + pr.w, y); c.stroke();
        } else {
          const x = g.pos * this.view.scale + this.view.ox;
          c.beginPath(); c.moveTo(x, pr.y); c.lineTo(x, pr.y + pr.h); c.stroke();
        }
      }
      c.setLineDash([]);
    }
    if (this.selectedStageIdxs && this.selectedStageIdxs.size) {
      this.drawSelectedStageHighlight(c, pr);
    }
    if (this.floating) {
      const f = this.floating, sc = this.view.scale, scale = f.scale || 1;
      const top = f.worldY, bot = f.worldY + f.h * scale, mid = (top + bot) / 2;
      const left = f.worldX, right = f.worldX + f.w * scale, cx = (left + right) / 2;
      c.setLineDash([4, 3]);
      c.lineWidth = 1;
      c.strokeStyle = 'rgba(201,98,47,0.55)';
      for (const y of [top, mid, bot]) {
        const sy = y * sc + this.view.oy;
        c.beginPath(); c.moveTo(pr.x, sy); c.lineTo(pr.x + pr.w, sy); c.stroke();
      }
      for (const x of [left, cx, right]) {
        const sx = x * sc + this.view.ox;
        c.beginPath(); c.moveTo(sx, pr.y); c.lineTo(sx, pr.y + pr.h); c.stroke();
      }
      c.setLineDash([]);
      if (this.floatAxisLock === 'x') {
        c.setLineDash([8, 4]);
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(124,58,237,0.9)';
        for (const x of [f.originX, f.originX + f.w / 2, f.originX + f.w]) {
          const sx = x * sc + this.view.ox;
          c.beginPath(); c.moveTo(sx, pr.y); c.lineTo(sx, pr.y + pr.h); c.stroke();
        }
        c.setLineDash([]);
      } else if (this.floatAxisLock === 'y') {
        c.setLineDash([8, 4]);
        c.lineWidth = 2;
        c.strokeStyle = 'rgba(124,58,237,0.9)';
        for (const y of [f.originY, f.originY + f.h / 2, f.originY + f.h]) {
          const sy = y * sc + this.view.oy;
          c.beginPath(); c.moveTo(pr.x, sy); c.lineTo(pr.x + pr.w, sy); c.stroke();
        }
        c.setLineDash([]);
      }
    }
    c.restore();
  };

  PatternBoard.prototype.drawSel = function(pr) {
    if (this.floating) return;
    if (!this.selRect && (!this.selShapeIds || !this.selShapeIds.size)) return;
    const c = this.ctx;
    c.save();
    if (this.selRect && this.tool === 'select') {
      const a = this.w2s(this.selRect.x, this.selRect.y),
        b = this.w2s(this.selRect.x + this.selRect.w, this.selRect.y + this.selRect.h);
      c.strokeStyle = '#c9622f';
      c.setLineDash([6, 4]);
      c.lineWidth = 2;
      c.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    c.setLineDash([]);
    const selected = this.getSelectedShapesOrdered();
    selected.forEach((sh, i) => {
      const bb = shapeBBox(sh);
      if (!bb) return;
      const pad = 3;
      const p1 = this.w2s(bb.minX - pad, bb.minY - pad),
        p2 = this.w2s(bb.maxX + pad, bb.maxY + pad);
      const isFocus = this._focusSelId === sh.id;
      c.strokeStyle = isFocus ? '#c9622f' : 'rgba(63,99,87,0.9)';
      c.lineWidth = isFocus ? 3.5 : 2.5;
      c.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      const label = String(i + 1);
      const bx = p1.x + 2, by = p1.y + 2;
      const r = 10;
      c.beginPath();
      c.arc(bx + r, by + r, r, 0, Math.PI * 2);
      c.fillStyle = isFocus ? '#c9622f' : '#3f6357';
      c.fill();
      c.fillStyle = '#fff';
      c.font = 'bold 11px system-ui,sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, bx + r, by + r + 0.5);
    });
    c.restore();
  };

  PatternBoard.prototype.drawPlacePoint = function() {
    if (!this.placePoint) return;
    const c = this.ctx;
    const p = this.w2s(this.placePoint.x, this.placePoint.y);
    const r = 10;
    c.save();
    c.strokeStyle = '#e11d48';
    c.fillStyle = 'rgba(225,29,72,0.2)';
    c.lineWidth = 2;
    c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.moveTo(p.x - r - 4, p.y); c.lineTo(p.x + r + 4, p.y);
    c.moveTo(p.x, p.y - r - 4); c.lineTo(p.x, p.y + r + 4); c.stroke();
    c.fillStyle = '#e11d48';
    c.font = 'bold 11px sans-serif';
    c.fillText('نقطة', p.x + r + 6, p.y - 4);
    c.restore();
  };

  PatternBoard.prototype.drawFloat = function(pr) {
    if (!this.floating) return;
    const f = this.floating, c = this.ctx;
    const ang = ((f.rotation || 0) * Math.PI) / 180;
    const scale = f.scale || 1;
    const sx = f.flipH ? -1 : 1, sy = f.flipV ? -1 : 1;
    const cx = f.worldX + f.w / 2, cy = f.worldY + f.h / 2;
    const sc = this.view.scale;
    const screenCx = cx * sc + this.view.ox, screenCy = cy * sc + this.view.oy;
    const halfW = (f.w * sc * scale) / 2, halfH = (f.h * sc * scale) / 2;
    c.save();
    c.globalAlpha = 0.85;
    c.imageSmoothingEnabled = true;
    c.translate(screenCx, screenCy);
    c.rotate(ang);
    c.scale(sx, sy);
    c.drawImage(f.previewCanvas, 0, 0, f.w, f.h, -halfW, -halfH, halfW * 2, halfH * 2);
    c.globalAlpha = 1;
    c.strokeStyle = '#c9622f';
    c.setLineDash([4, 3]);
    c.lineWidth = 1.5;
    c.strokeRect(-halfW, -halfH, halfW * 2, halfH * 2);
    c.restore();
  };

  PatternBoard.prototype.setStroke = function(ctx, color, width) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  PatternBoard.prototype.rasterFree = function(ctx, pts, close, color, width, straight) {
    this.setStroke(ctx, color, width);
    if (pts.length < 2) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (straight || pts.length <= 4) {
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    } else {
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    }
    if (close) ctx.closePath();
    ctx.stroke();
  };

  PatternBoard.prototype.rasterLine = function(ctx, x1, y1, x2, y2, color, width) {
    this.setStroke(ctx, color, width);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  PatternBoard.prototype.rasterArrow = function(ctx, x1, y1, x2, y2, color, width) {
    const w = width || 4;
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const headLen = Math.min(Math.max(w * 3.2, 10), len * 0.45);
    const headW = headLen * 0.55;
    const sx = x2 - ux * headLen, sy = y2 - uy * headLen;
    this.setStroke(ctx, color, w);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    const px = -uy * headW, py = ux * headW;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(sx + px, sy + py);
    ctx.lineTo(sx - px, sy - py);
    ctx.closePath();
    ctx.fillStyle = color || '#000';
    ctx.fill();
  };

  PatternBoard.prototype.rasterCircle = function(ctx, cx, cy, r, color, width, filled) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (filled || !width) {
      ctx.fillStyle = color || '#c9622f';
      ctx.fill();
    } else {
      this.setStroke(ctx, color, width);
      ctx.stroke();
    }
  };

  PatternBoard.prototype.rasterArc = function(ctx, cx, cy, r, s, e, ccw, color, width) {
    this.setStroke(ctx, color, width);
    ctx.beginPath();
    ctx.arc(cx, cy, r, s, e, ccw);
    ctx.stroke();
  };

  PatternBoard.prototype.rasterTri = function(ctx, p1, p2, p3, color, width, filled) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    if (filled || !width) {
      ctx.fillStyle = color || '#2b2820';
      ctx.fill();
    }
    if (width) {
      this.setStroke(ctx, color, width);
      ctx.stroke();
    }
  };

  PatternBoard.prototype.rasterErase = function(ctx, pts, width) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    if (pts.length < 2) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, width / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
      ctx.stroke();
    }
    ctx.restore();
  };

  PatternBoard.prototype.rasterNumber = function(ctx, sh) {
    this.paintNumber(ctx, sh.x, sh.y, String(sh.text), sh.size || 12, sh.color || '#1a1814');
  };

  PatternBoard.prototype.rasterTextLabel = function(ctx, sh) {
    this.paintTextLabel(ctx, sh.x, sh.y, String(sh.text || ''), sh.size || 14, sh.color || '#1a1814');
  };

  PatternBoard.prototype._shadeHex = function(hex, amount) {
    hex = this._normHex(hex || '#2b2820');
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amount >= 0) {
      r = Math.round(r + (255 - r) * amount);
      g = Math.round(g + (255 - g) * amount);
      b = Math.round(b + (255 - b) * amount);
    } else {
      const k = 1 + amount;
      r = Math.round(r * k);
      g = Math.round(g * k);
      b = Math.round(b * k);
    }
    const h = (x) => ('0' + Math.max(0, Math.min(255, x)).toString(16)).slice(-2);
    return '#' + h(r) + h(g) + h(b);
  };
}
