import {
  shapeBBox, unionBBox, cloneShapeOffset, dist, clamp
} from './geometry.ts';

export function attachVideoAndSequenceMethods(PatternBoard) {
  PatternBoard.prototype.saveSequenceClip = function() {
    if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
    if (!this.stageTimeline.length) {
      this.showToast('لا مراحل — سجّلي مراحل الغرزة أولاً ثم احفظيها كمتتالية');
      return;
    }
    const name = (prompt('اسم المتتالية (مثال: غرزة السلسلة)', 'غرزة ' + (this.sequenceLibrary.length + 1)) || '').trim();
    if (!name) return;
    const stages = this.stageTimeline.map((st) => ({
      label: st.label,
      t: st.t,
      shapes: (st.shapes || []).map((s) => this._cloneShapeDeep(s)),
    }));
    const clip = {
      id: 'seq_' + Date.now() + '_' + Math.floor(Math.random() * 999),
      name,
      stages,
      n: stages.length,
      savedAt: Date.now(),
    };
    this.sequenceLibrary.push(clip);
    this.renderSequenceLibraryUI();
    this.autoSave();
    this.showToast('حُفظت متتالية «' + name + '» (' + stages.length + ' مرحلة) — ✕ لحذفها');
  };

  PatternBoard.prototype.renderSequenceLibraryUI = function() {
    const row = document.getElementById('seqLibraryRow');
    if (!row) return;
    row.innerHTML = '';
    const list = this.sequenceLibrary || [];
    if (!list.length) {
      row.classList.remove('show');
      return;
    }
    row.classList.add('show');
    const lbl = document.createElement('span');
    lbl.className = 'seqLbl';
    lbl.textContent = 'متتاليات:';
    row.appendChild(lbl);
    list.forEach((clip, i) => {
      const chip = document.createElement('span');
      chip.className = 'seqChip';
      chip.title = 'اضغطي للإدراج · ✕ للحذف';
      const nameEl = document.createElement('span');
      nameEl.textContent = (clip.name || 'متتالية ' + (i + 1)) + ' (' + ((clip.stages && clip.stages.length) || 0) + ')';
      chip.appendChild(nameEl);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'seqDel';
      del.setAttribute('aria-label', 'حذف المتتالية');
      del.textContent = '✕';
      del.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.askConfirm('حذف المتتالية «' + (clip.name || '') + '»؟', { danger: true, okText: 'حذف' }).then((ok) => {
          if (!ok) return;
          this.sequenceLibrary = (this.sequenceLibrary || []).filter((c) => c.id !== clip.id);
          this.renderSequenceLibraryUI();
          this.autoSave();
          this.showToast('حُذفت المتتالية');
        });
      });
      chip.appendChild(del);
      chip.addEventListener('click', (ev) => {
        if (ev.target === del || (del.contains && del.contains(ev.target))) return;
        this.openSequencePicker();
      });
      row.appendChild(chip);
    });
  };

  PatternBoard.prototype.insertSequenceClipById = function(id) {
    const clip = (this.sequenceLibrary || []).find((c) => c.id === id);
    if (!clip) { this.showToast('المتتالية غير موجودة'); return; }
    this._insertSequenceClipObj(clip);
  };

  PatternBoard.prototype._shapeEnds = function(sh) {
    if (!sh) return null;
    if (typeof this.sampleShapePath === 'function' &&
       (sh.kind === 'arc' || sh.kind === 'line' || sh.kind === 'arrow' || sh.kind === 'silk' ||
        sh.kind === 'freehand' || sh.kind === 'freehandClosed' || sh.kind === 'circle')) {
      try {
        const path = this.sampleShapePath(sh, 6);
        if (path && path.length >= 1) {
          return { start: { x: path[0].x, y: path[0].y }, end: { x: path[path.length - 1].x, y: path[path.length - 1].y } };
        }
      } catch (_) {}
    }
    switch (sh.kind) {
      case 'line':
      case 'arrow':
        return { start: { x: sh.x1, y: sh.y1 }, end: { x: sh.x2, y: sh.y2 } };
      case 'arc': {
        let span = sh.end - sh.start;
        if (sh.anticlockwise) { if (span > 0) span -= 2 * Math.PI; }
        else { if (span < 0) span += 2 * Math.PI; }
        const a0 = sh.start, a1 = sh.start + span;
        return {
          start: { x: sh.cx + sh.r * Math.cos(a0), y: sh.cy + sh.r * Math.sin(a0) },
          end: { x: sh.cx + sh.r * Math.cos(a1), y: sh.cy + sh.r * Math.sin(a1) },
        };
      }
      case 'freehand':
      case 'freehandClosed':
      case 'silk':
      case 'eraser': {
        const p = sh.pts || [];
        if (p.length < 1) return null;
        return { start: { x: p[0].x, y: p[0].y }, end: { x: p[p.length - 1].x, y: p[p.length - 1].y } };
      }
      case 'circle':
        return { start: { x: sh.cx + sh.r, y: sh.cy }, end: { x: sh.cx + sh.r, y: sh.cy } };
      case 'rect':
        return { start: { x: sh.x, y: sh.y }, end: { x: sh.x + sh.w, y: sh.y + sh.h } };
      case 'triangle':
        if (!sh.p1) return null;
        return { start: { x: sh.p1.x, y: sh.p1.y }, end: { x: (sh.p3 || sh.p1).x, y: (sh.p3 || sh.p1).y } };
      default:
        return null;
    }
  };

  PatternBoard.prototype._lastWorkEnd = function() {
    if (this.placePoint) return { x: this.placePoint.x, y: this.placePoint.y };
    if (this.chainPoint) return { x: this.chainPoint.x, y: this.chainPoint.y };
    if (this.lastPoint) return { x: this.lastPoint.x, y: this.lastPoint.y };
    const work = this.shapes.filter((s) => !s.guide && !s.hidden && s.kind !== 'eraser' && s.kind !== 'fill' && s.kind !== 'number' && s.kind !== 'text');
    for (let i = work.length - 1; i >= 0; i--) {
      const e = this._shapeEnds(work[i]);
      if (e && e.end) return { x: e.end.x, y: e.end.y };
    }
    return null;
  };

  PatternBoard.prototype.setPlacePointMode = function(on) {
    this.placePointMode = !!on;
    const chip = document.getElementById('placePointChip');
    if (chip) {
      chip.classList.toggle('active', this.placePointMode || !!this.placePoint);
      chip.textContent = this.placePointMode ? 'اضغطي اللوحة' : this.placePoint ? 'نقطة ✓' : 'نقطة';
    }
    if (this.placePointMode) this.showToast('اضغطي على اللوحة لتحديد نقطة البداية');
    this.render();
  };

  PatternBoard.prototype.clearPlacePoint = function() {
    this.placePoint = null;
    this.placePointMode = false;
    const chip = document.getElementById('placePointChip');
    if (chip) {
      chip.classList.remove('active');
      chip.textContent = 'نقطة';
    }
    this.render();
  };

  PatternBoard.prototype._groupEnds = function(shapes) {
    if (!shapes || !shapes.length) return null;
    let start = null, end = null;
    for (const sh of shapes) {
      const e = this._shapeEnds(sh);
      if (!e) continue;
      if (!start) start = e.start;
      end = e.end;
    }
    if (!start || !end) return null;
    return { start, end };
  };

  PatternBoard.prototype._reverseShape = function(sh) {
    if (!sh) return sh;
    const c = this._cloneShapeDeep(sh);
    switch (c.kind) {
      case 'line':
      case 'arrow': {
        const x1 = c.x1, y1 = c.y1; c.x1 = c.x2; c.y1 = c.y2; c.x2 = x1; c.y2 = y1;
        break;
      }
      case 'arc': {
        const t = c.start; c.start = c.end; c.end = t;
        c.anticlockwise = !c.anticlockwise;
        break;
      }
      case 'freehand':
      case 'freehandClosed':
      case 'silk':
      case 'eraser': {
        if (c.pts && c.pts.length) c.pts = c.pts.slice().reverse();
        break;
      }
      case 'triangle': {
        if (c.p1 && c.p3) { const p = c.p1; c.p1 = c.p3; c.p3 = p; }
        break;
      }
      default: break;
    }
    return c;
  };

  PatternBoard.prototype._reverseShapes = function(shapes) {
    return shapes.map((s) => this._reverseShape(s)).reverse();
  };

  PatternBoard.prototype._shapeDir = function(sh) {
    const e = this._shapeEnds(sh);
    if (!e) return null;
    const dx = e.end.x - e.start.x, dy = e.end.y - e.start.y;
    const L = Math.hypot(dx, dy) || 1;
    return { x: dx / L, y: dy / L };
  };

  PatternBoard.prototype._axisLockEnd = function(from, to) {
    if (!from || !to) return to;
    const dx = to.x - from.x, dy = to.y - from.y;
    if (Math.abs(dy) >= Math.abs(dx)) return { x: from.x, y: to.y };
    return { x: to.x, y: from.y };
  };

  PatternBoard.prototype.insertSequenceClip = function() {
    if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
    if (!this.sequenceLibrary.length) {
      this.showToast('لا متتاليات محفوظة — احفظي واحدة من «متتالية» أولاً');
      return;
    }
    this.openSequencePicker();
  };

  PatternBoard.prototype.openSequencePicker = function() {
    this.renderSequencePickerList();
    const bd = document.getElementById('seqPickerBackdrop');
    const pan = document.getElementById('seqPickerPanel');
    if (bd) bd.classList.add('open');
    if (pan) pan.classList.add('open');
  };

  PatternBoard.prototype.closeSequencePicker = function() {
    const bd = document.getElementById('seqPickerBackdrop');
    const pan = document.getElementById('seqPickerPanel');
    if (bd) bd.classList.remove('open');
    if (pan) pan.classList.remove('open');
  };

  PatternBoard.prototype.renderSequencePickerList = function() {
    const box = document.getElementById('seqPickerList');
    if (!box) return;
    box.innerHTML = '';
    const list = this.sequenceLibrary || [];
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'spEmpty';
      empty.textContent = 'لا متتاليات — احفظي من زر «متتالية»';
      box.appendChild(empty);
      return;
    }
    list.forEach((clip, i) => {
      const row = document.createElement('div');
      row.className = 'spItem';
      const name = document.createElement('div');
      name.className = 'spName';
      name.textContent = (i + 1) + ') ' + (clip.name || 'متتالية ' + (i + 1)) + ' — ' + ((clip.stages && clip.stages.length) || 0) + ' مرحلة';
      const useBtn = document.createElement('button');
      useBtn.type = 'button';
      useBtn.className = 'spUse';
      useBtn.textContent = 'إدراج';
      useBtn.addEventListener('click', () => {
        const inp = document.getElementById('seqRepsInput');
        let reps = parseInt(inp && inp.value, 10);
        if (!(reps >= 1 && reps <= 100)) reps = 1;
        this.closeSequencePicker();
        this._insertSequenceClipObj(clip, reps);
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'spDel';
      del.setAttribute('aria-label', 'حذف المتتالية');
      del.textContent = '✕';
      del.title = 'حذف هذه المتتالية';
      del.addEventListener('click', () => {
        this.askConfirm('حذف المتتالية «' + (clip.name || '') + '»؟', { danger: true, okText: 'حذف' }).then((ok) => {
          if (!ok) return;
          this.sequenceLibrary = (this.sequenceLibrary || []).filter((c) => c.id !== clip.id);
          this.renderSequenceLibraryUI();
          this.renderSequencePickerList();
          this.autoSave();
          this.showToast('حُذفت المتتالية');
          if (!(this.sequenceLibrary && this.sequenceLibrary.length)) this.closeSequencePicker();
        });
      });
      row.appendChild(name);
      row.appendChild(useBtn);
      row.appendChild(del);
      box.appendChild(row);
    });
  };

  PatternBoard.prototype._insertSequenceClipObj = function(clip, repsOpt) {
    if (!clip) return;
    if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
    let reps = repsOpt != null ? parseInt(repsOpt, 10) : 0;
    if (!(reps >= 1 && reps <= 100)) {
      try {
        const repsRaw = prompt('كم مرة تُكرَّر «' + (clip.name || '') + '»؟', '1');
        if (repsRaw == null) return;
        reps = parseInt(repsRaw, 10);
      } catch (e) {
        reps = 1;
      }
    }
    if (!(reps >= 1 && reps <= 100)) { this.showToast('التكرار من 1 إلى 100'); return; }

    let stages = clip.stages.map((st) => ({
      label: st.label,
      t: st.t,
      shapes: (st.shapes || []).map((s) => this._cloneShapeDeep(s)),
    }));

    let anchor = this._lastWorkEnd();
    let inDir = null;
    {
      const work = this.shapes.filter((s) => !s.guide && !s.hidden && s.kind !== 'eraser');
      for (let i = work.length - 1; i >= 0; i--) {
        inDir = this._shapeDir(work[i]);
        if (inDir) break;
      }
    }

    const firstSt = stages.find((st) => (st.shapes || []).length);
    if (firstSt && inDir) {
      const outDir = this._shapeDir(firstSt.shapes[0]);
      if (outDir && inDir.x * outDir.x + inDir.y * outDir.y < 0) {
        stages = stages.map((st) => ({
          label: st.label,
          t: st.t,
          shapes: this._reverseShapes(st.shapes || []),
        }));
        this.showToast('عُكس اتجاه المتتالية ليتوافق مع اتجاه الرسم');
      }
    }

    const clipFirst = stages.find((st) => (st.shapes || []).length);
    const ends0 = this._groupEnds(clipFirst.shapes);
    if (!ends0) { this.showToast('تعذّر تحديد نقاط البداية/النهاية للمتتالية'); return; }
    const clipStart0 = ends0.start;
    if (!anchor) anchor = { x: clipStart0.x, y: clipStart0.y };

    const addedStages = [];
    let cursor = { x: anchor.x, y: anchor.y };
    const nStagesPer = stages.filter((st) => (st.shapes || []).length).length || 1;

    for (let r = 0; r < reps; r++) {
      const idMap = new Map();
      const ox = cursor.x - clipStart0.x;
      const oy = cursor.y - clipStart0.y;
      let lastShapesInRepeat = null;
      for (const st of stages) {
        const shapes = (st.shapes || []).map((s) => {
          let c = this._cloneShapeDeep(s);
          const oldId = s.id;
          if (oldId != null) {
            if (!idMap.has(oldId)) idMap.set(oldId, this.newId());
            c.id = idMap.get(oldId);
          } else c.id = this.newId();
          if (ox || oy) {
            c = cloneShapeOffset(c, ox, oy);
            c.id = idMap.has(oldId) ? idMap.get(oldId) : c.id || this.newId();
          }
          return c;
        }).filter((s) => s && s.kind);
        if (!shapes.length) continue;
        const stage = {
          shapes,
          label: (st.label || clip.name) + (reps > 1 ? ' ×' + (r + 1) : ''),
          t: Date.now(),
        };
        this.stageTimeline.push(stage);
        addedStages.push(stage);
        lastShapesInRepeat = shapes;
      }
      if (lastShapesInRepeat) {
        const ge = this._groupEnds(lastShapesInRepeat);
        if (ge) cursor = this._axisLockEnd({ x: cursor.x, y: cursor.y }, ge.end);
      }
    }

    if (!addedStages.length) { this.showToast('فشل الإدراج — لا أشكال'); return; }
    this.updateStageRecUI();
    this.autoSave();

    const perRepLast = [];
    let i = 0;
    for (let r = 0; r < reps; r++) {
      let lastOfRep = null;
      for (let k = 0; k < nStagesPer && i < addedStages.length; k++, i++) lastOfRep = addedStages[i];
      if (lastOfRep) perRepLast.push(lastOfRep);
    }
    const map = new Map();
    for (const st of perRepLast) {
      for (const sh of st.shapes) map.set(sh.id, this._cloneShapeDeep(sh));
    }
    const guides = this.shapes.filter((s) => s.guide);
    const prior = this.shapes.filter((s) => !s.guide);
    const work = [...map.values()];
    const newIds = new Set(work.map((s) => s.id));
    for (const sh of prior) {
      if (!newIds.has(sh.id)) work.push(this._cloneShapeDeep(sh));
    }

    const before = this.shapes.slice();
    this.shapes = guides.concat(work);
    this.pushHistory({ op: 'batchReplace', removed: before.filter((s) => !s.guide), added: work });
    this.rebuildArt();
    this.render();

    if (cursor) {
      this.chainPoint = { x: cursor.x, y: cursor.y };
      this.lastPoint = { x: cursor.x, y: cursor.y };
    }
    if (this.placePoint) {
      this.placePoint = null;
      const chip = document.getElementById('placePointChip');
      if (chip) { chip.classList.remove('active'); chip.textContent = 'نقطة'; }
    }
    this.showToast('أُدرجت «' + clip.name + '» ×' + reps + ' بعمود/صف مستقيم · ▶ للمعاينة');
  };

  PatternBoard.prototype.sampleShapePath = function(sh, spacing) {
    spacing = Math.max(6, spacing || 16);
    const pts = [];
    const push = (p) => {
      if (!pts.length || dist(pts[pts.length - 1], p) > 0.5) pts.push({ x: p.x, y: p.y });
    };
    if (sh.kind === 'line' || sh.kind === 'arrow') {
      const len = Math.hypot(sh.x2 - sh.x1, sh.y2 - sh.y1) || 1;
      const n = Math.max(1, Math.round(len / spacing));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        push({ x: sh.x1 + (sh.x2 - sh.x1) * t, y: sh.y1 + (sh.y2 - sh.y1) * t });
      }
    } else if (sh.kind === 'arc') {
      let span = sh.end - sh.start;
      if (sh.anticlockwise) { if (span > 0) span -= 2 * Math.PI; }
      else { if (span < 0) span += 2 * Math.PI; }
      const arcLen = Math.abs(span) * sh.r;
      const n = Math.max(2, Math.round(arcLen / spacing));
      for (let i = 0; i <= n; i++) {
        const a = sh.start + span * (i / n);
        push({ x: sh.cx + sh.r * Math.cos(a), y: sh.cy + sh.r * Math.sin(a) });
      }
    } else if (sh.kind === 'circle') {
      const n = Math.max(8, Math.round((2 * Math.PI * sh.r) / spacing));
      for (let i = 0; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        push({ x: sh.cx + sh.r * Math.cos(a), y: sh.cy + sh.r * Math.sin(a) });
      }
    } else if (sh.kind === 'freehand' || sh.kind === 'freehandClosed') {
      const src = sh.pts || [];
      if (!src.length) return pts;
      push(src[0]);
      let acc = 0;
      for (let i = 1; i < src.length; i++) {
        let x0 = src[i - 1].x, y0 = src[i - 1].y, x1 = src[i].x, y1 = src[i].y;
        let seg = Math.hypot(x1 - x0, y1 - y0);
        if (seg < 0.01) continue;
        while (acc + seg >= spacing) {
          const t = (spacing - acc) / seg;
          push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
          x0 = pts[pts.length - 1].x; y0 = pts[pts.length - 1].y;
          seg = Math.hypot(x1 - x0, y1 - y0);
          acc = 0;
        }
        acc += seg;
      }
      push(src[src.length - 1]);
      if (sh.kind === 'freehandClosed' && pts.length > 2) push(pts[0]);
    } else if (sh.kind === 'rect') {
      const corners = [
        { x: sh.x, y: sh.y }, { x: sh.x + sh.w, y: sh.y },
        { x: sh.x + sh.w, y: sh.y + sh.h }, { x: sh.x, y: sh.y + sh.h }, { x: sh.x, y: sh.y },
      ];
      for (let i = 1; i < corners.length; i++) {
        const a = corners[i - 1], b = corners[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const n = Math.max(1, Math.round(len / spacing));
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
    }
    return pts;
  };

  PatternBoard.prototype.cycleSilkTwist = function() {
    const list = this.getSelectedShapes().filter((s) => s.kind === 'silk' && !s.hidden);
    if (!list.length) { this.showToast('حدّدي خيطاً ثم اضغطي «التواء»'); return; }
    const before = list.map((s) => this._cloneShapeDeep(s));
    let next = 0;
    for (const sh of list) {
      const cur = sh.twistStrength != null ? Number(sh.twistStrength) : 2;
      next = (Math.max(0, Math.min(3, cur)) + 1) % 4;
      sh.twistStrength = next;
      sh.twist = 1.1 + next * 0.7;
    }
    this.pushHistory({ op: 'batchReplace', removed: before, added: list.map((s) => this._cloneShapeDeep(s)) });
    this.rebuildArt(); this.render();
    const labels = ['أملس', 'خفيف', 'متوسط', 'قوي'];
    this.showToast('التواء: ' + labels[next] + ' (' + next + '/3) على ' + list.length + ' خيط');
  };

  PatternBoard.prototype.wrapSilkAround = function() {
    const list = this.getSelectedShapes().filter((s) => s.kind === 'silk' && !s.hidden && s.pts && s.pts.length >= 2);
    if (!list.length) { this.showToast('حدّدي خيط المحور (ثم اختيارياً خيطاً ثانياً) واضغطي «لف حول»'); return; }
    const axis = list[0];
    const turns = this._wrapTurns || 3;
    const helix = this._buildHelixAroundSilk(axis, turns, list[1] ? list[1].width : null);
    if (!helix || helix.length < 4) { this.showToast('تعذّر بناء اللف — المحور قصير جداً'); return; }
    const col = list[1] ? list[1].color || axis.color : axis.color;
    const w = list[1] ? list[1].width || axis.width : Math.max(7, (axis.width || 12) * 0.85);
    const neu = {
      kind: 'silk', id: this.newId(), pts: helix, color: this._normHex(col || '#3366ff'),
      width: w, twist: 2.2, twistStrength: axis.twistStrength != null ? axis.twistStrength : 2,
      interlock: true, tension: true, threadId: axis.threadId || this.newId(),
    };
    if (list[1]) this.inheritDrawOrder(list[1], neu);
    else this.inheritDrawOrder(axis, neu, 1e-3);

    axis.interlock = true;
    if (list[1]) {
      const before = [this._cloneShapeDeep(list[1]), this._cloneShapeDeep(axis)];
      neu.drawOrder = typeof list[1].drawOrder === 'number' && isFinite(list[1].drawOrder) ? list[1].drawOrder : this.nextDrawOrder();
      const idx = this.shapes.indexOf(list[1]);
      this.shapes = this.shapes.filter((s) => s.id !== list[1].id);
      if (idx >= 0) this.shapes.splice(Math.min(idx, this.shapes.length), 0, neu);
      else this.shapes.push(neu);
      this.pushHistory({ op: 'batchReplace', removed: before, added: [this._cloneShapeDeep(neu), this._cloneShapeDeep(axis)] });
      this.selShapeIds = new Set([axis.id, neu.id]);
      this.showToast('لُفّ الخيط الثاني حول المحور · ' + turns + ' لفات');
    } else {
      const before = [this._cloneShapeDeep(axis)];
      this.shapes.push(neu);
      this.pushHistory({ op: 'batchReplace', removed: before, added: [this._cloneShapeDeep(neu), this._cloneShapeDeep(axis)] });
      this.selShapeIds = new Set([axis.id, neu.id]);
      this.showToast('أُضيف خيط ملفوف · ' + turns + ' لفات');
    }
    this._wrapTurns = turns >= 5 ? 2 : turns + 1;
    this.rebuildArt(); this.render();
    this.updateSelHint && this.updateSelHint();
  };

  PatternBoard.prototype._buildHelixAroundSilk = function(axis, turns, wrapW) {
    const raw = axis.pts || [];
    if (raw.length < 2) return null;
    const pts = [];
    for (let i = 0; i < raw.length; i++) {
      if (i === 0) { pts.push({ x: raw[0].x, y: raw[0].y }); continue; }
      const a = raw[i - 1], b = raw[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y) || 0;
      const n = Math.max(1, Math.min(14, Math.ceil(seg / 2.2)));
      for (let k = 1; k <= n; k++) {
        const t = k / n;
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    if (pts.length < 3) return null;
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(cum[i - 1] + (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 0));
    const total = cum[cum.length - 1] || 1;
    const axisR = Math.max(3, (axis.width || 12) / 2);
    const otherR = Math.max(2.5, (wrapW || axis.width || 12) / 2);
    const rad = axisR + otherR * 0.85;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      let tx, ty;
      if (i <= 0) { tx = pts[1].x - pts[0].x; ty = pts[1].y - pts[0].y; }
      else if (i >= pts.length - 1) { tx = pts[i].x - pts[i - 1].x; ty = pts[i].y - pts[i - 1].y; }
      else { tx = pts[i + 1].x - pts[i - 1].x; ty = pts[i + 1].y - pts[i - 1].y; }
      const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
      const nx = -ty, ny = tx;
      const th = (cum[i] / total) * turns * Math.PI * 2;
      out.push({
        x: pts[i].x + nx * Math.cos(th) * rad,
        y: pts[i].y + ny * Math.sin(th) * rad,
      });
    }
    return out;
  };

  PatternBoard.prototype.convertSelectionToThread = function() {
    this.includeChildFillsInSelection();
    const selected = this.getSelectedShapes().filter(
      (sh) =>
        !sh.guide && !sh.hidden && sh.kind !== 'silk' && !sh.threadId &&
        (sh.kind === 'line' || sh.kind === 'arrow' || sh.kind === 'arc' || sh.kind === 'circle' ||
         sh.kind === 'freehand' || sh.kind === 'freehandClosed' || sh.kind === 'rect')
    );
    if (!selected.length) { this.showToast('حدّدي خطاً أو قوساً ثم اضغطي «خيط»'); return; }
    const added = [];
    const removed = [];
    for (const sh of selected) {
      const base = this._normHex(sh.color || this.color || '#4a7ab5');
      const srcW = sh.width || this.lineWidth || 4;
      const silkW = Math.max(7, Math.min(28, srcW * 2.6));
      const path = this.sampleShapePath(sh, Math.max(2.5, silkW * 0.22));
      if (path.length < 2) continue;
      removed.push(sh);
      added.push({
        kind: 'silk', pts: path.map((p) => ({ x: p.x, y: p.y })), color: base,
        width: silkW, twist: 2.2, twistStrength: 2, interlock: false, tension: true,
      });
    }
    if (!added.length) { this.showToast('تعذّر تحويل الأشكال المحددة'); return; }
    const rmIds = new Set(removed.map((s) => s.id));
    const before = removed.map((s) => this._cloneShapeDeep(s));
    const replaceMap = new Map();
    added.forEach((sh, i) => {
      const orig = removed[i];
      if (orig) replaceMap.set(orig.id, sh);
    });
    const committed = [];
    this.shapes = this.shapes.map((s) => {
      if (!rmIds.has(s.id)) return s;
      const repl = replaceMap.get(s.id);
      if (!repl) return null;
      const full = { ...repl, id: s.id };
      committed.push(full);
      return full;
    }).filter(Boolean);
    this.pushHistory({ op: 'batchReplace', removed: before, added: committed.map((s) => this._cloneShapeDeep(s)) });
    this.clearSelection();
    this.rebuildArt(); this.render();
    this._afterAppearanceEdit(committed, 'تم تحويل ' + committed.length + ' إلى خيط بشعيرات طولية', true);
  };

  PatternBoard.prototype.expandThreadGroupsInSelection = function() {
    if (!this.selShapeIds || !this.selShapeIds.size) return;
    const tids = new Set();
    for (const sh of this.shapes) {
      if (this.selShapeIds.has(sh.id) && sh.threadId) tids.add(sh.threadId);
    }
    if (!tids.size) return;
    for (const sh of this.shapes) {
      if (sh.threadId && tids.has(sh.threadId)) this.selShapeIds.add(sh.id);
    }
  };

  PatternBoard.prototype.expandJoinGroupsInSelection = function() {
    if (!this.selShapeIds || !this.selShapeIds.size) return;
    const jids = new Set();
    for (const sh of this.shapes) {
      if (this.selShapeIds.has(sh.id) && sh.joinId) jids.add(sh.joinId);
    }
    if (!jids.size) return;
    for (const sh of this.shapes) {
      if (sh.joinId && jids.has(sh.joinId)) this.selShapeIds.add(sh.id);
    }
  };

  PatternBoard.prototype.joinSelectionAsOne = function() {
    this.includeChildFillsInSelection && this.includeChildFillsInSelection();
    this.expandJoinGroupsInSelection();
    this.expandThreadGroupsInSelection && this.expandThreadGroupsInSelection();
    const shapes = this.getSelectedShapes().filter((s) => !s.guide && !s.hidden && !s.isDivMarker);
    if (shapes.length < 2) { this.showToast('حدّدي شكلين أو أكثر للصقهما كوحدة واحدة'); return; }
    let joinId = null;
    for (const sh of shapes) {
      if (sh.joinId) { joinId = sh.joinId; break; }
    }
    if (!joinId) joinId = 'join_' + Date.now() + '_' + (this._idc || 1);
    const changed = [];
    for (const sh of shapes) {
      if (sh.joinId === joinId) continue;
      changed.push({ id: sh.id, from: sh.joinId || null, to: joinId });
      sh.joinId = joinId;
    }
    if (!changed.length) { this.showToast('الأشكال ملتصقة مسبقاً كوحدة واحدة'); return; }
    const before = changed.map((c) => {
      const sh = this.shapes.find((s) => s.id === c.id);
      const snap = this._cloneShapeDeep(sh); snap.joinId = c.from; return snap;
    });
    const after = changed.map((c) => {
      const sh = this.shapes.find((s) => s.id === c.id);
      return this._cloneShapeDeep(sh);
    });
    this.pushHistory({ op: 'batchReplace', removed: before, added: after });
    this.expandJoinGroupsInSelection();
    const ub = unionBBox(this.getSelectedShapes());
    if (ub) this.selRect = { x: ub.minX, y: ub.minY, w: Math.max(1, ub.maxX - ub.minX), h: Math.max(1, ub.maxY - ub.minY) };
    this.updateSelHint();
    this.rebuildArt(); this.render(); this.autoSave();
    this.showToast('تم اللصق — ' + this.selShapeIds.size + ' شكل كوحدة واحدة');
  };

  PatternBoard.prototype.splitJoinedSelection = function() {
    this.expandJoinGroupsInSelection();
    const shapes = this.getSelectedShapes().filter((s) => s.joinId);
    if (!shapes.length) { this.showToast('لا أشكال ملتصقة في التحديد'); return; }
    const jids = new Set(shapes.map((s) => s.joinId));
    const before = [], after = [];
    for (const sh of this.shapes) {
      if (!sh.joinId || !jids.has(sh.joinId)) continue;
      before.push(this._cloneShapeDeep(sh));
      delete sh.joinId;
      after.push(this._cloneShapeDeep(sh));
    }
    if (!before.length) { this.showToast('لا شيء للفصل'); return; }
    this.pushHistory({ op: 'batchReplace', removed: before, added: after });
    this.updateSelHint();
    this.rebuildArt(); this.render(); this.autoSave();
    this.showToast('تم الفصل — ' + before.length + ' شكل أصبحت مستقلة');
  };

  PatternBoard.prototype.repeatSelectionCount = function() {
    if (this._guardSelAction('تكرار')) return;
    this.includeChildFillsInSelection && this.includeChildFillsInSelection();
    this.expandJoinGroupsInSelection();
    const contained = this.getSelectedShapes().filter((s) => !s.guide && !s.hidden);
    if (!contained.length) { this.showToast('حدّدي شكلاً أولاً للتكرار'); return; }
    let n = 1;
    try {
      const raw = prompt('كم نسخة؟ (1–20)', '1');
      if (raw === null) return;
      n = clamp(parseInt(String(raw).trim(), 10) || 0, 0, 20);
    } catch (_) { n = 1; }
    if (n < 1) { this.showToast('أدخلي رقماً من 1 إلى 20'); return; }
    this._pendingRepeatCount = Math.max(0, n - 1);
    this._pendingRepeatTemplate = contained.map((s) => (this._cloneShapeDeep ? this._cloneShapeDeep(s) : JSON.parse(JSON.stringify(s))));
    this._selActionGuardUntil = 0;
    this.startFloat(false);
    this.showToast(n > 1 ? 'نسخة 1/' + n + ' عائمة — ثبّتيها ثم تُضاف الباقي' : 'نسخة عائمة — اسحبيها ثم ثبّتي');
  };

  PatternBoard.prototype._continuePendingRepeats = function() {
    const left = this._pendingRepeatCount | 0;
    const tmpl = this._pendingRepeatTemplate;
    if (!left || !tmpl || !tmpl.length) {
      this._pendingRepeatCount = 0;
      this._pendingRepeatTemplate = null;
      return;
    }
    const ends = this._groupEnds(tmpl);
    let cursor = this._lastWorkEnd && this._lastWorkEnd();
    if (!cursor && ends) cursor = { x: ends.end.x, y: ends.end.y };
    if (!cursor) {
      try {
        const ub = unionBBox(tmpl);
        if (ub) cursor = { x: ub.maxX, y: (ub.minY + ub.maxY) / 2 };
      } catch (_) {}
    }
    if (!cursor) {
      this._pendingRepeatCount = 0;
      this._pendingRepeatTemplate = null;
      return;
    }
    const added = [];
    for (let k = 0; k < left; k++) {
      const start = ends ? ends.start : { x: cursor.x, y: cursor.y };
      const dx = cursor.x - start.x, dy = cursor.y - start.y;
      const joinMap = new Map();
      const idMap = new Map();
      const batch = [];
      for (const sh of tmpl) {
        const c = cloneShapeOffset(sh, dx, dy);
        c.id = this.newId();
        if (sh.id != null) idMap.set(sh.id, c.id);
        if (sh.joinId) {
          if (!joinMap.has(sh.joinId)) joinMap.set(sh.joinId, 'join_' + Date.now() + '_' + k + '_' + this.newId());
          c.joinId = joinMap.get(sh.joinId);
        }
        delete c.guide;
        batch.push(c);
      }
      for (const c of batch) {
        if (c.kind === 'fill' && c.parentId != null && idMap.has(c.parentId)) c.parentId = idMap.get(c.parentId);
      }
      added.push(...batch);
      const ne = this._groupEnds(batch);
      if (ne && ne.end) cursor = { x: ne.end.x, y: ne.end.y };
      else {
        try {
          const ub = unionBBox(batch);
          if (ub) cursor = { x: ub.maxX, y: (ub.minY + ub.maxY) / 2 };
        } catch (_) {}
      }
    }
    this._pendingRepeatCount = 0;
    this._pendingRepeatTemplate = null;
    if (!added.length) return;
    this.shapes.push(...added);
    this.pushHistory({ op: 'batchAdd', shapes: added });
    this.lastCommittedShapes = added.map((s) => { const c = this._cloneShapeDeep(s); delete c.id; return c; });
    if (cursor) {
      this.chainPoint = { x: cursor.x, y: cursor.y };
      this.lastPoint = { x: cursor.x, y: cursor.y };
    }
    this.rebuildArt(); this.render(); this.autoSave();
    this.showToast('أُضيفت ' + left + ' نسخة من آخر نقطة');
  };

  PatternBoard.prototype.recolorThreadGroup = function(threadId, newBase) {
    newBase = this._normHex(newBase);
    const colEdge = this._shadeHex(newBase, -0.18);
    const colRung = newBase;
    const colHi = this._shadeHex(newBase, 0.42);
    const items = [];
    for (const sh of this.shapes) {
      if (sh.threadId !== threadId) continue;
      const from = sh.color;
      let to = newBase;
      if (sh.threadRole === 'edge') to = colEdge;
      else if (sh.threadRole === 'hi') to = colHi;
      else to = colRung;
      if (from === to) { sh.threadBase = newBase; continue; }
      items.push({ id: sh.id, from, to });
      sh.color = to;
      sh.threadBase = newBase;
    }
    return items;
  };

  PatternBoard.prototype.pausePreviewForEdit = function() {
    if (!this.stagePlaying) return;
    const idx = this._previewStageIndex;
    if (!(idx >= 0 && idx < this.stageTimeline.length)) {
      this.showToast('لم تبدأ لقطة قابلة للتعديل بعد');
      return;
    }
    this._previewPauseForEdit = true;
    this._previewPauseStageIndex = idx;
    if (this._stagePreviewTimer) { cancelAnimationFrame(this._stagePreviewTimer); this._stagePreviewTimer = null; }
    this.stagePlaying = false;
    this.showToast('توقفت عند اللقطة ' + (idx + 1) + ' — صحّحيها ثم اضغطي حفظ');
  };

  PatternBoard.prototype.beginPreviewCorrection = function(idx) {
    const st = this.stageTimeline[idx];
    if (!st) return;
    this._stageEditBackup = {
      timeline: JSON.parse(JSON.stringify(this.stageTimeline)),
      editIndex: idx,
      label: st.label || 'مرحلة ' + (idx + 1),
      simpleCorrection: true,
      originalIds: (st.shapes || []).map((sh) => sh.id).filter((id) => id != null),
    };
    this.selectedStageIdxs = new Set([idx]);
    this.selShapeIds = new Set();
    this.selRect = null;
    this.shapes = JSON.parse(JSON.stringify(st.shapes || []));
    this.rebuildArt && this.rebuildArt();
    this.setTool('pickSelect');
    this._showEditModeBar(idx + 1, (st.shapes || []).length);
    const multiRow = document.getElementById('stageMultiRow');
    if (multiRow) multiRow.style.display = 'none';
    this.updateStageRecUI && this.updateStageRecUI();
    this.renderStageThumbs && this.renderStageThumbs();
    this.render();
  };

  PatternBoard.prototype.stopStagePreview = function() {
    if (this._stagePreviewTimer) {
      cancelAnimationFrame(this._stagePreviewTimer);
      this._stagePreviewTimer = null;
      this._showPreviewSpeedBar && this._showPreviewSpeedBar(false);
    }
    this.stagePlaying = false;
    this._previewPlayList = null;
    this._previewPlayIdxs = null;
    if (this.setPreviewStageIndex) this.setPreviewStageIndex(-1);
    this.rebuildArt();
    this.render();
    this.updateStageRecUI();
  };

  PatternBoard.prototype.rasterShapeProgress = function(ctx, sh, t) {
    t = Math.max(0, Math.min(1, t));
    if (t <= 0) return;
    if (sh.kind === 'needlePath') {
      const pts = sh.pts || [];
      if (pts.length < 1) return;
      const nSize = sh.needleSize || sh.width || 8;
      const sc = 0.65 + (Math.max(1, Math.min(26, nSize)) / 26) * 1.35;
      const T_OUT = 0.38, T_GONE = 0.48, T_IN = 0.55;
      const p0 = this._pointOnPath(pts, 0);
      const p1 = this._pointOnPath(pts, 1);
      if (!p0 || !p1) return;
      if (t <= T_OUT) {
        const emerge = Math.max(0.08, t / T_OUT);
        this.rasterNeedle3D(ctx, p0.x, p0.y, p0.angle, sc, { emerge, plunge: 0, pitch: -0.2 * (1 - emerge) });
      } else if (t < T_GONE || t < T_IN) {
        return;
      } else {
        const u = (t - T_IN) / (1 - T_IN);
        const emerge = Math.min(1, 0.35 + u * 0.9);
        const plunge = Math.min(1, u * 1.15);
        this.rasterNeedle3D(ctx, p1.x, p1.y, p1.angle, sc, { emerge, plunge, pitch: 0.4 * plunge });
      }
      return;
    }
    if (t >= 1) { this.rasterShape(ctx, sh); return; }
    if (sh.kind === 'eraser') {
      const pts = sh.pts || [];
      if (pts.length < 1) return;
      const n = Math.max(1, Math.ceil((pts.length - 1) * t));
      const sub = pts.slice(0, n + 1);
      this.rasterErase(ctx, sub, sh.width || 12);
      return;
    }
    switch (sh.kind) {
      case 'line': {
        const x = sh.x1 + (sh.x2 - sh.x1) * t, y = sh.y1 + (sh.y2 - sh.y1) * t;
        this.rasterLine(ctx, sh.x1, sh.y1, x, y, sh.color, sh.width);
        break;
      }
      case 'arrow': {
        const x = sh.x1 + (sh.x2 - sh.x1) * t, y = sh.y1 + (sh.y2 - sh.y1) * t;
        if (t < 0.88) this.rasterLine(ctx, sh.x1, sh.y1, x, y, sh.color, sh.width);
        else this.rasterArrow(ctx, sh.x1, sh.y1, x, y, sh.color, sh.width);
        break;
      }
      case 'arc': {
        let span = sh.end - sh.start;
        if (sh.anticlockwise) { if (span > 0) span -= 2 * Math.PI; }
        else { if (span < 0) span += 2 * Math.PI; }
        const aEnd = sh.start + span * t;
        this.rasterArc(ctx, sh.cx, sh.cy, sh.r, sh.start, aEnd, sh.anticlockwise, sh.color, sh.width);
        break;
      }
      case 'circle': {
        if (sh.filled || !sh.width) {
          const dir = sh.growFrom || 'left';
          const cx = sh.cx, cy = sh.cy, r = sh.r || 0;
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.clip();
          ctx.fillStyle = sh.color || '#2b2820';
          if (dir === 'right') {
            const ww = 2 * r * t;
            ctx.fillRect(cx + r - ww, cy - r, ww, 2 * r);
          } else if (dir === 'top') {
            ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r * t);
          } else if (dir === 'bottom') {
            const hh = 2 * r * t;
            ctx.fillRect(cx - r, cy + r - hh, 2 * r, hh);
          } else {
            ctx.fillRect(cx - r, cy - r, 2 * r * t, 2 * r);
          }
          ctx.restore();
          break;
        }
        const aEnd = t * Math.PI * 2;
        this.rasterArc(ctx, sh.cx, sh.cy, sh.r, 0, aEnd, false, sh.color, sh.width);
        break;
      }
      case 'rect': {
        const x = sh.x, y = sh.y, w = sh.w, h = sh.h;
        if (sh.filled || !sh.width || sh.fabric) {
          const dir = sh.growFrom || 'left';
          let rx = x, ry = y, rw = w, rh = h;
          if (dir === 'right') { rw = w * t; rx = x + w - rw; }
          else if (dir === 'top') { rh = h * t; }
          else if (dir === 'bottom') { rh = h * t; ry = y + h - rh; }
          else { rw = w * t; }
          if (rw < 0.5 || rh < 0.5) break;
          if (sh.fabric || sh.weave) {
            ctx.save();
            ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
            this.rasterWeaveFabric(ctx, x, y, w, h, sh.color || '#4a2c20', sh);
            ctx.restore();
          } else if (sh.texData || sh._texImg || sh.texImage) {
            ctx.save();
            ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
            this.rasterRect(ctx, { ...sh, x, y, w, h }, sh.color, sh.width || 0);
            ctx.restore();
          } else {
            ctx.fillStyle = sh.color || '#2b2820';
            ctx.fillRect(rx, ry, rw, rh);
          }
          break;
        }
        const per = 2 * (w + h) || 1;
        const d = t * per;
        this.setStroke(ctx, sh.color, sh.width);
        ctx.beginPath();
        ctx.moveTo(x, y);
        let rem = d;
        const edges = [[w, 0], [0, h], [-w, 0], [0, -h]];
        let curX = x, curY = y;
        for (const [ex, ey] of edges) {
          const el = Math.hypot(ex, ey) || 1;
          if (rem <= 0) break;
          if (rem >= el) { curX += ex; curY += ey; ctx.lineTo(curX, curY); rem -= el; }
          else { curX += ex * (rem / el); curY += ey * (rem / el); ctx.lineTo(curX, curY); rem = 0; }
        }
        ctx.stroke();
        break;
      }
      case 'triangle': {
        const pts = [sh.p1, sh.p2, sh.p3, sh.p1];
        let total = 0;
        for (let i = 0; i < 3; i++) total += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        let rem = t * (total || 1);
        this.setStroke(ctx, sh.color, sh.width);
        ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < 3; i++) {
          const el = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) || 1;
          if (rem <= 0) break;
          if (rem >= el) { ctx.lineTo(pts[i + 1].x, pts[i + 1].y); rem -= el; }
          else {
            const u = rem / el;
            ctx.lineTo(pts[i].x + (pts[i + 1].x - pts[i].x) * u, pts[i].y + (pts[i + 1].y - pts[i].y) * u);
            rem = 0;
          }
        }
        ctx.stroke();
        break;
      }
      case 'freehand':
      case 'freehandClosed': {
        const pts = sh.pts || [];
        if (pts.length < 2) break;
        let total = 0;
        for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (sh.kind === 'freehandClosed' && pts.length > 2)
          total += Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y);
        let rem = t * (total || 1);
        const out = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
          const el = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 1;
          if (rem <= 0) break;
          if (rem >= el) { out.push(pts[i]); rem -= el; }
          else {
            const u = rem / el;
            out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u });
            rem = 0;
          }
        }
        if (out.length) this.rasterFree(ctx, out, false, sh.color, sh.width);
        break;
      }
      case 'silk': {
        const pts = sh.pts || [];
        if (pts.length < 2) break;
        let total = 0;
        for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 0;
        if (total <= 0) { this.rasterSilk(ctx, sh); break; }
        let rem = t * total;
        const out = [{ x: pts[0].x, y: pts[0].y }];
        for (let i = 1; i < pts.length; i++) {
          const el = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 1;
          if (rem <= 0) break;
          if (rem >= el) { out.push({ x: pts[i].x, y: pts[i].y }); rem -= el; }
          else {
            const u = rem / el;
            out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * u, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u });
            rem = 0;
          }
        }
        if (out.length < 2) {
          const dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
          const L = Math.hypot(dx, dy) || 1;
          out.push({ x: pts[0].x + (dx / L) * 0.5, y: pts[0].y + (dy / L) * 0.5 });
        }
        this.rasterSilk(ctx, Object.assign({}, sh, { pts: out }));
        break;
      }
      case 'fill':
        if (t > 0.7) this.rasterShape(ctx, sh);
        break;
      case 'number':
      case 'text':
        if (t > 0.5) this.rasterShape(ctx, sh);
        break;
      default:
        if (t > 0.5) this.rasterShape(ctx, sh);
    }
  };

  PatternBoard.prototype.buildStagesFromArt = function() {
    if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
    const work = this.shapesInDrawOrder(this.shapes).filter((sh) => !sh.hidden && !sh.guide);
    if (!work.length) { this.showToast('لا أشكال على اللوحة لإنشاء مراحل منها'); return; }
    const run = () => {
      const before = JSON.parse(JSON.stringify(this.stageTimeline || []));
      const timeline = [];
      const acc = [];
      for (let i = 0; i < work.length; i++) {
        acc.push(this._cloneShapeDeep(work[i]));
        timeline.push({
          shapes: acc.map((s) => this._cloneShapeDeep(s)),
          label: 'شكل ' + (i + 1),
          t: Date.now() + i,
        });
      }
      this.stageTimeline = timeline;
      this.stageRecording = false;
      this.pushStageSnapshot(before);
      this.updateStageRecUI();
      this.autoSave();
      this.showToast('جاهز: ' + timeline.length + ' مرحلة — يمكن التراجع ↩');
    };
    if (this.stageTimeline.length) {
      this.askConfirm('سيتم استبدال المراحل الحالية بمراحل من الرسم الحالي (' + work.length + ' شكل). متأكدة؟', { danger: true, okText: 'استبدال' }).then((ok) => {
        if (ok) run();
      });
      return;
    }
    run();
  };

  PatternBoard.prototype._stageIntroUnits = function(timeline) {
    const list = timeline || this.stageTimeline || [];
    const units = [];
    let prevIds = new Set();
    for (let i = 0; i < list.length; i++) {
      const shapes = (list[i] && list[i].shapes) || [];
      const neu = this.shapesInDrawOrder(shapes.filter((sh) => sh && !prevIds.has(sh.id)));
      prevIds = new Set(shapes.map((sh) => sh.id));
      let sum = 0, n = 0;
      for (const sh of neu) {
        try {
          const b = shapeBBox(sh);
          if (b) { sum += (b.minY + b.maxY) * 0.5; n++; }
        } catch (e) {}
      }
      units.push({
        index: i,
        label: (list[i] && list[i].label) || 'لقطة ' + (i + 1),
        newShapes: neu,
        cy: n ? sum / n : 0,
        t: list[i] && list[i].t,
      });
    }
    return units;
  };

  PatternBoard.prototype.togglePreviewBottomUp = function() {
    this._previewBottomUp = !this._previewBottomUp;
    const b = document.getElementById('stagePreviewDirBtn');
    if (b) {
      b.classList.toggle('rec-on', this._previewBottomUp);
      b.textContent = this._previewBottomUp ? '↑ من الأسفل' : '↕ من الأسفل';
      b.title = this._previewBottomUp
        ? 'المعاينة حالياً: من أسفل اللوحة نحو الأعلى'
        : 'اتجاه المعاينة: من التسجيل أو من أسفل اللوحة للأعلى';
    }
    this.showToast(this._previewBottomUp ? 'المعاينة: من الأسفل → الأعلى' : 'المعاينة: ترتيب التسجيل كالمعتاد');
  };

  PatternBoard.prototype.reorderStagesBottomUp = function() {
    if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
    const tl = this.stageTimeline || [];
    if (tl.length < 2) { this.showToast('تحتاجين لقطتين على الأقل'); return; }
    const before = JSON.parse(JSON.stringify(tl));
    const units = this._stageIntroUnits(tl);
    units.sort((a, b) => b.cy - a.cy || a.index - b.index);
    const cumulative = [];
    let acc = [];
    const seen = new Set();
    for (const u of units) {
      for (const sh of u.newShapes) {
        if (seen.has(sh.id)) continue;
        seen.add(sh.id);
        acc.push(this._cloneShapeDeep(sh));
      }
      cumulative.push({
        label: u.label || 'لقطة ' + (cumulative.length + 1),
        t: Date.now() + cumulative.length,
        shapes: acc.map((s) => this._cloneShapeDeep(s)),
      });
    }
    this.stageTimeline = cumulative;
    this.selectedStageIdxs = new Set();
    this.pushStageSnapshot && this.pushStageSnapshot(before);
    this.updateStageRecUI && this.updateStageRecUI();
    this.renderStageThumbs && this.renderStageThumbs();
    this.autoSave && this.autoSave();
    this.showToast('رتّبت ' + cumulative.length + ' لقطة من الأسفل → الأعلى');
  };

  PatternBoard.prototype._previewDurationFor = function(sh) {
    const mul = Math.max(1, this._previewSpeedMul || 1);
    let base = 380;
    if (sh.kind === 'arc' || sh.kind === 'circle') base = 520;
    else if (sh.kind === 'silk') {
      const pts = sh.pts || [];
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 0;
      base = Math.max(650, Math.min(2200, 400 + len * 1.1));
    } else if (sh.kind === 'needlePath') {
      base = Math.max(1100, Math.min(2200, 1400));
    } else if (sh.kind === 'freehand' || sh.kind === 'freehandClosed') base = 600;
    else if (sh.kind === 'rect' || sh.kind === 'triangle') base = 480;
    return Math.max(40, base / mul);
  };

  PatternBoard.prototype._previewWait = function(ms) {
    const mul = Math.max(1, this._previewSpeedMul || 1);
    return new Promise((r) => setTimeout(r, Math.max(10, ms / mul)));
  };

  PatternBoard.prototype._previewClearToBoardOnly = function() {
    try {
      if (this.actx) this.actx.clearRect(0, 0, this.art.width, this.art.height);
      const board = this.getBoardShapes ? this.getBoardShapes() : [];
      for (const sh of board) {
        try { this.rasterShape(this.actx, sh); } catch (e) {}
      }
      this.render && this.render();
    } catch (e) {
      console.warn('preview clear', e);
    }
  };

  PatternBoard.prototype._previewAnimateShapes = function(baseShapes, newShapes) {
    return new Promise((resolve) => {
      const board = this.getBoardShapes ? this.getBoardShapes() : [];
      const baseAll = board && board.length ? board.concat(baseShapes || []) : baseShapes || [];
      baseShapes = baseAll;
      try {
        this.actx.clearRect(0, 0, this.art.width, this.art.height);
        for (const b of baseShapes) this.rasterShape(this.actx, b);
        this.render();
      } catch (e) {}
      if (!newShapes.length) {
        this.actx.clearRect(0, 0, this.art.width, this.art.height);
        for (const sh of baseShapes) this.rasterShape(this.actx, sh);
        this.render();
        resolve();
        return;
      }
      let idx = 0;
      const playOne = () => {
        if (!this.stagePlaying) { resolve(); return; }
        if (this._previewSkipRequested) {
          this._previewSkipRequested = false;
          this.actx.clearRect(0, 0, this.art.width, this.art.height);
          for (const b of baseShapes) this.rasterShape(this.actx, b);
          for (const sh of newShapes) this.rasterShape(this.actx, sh);
          this.render();
          resolve();
          return;
        }
        if (idx >= newShapes.length) { resolve(); return; }
        const sh = newShapes[idx];
        const dur = this._previewDurationFor(sh);
        const t0 = performance.now();
        const step = (now) => {
          if (!this.stagePlaying) { resolve(); return; }
          if (this._previewSkipRequested) {
            this._previewSkipRequested = false;
            this.actx.clearRect(0, 0, this.art.width, this.art.height);
            for (const b of baseShapes) this.rasterShape(this.actx, b);
            for (const s of newShapes) this.rasterShape(this.actx, s);
            this.render();
            resolve();
            return;
          }
          const t = Math.min(1, (now - t0) / dur);
          this.actx.clearRect(0, 0, this.art.width, this.art.height);
          for (const b of baseShapes) this.rasterShape(this.actx, b);
          for (let i = 0; i < idx; i++) this.rasterShape(this.actx, newShapes[i]);
          this.rasterShapeProgress(this.actx, sh, t);
          this.render();
          if (t < 1) this._stagePreviewTimer = requestAnimationFrame(step);
          else {
            idx++;
            this._stagePreviewTimer = null;
            const gap = Math.max(15, 90 / Math.max(1, this._previewSpeedMul || 1));
            setTimeout(playOne, gap);
          }
        };
        this._stagePreviewTimer = requestAnimationFrame(step);
      };
      playOne();
    });
  };

  PatternBoard.prototype.previewStages = async function() {
    if (this.stagePlaying) {
      this.stopStagePreview();
      this.showToast('أُوقفت المعاينة');
      return;
    }
    if (!this.stageTimeline.length) { this.showToast('لا مراحل — احفظي مراحل أو اضغطي «من الرسم»'); return; }
    const sel = this.selectedStageIdxs || new Set();
    const playList = sel.size
      ? [...sel].filter((i) => i >= 0 && i < this.stageTimeline.length).sort((a, b) => a - b).map((i) => this.stageTimeline[i])
      : this.stageTimeline;
    if (!playList.length) { this.showToast('لا لقطات'); return; }
    this._previewPlayList = playList;
    this._previewPlayIdxs = sel.size
      ? [...sel].filter((i) => i >= 0 && i < this.stageTimeline.length).sort((a, b) => a - b)
      : playList.map((_, i) => i);
    this.stagePlaying = true;
    this._previewSkipRequested = false;
    if (!this._previewSpeedMul || this._previewSpeedMul < 1) this._previewSpeedMul = 1;
    this.updateStageRecUI();
    this._showPreviewSpeedBar(true);
    this.showToast(sel.size ? 'معاينة ' + sel.size + ' لقطة محدّدة' : 'معاينة كل اللقطات…');

    try {
      this._previewClearToBoardOnly();
      this._forceFullSilk = true;
      let base = [];
      const list = this._previewPlayList || this.stageTimeline;
      const idxMap = this._previewPlayIdxs || list.map((_, i) => i);
      if (this.setPreviewStageIndex) this.setPreviewStageIndex(-1);

      if (this._previewBottomUp) {
        const units = this._stageIntroUnits(list);
        units.forEach((u) => { u._playIdx = idxMap[u.index] != null ? idxMap[u.index] : u.index; });
        units.sort((a, b) => b.cy - a.cy || a.index - b.index);
        for (let s = 0; s < units.length; s++) {
          if (!this.stagePlaying) break;
          const u = units[s];
          if (this.setPreviewStageIndex) this.setPreviewStageIndex(u._playIdx);
          const newShapes = (u.newShapes || []).map((sh) => this._cloneShapeDeep(sh));
          await this._previewAnimateShapes(base, newShapes);
          base = base.concat(newShapes);
          if (this.stagePlaying) await this._previewWait(180);
        }
      } else {
        let prevIds = new Set();
        for (let s = 0; s < list.length; s++) {
          if (!this.stagePlaying) break;
          if (this.setPreviewStageIndex) this.setPreviewStageIndex(idxMap[s]);
          const stage = list[s];
          const newShapes = this.shapesInDrawOrder(stage.shapes.filter((sh) => !prevIds.has(sh.id)));
          await this._previewAnimateShapes(base, newShapes);
          base = stage.shapes.map((sh) => this._cloneShapeDeep(sh));
          prevIds = new Set(stage.shapes.map((sh) => sh.id));
          if (this.stagePlaying) await this._previewWait(180);
        }
      }
    } finally {
      const pausedForEdit = !!this._previewPauseForEdit;
      const pauseIdx = this._previewPauseStageIndex;
      this._previewPauseForEdit = false;
      this._previewPauseStageIndex = -1;
      this.stagePlaying = false;
      this._forceFullSilk = false;
      this._stagePreviewTimer = null;
      this._previewPlayList = null;
      this._previewPlayIdxs = null;
      this._previewSkipRequested = false;
      if (this.setPreviewStageIndex) this.setPreviewStageIndex(-1);
      this._showPreviewSpeedBar(false);
      if (pausedForEdit && pauseIdx >= 0 && pauseIdx < this.stageTimeline.length) {
        this.beginPreviewCorrection(pauseIdx);
        return;
      }
      this.rebuildArt();
      this.render();
      this.updateStageRecUI();
      this.showToast('انتهت المعاينة');
    }
  };

  PatternBoard.prototype._showPreviewSpeedBar = function(show) {
    const bar = document.getElementById('previewSpeedBar');
    if (!bar) return;
    bar.classList.toggle('show', !!show);
    if (show) {
      bar.querySelectorAll('button[data-speed]').forEach((b) => {
        b.classList.toggle('active', Number(b.getAttribute('data-speed')) === Number(this._previewSpeedMul || 1));
      });
    }
  };

  PatternBoard.prototype.setPreviewSpeed = function(mul) {
    mul = Number(mul) || 1;
    if (!(mul >= 1 && mul <= 8)) mul = 1;
    this._previewSpeedMul = mul;
    const bar = document.getElementById('previewSpeedBar');
    if (bar) {
      bar.querySelectorAll('button[data-speed]').forEach((b) => {
        b.classList.toggle('active', Number(b.getAttribute('data-speed')) === mul);
      });
    }
    this.showToast('سرعة المعاينة: ' + mul + '×');
  };

  PatternBoard.prototype.requestPreviewSkip = function() {
    if (!this.stagePlaying) return;
    this._previewSkipRequested = true;
    this.showToast('تخطي…');
  };

  PatternBoard.prototype._finalMaterialShape = function(sh) {
    const c = this._cloneShapeDeep(sh);
    if (!c || c.hidden || c.guide) return c;
    if (c.kind === 'rect' && (c.texData || c.texImage || c._texImg || c._texCanvas)) {
      c._finalMaterial = true;
      return c;
    }
    if (c.kind === 'rect' && !(c.fabric || c.weave)) {
      c.fabric = true; c.weave = true; c.filled = true;
      c.width = 0;
      if (c.weaveSeed == null) c.weaveSeed = (Math.random() * 1e9) | 0;
      if (c.weaveWarp == null) c.weaveWarp = 14 + Math.random() * 12;
      c._finalMaterial = true;
      return c;
    }
    if (c.kind === 'rect') {
      c._finalMaterial = true;
      return c;
    }
    if (c.kind === 'line' || c.kind === 'arrow') {
      const w = Math.max(5, (c.width || 4) * 2.2);
      return {
        ...c,
        kind: 'silk',
        pts: [{ x: c.x1, y: c.y1 }, { x: c.x2, y: c.y2 }],
        width: w, twist: 2.2, twistStrength: 2, tension: true,
        _finalMaterial: true, _fastSilk: false,
      };
    }
    if (c.kind === 'freehand' && Array.isArray(c.pts) && c.pts.length > 1) {
      c.kind = 'silk';
      c.width = Math.max(5, (c.width || 4) * 2.2);
      if (c.twist == null) c.twist = 2.2;
      if (c.twistStrength == null) c.twistStrength = 2;
      c.tension = true;
      c._finalMaterial = true;
      c._fastSilk = false;
      return c;
    }
    if (c.kind === 'silk') {
      c._finalMaterial = true;
      c._fastSilk = false;
      if (c.twistStrength == null) c.twistStrength = 2;
      if (c.twist == null) c.twist = 2.2;
      return c;
    }
    return c;
  };

  PatternBoard.prototype._finalMaterialStageShapes = function(shapes) {
    return (shapes || []).map((sh) => this._finalMaterialShape(sh));
  };

  PatternBoard.prototype.exportStageVideo = async function() {
    if (!this.stageTimeline.length) { this.showToast('لا مراحل للتصدير'); return; }
    if (this.stagePlaying) { this.showToast('أوقفي المعاينة أولاً'); return; }
    if (typeof MediaRecorder === 'undefined') {
      this.showToast('المتصفح لا يدعم تسجيل الفيديو — جرّبي كروم أو فايرفوكس');
      return;
    }

    const outScale = 0.55;
    const ow = Math.round(this.art.width * outScale), oh = Math.round(this.art.height * outScale);
    const OW = ow - (ow % 2), OH = oh - (oh % 2);
    const out = document.createElement('canvas');
    out.width = OW; out.height = OH;
    const octx = out.getContext('2d', { alpha: false, desynchronized: true });
    const board = this.getBoardShapes ? this.getBoardShapes() : [];

    let lastPaint = { base: [], done: [], current: null, t: 1 };
    const paintFrame = (baseShapes, doneNew, current, t) => {
      lastPaint = { base: baseShapes, done: doneNew, current: current, t: t };
      octx.fillStyle = '#ffffff';
      octx.fillRect(0, 0, OW, OH);
      octx.save();
      octx.scale(outScale, outScale);
      for (const sh of board) { try { this.rasterShape(octx, sh); } catch (e) {} }
      for (const sh of baseShapes) { try { this.rasterShape(octx, sh); } catch (e) {} }
      for (const sh of doneNew) { try { this.rasterShape(octx, sh); } catch (e) {} }
      if (current) { try { this.rasterShapeProgress(octx, current, t); } catch (e) {} }
      octx.restore();
    };
    const repaintLast = () => {
      const p = lastPaint;
      paintFrame(p.base, p.done, p.current, p.t);
    };

    let pumpOn = true;
    let pumpCount = 0;
    const pump = () => {
      if (!pumpOn) return;
      repaintLast();
      pumpCount++;
      setTimeout(pump, 1000 / 30);
    };

    const mimeCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
    ];
    let mime = '';
    for (const m of mimeCandidates) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { mime = m; break; }
    }
    const stream = out.captureStream(30);
    let recorder;
    try {
      recorder = mime
        ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3500000 })
        : new MediaRecorder(stream, { videoBitsPerSecond: 3500000 });
    } catch (e) {
      this.showToast('تعذّر بدء التسجيل');
      return;
    }
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    this.stagePlaying = true;
    this.updateStageRecUI();
    this.showToast('جاري إنشاء الفيديو… أبقِ الصفحة مفتوحة وفي المقدّمة');

    const speed = Math.max(1, Math.min(4, this._previewSpeed || 2));
    const durationFor = (sh) => {
      let d = 380;
      if (sh.kind === 'arc' || sh.kind === 'circle') d = 420;
      else if (sh.kind === 'silk') {
        const pts = sh.pts || [];
        let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 0;
        d = Math.max(400, Math.min(1400, 280 + len * 0.7));
      } else if (sh.kind === 'needlePath') {
        const pts = sh.pts || []; let len = 0;
        for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) || 0;
        d = Math.max(600, Math.min(2400, 400 + len * 1.2));
      } else if (sh.kind === 'freehand' || sh.kind === 'freehandClosed') d = 450;
      else if (sh.kind === 'rect' || sh.kind === 'triangle') d = 360;
      return Math.max(120, d / speed);
    };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    const animateOnOut = (baseShapes, newShapes) =>
      new Promise((resolve) => {
        if (!newShapes.length) {
          paintFrame(baseShapes, [], null, 1);
          resolve(); return;
        }
        let idx = 0;
        const playOne = () => {
          if (!this.stagePlaying || idx >= newShapes.length) { resolve(); return; }
          const sh = newShapes[idx];
          const dur = durationFor(sh);
          const t0 = performance.now();
          const step = (now) => {
            if (!this.stagePlaying) { resolve(); return; }
            const t = Math.min(1, (now - t0) / dur);
            paintFrame(baseShapes, newShapes.slice(0, idx), sh, t);
            if ((pumpCount & 1) === 0) {
              try {
                this.actx.clearRect(0, 0, this.art.width, this.art.height);
                for (const b of board) this.rasterShape(this.actx, b);
                for (const b of baseShapes) this.rasterShape(this.actx, b);
                for (let i = 0; i < idx; i++) this.rasterShape(this.actx, newShapes[i]);
                this.rasterShapeProgress(this.actx, sh, t);
                this.render();
              } catch (e) {}
            }
            if (t < 1) this._stagePreviewTimer = requestAnimationFrame(step);
            else { idx++; this._stagePreviewTimer = null; setTimeout(playOne, Math.max(40, 70 / speed)); }
          };
          this._stagePreviewTimer = requestAnimationFrame(step);
        };
        playOne();
      });

    const stopped = new Promise((resolve) => { recorder.onstop = () => resolve(); });
    try { recorder.start(200); } catch (e) { recorder.start(); }

    paintFrame([], [], null, 1);
    pump();
    await wait(300);

    try {
      let prevRaw = [];
      let base = [];
      const finalMaterial = !!this.finalMaterialVideo;
      this._forceFullSilk = true;
      for (let s = 0; s < this.stageTimeline.length; s++) {
        if (!this.stagePlaying) break;
        const stage = this.stageTimeline[s];
        const rawStage = stage.shapes || [];
        const prevIds = new Set(prevRaw.map((sh) => sh.id));
        const newRaw = rawStage.filter((sh) => !prevIds.has(sh.id));
        const newShapes = finalMaterial ? this._finalMaterialStageShapes(newRaw) : newRaw.map((sh) => this._cloneShapeDeep(sh));
        await animateOnOut(base, newShapes);
        base = finalMaterial ? this._finalMaterialStageShapes(rawStage) : rawStage.map((sh) => this._cloneShapeDeep(sh));
        prevRaw = rawStage.map((sh) => this._cloneShapeDeep(sh));
        paintFrame(base, [], null, 1);
        if (this.stagePlaying) await wait(Math.max(80, 160 / speed));
      }
      paintFrame(base, [], null, 1);
      await wait(500);
    } catch (e) {
      console.error(e);
    }

    try { if (recorder.state === 'recording') recorder.requestData(); } catch (e) {}
    await wait(150);
    pumpOn = false;
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {}

    this.stagePlaying = false;
    this._forceFullSilk = false;
    this._stagePreviewTimer = null;
    this.rebuildArt();
    this.render();
    this.updateStageRecUI();

    if (!chunks.length) {
      this.showToast('لم يُنتَج فيديو — جرّبي كروم وأبقي الصفحة مفتوحة');
      return;
    }
    const rawType = (recorder.mimeType || mime || 'video/webm').split(';')[0];
    let blob = new Blob(chunks, { type: rawType || 'video/webm' });
    let ext = rawType.includes('mp4') ? 'mp4' : 'webm';

    if (ext !== 'mp4') {
      this.showToast('تحويل إلى MP4 متوافق مع الهاتف…');
      try {
        const mp4 = await this.convertWebmBlobToMp4(blob);
        if (mp4 && mp4.size > 0) { blob = mp4; ext = 'mp4'; }
      } catch (err) {
        console.warn('MP4 convert failed', err);
        this.showToast('التحويل لم ينجح — سيتم تنزيل WebM');
        await wait(800);
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'marahel-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + ext;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 3000);
    this.showToast('تم التصدير · ' + ext.toUpperCase() + ' · ' + Math.round(blob.size / 1024) + ' ك.ب');
  };

  PatternBoard.prototype.convertWebmBlobToMp4 = async function(webmBlob) {
    const { FFmpeg } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.10/+esm');
    const { fetchFile, toBlobURL } = await import('https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.1/+esm');
    const ffmpeg = new FFmpeg();
    ffmpeg.on('log', () => {});
    const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';
    await ffmpeg.load({
      coreURL: await toBlobURL(base + '/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL(base + '/ffmpeg-core.wasm', 'application/wasm'),
    });
    await ffmpeg.writeFile('in.webm', await fetchFile(webmBlob));
    await ffmpeg.exec([
      '-fflags', '+genpts',
      '-i', 'in.webm',
      '-vf', 'fps=30,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26',
      '-r', '30', '-vsync', 'cfr',
      '-movflags', '+faststart',
      '-an', 'out.mp4',
    ]);
    const data = await ffmpeg.readFile('out.mp4');
    return new Blob([data.buffer], { type: 'video/mp4' });
  };
}
