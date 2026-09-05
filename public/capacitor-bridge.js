// Capacitor Bridge for Export & Save
document.addEventListener('DOMContentLoaded', function() {
  if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform()) {
    console.log('[Capacitor] Native platform detected');
    
    // Override download links to use Capacitor Share
    document.addEventListener('click', function(e) {
      const link = e.target.closest('a[download]');
      if (link && link.href && link.href.startsWith('blob:')) {
        e.preventDefault();
        e.stopPropagation();
        
        fetch(link.href)
          .then(r => r.blob())
          .then(blob => {
            const reader = new FileReader();
            reader.onloadend = function() {
              const base64 = reader.result.split(',')[1];
              Capacitor.Plugins.Filesystem.writeFile({
                path: link.download || 'export',
                data: base64,
                directory: 'DOCUMENTS',
                recursive: true
              }).then((result) => {
                Capacitor.Plugins.Share.share({
                  title: 'Pattern Board Export',
                  text: 'Exported: ' + link.download,
                  url: result.uri,
                  dialogTitle: 'Share your pattern'
                });
              }).catch(err => {
                console.error('[Capacitor] Export error:', err);
                alert('Export error: ' + err.message);
              });
            };
            reader.readAsDataURL(blob);
          });
      }
    }, true);
  }
});
