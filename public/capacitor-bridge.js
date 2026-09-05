(function(){
  function wait(cb,r){if(typeof Capacitor!=='undefined'&&Capacitor.Plugins){cb();return;}if(r>0)setTimeout(function(){wait(cb,r-1)},100);}
  wait(function(){
    var F=Capacitor.Plugins.Filesystem,S=Capacitor.Plugins.Share;
    if(!F){alert('Filesystem plugin not loaded');return;}

    var origWrite=document.write;
    document.write=function(html){
      if(typeof html==='string'&&html.indexOf('{"version":')===0){
        saveProjectJSON(html);
        return;
      }
      origWrite.call(document,html);
    };

    var origOpen=window.open;
    window.open=function(url,name,specs){
      if(url&&typeof url==='string'&&(url.indexOf('data:')===0||url.indexOf('blob:')===0)){
        exportAnyFile(url,'export');
        return null;
      }
      return origOpen.call(window,url,name,specs);
    };

    var origCreate=document.createElement;
    document.createElement=function(t){
      var e=origCreate.call(document,t);
      if(t.toLowerCase()==='a'){
        var d='',h='';
        Object.defineProperty(e,'download',{set:function(v){d=v;},get:function(){return d;}});
        Object.defineProperty(e,'href',{
          set:function(v){h=v; try{Element.prototype.setAttribute.call(e,'href',v);}catch(_){}},
          get:function(){return h;}
        });
        var oc=e.click;e.click=function(){
          if(d&&h&&(h.indexOf('data:')===0||h.indexOf('blob:')===0)){exportAnyFile(h,d);return;}
          return oc.call(e);
        };
        e.setAttribute=function(n,v){if(n==='href')h=v;return Element.prototype.setAttribute.call(e,n,v);};
      }
      return e;
    };

    function saveProjectJSON(jsonText){
      var name='project_'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.json';
      F.writeFile({path:'Download/PatternBoard/'+name,data:btoa(unescape(encodeURIComponent(jsonText))),directory:'EXTERNAL_STORAGE',recursive:true})
        .then(function(r){alert('✅ تم الحفظ: '+name);})
        .catch(function(e){alert('❌ فشل الحفظ: '+e.message);});
    }

    function exportAnyFile(url,filename){
      if(!F||!S){alert('التصدير غير متوفر');return;}
      if(url.indexOf('data:')===0){
        var c=url.indexOf(',');var b64=url.substring(c+1);
        if(url.indexOf('base64')<0)b64=btoa(b64);
        saveFile(b64,filename);
      }else if(url.indexOf('blob:')===0){
        fetch(url).then(function(r){return r.blob();}).then(function(b){
          var rd=new FileReader();rd.onloadend=function(){saveFile(rd.result.split(',')[1],filename);};rd.readAsDataURL(b);
        });
      }
    }

    function saveFile(b64,name){
      F.writeFile({path:'Download/PatternBoard/'+name,data:b64,directory:'EXTERNAL_STORAGE',recursive:true})
        .then(function(r){
          S.share({title:'Pattern Board',text:name,url:r.uri,dialogTitle:'حفظ أو مشاركة'})
            .catch(function(e){console.log('Share cancelled',e);});
        })
        .catch(function(e){
          alert('❌ فشل التصدير: '+e.message);
        });
    }

    console.log('[Bridge] Capacitor bridge v4 active');
  },50);
})();
