import {
  shapeBBox, unionBBox, cloneShapeOffset, dist, clamp
} from './geometry.ts';
import { ART_MIN_W, ART_MIN_H, ART_MAX_W, ART_MAX_H } from './constants.ts';

export function attachStageMethods(PatternBoard) {
  PatternBoard.prototype.updateStageRecUI = function() {
    const rec = document.getElementById('stageRecToggle');
    const save = document.getElementById('stageSaveBtn');
    const prev = document.getElementById('stagePreviewBtn');
    const fromArt = document.getElementById('stageFromArtBtn');
    const exp = document.getElementById('stageExportBtn');
    const clr = document.getElementById('stageClearBtn');
    const cnt = document.getElementById('stageRecCount');
    if (rec) {
      rec.classList.toggle('rec-on', this.stageRecording);
      rec.textContent = this.stageRecording ? '■ إيقاف التسجيل' : '● تسجيل مراحل';
      rec.disabled = !!this.stagePlaying;
    }
    if (save) save.disabled = !this.stageRecording || this.stagePlaying;
    if (prev) {
      prev.disabled = !this.stageTimeline.length && !this.stagePlaying;
      if (this.stagePlaying) {
        prev.textContent = '■ إيقاف';
        prev.title = 'إيقاف المعاينة';
        prev.style.background = '#c44';
        prev.style.color = '#fff';
      } else {
        prev.textContent = '▶ معاينة';
        prev.title = 'معاينة أنيميشن البناء';
        prev.style.background = '';
        prev.style.color = '';
      }
    }
    if (fromArt) fromArt.disabled = !!this.stagePlaying;
    if (exp) exp.disabled = !this.stageTimeline.length || this.stagePlaying;
    const fm = document.getElementById('stageFinalModeBtn');
    if (fm) {
      fm.classList.toggle('active', !!this.finalMaterialVideo);
      fm.textContent = this.finalMaterialVideo ? '🧵 فيديو بالخامة' : '⚡ فيديو سريع';
      fm.title = this.finalMaterialVideo
        ? 'الفيديو النهائي: المستطيلات نسيج والخطوط خيوط، مع نفس الزمن والطبقات'
        : 'الفيديو يعرض الرسم العادي بدون خامة';
      fm.disabled = !!this.stagePlaying;
    }
    const undoSt = document.getElementById('stageUndoBtn');
    if (undoSt) undoSt.disabled = !this.stageTimeline.length || this.stagePlaying;
    if (clr) clr.disabled = !this.stageTimeline.length || this.stagePlaying;
    if (cnt) cnt.textContent = this.stageTimeline.length + ' مراحل';
    try {
      this.renderStageThumbs();
    } catch (e) {
      console.warn('renderStageThumbs', e);
    }
  };

  PatternBoard.prototype.toggleStageRecording = function() {
    if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
    if (!this.stageRecording && this.boardMode) {
      this.showToast('عطّلي وضع اللوحة أولاً ثم سجّلي الغرز فقط');
      return;
    }
    this.stageRecording = !this.stageRecording;
    this.updateStageRecUI();
    this.showToast(
      this.stageRecording
        ? 'التسجيل يعمل — اللوحة/الثوب ثابتة ولن تُحفظ في اللقطات'
        : 'توقف التسجيل · المراحل المحفوظة: ' + this.stageTimeline.length
    );
  };

  PatternBoard.prototype.isShapeOutsideArt = function(sh) {
    if (!sh || sh.guide) return false;
    const b = shapeBBox(sh);
    if (!b) return true;
    const m = 2;
    return b.maxX < m || b.maxY < m || b.minX > this.art.width - m || b.minY > this.art.height - m;
  };

  PatternBoard.prototype.purgeOutsideArtShapes = function(silent) {
    const kept = [], removed = [];
    for (const sh of this.shapes) {
      if (this.isShapeOutsideArt(sh)) removed.push(sh);
      else kept.push(sh);
    }
    if (!removed.length) return 0;
    this.shapes = kept;
    this.pushHistory({ op: 'batchRemove', shapes: removed.map((s) => this._cloneShapeDeep(s)) });
    this.rebuildArt();
    this.render();
    if (!silent) this.showToast('حُذف ' + removed.length + ' شكل خارج إطار اللوحة');
    return removed.length;
  };

  PatternBoard.prototype.snapshotBoardForStage = function() {
    const ordered = this.shapesInDrawOrder(this.shapes);
    return ordered
      .filter((sh) => {
        if (!sh || sh.hidden || sh.guide) return false;
        if (sh.board) return false;
        if (this.isShapeOutsideArt && this.isShapeOutsideArt(sh)) return false;
        return true;
      })
      .map((sh) => this._cloneShapeDeep(sh));
  };

  PatternBoard.prototype.getBoardShapes = function() {
    return (this.shapes || []).filter((sh) => sh && sh.board && !sh.hidden);
  };

  PatternBoard.prototype.getWorkShapes = function() {
    return (this.shapes || []).filter((sh) => sh && !sh.board && !sh.guide && !sh.hidden);
  };

  PatternBoard.prototype.saveStage = function() {
    if (!this.stageRecording) { this.showToast('شغّلي التسجيل أولاً'); return; }
    if (this.stagePlaying) return;
    this.purgeOutsideArtShapes(true);
    const before = JSON.parse(JSON.stringify(this.stageTimeline || []));
    const snap = this.snapshotBoardForStage();
    if (!snap.length) { this.showToast('لا أشكال داخل الإطار لحفظها'); return; }
    const nErase = snap.filter((s) => s.kind === 'eraser').length;
    this.stageTimeline.push({
      shapes: snap,
      label: 'مرحلة ' + (this.stageTimeline.length + 1),
      t: Date.now(),
    });
    this.pushStageSnapshot(before);
    this.updateStageRecUI();
    this.autoSave();
    let msg = 'حُفظت ' + this.stageTimeline[this.stageTimeline.length - 1].label + ' (' + snap.length + ' عنصر)';
    if (nErase) msg += ' · منها ' + nErase + ' مسح';
    this.showToast(msg);
  };

  PatternBoard.prototype.clearStages = function() {
    if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
    if (!(this.stageTimeline && this.stageTimeline.length)) { this.showToast('لا مراحل'); return; }
    const before = JSON.parse(JSON.stringify(this.stageTimeline));
    this.stageTimeline = [];
    this.selectedStageIdxs = new Set();
    this.pushStageSnapshot(before);
    this.updateStageRecUI();
    this.autoSave();
    this.showToast('مُسحت كل المراحل — يمكن التراجع ↩');
  };

  PatternBoard.prototype.deleteLastStage = function() {
    if (!this.stageTimeline.length) { this.showToast('لا مراحل لحذفها'); return; }
    this.deleteStageAt(this.stageTimeline.length - 1);
  };

  PatternBoard.prototype.deleteStageAt = function(idx) {
    if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
    if (!(idx >= 0 && idx < this.stageTimeline.length)) return;
    const before = JSON.parse(JSON.stringify(this.stageTimeline));
    this.stageTimeline.splice(idx, 1);
    const next = new Set();
    for (const i of this.selectedStageIdxs || []) {
      if (i < idx) next.add(i);
      else if (i > idx) next.add(i - 1);
    }
    this.selectedStageIdxs = next;
    this.renumberStages();
    this.pushStageSnapshot(before);
    this.updateStageRecUI();
    this.autoSave();
    this.render();
    this.showToast('حُذفت لقطة — تراجعي بـ ↩ إن لزم · المتبقي: ' + this.stageTimeline.length);
  };

  PatternBoard.prototype.renumberStages = function() {
    this.stageTimeline.forEach((st, i) => { st.label = 'مرحلة ' + (i + 1); });
  };

  PatternBoard.prototype.toggleStageSelect = function(idx) {
    idx = parseInt(idx, 10);
    if (isNaN(idx)) return;
    if (this.stageMoveMode) { this.moveStageToNumber(idx); return; }
    if (this._stageEditBackup) {
      const multi = !!this.editCollectMode;
      if (multi) {
        if (this.selectedStageIdxs.has(idx)) this.selectedStageIdxs.delete(idx);
        else this.selectedStageIdxs.add(idx);
      } else {
        this.selectedStageIdxs = new Set([idx]);
      }
      const st = this.stageTimeline[idx];
      if (st && st.shapes && (!multi || this.selectedStageIdxs.size === 1)) {
        this.shapes = JSON.parse(JSON.stringify(st.shapes));
        this.rebuildArt && this.rebuildArt();
      }
      this.syncEditCanvasSelection();
      if (this.tool !== 'pickSelect' && this.tool !== 'select' && this.tool !== 'pan') {
        this.setTool('pickSelect');
      }
      this.renderStageThumbs();
      this.updateStageSelBar();
      this.render();
      this.showToast(multi ? 'محدّد: ' + this.selectedStageIdxs.size : 'قطعة ' + (idx + 1) + ' — اضغطي الشكل على اللوحة لتحديده');
      return;
    }
    const btn = document.getElementById('stageMultiBtn');
    const multi = !!(this.stageMultiSelect || (btn && (btn.classList.contains('active') || btn.getAttribute('data-multi') === '1')));
    this.stageMultiSelect = multi;
    if (btn) {
      btn.classList.toggle('active', multi);
      btn.setAttribute('data-multi', multi ? '1' : '0');
    }
    if (!this.selectedStageIdxs) this.selectedStageIdxs = new Set();
    this.selectedStageIdxs = new Set([...this.selectedStageIdxs].filter((i) => i >= 0 && i < (this.stageTimeline || []).length));
    if (multi) {
      if (this.selectedStageIdxs.has(idx)) this.selectedStageIdxs.delete(idx);
      else this.selectedStageIdxs.add(idx);
    } else {
      if (this.selectedStageIdxs.has(idx) && this.selectedStageIdxs.size === 1) this.selectedStageIdxs.clear();
      else {
        this.selectedStageIdxs = new Set([idx]);
        this._lastStageFocusIdx = idx;
      }
    }
    if (this.selectedStageIdxs.size) {
      this._lastStageFocusIdx = Math.min(...this.selectedStageIdxs);
    }
    this.renderStageThumbs();
    this.updateStageSelBar();
    this.render();
  };

  PatternBoard.prototype.clearStageSelection = function() {
    this.selectedStageIdxs = new Set();
    this.renderStageThumbs();
    this.updateStageSelBar();
    this.render();
  };

  PatternBoard.prototype.updateStageSelBar = function() {
    const bar = document.getElementById('stageSelBar');
    const info = document.getElementById('stageSelInfo');
    const n = (this.selectedStageIdxs && this.selectedStageIdxs.size) || 0;
    if (bar) bar.classList.toggle('show', n > 0 || !!this.stageMultiSelect);
    const mb = document.getElementById('stageMultiBtn');
    if (mb) mb.classList.toggle('active', !!this.stageMultiSelect);
    const mh = document.getElementById('stageMultiHint');
    if (mh)
      mh.textContent = this.stageMultiSelect
        ? 'مفعّل — ' + n + ' محدّدة · اضغطي لقطات أخرى لإضافتها'
        : 'متوقف — اضغطي «تحديد متعدد» ثم اللقطات';
    if (info) {
      if (n === 1) info.textContent = 'لقطة ' + ([...this.selectedStageIdxs][0] + 1) + ' — عدّلي ثم «إعادة حفظ»';
      else if (n > 1) info.textContent = n + ' لقطات محدّدة';
      else info.textContent = this.stageMultiSelect ? 'اختاري اللقطات' : '';
    }
    const resave = document.getElementById('stageSelResave');
    if (resave) resave.style.display = n === 1 ? '' : 'none';
  };

  PatternBoard.prototype.getSelectedStageShapeIds = function() {
    const sel = this.selectedStageIdxs || new Set();
    const ids = new Set();
    for (const i of sel) {
      const st = this.stageTimeline[i];
      if (!st || !st.shapes) continue;
      for (const sh of st.shapes) {
        if (sh.id != null) ids.add(sh.id);
      }
    }
    return ids;
  };

  PatternBoard.prototype.getSelectedStageShapes = function() {
    const ids = this.getSelectedStageShapeIds();
    const live = this.shapes.filter((sh) => ids.has(sh.id));
    if (live.length) return live;
    const out = [];
    for (const i of this.selectedStageIdxs || []) {
      const st = this.stageTimeline[i];
      if (st && st.shapes) out.push(...st.shapes);
    }
    return out;
  };

  PatternBoard.prototype.hideSelectedStageShapes = function() {
    const ids = this.getSelectedStageShapeIds();
    if (!ids.size) { this.showToast('لا أشكال في اللقطات المحدّدة'); return; }
    let n = 0;
    for (const sh of this.shapes) {
      if (ids.has(sh.id) && !sh.hidden) { sh.hidden = true; n++; }
    }
    this.rebuildArt(); this.render(); this.autoSave();
    this.showToast(n ? 'أُخفيت ' + n + ' شكل — احفظي اللقطة الجديدة الآن' : 'كانت مخفية مسبقًا');
  };

  PatternBoard.prototype.showSelectedStageShapes = function() {
    const ids = this.getSelectedStageShapeIds();
    if (!ids.size) { this.showToast('لا أشكال في اللقطات المحدّدة'); return; }
    let n = 0;
    for (const sh of this.shapes) {
      if (ids.has(sh.id) && sh.hidden) { sh.hidden = false; n++; }
    }
    this.rebuildArt(); this.render(); this.autoSave();
    this.showToast(n ? 'أُظهرت ' + n + ' شكل' : 'كانت ظاهرة مسبقًا');
  };

  PatternBoard.prototype.resaveSelectedStage = function() {
    if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
    const sel = [...(this.selectedStageIdxs || [])];
    if (sel.length !== 1) {
      this.showToast('حدّدي لقطة واحدة فقط لإعادة حفظها');
      return;
    }
    const idx = sel[0];
    if (!(idx >= 0 && idx < this.stageTimeline.length)) return;
    const snap = this.snapshotBoardForStage();
    if (!snap.length) { this.showToast('لا أشكال ظاهرة لإعادة الحفظ'); return; }
    const oldN = (this.stageTimeline[idx].shapes || []).length;
    this.stageTimeline[idx] = {
      shapes: snap,
      label: this.stageTimeline[idx].label || 'مرحلة ' + (idx + 1),
      savedAt: new Date().toISOString(),
    };
    this.updateStageRecUI(); this.autoSave(); this.render();
    this.showToast('أُعيد حفظ اللقطة ' + (idx + 1) + ' (' + oldN + ' ← ' + snap.length + ' شكل)');
  };

  PatternBoard.prototype.copySelectedStageAsFloat = function() {
    if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
    const sel = [...(this.selectedStageIdxs || [])];
    if (!sel.length) { this.showToast('اختاري لقطة أولاً'); return; }
    const src = this.getSelectedStageShapes();
    if (!src.length) { this.showToast('لا أشكال في اللقطة المحددة'); return; }
    const template = src.map((sh) => this._cloneShapeDeep(sh));
    const ub = unionBBox(template);
    if (!ub) return;
    const ox = ub.minX, oy = ub.minY, uw = ub.maxX - ub.minX, uh = ub.maxY - ub.minY;
    const preview = this.buildPreviewCanvas(template, ox, oy, uw, uh);
    const target = this.lastPoint || { x: this.art.width / 2, y: this.art.height / 2 };
    const placeX = clamp(target.x - uw / 2, 0, this.art.width - uw);
    const placeY = clamp(target.y - uh / 2, 0, this.art.height - uh);
    this.cancelFloat && this.cancelFloat();
    this.floating = {
      shapesTemplate: template, previewCanvas: preview, w: uw, h: uh,
      originX: ox, originY: oy, worldX: placeX, worldY: placeY,
      rotation: 0, scale: 1, flipH: false, flipV: false,
      silkView: 0, faceView: 'front', baseTemplate: null,
      isMove: false, originalIds: null, contentPad: 0,
    };
    this.floatAxisLock = null;
    this.clearStageSelection && this.clearStageSelection();
    this.clearSelection && this.clearSelection();
    this.stage.style.cursor = 'move';
    this.showFloatPanel(true);
    this.resetFloatUI();
    this.showToast('نسخة شفافة من اللقطة جاهزة — اسحبيها للمكان الجديد ثم ثبّتي');
    this.render();
  };

  PatternBoard.prototype.drawSelectedStageHighlight = function(c, pr) {
    const shapes = this.getSelectedStageShapes().filter((sh) => !sh.hidden);
    if (!shapes.length) return;
    const v = this.view;
    const toS = (x, y) => ({ x: pr.x + x * v.scale, y: pr.y + y * v.scale });
    let ub = null;
    try { ub = unionBBox(shapes); } catch (_e) {}
    c.save();
    for (const sh of shapes) {
      try {
        c.save();
        if (sh.kind === 'line' || sh.kind === 'arrow') {
          const a = toS(sh.x1, sh.y1), b = toS(sh.x2, sh.y2);
          c.strokeStyle = 'rgba(196,92,38,0.85)';
          c.lineWidth = Math.max(4, (sh.width || 2) * v.scale + 3);
          c.lineCap = 'round';
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        } else if (sh.kind === 'arc') {
          const cx = pr.x + sh.cx * v.scale, cy = pr.y + sh.cy * v.scale, r = sh.r * v.scale;
          c.strokeStyle = 'rgba(196,92,38,0.85)';
          c.lineWidth = Math.max(4, (sh.width || 2) * v.scale + 3);
          c.lineCap = 'round';
          c.beginPath(); c.arc(cx, cy, r, sh.start, sh.end, !!sh.anticlockwise); c.stroke();
        } else if (sh.kind === 'circle') {
          const cx = pr.x + sh.cx * v.scale, cy = pr.y + sh.cy * v.scale, r = sh.r * v.scale;
          c.strokeStyle = 'rgba(196,92,38,0.85)';
          c.lineWidth = Math.max(4, (sh.width || 2) * v.scale + 3);
          c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
        } else if (sh.pts && sh.pts.length) {
          c.strokeStyle = 'rgba(196,92,38,0.85)';
          c.lineWidth = Math.max(4, (sh.width || 2) * v.scale + 3);
          c.lineCap = 'round'; c.lineJoin = 'round';
          c.beginPath();
          const p0 = toS(sh.pts[0].x, sh.pts[0].y); c.moveTo(p0.x, p0.y);
          for (let k = 1; k < sh.pts.length; k++) {
            const p = toS(sh.pts[k].x, sh.pts[k].y); c.lineTo(p.x, p.y);
          }
          if (sh.kind === 'freehandClosed') c.closePath();
          c.stroke();
        } else if (sh.kind === 'rect') {
          const p = toS(sh.x, sh.y);
          c.strokeStyle = 'rgba(196,92,38,0.85)';
          c.lineWidth = Math.max(3, 2 * v.scale + 2);
          c.strokeRect(p.x, p.y, sh.w * v.scale, sh.h * v.scale);
        }
        c.restore();
      } catch (_e) {}
    }
    if (ub) {
      const pad = 8 * v.scale;
      const x = pr.x + ub.minX * v.scale - pad, y = pr.y + ub.minY * v.scale - pad;
      const w = (ub.maxX - ub.minX) * v.scale + pad * 2, h = (ub.maxY - ub.minY) * v.scale + pad * 2;
      c.setLineDash([6, 4]); c.strokeStyle = 'rgba(196,92,38,0.95)'; c.lineWidth = 2;
      c.strokeRect(x, y, w, h); c.setLineDash([]);
    }
    c.restore();
  };

  PatternBoard.prototype.findStagesMatchingSelection = function() {
    const sel = this.getSelectedShapes ? this.getSelectedShapes() : [];
    if (!sel.length || !(this.stageTimeline && this.stageTimeline.length)) return [];
    const ids = new Set(sel.map((s) => s.id).filter((id) => id != null));
    const fps = [];
    for (const s of sel) {
      try {
        if (this._shapeLocalFingerprint) fps.push(this._shapeLocalFingerprint(s, 1));
        else if (this._relShapeFingerprint) {
          const b = shapeBBox(s);
          fps.push(this._relShapeFingerprint(s, b ? b.minX : 0, b ? b.minY : 0, 1));
        }
      } catch (e) {}
    }
    const hits = [];
    let seenIds = new Set();
    for (let i = 0; i < this.stageTimeline.length; i++) {
      const shs = this.stageTimeline[i].shapes || [];
      let byId = false, byFp = false;
      const stageIds = new Set();
      for (const sh of shs) {
        if (sh && sh.id != null) stageIds.add(sh.id);
        if (ids.has(sh.id)) byId = true;
      }
      if (!byId && fps.length) {
        for (const sh of shs) {
          if (!sh || sh.guide || sh.kind === 'eraser') continue;
          let fp = '';
          try {
            if (this._shapeLocalFingerprint) fp = this._shapeLocalFingerprint(sh, 1);
          } catch (e) { continue; }
          if (fp && fps.indexOf(fp) >= 0) { byFp = true; break; }
        }
      }
      if (byId || byFp) {
        let first = false;
        if (byId) {
          for (const id of ids) {
            if (stageIds.has(id) && !seenIds.has(id)) { first = true; break; }
          }
        } else first = hits.length === 0;
        hits.push({ idx: i, first });
        ids.forEach((id) => { if (stageIds.has(id)) seenIds.add(id); });
      }
    }
    hits.sort((a, b) => b.first - a.first || a.idx - b.idx);
    return hits.map((h) => h.idx);
  };

  PatternBoard.prototype._orderShapesBySavePriority = function(shapes) {
    if (!shapes || !shapes.length) return [];
    if (!(this.stageTimeline && this.stageTimeline.length)) return shapes.slice();
    const n = shapes.length;
    const ranks = new Array(n).fill(Infinity);
    const idToIdx = new Map();
    shapes.forEach((sh, i) => {
      if (sh && sh.id != null && !idToIdx.has(sh.id)) idToIdx.set(sh.id, i);
    });
    let seq = 0;
    for (const st of this.stageTimeline) {
      for (const sh of st.shapes || []) {
        if (!sh || sh.id == null) continue;
        const i = idToIdx.get(sh.id);
        if (i != null && ranks[i] === Infinity) ranks[i] = seq;
        seq++;
      }
    }
    return shapes
      .map((sh, i) => ({ sh, r: ranks[i], i }))
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((o) => o.sh);
  };

  PatternBoard.prototype.previewStagesFromSelection = async function() {
    if (this.stagePlaying) {
      this.stopStagePreview && this.stopStagePreview();
      this.showToast('أُوقفت المعاينة');
      return;
    }
    const sel = this.getSelectedShapes ? this.getSelectedShapes() : [];
    if (!sel.length) { this.showToast('لا أشكال محددة'); return; }
    const idxs = this.findStagesMatchingSelection();
    if (!idxs.length) { this.showToast('لا توجد لقطة محفوظة تحتوي هذه الأشكال'); return; }
    const ordered = this._orderShapesBySavePriority(sel);
    this.stagePlaying = true;
    this._previewSkipRequested = false;
    if (!this._previewSpeedMul || this._previewSpeedMul < 1) this._previewSpeedMul = 1;
    this._previewPlayList = null;
    this._previewPlayIdxs = null;
    if (this.setPreviewStageIndex) this.setPreviewStageIndex(-1);
    this.updateStageRecUI && this.updateStageRecUI();
    this._showPreviewSpeedBar(true);
    this.showToast('معاينة ' + ordered.length + ' شكل محدّد فقط، حسب ترتيب حفظها');
    try {
      const clones = ordered.map((sh) => this._cloneShapeDeep(sh));
      await this._previewAnimateShapes([], clones);
    } finally {
      this.stagePlaying = false;
      this._stagePreviewTimer = null;
      this._previewSkipRequested = false;
      if (this.setPreviewStageIndex) this.setPreviewStageIndex(-1);
      this._showPreviewSpeedBar(false);
      this.rebuildArt();
      this.render();
      this.updateStageRecUI && this.updateStageRecUI();
      this.showToast('انتهت معاينة الأشكال المحددة');
    }
  };

  PatternBoard.prototype.syncStageHighlightsFromSelection = function() {
    const idxs = this.findStagesMatchingSelection();
    this._stageMatchIdxs = new Set(idxs);
    if (document.getElementById('stageThumbs') && (this.stageTimeline || []).length) {
      this._applyStageMatchClasses();
      this._scrollToMatchedStages();
    }
    if (idxs.length) {
      const first = idxs[0] + 1;
      this.showToast(
        idxs.length === 1
          ? 'اللقطة ' + first + ' تحتوي الشكل — مؤطّرة بالأحمر'
          : 'وُجد في ' + idxs.length + ' لقطة · الأولى: ' + first + ' (إطار أحمر)'
      );
    }
  };

  PatternBoard.prototype._applyStageMatchClasses = function() {
    const box = document.getElementById('stageThumbs');
    if (!box) return;
    const set = this._stageMatchIdxs || new Set();
    box.querySelectorAll('.stageThumb').forEach((el) => {
      const ix = parseInt(el.dataset.stageIndex, 10);
      el.classList.toggle('is-shape-match', set.has(ix));
    });
  };

  PatternBoard.prototype._scrollToMatchedStages = function() {
    const box = document.getElementById('stageThumbs');
    if (!box) return;
    const first = box.querySelector('.stageThumb.is-shape-match');
    if (first) {
      try {
        first.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
      } catch (e) {
        try {
          const br = box.getBoundingClientRect(),
            fr = first.getBoundingClientRect();
          box.scrollTop += fr.top - br.top - box.clientHeight / 3;
        } catch (_) {}
      }
    }
  };

  PatternBoard.prototype.renderStageThumbs = function() {
    const box = document.getElementById('stageThumbs');
    if (!box) return;
    if (!this.selectedStageIdxs) this.selectedStageIdxs = new Set();
    this.selectedStageIdxs = new Set([...this.selectedStageIdxs].filter((i) => i >= 0 && i < this.stageTimeline.length));
    const list = this.stageTimeline || [];
    const active = this._previewStageIndex;
    box.innerHTML = '';
    const nav = document.getElementById('stageNavWrap');
    if (!list.length) {
      box.style.display = 'none';
      if (nav) { nav.style.display = 'none'; nav.classList.remove('visible'); }
      this.updateStageSelBar();
      return;
    }
    box.style.display = 'flex';
    if (nav) { nav.style.display = 'flex'; nav.classList.add('visible'); }
    list.forEach((st, i) => {
      const row = document.createElement('div');
      const selected = this.selectedStageIdxs.has(i);
      row.className =
        'stageThumb' +
        (selected ? ' is-selected' : '') +
        (active === i ? ' is-playing' : '') +
        (this._stageMatchIdxs && this._stageMatchIdxs.has(i) ? ' is-shape-match' : '');
      row.dataset.stageIndex = String(i);
      const num = document.createElement('div');
      num.className = 'stNum';
      num.textContent = String(i + 1);
      const cnv = document.createElement('canvas');
      cnv.width = 104;
      cnv.height = 72;
      try {
        this._drawStageThumb(cnv, st.shapes || []);
      } catch (_e) {
        console.warn('thumb', _e);
      }
      const meta = document.createElement('div');
      meta.className = 'stMeta';
      const strong = document.createElement('strong');
      strong.textContent = (st.label || 'مرحلة ' + (i + 1)) + (selected ? ' ✓' : '');
      meta.appendChild(strong);
      meta.appendChild(document.createTextNode(String((st.shapes && st.shapes.length) || 0) + ' شكل'));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'stDel';
      del.textContent = '✕';
      del.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
        this.askConfirm('حذف لقطة ' + (i + 1) + '؟', { danger: true, okText: 'حذف' }).then((ok) => {
          if (ok) this.deleteStageAt(i);
        });
      });
      this._bindStageThumbDrag(row, i, del);
      row.appendChild(num);
      row.appendChild(cnv);
      row.appendChild(meta);
      row.appendChild(del);
      box.appendChild(row);
    });
    this.updateStageSelBar();
    this._applyStageMatchClasses && this._applyStageMatchClasses();
    if (this._stageMatchIdxs && this._stageMatchIdxs.size) {
      requestAnimationFrame(() => this._scrollToMatchedStages && this._scrollToMatchedStages());
    }
  };

  PatternBoard.prototype._bindStageThumbDrag = function(row, index, delBtn) {
    const LONG_MS = 480;
    const self = this;
    let timer = null, armed = false, dragging = false, fromIdx = index;
    let startX = 0, startY = 0, ghost = null, lastX = 0, lastY = 0;
    let suppressClick = false;
    const pt = (ev) => {
      if (ev.touches && ev.touches[0]) return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
      if (ev.changedTouches && ev.changedTouches[0]) return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
      return { x: ev.clientX, y: ev.clientY };
    };
    const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const removeGhost = () => { if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost); ghost = null; };
    const clearDrop = () => {
      const box = document.getElementById('stageThumbs');
      if (box) box.querySelectorAll('.drop-target').forEach((el) => el.classList.remove('drop-target'));
    };
    const getDragIndices = (primary) => {
      const sel = [...(self.selectedStageIdxs || [])].filter((i) => i >= 0 && i < (self.stageTimeline || []).length).sort((a, b) => a - b);
      if (sel.length > 1 && sel.includes(primary)) return sel;
      return [primary];
    };
    const unbindWin = () => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onEnd, true);
      window.removeEventListener('pointercancel', onEnd, true);
    };
    const onStart = (ev) => {
      if (ev.target === delBtn || (delBtn && delBtn.contains(ev.target))) return;
      if (self.stagePlaying) return;
      if (ev.button != null && ev.button !== 0) return;
      const p = pt(ev);
      startX = p.x; startY = p.y; lastX = p.x; lastY = p.y;
      fromIdx = parseInt(row.dataset.stageIndex, 10);
      if (isNaN(fromIdx)) fromIdx = index;
      armed = false; dragging = false; suppressClick = false; clearTimer();
      timer = setTimeout(() => {
        armed = true;
        row.classList.add('shake');
        try { if (navigator.vibrate) navigator.vibrate(20); } catch (_e) {}
      }, LONG_MS);
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onEnd, true);
      window.addEventListener('pointercancel', onEnd, true);
      if (ev.pointerId != null && row.setPointerCapture) {
        try { row.setPointerCapture(ev.pointerId); } catch (_e) {}
      }
    };
    const onMove = (ev) => {
      const p = pt(ev);
      lastX = p.x; lastY = p.y;
      const dist2 = Math.hypot(p.x - startX, p.y - startY);
      if (!armed && !dragging) {
        if (dist2 > 14) clearTimer();
        return;
      }
      if (armed && !dragging && dist2 > 8) {
        dragging = true; suppressClick = true; self._thumbDragLock = true;
        row.classList.remove('shake');
        const idxs = getDragIndices(fromIdx);
        document.querySelectorAll('#stageThumbs .stageThumb').forEach((el) => {
          const ix = parseInt(el.dataset.stageIndex, 10);
          if (idxs.includes(ix)) el.classList.add('drag-src');
        });
        ghost = document.createElement('div');
        ghost.style.cssText =
          'position:fixed;z-index:10020;pointer-events:none;background:#1e293b;color:#fff;padding:10px 14px;border-radius:12px;font-weight:700;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.35);';
        ghost.textContent = idxs.length > 1 ? 'نقل ' + idxs.length + ' لقطات' : 'نقل لقطة ' + (fromIdx + 1);
        document.body.appendChild(ghost);
        ghost.style.left = p.x + 12 + 'px'; ghost.style.top = p.y + 12 + 'px';
      }
      if (dragging && ghost) {
        ghost.style.left = p.x + 12 + 'px'; ghost.style.top = p.y + 12 + 'px';
        ghost.style.visibility = 'hidden';
        clearDrop();
        const el = document.elementFromPoint(p.x, p.y);
        ghost.style.visibility = 'visible';
        const over = el && el.closest ? el.closest('.stageThumb') : null;
        if (over && !over.classList.contains('drag-src')) over.classList.add('drop-target');
        if (ev.cancelable) ev.preventDefault();
      }
    };
    const onEnd = (ev) => {
      clearTimer(); unbindWin();
      const p = pt(ev);
      const x = p.x || lastX, y = p.y || lastY;
      const wasDrag = dragging;
      document.querySelectorAll('#stageThumbs .stageThumb').forEach((el) => el.classList.remove('shake', 'drag-src'));
      if (wasDrag || armed) suppressClick = true;
      let toIdx = fromIdx;
      const dragIdxs = getDragIndices(fromIdx);
      if (wasDrag) {
        if (ghost) ghost.style.visibility = 'hidden';
        const el = document.elementFromPoint(x, y);
        if (ghost) ghost.style.visibility = 'visible';
        const over = el && el.closest ? el.closest('.stageThumb') : null;
        if (over) {
          const t = parseInt(over.dataset.stageIndex, 10);
          if (!isNaN(t)) toIdx = t;
        }
        clearDrop(); removeGhost(); dragging = false; armed = false;
        self._thumbDragLock = true;
        setTimeout(() => { self._thumbDragLock = false; }, 400);
        if (toIdx >= 0 && toIdx < self.stageTimeline.length && !dragIdxs.includes(toIdx)) {
          self._askStageDropAction(dragIdxs, toIdx);
        } else self.renderStageThumbs();
        if (ev.cancelable) ev.preventDefault();
        return;
      }
      clearDrop(); removeGhost(); dragging = false; armed = false;
      if (!wasDrag && !suppressClick && !self._thumbDragLock) {
        const ix = parseInt(row.dataset.stageIndex, 10);
        self.toggleStageSelect(isNaN(ix) ? index : ix);
        suppressClick = true;
      }
    };
    const onClick = (ev) => {
      if (ev.target === delBtn || (delBtn && delBtn.contains(ev.target))) return;
      if (suppressClick || self._thumbDragLock) {
        suppressClick = false; self._thumbDragLock = false; return;
      }
      const ix = parseInt(row.dataset.stageIndex, 10);
      self.toggleStageSelect(isNaN(ix) ? index : ix);
    };
    row.addEventListener('pointerdown', onStart);
    row.addEventListener('click', onClick);
    row.addEventListener('contextmenu', (ev) => ev.preventDefault());
  };

  PatternBoard.prototype._drawStageThumb = function(cnv, shapes) {
    const ctx = cnv.getContext('2d');
    const W = cnv.width, H = cnv.height;
    ctx.fillStyle = '#faf8f2'; ctx.fillRect(0, 0, W, H);
    if (!shapes || !shapes.length) return;
    let ub = null;
    try { ub = unionBBox(shapes); } catch (_e) {}
    if (!ub) return;
    const pad = 8, w = Math.max(1, ub.maxX - ub.minX), h = Math.max(1, ub.maxY - ub.minY);
    const sc = Math.min((W - pad * 2) / w, (H - pad * 2) / h);
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(sc, sc);
    ctx.translate(-(ub.minX + ub.maxX) / 2, -(ub.minY + ub.maxY) / 2);
    for (const sh of shapes) {
      try { this.rasterShape(ctx, sh); } catch (_e) {}
    }
    ctx.restore();
  };

  PatternBoard.prototype.setPreviewStageIndex = function(i) {
    this._previewStageIndex = i == null ? -1 : i;
    const box = document.getElementById('stageThumbs');
    if (!box) return;
    box.querySelectorAll('.stageThumb').forEach((el) => {
      el.classList.toggle('is-playing', parseInt(el.dataset.stageIndex, 10) === this._previewStageIndex);
    });
  };
}
