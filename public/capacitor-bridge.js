// Capacitor Native Bridge
(function() {
  'use strict';
  
  function waitForCapacitor(cb, retries = 50) {
    if (typeof Capacitor !== 'undefined' && Capacitor.Plugins) {
      cb();
      return;
    }
    if (retries > 0) setTimeout(() => waitForCapacitor(cb, retries - 1), 100);
  }

  waitForCapacitor(function() {
    console.log('[Bridge] Capacitor ready');
    const Plugins = Capacitor.Plugins;
    const Filesystem = Plugins.Filesystem;
    const Share = Plugins.Share;

    // === اعتراض روابط التنزيل ===
    const origCreateElement = document.createElement;
    document.createElement = function(tag) {
      const el = origCreateElement.call(document, tag);
      if (tag.toLowerCase() === 'a') {
        let downloadName = '';
        let hrefUrl = '';
        
        Object.defineProperty(el, 'download', {
          set: function(v) { downloadName = v; },
          get: function() { return downloadName; }
        });
        
        const origClick = el.click;
        el.click = function() {
          if (downloadName && hrefUrl && (hrefUrl.startsWith('data:') || hrefUrl.startsWith('blob:'))) {
            exportFile(hrefUrl, downloadName);
            return;
          }
          return origClick.call(el);
        };
        
        el.setAttribute = function(name, value) {
          if (name === 'href') hrefUrl = value;
          return Element.prototype.setAttribute.call(el, name, value);
        };
      }
      return el;
    };

    function exportFile(dataUrl, filename) {
      if (!Filesystem || !Share) {
        alert('Export not available');
        return;
      }
      
      let base64 = '';
      if (dataUrl.startsWith('data:')) {
        const comma = dataUrl.indexOf(',');
        base64 = dataUrl.substring(comma + 1);
        if (!dataUrl.includes('base64')) base64 = btoa(base64);
      } else {
        fetch(dataUrl).then(r => r.blob()).then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const b64 = reader.result.split(',')[1];
            saveAndShare(b64, filename);
          };
          reader.readAsDataURL(blob);
        });
        return;
      }
      saveAndShare(base64, filename);
    }

    function saveAndShare(base64, filename) {
      Filesystem.writeFile({
        path: 'Download/' + filename,
        data: base64,
        directory: 'EXTERNAL_STORAGE',
        recursive: true
      }).then((result) => {
        Share.share({
          title: 'Pattern Board Export',
          text: filename,
          url: result.uri,
          dialogTitle: 'Save or Share'
        });
      }).catch(err => {
        alert('Save failed: ' + err.message);
      });
    }

    console.log('[Bridge] Ready');
  });
})();
