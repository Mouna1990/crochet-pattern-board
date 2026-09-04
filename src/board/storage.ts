/** تهريب نص قبل إدخاله في HTML (حماية XSS محلية) */
export function escapeHtml(s: any): string {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function setText(el: HTMLElement | null, s: any): void {
  if (el) el.textContent = s == null ? '' : String(s);
}

/* ===== MODULE: storage (IndexedDB + localStorage fallback) ===== */
export const PB_IDB_NAME = 'PatternBoardDB';
export const PB_IDB_STORE = 'kv';
export const PB_IDB_VER = 1;

export function pbIdbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('no idb'));
      return;
    }
    const req = indexedDB.open(PB_IDB_NAME, PB_IDB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PB_IDB_STORE)) db.createObjectStore(PB_IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb open failed'));
  });
}

export async function pbIdbSet(key: string, value: any): Promise<boolean> {
  const db = await pbIdbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PB_IDB_STORE, 'readwrite');
    tx.objectStore(PB_IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function pbIdbGet(key: string): Promise<any> {
  const db = await pbIdbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PB_IDB_STORE, 'readonly');
    const req = tx.objectStore(PB_IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** ترحيل بنية المشروع المحفوظ إلى أحدث إصدار */
export function migrateProjectData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  let v = data.version | 0;
  // v1/v2: لوحة واحدة shapes[] بدون paragraphs
  if (v < 3) {
    if (!Array.isArray(data.paragraphs) || !data.paragraphs.length) {
      data.paragraphs = [
        {
          id: 1,
          name: 'فقرة 1',
          shapes: Array.isArray(data.shapes) ? data.shapes : [],
          nextNumber: data.nextNumber || 1,
          _idc: data._idc || 1,
          stageTimeline: Array.isArray(data.stageTimeline) ? data.stageTimeline : [],
          guidesVisible: data.guidesVisible !== false,
        },
      ];
      data.paraIndex = 0;
    }
    data.version = 3;
    v = 3;
  }
  // حقول افتراضية مستقرة
  if (!Array.isArray(data.unitLibrary)) data.unitLibrary = [];
  if (!Array.isArray(data.recipeRows)) data.recipeRows = [];
  if (!Array.isArray(data.sequenceLibrary)) data.sequenceLibrary = [];
  if (!Array.isArray(data.recentColors)) data.recentColors = [];
  if (!Array.isArray(data.alignGuides)) data.alignGuides = [];
  data.version = 3;
  return data;
}
