(function(){
  function wait(cb,r){if(typeof Capacitor!=='undefined'&&Capacitor.Plugins){cb();return;}if(r>0)setTimeout(function(){wait(cb,r-1)},100);}
  wait(function(){
    var F=Capacitor.Plugins.Filesystem,S=Capacitor.Plugins.Share;
    if(!F||!S)return;
    var orig=document.createElement;
    document.createElement=function(t){
      var e=orig.call(document,t);
      if(t.toLowerCase()==='a'){
        var d='',h='';
        Object.defineProperty(e,'download',{set:function(v){d=v;},get:function(){return d;}});
        var oc=e.click;e.click=function(){if(d&&h&&(h.indexOf('data:')===0||h.indexOf('blob:')===0)){exportFile(h,d);return;}return oc.call(e);};
        e.setAttribute=function(n,v){if(n==='href')h=v;return Element.prototype.setAttribute.call(e,n,v);};
      }
      return e;
    };
    function exportFile(u,n){
      var b64='';
      if(u.indexOf('data:')===0){var c=u.indexOf(',');b64=u.substring(c+1);if(u.indexOf('base64')<0)b64=btoa(b64);save(b64,n);}
      else{fetch(u).then(function(r){return r.blob();}).then(function(b){var r=new FileReader();r.onloadend=function(){save(r.result.split(',')[1],n);};r.readAsDataURL(b);});}
    }
    function save(b64,name){
      F.writeFile({path:'Download/'+name,data:b64,directory:'EXTERNAL_STORAGE',recursive:true}).then(function(r){
        S.share({title:'Pattern Board',text:name,url:r.uri,dialogTitle:'Save or Share'});
      }).catch(function(e){alert('Save failed: '+e.message);});
    }
    console.log('[Bridge] Ready');
  },50);
})();
