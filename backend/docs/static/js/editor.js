(function(){
  "use strict";

  /* ---- 注册自定义格式：字体 / 字号 / 行距 ---- */
  var Font=Quill.import('formats/font');
  Font.whitelist=['SimSun','SimHei','KaiTi','FangSong','Microsoft YaHei','Arial','Droid Serif','Source Code Pro','Times New Roman','Noto Sans JP','Noto Serif JP'];
  Quill.register(Font,true);
  var Size=Quill.import('formats/size');
  Size.whitelist=['9px','10px','11px','12px','13px','14px','16px','18px','20px','22px','24px','30px','36px','13.33px','14.67px'];
  Quill.register(Size,true);
  var Parchment=Quill.import('parchment');
  var LineHeight=new Parchment.StyleAttributor('lineheight','line-height',{whitelist:['1.0','1.15','1.5','2.0','2.5','3.0']});
  Quill.register(LineHeight,true);
  /* 自定义分隔线 blot（CDN 版无内置 divider） */
  var BlockEmbed=Quill.import('blots/block/embed');
  class HRBlot extends BlockEmbed {
    static create(){ var n=super.create(); n.setAttribute('contenteditable','false'); n.setAttribute('class','ql-hr'); return n; }
    static value(){ return true; }
  }
  HRBlot.blotName='divider';
  HRBlot.tagName='div';
  Quill.register(HRBlot,true);

  var quill=new Quill('#editor',{theme:'snow',placeholder:'开始输入…',modules:{toolbar:false,history:{delay:500}}});
  window.quill=quill;
  if(new URLSearchParams(location.search).get('test')){ quill.setText('这是第一段测试文本\n第二段测试内容 Second line\n第三段文字 Third paragraph here\n'); }
  var titleEl=document.getElementById('docTitle');
  var headerInput=document.getElementById('docHeaderInput');
  var mPath=location.pathname.match(/^\/docs\/(\d+)/);
  var initDocId=mPath?mPath[1]:(new URLSearchParams(location.search).get('id')||null);
  var toastTimer=null;

  /* toast 由 common.js 提供 window.showToast / window.toast */

  /* ==================== Pinia Store：全局状态统一管理 ==================== */
  var useDocStore=Pinia.defineStore('doc',{
    state:function(){ return {
      docId:initDocId,          /* 当前文档 id */
      title:'未命名文档',        /* 文档标题 */
      saveStateText:'已保存',    /* 顶栏保存状态（Vue 响应式绑定到 #saveState） */
      dirty:false,              /* 是否有未保存修改 */
      saveTimer:null,           /* 防抖计时器 */
      quill:quill               /* Quill 实例引用 */
    };},
    actions:{
      setStatus:function(t){ this.saveStateText=t; },
      curBody:function(){ return JSON.stringify({title:this.title||'未命名文档',content_html:this.quill.root.innerHTML}); },
      scheduleSave:function(){
        this.dirty=true; this.setStatus('保存中…');
        clearTimeout(this.saveTimer);
        var self=this; this.saveTimer=setTimeout(function(){ self.doSave(); },1000);
      },
      doSave:async function(){
        if(!this.docId) return;
        try{
          await EditorAPI.docs.update(this.docId, this.curBody());
          this.dirty=false; this.setStatus('已保存 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false}));
        }catch(e){
          this.setStatus(e.status?'保存失败':'离线，未保存');
        }
      },
      /* 销毁/卸载前强制保存：sendBeacon 不阻塞页面关闭 */
      forceSave:function(){
        if(!this.docId||!this.dirty) return;
        EditorAPI.docs.beacon(this.docId, this.curBody());
        this.dirty=false;
      }
    }
  });

  /* ==================== Vue 应用：状态绑定 + 销毁前强制保存 ==================== */
  var pinia=Pinia.createPinia();
  var app=Vue.createApp({
    setup:function(){
      var s=useDocStore();
      Vue.onBeforeUnmount(function(){ s.forceSave(); });   /* 组件销毁前强制保存 */
      return { store:s };
    },
    render:function(){ return this.store.saveStateText; }  /* 用 render 函数，避免与 Django 模板分隔符冲突 */
  });
  app.use(pinia);
  app.mount('#saveState');
  var store=useDocStore();
  window.__docStore=store; window.__vueApp=app;

  /* 兼容包装：旧调用点无缝接入 store */
  function setStatus(t){ store.setStatus(t); }
  function scheduleSave(){ store.scheduleSave(); }
  function doSave(){ return store.doSave(); }

  /* 文档标题双向同步：页面头部标题 ↔ 编辑器头部标题输入框（同步写入 store） */
  function syncTitle(val){
    val=val||'未命名文档';
    store.title=val;
    if(titleEl.textContent!==val) titleEl.textContent=val;
    if(headerInput.value!==val) headerInput.value=val;
  }
  titleEl.addEventListener('input',function(){ headerInput.value=titleEl.textContent; store.title=titleEl.textContent||'未命名文档'; scheduleSave(); });
  headerInput.addEventListener('input',function(){ titleEl.textContent=headerInput.value||'未命名文档'; store.title=headerInput.value||'未命名文档'; scheduleSave(); });

  /* 页面卸载兜底：beforeunload + pagehide 双保险 */
  window.addEventListener('beforeunload',function(){ store.forceSave(); });
  window.addEventListener('pagehide',function(){ store.forceSave(); });
  quill.on('text-change',scheduleSave);

  /* ---- 下拉 / 菜单通用开关 ---- */
  var suppressClose=false; // 取色器拖拽结束后阻止紧邻的 document click 关闭面板
  function closeAllMenus(){ document.querySelectorAll('.drop-menu,.palette').forEach(function(m){m.classList.remove('open');}); ['tablePicker','emojiPanel'].forEach(function(id){var el=document.getElementById(id); if(el) el.classList.remove('open');}); var cm=document.getElementById('colorMore'); if(cm) cm.classList.remove('open'); }
  function bindDrop(triggerId, menuId){
    var trg=document.getElementById(triggerId), menu=document.getElementById(menuId);
    trg.addEventListener('mousedown',function(e){ e.preventDefault(); });
    menu.addEventListener('mousedown',function(e){ e.preventDefault(); });
    trg.addEventListener('click',function(e){ e.stopPropagation(); closeAllMenus(); menu.classList.toggle('open'); });
  }
  document.addEventListener('click',function(e){ if(suppressClose){ suppressClose=false; return; } if(e.target.closest && e.target.closest('#colorMore')) return; closeAllMenus(); });

  /* ---- 编辑按钮绑定到 Quill API ---- */
  document.getElementById('undoBtn').addEventListener('mousedown',function(e){ e.preventDefault(); });
  document.getElementById('undoBtn').addEventListener('click',function(){ quill.history.undo(); refreshToolbar(); });
  document.getElementById('redoBtn').addEventListener('mousedown',function(e){ e.preventDefault(); });
  document.getElementById('redoBtn').addEventListener('click',function(){ quill.history.redo(); refreshToolbar(); });

  var painterOn=false, painterFormat=null;
  document.getElementById('painterBtn').addEventListener('mousedown',function(e){
    e.preventDefault();
    var sel=quill.getSelection();
    if(sel && sel.length>0){
      painterFormat=quill.getFormat(); painterOn=true;
      document.getElementById('painterBtn').classList.add('on');
      toast('已复制格式，选中文字粘贴格式');
    } else {
      toast('请先选中带格式的文字');
    }
  });
  quill.on('selection-change',function(range){
    if(painterOn && range && range.length>0){
      var keys=Object.keys(painterFormat);
      try{
        for(var i=0;i<keys.length;i++){
          quill.format(keys[i], painterFormat[keys[i]]);
        }
      }catch(e){ /* 边界情况（非真实焦点）下不崩溃，下次选择仍可重试 */ }
      painterOn=false; painterFormat=null;
      document.getElementById('painterBtn').classList.remove('on');
    }
  });

  function setSelStyle(menuId){
    document.getElementById(menuId).addEventListener('click',function(e){
      var it=e.target.closest('.dmi'); if(!it) return;
      var st=it.dataset.style;
      if(st==='p') quill.format('header',false);
      else if(st==='blockquote') quill.format('blockquote',true);
      else if(st==='pre') quill.format('code-block',true);
      else if(st==='h7'){ quill.format('header',false); quill.format('size','14.67px'); quill.format('bold',true); }
      else if(st==='h8'){ quill.format('header',false); quill.format('size','13.33px'); quill.format('bold',true); }
      else if(st) quill.format('header',parseInt(st.slice(1),10));
      document.getElementById(menuId).classList.remove('open'); refreshToolbar();
    });
  }
  setSelStyle('styleMenu');

  document.getElementById('fontMenu').addEventListener('click',function(e){
    var it=e.target.closest('.dmi'); if(!it) return;
    quill.format('font', it.dataset.font||false); document.getElementById('fontMenu').classList.remove('open'); refreshToolbar();
  });
  document.getElementById('sizeMenu').addEventListener('click',function(e){
    var it=e.target.closest('.dmi'); if(!it) return;
    quill.format('size', it.dataset.size+'px'); document.getElementById('sizeMenu').classList.remove('open'); refreshToolbar();
  });

  var fmtBtns={bold:'boldBtn',italic:'italicBtn',underline:'underlineBtn',strike:'strikeBtn'};
  Object.keys(fmtBtns).forEach(function(k){
    document.getElementById(fmtBtns[k]).addEventListener('mousedown',function(e){ e.preventDefault(); });
    document.getElementById(fmtBtns[k]).addEventListener('click',function(){ quill.format(k, !(quill.getFormat()[k])); refreshToolbar(); });
  });


  /* 颜色 - 石墨8列×5行=40色（8色相×5明暗） */
  var shimoColors=[
    '#000000','#e8432c','#f57c00','#fdc200','#3cba54','#16a1a6','#2c7be5','#9b4dca',
    '#cccccc','#f5b5ad','#fdd0a4','#ffe899','#b5e3a8','#a3dde0','#b0d0f0','#d8c2ed',
    '#999999','#c93939','#cc6600','#b5950b','#3d8b3d','#0d7e84','#1a4fb8','#7c3da8',
    '#666666','#9c1f1f','#8a3c00','#6e5b00','#1c5c1c','#0d5b5b','#1a3d70','#4a1d6b',
    '#333333','#5c0e0e','#4d1f00','#332700','#0a330a','#003333','#001f3d','#26003d'
  ];
  var fgColors=shimoColors;
  var hlColors=shimoColors;
  (function buildPalette(){
    var fgRow=document.getElementById('fgRow'), hlRow2=document.getElementById('hlRow2');
    fgColors.forEach(function(c){ var d=document.createElement('div'); d.className='pal-cell'; d.style.background=c; d.dataset.color=c; d.dataset.kind='fg'; fgRow.appendChild(d); });
    hlColors.forEach(function(c){ var d=document.createElement('div'); d.className='pal-cell'; d.style.background=c; d.dataset.color=c; d.dataset.kind='hl'; hlRow2.appendChild(d); });
    function pickColor(c){
      if(!c) return;
      quill.format(c.dataset.kind==='fg'?'color':'background', c.dataset.color);
      if(c.dataset.kind==='fg') document.getElementById('colorBar').style.background=c.dataset.color;
      closeAllMenus(); refreshToolbar();
    }
    document.getElementById('colorPal').addEventListener('click',function(e){
      var c=e.target.closest('.pal-cell'); if(!c) return; pickColor(c);
    });
    document.getElementById('hlPal').addEventListener('click',function(e){
      var c=e.target.closest('.pal-cell,.pal-no-fill-btn'); if(!c) return; pickColor(c);
    });
  })();

  /* ===== 更多颜色取色器（复刻石墨） ===== */
  var customColors=[];
  try{ customColors=JSON.parse(localStorage.getItem('customColors')||'[]'); }catch(e){}
  function renderCustomColors(){
    [['customRowFg','fg'],['customRowHl','hl']].forEach(function(pair){
      var row=document.getElementById(pair[0]); if(!row) return;
      row.innerHTML='';
      if(!customColors.length){ row.style.display='none'; return; }
      row.style.display='grid';
      customColors.forEach(function(c){
        var d=document.createElement('div'); d.className='pal-cell'; d.style.background=c;
        d.dataset.color=c; d.dataset.kind=pair[1]; d.title=c; row.appendChild(d);
      });
    });
  }
  renderCustomColors();

  var cmKind='fg', cmH=0, cmS=0, cmV=0, cmA=1;
  function hsv2rgb(h,s,v){
    var c=v*s,x=c*(1-Math.abs(((h/60)%2)-1)),m=v-c,r=0,g=0,b=0;
    if(h<60){r=c;g=x;}else if(h<120){r=x;g=c;}else if(h<180){g=c;b=x;}
    else if(h<240){g=x;b=c;}else if(h<300){r=x;b=c;}else{r=c;b=x;}
    return [Math.round((r+m)*255),Math.round((g+m)*255),Math.round((b+m)*255)];
  }
  function rgb2hsv(r,g,b){
    r/=255;g/=255;b/=255;
    var mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,h=0;
    if(d){ if(mx===r) h=((g-b)/d)%6; else if(mx===g) h=(b-r)/d+2; else h=(r-g)/d+4; h*=60; if(h<0) h+=360; }
    return [h, mx?d/mx:0, mx];
  }
  function rgb2hex(r,g,b){ return '#'+[r,g,b].map(function(v){ return ('0'+v.toString(16)).slice(-2); }).join(''); }
  function parseHexColor(str){ str=String(str||'').trim().replace('#',''); if(!/^[0-9a-fA-F]{6}$/.test(str)) return null; return [parseInt(str.slice(0,2),16),parseInt(str.slice(2,4),16),parseInt(str.slice(4,6),16)]; }

  (function initColorMore(){
    var cmEl=document.getElementById('colorMore');
    var area=document.getElementById('cmArea'), areaThumb=document.getElementById('cmAreaThumb');
    var hueBar=document.getElementById('cmHue'), hueThumb=document.getElementById('cmHueThumb');
    var alphaWrap=document.getElementById('cmAlphaWrap'), alphaBar=document.getElementById('cmAlpha'), alphaThumb=document.getElementById('cmAlphaThumb');
    var preview=document.getElementById('cmPreview'), hexInput=document.getElementById('cmHex'), alphaInput=document.getElementById('cmAlphaIn');
    function curRGB(){ return hsv2rgb(cmH,cmS,cmV); }
    function curColor(){ var rgb=curRGB(); if(cmA>=1) return rgb2hex(rgb[0],rgb[1],rgb[2]); return 'rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+','+(+cmA.toFixed(2))+')'; }
    function render(){
      var rgb=curRGB(), hex=rgb2hex(rgb[0],rgb[1],rgb[2]);
      area.style.background='hsl('+Math.round(cmH)+',100%,50%)';
      areaThumb.style.left=(cmS*100)+'%'; areaThumb.style.top=((1-cmV)*100)+'%'; areaThumb.style.background=hex;
      hueThumb.style.left=(cmH/360*100)+'%'; hueThumb.style.background='hsl('+Math.round(cmH)+',100%,50%)';
      alphaBar.style.background='linear-gradient(to right,rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',0),rgba('+rgb[0]+','+rgb[1]+','+rgb[2]+',1))';
      alphaThumb.style.left=(cmA*100)+'%'; alphaThumb.style.background=hex;
      preview.style.background=curColor();
      if(document.activeElement!==hexInput) hexInput.value=hex.slice(1).toUpperCase();
      if(document.activeElement!==alphaInput) alphaInput.value=Math.round(cmA*100)+'%';
    }
    function applyToSelection(){
      var c=curColor();
      quill.format(cmKind==='fg'?'color':'background', c);
      if(cmKind==='fg') document.getElementById('colorBar').style.background=c;
      refreshToolbar();
    }
    function bindDrag(el,fn){
      el.addEventListener('mousedown',function(e){
        e.preventDefault(); e.stopPropagation(); fn(e);
        var mv=function(ev){ fn(ev); };
        var up=function(){
          document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up);
          applyToSelection();
          suppressClose=true; setTimeout(function(){ suppressClose=false; },120);
        };
        document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
      });
    }
    bindDrag(area,function(e){ var r=area.getBoundingClientRect(); cmS=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)); cmV=1-Math.min(1,Math.max(0,(e.clientY-r.top)/r.height)); render(); });
    bindDrag(hueBar,function(e){ var r=hueBar.getBoundingClientRect(); cmH=Math.min(359.99,Math.max(0,(e.clientX-r.left)/r.width*360)); render(); });
    bindDrag(alphaWrap,function(e){ var r=alphaWrap.getBoundingClientRect(); cmA=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)); render(); });
    hexInput.addEventListener('change',function(){ var rgb=parseHexColor(hexInput.value); if(rgb){ var hsv=rgb2hsv(rgb[0],rgb[1],rgb[2]); cmH=hsv[0]; cmS=hsv[1]; cmV=hsv[2]; render(); applyToSelection(); } });
    alphaInput.addEventListener('change',function(){ var v=parseFloat(alphaInput.value); if(!isNaN(v)){ cmA=Math.min(1,Math.max(0,v/100)); render(); applyToSelection(); } });
    document.getElementById('cmAdd').addEventListener('click',function(e){
      e.stopPropagation();
      var rgb=curRGB(), c=rgb2hex(rgb[0],rgb[1],rgb[2]);
      if(customColors.indexOf(c)<0){ customColors.push(c); try{ localStorage.setItem('customColors',JSON.stringify(customColors)); }catch(err){} renderCustomColors(); }
      toast('已添加为自定义颜色');
    });
    cmEl.addEventListener('mousedown',function(e){ if(e.target.tagName!=='INPUT') e.preventDefault(); e.stopPropagation(); });
    cmEl.addEventListener('click',function(e){ e.stopPropagation(); });
    window.__openColorMore=function(kind,anchorRect){
      cmKind=kind;
      var f=quill.getFormat()||{};
      var rgb=parseHexColor(kind==='fg' ? (f.color||'#000000') : (f.background||'#000000'));
      if(rgb){ var hsv=rgb2hsv(rgb[0],rgb[1],rgb[2]); cmH=hsv[0]; cmS=hsv[1]; cmV=hsv[2]; cmA=1; }
      render();
      cmEl.classList.add('open');
      var w=cmEl.offsetWidth||368, h=cmEl.offsetHeight||420;
      var x=anchorRect.right+8, y=anchorRect.top-60;
      if(x+w>window.innerWidth-8) x=anchorRect.left-w-8;
      if(x<8) x=8;
      if(y+h>window.innerHeight-8) y=window.innerHeight-h-8;
      cmEl.style.left=Math.max(8,x)+'px'; cmEl.style.top=Math.max(8,y)+'px';
    };
  })();
  document.querySelectorAll('.pal-more').forEach(function(el){
    el.addEventListener('mousedown',function(e){ e.preventDefault(); e.stopPropagation(); });
    el.addEventListener('click',function(e){
      e.stopPropagation();
      var pal=el.closest('.palette');
      window.__openColorMore(el.dataset.kind||'hl', pal.getBoundingClientRect());
    });
  });

  /* ===== 文档默认样式弹窗（复刻石墨） ===== */
  (function initDocStyle(){
    var mask=document.getElementById('docStyleMask'), modal=document.getElementById('docStyleModal');
    var DEFAULTS={font:'',size:'12',line:'1.7',color:'#333333'};
    var state={font:'',size:'12',line:'1.7',color:'#333333'};
    var fontFamilies={'SimSun':'SimSun,宋体,serif','SimHei':'SimHei,黑体,sans-serif','KaiTi':'KaiTi,楷体,serif','FangSong':'FangSong,仿宋,serif','Microsoft YaHei':'"Microsoft YaHei",微软雅黑,sans-serif','Arial':'Arial,sans-serif','Droid Serif':'"Droid Serif",serif','Source Code Pro':'"Source Code Pro",Menlo,Consolas,monospace','Times New Roman':'"Times New Roman",serif','Noto Sans JP':'"Noto Sans JP",sans-serif','Noto Serif JP':'"Noto Serif JP",serif'};
    var dsmFontNames={'':'默认字体','SimSun':'宋体','SimHei':'黑体','Microsoft YaHei':'微软雅黑','FangSong':'仿宋','KaiTi':'楷体','Arial':'Arial','Droid Serif':'Droid Serif','Source Code Pro':'Source Code Pro','Times New Roman':'Times New Roman','Noto Sans JP':'Noto Sans JP','Noto Serif JP':'Noto Serif JP'};
    var styleTag=document.createElement('style'); styleTag.id='docStyleOverride'; document.head.appendChild(styleTag);
    function applyDocStyle(st){
      var css='.ql-snow .ql-editor{color:'+st.color+';font-size:'+st.size+'pt;line-height:'+st.line+';';
      if(st.font) css+='font-family:'+fontFamilies[st.font]+';';
      css+='}.ql-snow .ql-editor p{color:'+st.color+';font-size:'+st.size+'pt;line-height:'+st.line+';}';
      styleTag.textContent=css;
    }
    var saved=null;
    try{ localStorage.removeItem('docDefaultStyle'); saved=JSON.parse(localStorage.getItem('docDefaultStyle_v2')||'null'); }catch(e){}
    if(saved && saved.size){
      state=saved; applyDocStyle(state);
      document.getElementById('dsmSetter').textContent='我';
      document.getElementById('dsmDefault').checked=true;
    }
    ['9','10','11','12','13','14','16','18','20','22','24','30','36'].forEach(function(s){
      var d=document.createElement('div'); d.className='dmi'; d.dataset.v=s; d.textContent=s;
      document.getElementById('dsmSizeMenu').appendChild(d);
    });
    ['1.0','1.15','1.5','1.7','2.0','2.5','3.0'].forEach(function(s){
      var d=document.createElement('div'); d.className='dmi'; d.dataset.v=s; d.textContent=s;
      document.getElementById('dsmLineMenu').appendChild(d);
    });
    shimoColors.forEach(function(c){
      var d=document.createElement('div'); d.className='pal-cell'; d.style.background=c; d.dataset.color=c;
      document.getElementById('dsmColorRow').appendChild(d);
    });
    function sync(){
      document.querySelector('#dsmFont .v').textContent=dsmFontNames[state.font]||'默认字体';
      document.querySelector('#dsmSize .v').textContent=state.size;
      document.querySelector('#dsmLine .v').textContent=state.line;
      document.getElementById('dsmColorVal').style.background=state.color;
    }
    function closeDsmMenus(){ modal.querySelectorAll('.dsm-menu').forEach(function(m){ m.classList.remove('open'); }); }
    modal.querySelectorAll('.dsm-sel').forEach(function(sel){
      sel.addEventListener('click',function(e){
        if(e.target.closest('.dsm-menu')) return;
        e.stopPropagation();
        var menu=sel.querySelector('.dsm-menu');
        var was=menu.classList.contains('open');
        closeDsmMenus();
        menu.classList.toggle('open',!was);
      });
    });
    document.getElementById('dsmFontMenu').addEventListener('click',function(e){
      var it=e.target.closest('.dmi'); if(!it) return;
      state.font=it.dataset.font; sync(); closeDsmMenus();
    });
    document.getElementById('dsmSizeMenu').addEventListener('click',function(e){
      var it=e.target.closest('.dmi'); if(!it) return;
      state.size=it.dataset.v; sync(); closeDsmMenus();
    });
    document.getElementById('dsmLineMenu').addEventListener('click',function(e){
      var it=e.target.closest('.dmi'); if(!it) return;
      state.line=it.dataset.v; sync(); closeDsmMenus();
    });
    document.getElementById('dsmColorRow').addEventListener('click',function(e){
      var cell=e.target.closest('.pal-cell'); if(!cell) return;
      state.color=cell.dataset.color; sync(); closeDsmMenus();
    });
    modal.addEventListener('click',function(e){ if(!e.target.closest('.dsm-sel')) closeDsmMenus(); });
    function open(){ sync(); mask.classList.add('open'); modal.classList.add('open'); }
    function close(){ mask.classList.remove('open'); modal.classList.remove('open'); closeDsmMenus(); }
    document.getElementById('docStyleBtn').addEventListener('click',open);
    document.getElementById('dsmClose').addEventListener('click',close);
    document.getElementById('dsmCancel').addEventListener('click',close);
    mask.addEventListener('click',close);
    document.getElementById('dsmReset').addEventListener('click',function(){
      state={font:DEFAULTS.font,size:DEFAULTS.size,line:DEFAULTS.line,color:DEFAULTS.color};
      sync(); toast('已重置为默认样式');
    });
    document.getElementById('dsmOk').addEventListener('click',function(){
      applyDocStyle(state);
      if(document.getElementById('dsmDefault').checked){
        try{ localStorage.setItem('docDefaultStyle_v2',JSON.stringify(state)); }catch(e){}
      }
      document.getElementById('dsmSetter').textContent='我';
      close(); toast('已应用文档默认样式');
    });
  })();
  bindDrop('colorSwatch','colorPal');
  bindDrop('highlightBtn','hlPal');
  bindDrop('toolBtn','toolMenu');
  bindDrop('transformBtn','transformMenu');

  document.getElementById('clearBtn').addEventListener('mousedown',function(e){ e.preventDefault(); });
  document.getElementById('clearBtn').addEventListener('click',function(){ var sel=quill.getSelection(); if(sel && sel.length){ quill.removeFormat(sel.index,sel.length); } refreshToolbar(); });

  document.getElementById('alignMenu').addEventListener('click',function(e){
    var it=e.target.closest('.dmi'); if(!it) return;
    quill.format('align', it.dataset.align||false); document.getElementById('alignMenu').classList.remove('open'); refreshToolbar();
  });
  /* 防止按钮点击导致编辑器失焦：用 mousedown + preventDefault */
  function bindBtn(id,fn){
    document.getElementById(id).addEventListener('mousedown',function(e){ e.preventDefault(); });
    document.getElementById(id).addEventListener('click',function(){ fn(); refreshToolbar(); });
  }
  /* ---- 无序/有序列表下拉样式选择器 ---- */
  var ulStyles=[
    {cls:'bs-disc',mark:'●',bars:[40,30,35]},
    {cls:'bs-circle',mark:'○',bars:[40,30,35]},
    {cls:'bs-arrow',mark:'→',bars:[40,30,35]},
    {cls:'bs-circle',mark:'○',bars:[40,30,35]},
    {cls:'bs-bullseye',mark:'◎',bars:[40,30,35]},
    {cls:'bs-diamond',mark:'◆',bars:[40,30,35]},
    {cls:'bs-square',mark:'■',bars:[40,30,35]},
    {cls:'bs-bullseye',mark:'◎',bars:[40,30,35]},
    {cls:'bs-square',mark:'■',bars:[40,30,35]},
    {cls:'bs-hollow-sq',mark:'□',bars:[40,30,35]},
    {cls:'bs-bullseye',mark:'◎',bars:[40,30,35]},
    {cls:'bs-disc',mark:'●',bars:[40,30,35]},
    {cls:'bs-disc',mark:'●',bars:[40,30,35]},
    {cls:'bs-circle',mark:'○',bars:[40,30,35]},
    {cls:'bs-arrow',mark:'→',bars:[40,30,35]}
  ];
  var olStyles=[
    {levels:['1.','a.','i.','1.'],bars:[[35,28,22,18]]},
    {levels:['一、','a).','i.','1.'],bars:[[35,28,22,18]]},
    {levels:['1.','1.1','1.1.1','1.1.1.1','2.'],bars:[[35,28,22,16,35]]}
  ];
  function buildListGrid(){
    var ulG=document.getElementById('ulGrid'); if(ulG){
      ulG.innerHTML='';
      ulStyles.forEach(function(s){
        var d=document.createElement('div'); d.className='lsi'; d.dataset.cls=s.cls;
        s.bars.forEach(function(w,i){
          var r=document.createElement('div'); r.className='lsi-row';
          var m=document.createElement('span'); m.className='lsi-mark'; m.textContent=s.mark;
          var b=document.createElement('span'); b.className='lsi-bar'; b.style.width=w+'px';
          r.appendChild(m); r.appendChild(b); d.appendChild(r);
        });
        ulG.appendChild(d);
      });
    }
    var olG=document.getElementById('olGrid'); if(olG){
      olG.innerHTML='';
      olStyles.forEach(function(s){
        var d=document.createElement('div'); d.className='lsi'; d.dataset.idx=olStyles.indexOf(s);
        s.levels.forEach(function(lv,i){
          var r=document.createElement('div'); r.className='lsi-row';
          r.style.marginLeft=(i>0?(i*8):0)+'px';
          var m=document.createElement('span'); m.className='lsi-mark'; m.textContent=lv;
          var b=document.createElement('span'); b.className='lsi-bar'; b.style.width=(s.bars[0][i]||20)+'px';
          r.appendChild(m); r.appendChild(b); d.appendChild(r);
        });
        olG.appendChild(d);
      });
    }
  }
  buildListGrid();
  function getListLI(){
    var sel=quill.getSelection(); if(!sel) return null;
    var line=quill.getLine(sel.index)[0]; if(!line) return null;
    var node=line.domNode; if(node.nodeType===3) node=node.parentElement;
    return node?node.closest('li[data-list]'):null;
  }
  function applyBulletStyle(cls){
    var f=quill.getFormat();
    if(f.list==='bullet'){
      var li=getListLI(); if(li){ li.className=li.className.replace(/\bbs-\S+/g,''); if(cls) li.classList.add(cls); }
    } else {
      quill.format('list','bullet');
      setTimeout(function(){ var li=getListLI(); if(li){ li.className=li.className.replace(/\bbs-\S+/g,''); if(cls) li.classList.add(cls); } },0);
    }
    refreshToolbar();
  }
  var olNsMap=['ns-decimal','ns-lower-alpha','ns-lower-roman','ns-decimal'];
  function applyNumberStyle(idx){
    var cls=olNsMap[idx]||'ns-decimal';
    var f=quill.getFormat();
    if(f.list==='ordered'){
      var li=getListLI(); if(li){ li.className=li.className.replace(/\bns-\S+/g,''); if(cls) li.classList.add(cls); }
    } else {
      quill.format('list','ordered');
      setTimeout(function(){ var li=getListLI(); if(li){ li.className=li.className.replace(/\bns-\S+/g,''); if(cls) li.classList.add(cls); } },0);
    }
    refreshToolbar();
  }
  bindDrop('ulBtn','ulListMenu');
  bindDrop('olBtn','olListMenu');
  document.getElementById('ulListMenu').addEventListener('click',function(e){
    var it=e.target.closest('.lsi'); if(!it) return;
    e.stopPropagation();
    applyBulletStyle(it.dataset.cls);
    closeAllMenus();
  });
  document.getElementById('olListMenu').addEventListener('click',function(e){
    if(e.target.closest('.lsi-renumber')){ e.stopPropagation(); toast('重新编号：设置起始编号'); closeAllMenus(); return; }
    var it=e.target.closest('.lsi'); if(!it) return;
    e.stopPropagation();
    applyNumberStyle(parseInt(it.dataset.idx,10));
    closeAllMenus();
  });
  document.getElementById('taskBtn').addEventListener('mousedown',function(e){ e.preventDefault(); });
  document.getElementById('taskBtn').addEventListener('click',function(){
    var f=quill.getFormat();
    if(f.list==='checked'||f.list==='unchecked'){ quill.format('list',false); }
    else{ quill.format('list','unchecked'); }
    refreshToolbar();
  });
  /* 点击任务列表复选框切换选中状态 */
  document.addEventListener('mousedown',function(e){
    var editor=quill.root;
    if(!editor.contains(e.target) && e.target!==editor) return;
    var lis=editor.querySelectorAll('li[data-list]');
    for(var i=0;i<lis.length;i++){
      var ui=lis[i].querySelector('.ql-ui');
      if(!ui) continue;
      var rect=ui.getBoundingClientRect();
      if(e.clientX>=rect.left-5 && e.clientX<=rect.right+5 && e.clientY>=rect.top-5 && e.clientY<=rect.bottom+5){
        e.preventDefault();
        var checked=lis[i].dataset.list==='checked';
        var liText=lis[i].textContent;
        var fullText=quill.getText();
        var idx=fullText.indexOf(liText);
        if(idx<0) idx=0;
        var targetLi=lis[i];
        setTimeout(function(){
          quill.focus();
          quill.setSelection(idx,0,'user');
          quill.format('list', checked?'unchecked':'checked');
        },0);
        break;
      }
    }
  },true);
  document.getElementById('indentBtn').addEventListener('mousedown',function(e){ e.preventDefault(); });
  document.getElementById('indentBtn').addEventListener('click',function(){ quill.format('indent','+1'); refreshToolbar(); });
  document.getElementById('outdentBtn').addEventListener('mousedown',function(e){ e.preventDefault(); });
  document.getElementById('outdentBtn').addEventListener('click',function(){ quill.format('indent','-1'); refreshToolbar(); });
  document.getElementById('lineMenu').addEventListener('click',function(e){
    var it=e.target.closest('.dmi'); if(!it) return;
    quill.format('lineheight', it.dataset.line); document.getElementById('lineMenu').classList.remove('open'); refreshToolbar();
  });

  /* 插入 */
  /* ===== 插入菜单（复刻石墨） ===== */
  var pendingImageIndex=0; /* 图片/音频/附件上传完成后插入到该位置 */

  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  function insertTable(rows,cols){
    var idx=quill.getSelection(true).index;
    var tr='';
    for(var r=0;r<rows;r++){ tr+='<tr>'+new Array(cols+1).join('<td></td>')+'</tr>'; }
    quill.clipboard.dangerouslyPasteHTML(idx,'<table><tbody>'+tr+'</tbody></table>');
    toast(rows+' × '+cols+' 表格已插入'); refreshToolbar();
  }
  /* 表格：N×M 网格选择器（复刻石墨 4×3 预览） */
  var tablePicker=document.getElementById('tablePicker'), tpInfo=document.getElementById('tpInfo'), tpGrid=document.getElementById('tpGrid');
  var tpCells=[];
  (function(){
    var g='';
    for(var i=0;i<8;i++){ for(var j=0;j<8;j++){ g+='<div class="tp-cell" data-r="'+i+'" data-c="'+j+'"></div>'; } }
    tpGrid.innerHTML=g;
    tpCells=Array.prototype.slice.call(tpGrid.children);
    tpGrid.addEventListener('mouseover',function(e){
      var c=e.target.closest('.tp-cell'); if(!c) return;
      var r=+c.dataset.r+1, col=+c.dataset.c+1;
      tpInfo.textContent=r+' × '+col+' 表格';
      tpCells.forEach(function(x){ x.classList.toggle('on', (+x.dataset.r)<r && (+x.dataset.c)<col); });
    });
    tpGrid.addEventListener('click',function(e){
      e.stopPropagation();
      var c=e.target.closest('.tp-cell'); if(!c) return;
      tablePicker.classList.remove('open');
      insertTable(+c.dataset.r+1, +c.dataset.c+1);
    });
    document.getElementById('tpCancel').addEventListener('click',function(e){ e.stopPropagation(); tablePicker.classList.remove('open'); });
  })();

  /* 图表：生成 SVG 并作为 data-URI 插入 */
  function makeChartSvg(type){
    var w=520,h=300,padL=46,padB=34,padT=18,padR=16;
    var data=[{l:'一月',v:120},{l:'二月',v:200},{l:'三月',v:150},{l:'四月',v:230},{l:'五月',v:180}];
    var max=Math.max.apply(null,data.map(function(d){return d.v;})), min=0;
    var cw=w-padL-padR, ch=h-padT-padB;
    var s='<svg xmlns="http://www.w3.org/2000/svg" width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" font-family="PingFang SC, Helvetica, sans-serif">';
    s+='<rect width="'+w+'" height="'+h+'" fill="#fbfcfc"/>';
    for(var gi=0;gi<=4;gi++){
      var gy=padT+ch-gi/4*ch;
      s+='<line x1="'+padL+'" y1="'+gy+'" x2="'+(w-padR)+'" y2="'+gy+'" stroke="#ececed" stroke-width="1"/>';
      s+='<text x="'+(padL-8)+'" y="'+(gy+4)+'" fill="#9aa0a6" font-size="11" text-anchor="end">'+Math.round(max*gi/4)+'</text>';
    }
    if(type==='bar'){
      var bw=cw/data.length*0.55;
      data.forEach(function(d,i){
        var bh=ch*d.v/max, x=padL+i*cw/data.length+(cw/data.length-bw)/2, y=padT+ch-bh;
        s+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+bh+'" rx="2" fill="#2E7CF6" opacity="0.85"/>';
        s+='<text x="'+(x+bw/2)+'" y="'+(padT+ch+16)+'" fill="#5f6368" font-size="11" text-anchor="middle">'+d.l+'</text>';
      });
    } else if(type==='barh'){
      var bhh=ch/5*0.55;
      data.forEach(function(d,i){
        var bw2=cw*d.v/max, y=padT+i*ch/5+ch/5/2-bhh/2;
        s+='<rect x="'+padL+'" y="'+y+'" width="'+bw2+'" height="'+bhh+'" rx="2" fill="#2E7CF6" opacity="0.85"/>';
        s+='<text x="'+(padL-8)+'" y="'+(y+bhh/2+4)+'" fill="#5f6368" font-size="11" text-anchor="end">'+d.l+'</text>';
        s+='<text x="'+(padL+bw2+4)+'" y="'+(y+bhh/2+4)+'" fill="#5f6368" font-size="11">'+d.v+'</text>';
      });
    } else if(type==='line'){
      var pts='';
      data.forEach(function(d,i){
        var x=padL+i*cw/(data.length-1), y=padT+ch-ch*d.v/max;
        pts+=(i?' ':'')+x+','+y;
        s+='<circle cx="'+x+'" cy="'+y+'" r="3.5" fill="#2E7CF6"/>';
      });
      s+='<polyline points="'+pts+'" fill="none" stroke="#2E7CF6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      data.forEach(function(d,i){
        var x=padL+i*cw/(data.length-1);
        s+='<text x="'+x+'" y="'+(padT+ch+16)+'" fill="#5f6368" font-size="11" text-anchor="middle">'+d.l+'</text>';
      });
    } else if(type==='area'){
      var poly='';
      data.forEach(function(d,i){
        var x=padL+i*cw/(data.length-1), y=padT+ch-ch*d.v/max;
        poly+=(i?' ':'')+x+','+y;
        s+='<circle cx="'+x+'" cy="'+y+'" r="3" fill="#2E7CF6"/>';
      });
      poly+=' '+(w-padR)+','+(padT+ch)+' '+padL+','+(padT+ch);
      s+='<polygon points="'+poly+'" fill="#2E7CF6" opacity="0.16"/>';
      var pl=ptsOf(data,padL,padT,ch,cw);
      s+='<polyline points="'+pl+'" fill="none" stroke="#2E7CF6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>';
      data.forEach(function(d,i){
        var x=padL+i*cw/(data.length-1);
        s+='<text x="'+x+'" y="'+(padT+ch+16)+'" fill="#5f6368" font-size="11" text-anchor="middle">'+d.l+'</text>';
      });
    } else if(type==='pie'){
      var values=[120,200,150,230,180], cols=['#2E7CF6','#6da0e3','#f2a03f','#e95555','#7a6fd0'];
      var cx=w/2, cy=h/2+4, R=Math.min(cw,ch)/2-8;
      var total=values.reduce(function(a,b){return a+b;},0), ang=0;
      values.forEach(function(v,i){
        var a1=ang, a2=ang+v/total*Math.PI*2;
        var x1=cx+R*Math.cos(a1-Math.PI/2), y1=cy+R*Math.sin(a1-Math.PI/2);
        var x2=cx+R*Math.cos(a2-Math.PI/2), y2=cy+R*Math.sin(a2-Math.PI/2);
        var large=(v/total)>0.5?1:0;
        s+='<path d="M'+cx+' '+cy+' L'+x1+' '+y1+' A'+R+' '+R+' 0 '+large+' 1 '+x2+' '+y2+' Z" fill="'+cols[i]+'" opacity="0.92"/>';
        var ma=a1+v/total*Math.PI;
        s+='<text x="'+(cx+R*0.62*Math.cos(ma-Math.PI/2))+'" y="'+(cy+R*0.62*Math.sin(ma-Math.PI/2)+4)+'" fill="#fff" font-size="11" text-anchor="middle">'+Math.round(v/total*100)+'%</text>';
        ang=a2;
      });
    }
    s+='</svg>';
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(s);
  }
  function ptsOf(data,padL,padT,ch,cw){
    var p='';
    for(var i=0;i<data.length;i++){ var x=padL+i*cw/(data.length-1), y=padT+ch-ch*data[i].v/Math.max.apply(null,data.map(function(d){return d.v;})); p+=(i?' ':'')+x+','+y; }
    return p;
  }
  document.getElementById('chartMenu').addEventListener('click',function(e){
    e.stopPropagation();
    var it=e.target.closest('.dmi'); if(!it) return;
    document.getElementById('chartMenu').classList.remove('open');
    var idx=quill.getSelection(true).index;
    quill.insertEmbed(idx,'image',makeChartSvg(it.dataset.chart));
    toast('已插入'+it.textContent); refreshToolbar();
  });

  /* 表情：常用表情面板 */
  var emojis=['😀','😄','😁','😂','🤣','😊','😉','😍','🥰','😘','😜','🤪','😎','🤩','🥳','😏','😢','😭','😤','😡','🤔','🙄','👏','👍','🙏','💪','🔥','✨','🎉','❤️','👍','🙌'];
  var emojiPanel=document.getElementById('emojiPanel'), epGrid=document.getElementById('epGrid');
  epGrid.innerHTML=emojis.map(function(x){return '<div class="ep-cell">'+x+'</div>';}).join('');
  epGrid.addEventListener('click',function(e){
    e.stopPropagation();
    var c=e.target.closest('.ep-cell'); if(!c) return;
    var idx=quill.getSelection(true).index;
    quill.insertText(idx,c.textContent);
    emojiPanel.classList.remove('open');
    toast('已插入表情');
  });

  /* 超链接：自定义对话框 */
  var linkDialog=document.getElementById('linkDialog');
  function openLinkDialog(){
    var sel=quill.getSelection(true);
    var selText=sel && sel.length>0 ? quill.getText(sel.index, sel.length) : '';
    document.getElementById('lkText').value=(selText||'').trim();
    document.getElementById('lkUrl').value='';
    linkDialog.classList.add('open');
    setTimeout(function(){ document.getElementById('lkUrl').focus(); },0);
  }
  function closeLinkDialog(){ linkDialog.classList.remove('open'); }
  document.getElementById('lkOk').addEventListener('click',function(){
    var text=document.getElementById('lkText').value.trim(), url=document.getElementById('lkUrl').value.trim();
    closeLinkDialog();
    if(!url) return;
    var sel=quill.getSelection(true);
    if(sel && sel.length>0){ quill.format('link',url,'user'); }
    else if(text){ quill.insertText(sel.index,text); var end=quill.getSelection().index; quill.formatText(sel.index,end-sel.index,{link:url}); }
    else { quill.insertText(sel.index,url); var end2=quill.getSelection().index; quill.formatText(sel.index,end2-sel.index,{link:url}); }
    toast('已插入链接');
  });
  document.getElementById('lkCancel').addEventListener('click',closeLinkDialog);

  /* 公式：自定义对话框 */
  var formulaDialog=document.getElementById('formulaDialog');
  function openFormulaDialog(){
    document.getElementById('fmlInput').value='';
    formulaDialog.classList.add('open');
    setTimeout(function(){ document.getElementById('fmlInput').focus(); },0);
  }
  function closeFormulaDialog(){ formulaDialog.classList.remove('open'); }
  linkDialog.addEventListener('click',function(e){ if(e.target===linkDialog) closeLinkDialog(); });
  formulaDialog.addEventListener('click',function(e){ if(e.target===formulaDialog) closeFormulaDialog(); });
  document.getElementById('fmlOk').addEventListener('click',function(){
    var f=document.getElementById('fmlInput').value.trim();
    closeFormulaDialog();
    if(!f) return;
    var idx=quill.getSelection(true).index;
    quill.insertText(idx,'$'+f+'$');
    toast('已插入公式');
  });
  document.getElementById('fmlCancel').addEventListener('click',closeFormulaDialog);

  /* 插入菜单主点击 */
  document.getElementById('insertMenu').addEventListener('click',function(e){
    e.stopPropagation();
    var it=e.target.closest('.dmi'); if(!it) return;
    document.getElementById('insertMenu').classList.remove('open');
    var act=it.dataset.act, idx=quill.getSelection(true).index;
    if(act==='image'){ pendingImageIndex=idx; document.getElementById('imageInput').click(); }
    else if(act==='table'){ tablePicker.classList.add('open'); }
    else if(act==='chart'){ document.getElementById('chartMenu').classList.add('open'); }
    else if(act==='code'){ quill.format('code-block',true); }
    else if(act==='link'){ openLinkDialog(); }
    else if(act==='hr'){ try{ quill.insertEmbed(idx,'divider',true); }catch(err){ quill.insertText(idx,'\n————————\n'); } }
    else if(act==='quote'){ quill.format('blockquote',true); }
    else if(act==='formula'){ openFormulaDialog(); }
    else if(act==='date'){ quill.insertText(idx, new Date().toLocaleDateString('zh-CN')); }
    else if(act==='emoji'){ emojiPanel.classList.add('open'); }
    else if(act==='audio'){ pendingImageIndex=idx; document.getElementById('audioInput').click(); }
    else if(act==='attachment'){ pendingImageIndex=idx; document.getElementById('fileInput').click(); }
    else if(act==='file'){ pendingImageIndex=idx; document.getElementById('fileInput').click(); }
    else if(act==='preview'){ openLinkDialog(); }  /* 复用链接对话框输入 URL */
    else if(act==='thirdparty'){ quill.insertText(idx,'【第三方内容：可在弹层中接入地图、视频等第三方应用】'); toast('第三方内容：演示占位'); }
  });
  var imageInput=document.getElementById('imageInput');
  imageInput.addEventListener('change',function(e){
    var f=e.target.files[0];
    e.target.value='';            /* 允许下次再选同一文件 */
    if(!f) return;
    var idx=pendingImageIndex;
    var fd=new FormData(); fd.append('file',f);
    EditorAPI.upload.image(fd)
      .then(function(d){ quill.insertEmbed(idx,'image',d.url); toast('图片已插入'); refreshToolbar(); })
      .catch(function(){ toast('图片上传失败'); });
  });
  var audioInput=document.getElementById('audioInput');
  audioInput.addEventListener('change',function(e){
    var f=e.target.files[0];
    e.target.value='';
    if(!f) return;
    var idx=pendingImageIndex;
    var fd=new FormData(); fd.append('file',f);
    EditorAPI.upload.file(fd)
      .then(function(d){
        quill.clipboard.dangerouslyPasteHTML(idx,'<p><audio controls src="'+d.url+'" style="width:100%;max-width:420px;vertical-align:middle;"></audio> <span style="color:#8d9093;font-size:12px;">'+escapeHtml(d.name)+'</span></p>');
        toast('音频已插入'); refreshToolbar();
      })
      .catch(function(){ toast('音频上传失败'); });
  });
  document.getElementById('fileInput').addEventListener('change',function(e){
    var f=e.target.files[0];
    e.target.value='';
    if(!f) return;
    var idx=pendingImageIndex;
    var fd=new FormData(); fd.append('file',f);
    EditorAPI.upload.file(fd)
      .then(function(d){
        quill.clipboard.dangerouslyPasteHTML(idx,'<p><span style="display:inline-flex;align-items:center;gap:6px;border:1px solid #e5e5e5;border-radius:4px;padding:4px 10px;background:#f9f9f9;">📎 <a href="'+d.url+'" target="_blank" rel="noopener" style="color:#2E7CF6;text-decoration:none;">'+escapeHtml(d.name)+'</a></span></p>');
        toast('已上传附件'); refreshToolbar();
      })
      .catch(function(){ toast('附件上传失败'); });
  });
  document.getElementById('commentBtn').addEventListener('click',function(){ toast('评论功能：选中文字后点这里可添加批注（演示）'); });
  document.getElementById('toolMenu').addEventListener('click',function(e){
    var it=e.target.closest('.dmi'); if(!it) return;
    document.getElementById('toolMenu').classList.remove('open');
    var t=it.dataset.tool;
    if(t==='translate') toast('翻译：选中文字后可翻译（演示）');
    else if(t==='layout') toast('排版：自动整理文档格式（演示）');
  });
  document.getElementById('searchBtn').addEventListener('click',function(){ openFindReplace(); });

  /* ===== 查找替换（复刻石墨） ===== */
  var frMatches=[], frIdx=-1;
  function openFindReplace(){
    var fr=document.getElementById('findReplace');
    fr.classList.add('open');
    setTimeout(function(){ document.getElementById('frInput').focus(); },0);
  }
  document.getElementById('frClose').addEventListener('click',function(){ document.getElementById('findReplace').classList.remove('open'); });
  document.getElementById('frOpt').addEventListener('click',function(){
    var btn=document.getElementById('frOpt'), opts=document.getElementById('frOpts');
    btn.classList.toggle('on'); opts.classList.toggle('on');
    var rs=document.getElementById('frReplaceSection');
    if(opts.classList.contains('on')) rs.classList.add('on'); else rs.classList.remove('on');
    doSearch();
  });
  function buildSearchRe(){
    var q=document.getElementById('frInput').value;
    if(!q) return null;
    var cs=document.getElementById('frCase').checked;
    var ww=document.getElementById('frWhole').checked;
    var rx=document.getElementById('frRegex').checked;
    var re;
    try{
      if(rx){ re=new RegExp(q,cs?'g':'gi'); }
      else {
        var esc=q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        if(ww) re=new RegExp('\\b'+esc+'\\b',cs?'g':'gi');
        else re=new RegExp(esc,cs?'g':'gi');
      }
    }catch(e){ return null; }
    return re;
  }
  function doSearch(){
    var re=buildSearchRe(), text=quill.getText();
    frMatches=[]; frIdx=-1;
    if(re){
      var m;
      while((m=re.exec(text))!==null){
        frMatches.push({index:m.index,length:m[0].length});
        if(m[0].length===0) re.lastIndex++;
      }
    }
    var st=document.getElementById('frStatus'), ct=document.getElementById('frCount');
    if(frMatches.length===0){
      st.textContent='无搜索结果'; ct.textContent='0/0';
      document.getElementById('frPrev').disabled=true;
      document.getElementById('frNext').disabled=true;
    }else{
      st.textContent=frMatches.length+' 个结果';
      frIdx=0; gotoMatch(0);
    }
  }
  function gotoMatch(i){
    if(i<0||i>=frMatches.length) return;
    frIdx=i;
    var m=frMatches[i];
    quill.focus();
    quill.setSelection(m.index,m.length,'user');
    document.getElementById('frCount').textContent=(i+1)+'/'+frMatches.length;
    document.getElementById('frPrev').disabled=(frMatches.length<=1);
    document.getElementById('frNext').disabled=(frMatches.length<=1);
  }
  document.getElementById('frInput').addEventListener('input',doSearch);
  document.getElementById('frInput').addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); if(frMatches.length) gotoMatch((frIdx+1)%frMatches.length); }
  });
  document.getElementById('frFind').addEventListener('click',function(){ doSearch(); if(frMatches.length) gotoMatch(0); });
  document.getElementById('frCase').addEventListener('change',doSearch);
  document.getElementById('frWhole').addEventListener('change',doSearch);
  document.getElementById('frRegex').addEventListener('change',doSearch);
  document.getElementById('frPrev').addEventListener('click',function(){ if(frMatches.length) gotoMatch((frIdx-1+frMatches.length)%frMatches.length); });
  document.getElementById('frNext').addEventListener('click',function(){ if(frMatches.length) gotoMatch((frIdx+1)%frMatches.length); });
  document.getElementById('frReplaceBtn').addEventListener('click',function(){
    if(frIdx<0||frIdx>=frMatches.length) return;
    var rep=document.getElementById('frReplaceInput').value;
    var m=frMatches[frIdx];
    quill.deleteText(m.index,m.length,'user');
    quill.insertText(m.index,rep,'user');
    /* 更新后续匹配位置 */
    var diff=rep.length-m.length;
    for(var i=frIdx+1;i<frMatches.length;i++){ frMatches[i].index+=diff; }
    frMatches[frIdx].length=rep.length;
    /* 重新搜索 */
    doSearch();
    if(frMatches.length) gotoMatch(frIdx<frMatches.length?frIdx:0);
  });
  document.getElementById('frReplaceAllBtn').addEventListener('click',function(){
    var rep=document.getElementById('frReplaceInput').value;
    var re=buildSearchRe(); if(!re) return;
    var text=quill.getText();
    var newText=text.replace(re,function(){ return rep; });
    quill.setContents([{insert:newText}],'user');
    doSearch();
    toast('已全部替换');
  });
  document.getElementById('transformMenu').addEventListener('click',function(e){
    var it=e.target.closest('.dmi'); if(!it) return;
    document.getElementById('transformMenu').classList.remove('open');
    var t=it.dataset.transform;
    toast('转换：'+t+'（演示）');
  });

  bindDrop('styleBtn','styleMenu'); bindDrop('fontBtn','fontMenu'); bindDrop('sizeBtn','sizeMenu');
  bindDrop('alignBtn','alignMenu'); bindDrop('lineBtn','lineMenu'); bindDrop('insertBtn','insertMenu');

  /* 字体英文名 → 中文显示名 */
  var fontNames={'SimSun':'宋体','SimHei':'黑体','KaiTi':'楷体','FangSong':'仿宋','Microsoft YaHei':'微软雅黑','Arial':'Arial','Droid Serif':'Droid Serif','Source Code Pro':'Source Code Pro','Times New Roman':'Times New Roman','Noto Sans JP':'Noto Sans JP','Noto Serif JP':'Noto Serif JP'};
  /* ---- 工具栏激活态刷新 ---- */
  function refreshToolbar(){
    /* 用 getSelection(false) 读取选区，避免 getFormat() 内部抢焦点导致视图弹回编辑光标处 */
    var sel=quill.getSelection(false);
    var f= sel ? quill.getFormat(sel.index, sel.length) : {};
    ['bold','italic','underline','strike'].forEach(function(k){
      document.getElementById(fmtBtns[k]).classList.toggle('on', !!f[k]);
    });
    var label=document.getElementById('styleLabel');
    if(f.blockquote) label.textContent='引用';
    else if(f['code-block']) label.textContent='代码块';
    else if(f.header==1) label.textContent='标题';
    else if(f.header==2) label.textContent='副标题';
    else if(f.header>=3 && f.header<=6) label.textContent='标题'+(f.header-2);
    else if(f.size==='14.67px' && f.bold) label.textContent='标题5';
    else if(f.size==='13.33px' && f.bold) label.textContent='标题6';
    else label.textContent='正文';
    document.getElementById('fontLabel').textContent= f.font ? (fontNames[f.font]||f.font) : '字体';
    document.getElementById('sizeLabel').textContent= f.size ? String(f.size).replace('px','') : '14';
    document.getElementById('colorBar').style.background= f.color||'#000';
    /* 字体 / 字号 菜单项高亮 */
    document.querySelectorAll('#fontMenu .dmi').forEach(function(d){ d.classList.toggle('on', (d.dataset.font||'')===(f.font||'')); });
    var curSize= f.size ? String(f.size).replace('px','') : '';
    document.querySelectorAll('#sizeMenu .dmi').forEach(function(d){ d.classList.toggle('on', d.dataset.size===curSize); });
    /* 样式菜单项高亮 */
    var curStyle;
    if(f.blockquote) curStyle='blockquote';
    else if(f['code-block']) curStyle='pre';
    else if(f.header) curStyle='h'+f.header;
    else if(f.size==='14.67px' && f.bold) curStyle='h7';
    else if(f.size==='13.33px' && f.bold) curStyle='h8';
    else curStyle='p';
    document.querySelectorAll('#styleMenu .dmi').forEach(function(d){ d.classList.toggle('on', d.dataset.style===curStyle); });
    /* 列表按钮高亮 */
    document.getElementById('ulBtn').classList.toggle('on', f.list==='bullet');
    document.getElementById('olBtn').classList.toggle('on', f.list==='ordered');
    document.getElementById('taskBtn').classList.toggle('on', f.list==='checked'||f.list==='unchecked');
  }
  quill.on('selection-change',refreshToolbar);
  quill.on('text-change',refreshToolbar);
  quill.on('text-change',function(){ painterOn=false; painterFormat=null; document.getElementById('painterBtn').classList.remove('on'); });

  /* ---- 左侧目录（大纲） ---- */
  var scrollArea=document.getElementById('mainArea');
  var outline=document.getElementById('outline');
  var outlineClose=document.getElementById('outlineClose');
  var railToggle=document.getElementById('railToggle');
  var editRail=document.getElementById('editRail');
  var cougarWrapper=document.getElementById('cougarWrapper');
  function setOutline(show){
    outline.classList.toggle('collapsed',!show);
    railToggle.classList.toggle('on',show);
    editRail.style.display= show ? 'none' : 'flex';
    cougarWrapper.classList.toggle('outline-open',show);
  }
  outlineClose.addEventListener('click',function(){ setOutline(false); });
  railToggle.addEventListener('click',function(){ setOutline(outline.classList.contains('collapsed')); });
  setOutline(true);
  var outlineTimer=null;
  var tocItems=[];
  function applyCollapse(){
    var hideLevel=-1; // 当前正在折叠中的祖先标题层级
    for(var i=0;i<tocItems.length;i++){
      var lv=tocItems[i].lv;
      if(hideLevel>=0 && lv<=hideLevel) hideLevel=-1; // 走出折叠作用域
      var collapsed=(hideLevel>=0);
      tocItems[i].el.style.display=collapsed?'none':'';
      if(!collapsed && tocItems[i].el.classList.contains('has-children') && tocItems[i].el.classList.contains('collapsed')) hideLevel=lv;
    }
  }
  function buildOutline(){
    var list=document.getElementById('outlineList');
    var heads=quill.root.querySelectorAll('h1,h2,h3');
    list.innerHTML=''; tocItems=[];
    if(heads.length===0){ list.innerHTML='<div class="outline-empty">暂无标题内容<br>使用「标题 1/2/3」格式化后，将在此自动生成目录。</div>'; return; }
    heads.forEach(function(h){
      var lv=h.tagName[1]*1;
      var d=document.createElement('div'); d.className='outline-item lv'+lv; d.dataset.lv=lv;
      var svg='<svg width="8" height="8" viewBox="0 0 8 8"><path d="M2.2 1.4 L5.8 4 L2.2 6.6 Z" fill="currentColor"/></svg>';
      d.innerHTML='<span class="oc">'+svg+'</span><span class="ot"></span>';
      d.querySelector('.ot').textContent=h.textContent.trim()||'（空标题）';
      d.addEventListener('click',function(ev){
        if(ev.target.closest('.oc')){ this.classList.toggle('collapsed'); applyCollapse(); return; }
        var top=h.getBoundingClientRect().top + scrollArea.scrollTop;
        scrollArea.scrollTo({top:Math.max(0, top - scrollArea.getBoundingClientRect().top - 20), behavior:'smooth'});
      });
      list.appendChild(d);
      tocItems.push({el:d,lv:lv});
    });
    for(var i=0;i<tocItems.length;i++){
      var hasChild=false;
      for(var j=i+1;j<tocItems.length;j++){ if(tocItems[j].lv>tocItems[i].lv){ hasChild=true; break; } if(tocItems[j].lv<=tocItems[i].lv) break; }
      tocItems[i].el.classList.toggle('has-children',hasChild);
      if(!hasChild) tocItems[i].el.querySelector('.oc').style.visibility='hidden';
    }
    applyCollapse();
  }
  quill.on('text-change',function(){ clearTimeout(outlineTimer); outlineTimer=setTimeout(buildOutline,400); });
  quill.on('selection-change',function(){ clearTimeout(outlineTimer); outlineTimer=setTimeout(buildOutline,400); });
  scrollArea.addEventListener('scroll',function(){
    var heads=quill.root.querySelectorAll('h1,h2,h3'); if(!heads.length) return;
    var items=document.querySelectorAll('#outlineList .outline-item');
    var cur=0;
    for(var i=0;i<heads.length;i++){ if(heads[i].getBoundingClientRect().top < scrollArea.getBoundingClientRect().top+90) cur=i; }
    items.forEach(function(it,ix){ it.classList.toggle('on', ix===cur); });
  });

  /* ---- 右键菜单（复刻石墨 复制/剪切/删除/转换为/复制段落链接） ---- */
  var editorRoot=quill.root;
  var ctxMenu=document.getElementById('ctxMenu');
  var savedCtxSel=null;  /* 右键打开菜单时保存的选区，避免菜单点击时焦点丢失 */
  function showCtx(x,y){
    ctxMenu.style.display='block'; ctxMenu.classList.add('open');
    var w=ctxMenu.offsetWidth,h=ctxMenu.offsetHeight,vw=window.innerWidth,vh=window.innerHeight;
    if(x+w>vw-6) x=vw-w-6;
    if(y+h>vh-6) y=vh-h-6;
    ctxMenu.style.left=Math.max(4,x)+'px'; ctxMenu.style.top=Math.max(4,y)+'px';
  }
  function hideCtx(){ ctxMenu.style.display='none'; ctxMenu.classList.remove('open'); }
  editorRoot.addEventListener('contextmenu',function(e){
    if(!quill.hasFocus()) quill.focus();
    var sel=window.getSelection();
    if(!sel.rangeCount || sel.isCollapsed){
      var range=document.caretRangeFromPoint(e.clientX,e.clientY);
      if(range){ sel.removeAllRanges(); sel.addRange(range); }
    }
    quill.setSelection(quill.getSelection(),'user');
    savedCtxSel=quill.getSelection();  /* 保存选区快照 */
    e.preventDefault(); showCtx(e.clientX,e.clientY);
  });
  document.addEventListener('click',function(e){ if(!ctxMenu.contains(e.target)) hideCtx(); });
  document.addEventListener('scroll',hideCtx,true);
  document.addEventListener('keydown',function(e){ if(e.key==='Escape') hideCtx(); });
  document.addEventListener('contextmenu',function(e){ if(!editorRoot.contains(e.target)) hideCtx(); });

  /* ===== 块悬停手柄（石墨：段落菜单 + 折叠/展开） ===== */
  var blockHandle=document.getElementById('blockHandle');
  var bhMenu=blockHandle.querySelector('.bh-menu');
  var bhCollapse=blockHandle.querySelector('.bh-collapse');
  var curBlock=null, hoverTimer=null;
  function hideHandle(){ blockHandle.style.display='none'; curBlock=null; }
  function findBlock(node){
    while(node && node!==editorRoot && node!==document.body){
      if(node.nodeType===1){
        if(/^(P|H[1-6]|LI|BLOCKQUOTE|PRE)$/.test(node.tagName)) return node;
        /* 表格：返回 ql-editor 的直接子级块（table 本身或外层包装 div），
           保证与 quill.getLines() 返回的行 blot 的 domNode 一致 */
        if(node.tagName==='TABLE'){
          var wrap=node;
          while(wrap && wrap.parentNode!==editorRoot && wrap!==editorRoot) wrap=wrap.parentNode;
          return (wrap && wrap.parentNode===editorRoot) ? wrap : node;
        }
      }
      node=node.parentNode;
    }
    return null;
  }
  function isHeading(n){ return !!n && /^H[1-6]$/.test(n.tagName); }
  function headingLevel(n){ return n?parseInt(n.tagName[1],10):99; }
  document.addEventListener('mousemove',function(e){
    if(dragging) return;
    clearTimeout(hoverTimer);
    hoverTimer=setTimeout(function(){
      var t=document.elementFromPoint(e.clientX,e.clientY);
      if(blockHandle && blockHandle.contains(t)) return;
      if(t && t.closest && t.closest('#ctxMenu')) return;
      var blk=findBlock(t);
      if(!blk){ hideHandle(); return; }
      curBlock=blk;
      var r=blk.getBoundingClientRect();
      if(isHeading(blk)){
        var lv=headingLevel(blk), has=false, sib=blk.nextElementSibling;
        while(sib){ if(isHeading(sib)&&headingLevel(sib)<=lv) break; if(!isHeading(sib)){ has=true; break; } sib=sib.nextElementSibling; }
        bhCollapse.style.display=has?'flex':'none';
      } else bhCollapse.style.display='none';
      bhCollapse.textContent=(blk.dataset.collapsed==='1')?'▸':'▾';
      blockHandle.style.display='flex';
      var w=blockHandle.offsetWidth||50;
      blockHandle.style.left=(r.left-w-12)+'px';
      blockHandle.style.top=(r.top+Math.min(r.height,22)/2-11)+'px';
    },120);
  });
  scrollArea.addEventListener('scroll',hideHandle);

  /* ===== 段落拖动排序（石墨：按住三条线沿直线上下拖动，落点显示竖线） ===== */
  var dropLine=document.getElementById('dropLine');
  var dragging=false, dragBlock=null, dragLine=null, dragTargetLine=null, dragTargetBefore=false, lastDropY=-1, dragMoved=false, dragStartY=0;
  function getAllBlocks(){
    var els=[];
    var n=editorRoot.firstElementChild;
    while(n){
      if(/^(P|H[1-6]|LI|BLOCKQUOTE|PRE|DIV)$/.test(n.tagName) && !n.classList.contains('ql-hr')) els.push(n);
      n=n.nextElementSibling;
    }
    return els;
  }
  /* 依据鼠标 Y 决定落点：返回 {line:LineBlot, before:boolean} */
  function hitLine(y){
    var lines=quill.getLines(); /* Line blot 数组（文档顺序） */
    for(var i=0;i<lines.length;i++){
      var blot=lines[i];
      if(!blot.domNode || blot.domNode===dragBlock) continue;
      var r=blot.domNode.getBoundingClientRect();
      if(r.width===0&&r.height===0) continue;
      var mid=r.top+r.height/2;
      if(y<mid) return {line:blot, before:true};
    }
    var last=lines[lines.length-1];
    return {line:last, before:false};
  }
  var contentPadL=0, contentPadR=0;
  function updateDropLine(y){
    var h=hitLine(y);
    if(!h||!h.line||!h.line.domNode){ dropLine.style.display='none'; return; }
    dragTargetLine=h.line; dragTargetBefore=h.before;
    var r=h.line.domNode.getBoundingClientRect();
    var top=h.before?r.top:(r.top+r.height);
    /* 横线贯穿编辑内容区（不受落点块缩进影响） */
    var er=editorRoot.getBoundingClientRect();
    if(!contentPadL){
      var cs=getComputedStyle(editorRoot);
      contentPadL=parseFloat(cs.paddingLeft)||0; contentPadR=parseFloat(cs.paddingRight)||0;
    }
    dropLine.style.left=(er.left+contentPadL)+'px';
    dropLine.style.width=Math.max(40,er.width-contentPadL-contentPadR)+'px';
    dropLine.style.top=(top-1)+'px';
    dropLine.style.display='block';
    lastDropY=y;
  }
  function doMove(){
    if(!dragBlock||!dragLine) return;
    var allLines=quill.getLines();
    var srcIdx=allLines.indexOf(dragLine);
    if(srcIdx<0) return;
    var targetIdx=allLines.indexOf(dragTargetLine);
    if(targetIdx<0) return;
    /* 计算目标插入位置（target before -> 目标行开头；after -> 目标行之后） */
    var destIdx;
    if(!dragTargetBefore) destIdx=targetIdx+1; /* after */
    else destIdx=targetIdx;
    /* 排除无意义移动 */
    if(destIdx===srcIdx || destIdx===srcIdx+1){ dragLine=null; return; }
    /* 目标 Delta 索引 = 该行开头的 text index */
    var blockDeltaIndex;
    if(destIdx>=allLines.length){
      blockDeltaIndex=Math.max(0,quill.getLength()-1);
    } else {
      blockDeltaIndex=quill.getIndex(allLines[destIdx]);
    }
    /* 被拖行的 Delta 范围与内容（含换行符上的块格式：list/header 等） */
    var src=quill.getIndex(dragLine);
    var len=dragLine.length();
    var movingDelta=quill.getContents(src, len);
    var appendAtEnd=destIdx>=allLines.length;
    /* 原子移动：updateContents 一步完成删除+插入，避免中间态导致块格式错误合并 */
    var DeltaCtor=Quill.import('delta');
    var change=new DeltaCtor();
    if(blockDeltaIndex<src){
      /* 向上移动：retain 目标点 -> 插入 -> retain 到源块新位置 -> 删除 */
      change.retain(blockDeltaIndex);
      change=change.concat(movingDelta);
      change.retain(src-blockDeltaIndex);
      change.delete(len);
    } else if(appendAtEnd){
      /* 文末追加：末行 \n 即文档结束符（换行格式控制其前一行）。
         序列：删源 -> 插无格式 \n（分隔，保住末行）-> 插文本 -> retain(1) 给新行结束符加块格式 */
      var mdOps=movingDelta.ops, nlAttr=mdOps[mdOps.length-1].attributes||{};
      change.retain(src);
      change.delete(len);
      change.retain(Math.max(0,blockDeltaIndex-src-len));
      change.insert('\n');
      for(var oi=0;oi<mdOps.length-1;oi++) change.insert(mdOps[oi].insert, mdOps[oi].attributes||{});
      change.retain(1, nlAttr);
    } else {
      /* 向下移动：retain 源点 -> 删除 -> retain 到目标新位置 -> 插入 */
      change.retain(src);
      change.delete(len);
      change.retain(Math.max(0,blockDeltaIndex-src-len));
      change=change.concat(movingDelta);
    }
    quill.updateContents(change,'user');
    scheduleSave();
  }
  bhMenu.addEventListener('pointerdown',function(e){
    if(e.button!==0) return;
    if(!curBlock) return;
    e.preventDefault(); e.stopPropagation();
    dragging=true; clearTimeout(hoverTimer); dragBlock=curBlock;
    dragLine=quill.getLines().filter(function(b){ return b.domNode===curBlock; })[0];
    if(!dragLine){ try{ dragLine=Quill.find(curBlock); }catch(e){ dragLine=null; } }
    dragTargetLine=null; lastDropY=-1; dragMoved=false; dragStartY=e.clientY;
    blockHandle.style.opacity='0.6';
    document.body.style.userSelect='none';
    document.addEventListener('pointermove',onDragMove);
    document.addEventListener('pointerup',onDragEnd);
    document.addEventListener('pointercancel',onDragEnd);
  });
  function onDragMove(e){
    if(!dragging) return;
    /* 阈值内视为点击，不启动拖拽 */
    if(!dragMoved && Math.abs(e.clientY-dragStartY)<4) return;
    dragMoved=true;
    e.preventDefault();
    /* 石墨：仅垂直移动，手柄不水平跟随 */
    blockHandle.style.top=(e.clientY-13)+'px';
    updateDropLine(e.clientY);
  }
  function onDragEnd(e){
    if(!dragging) return;
    dragging=false;
    document.removeEventListener('pointermove',onDragMove);
    document.removeEventListener('pointerup',onDragEnd);
    document.removeEventListener('pointercancel',onDragEnd);
    blockHandle.style.opacity='1';
    document.body.style.userSelect='';
    /* 点击（未拖动）：保留手柄与 curBlock，交由 click 事件弹出菜单 */
    if(!dragMoved){ dragBlock=null; dragLine=null; return; }
    dropLine.style.display='none';
    doMove();
    dragBlock=null;
    hideHandle();
  }

  bhMenu.addEventListener('click',function(e){
    e.stopPropagation(); if(!curBlock) return;
    var r=blockHandle.getBoundingClientRect();
    showCtx(r.right+4, r.top-5);
  });
  bhCollapse.addEventListener('click',function(e){
    e.stopPropagation(); if(!isHeading(curBlock)) return;
    var lv=headingLevel(curBlock);
    if(curBlock.dataset.collapsed==='1'){
      curBlock.dataset.collapsed='0'; bhCollapse.textContent='▾';
      var sib=curBlock.nextElementSibling;
      while(sib){ if(isHeading(sib)&&headingLevel(sib)<=lv) break; sib.style.display=''; sib=sib.nextElementSibling; }
    } else {
      curBlock.dataset.collapsed='1'; bhCollapse.textContent='▸';
      var sib=curBlock.nextElementSibling;
      while(sib){ if(isHeading(sib)&&headingLevel(sib)<=lv) break; sib.style.display='none'; sib=sib.nextElementSibling; }
    }
  });
  ctxMenu.querySelectorAll('[data-act]').forEach(function(el){
    el.addEventListener('mousedown',function(e){ e.preventDefault(); }); /* 阻止菜单点击时编辑器失焦 */
  });
  ctxMenu.querySelectorAll('[data-act]').forEach(function(el){
    el.addEventListener('click',function(){
      var act=el.dataset.act;
      /* 用右键打开时保存的选区，避免菜单点击导致 quill.getSelection() 返回 null */
      var sel = savedCtxSel || quill.getSelection();
      /* 兼容旧浏览器/非安全上下文：用 textarea + execCommand 兜底写剪贴板 */
      function _fallbackCopy(text){
        var ta=document.createElement('textarea'); ta.value=text;
        ta.style.position='fixed'; ta.style.left='-9999px';
        document.body.appendChild(ta); ta.focus(); ta.select();
        try{ document.execCommand('copy'); }catch(e){}
        ta.remove();
      }
      if(act==='copy'){
        if(!sel||sel.length===0){ toast('请先选择文字'); return; }
        var txt=quill.getText(sel.index, sel.length);
        _fallbackCopy(txt); toast('已复制');
        hideCtx();
      }
      else if(act==='cut'){
        if(!sel||sel.length===0){ toast('请先选择文字'); return; }
        var utxt=quill.getText(sel.index, sel.length);
        _fallbackCopy(utxt);
        quill.deleteText(sel.index, sel.length, 'user');
        toast('已剪切');
        hideCtx();
      }
      else if(act==='delete'){
        var ds=quill.getSelection();
        if(ds && ds.length>0){
          /* 右键菜单：有选区则删选区 */
          quill.deleteText(ds.index, ds.length, 'user');
        } else {
          /* 块菜单：删除整个当前块（curBlock 由手柄点击确定；无则取光标所在行） */
          var targetEl=curBlock;
          if(!targetEl && ds){
            var bl=quill.getLines(ds.index, 1);
            if(bl.length) targetEl=bl[0].domNode;
          }
          var dl0=quill.getLines().filter(function(b){ return b.domNode===targetEl; })[0];
          if(!dl0 && targetEl){ try{ dl0=Quill.find(targetEl); }catch(e){ dl0=null; } }
          if(dl0){
            quill.deleteText(quill.getIndex(dl0), dl0.length(), 'user');
            hideHandle();
          } else {
            document.execCommand('delete');
          }
        }
      }
      else if(act==='link'){
        var idx=quill.getSelection()?quill.getSelection().index:0;
        var url=location.href.split('#')[0]+'#L'+idx;
        var ta=document.createElement('textarea'); ta.value=url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
        toast('段落链接已复制');
      }
      hideCtx();
    });
  });
  ctxMenu.querySelectorAll('[data-fmt]').forEach(function(el){
    el.addEventListener('click',function(){
      var f=el.dataset.fmt;
      if(f==='paragraph'){ quill.format('header',false); quill.format('blockquote',false); quill.format('code-block',false); quill.format('list',false); }
      else if(f==='heading'||f==='header1'){ quill.format('header','1'); }
      else if(f.indexOf('header')===0){ quill.format('header', parseInt(f.slice(6),10)); }
      else if(f==='ordered'){ quill.format('list','ordered'); }
      else if(f==='bullet'){ quill.format('list','bullet'); }
      else if(f==='task'){ quill.format('list','unchecked'); }
      else if(f==='blockquote'){ quill.format('blockquote',true); }
      else if(f==='code'){ quill.format('code-block',true); }
      hideCtx(); refreshToolbar();
    });
  });

  /* ===== 斜杠命令面板（石墨：输入 / 唤起） ===== */
  var slashMenu=document.getElementById('slashMenu');
  var slashList=document.getElementById('slashList');
  var slashOpen=false, slashIdx=0, slashItems=[], slashRange=null, slashStartIdx=-1;
  var slashCommands=[
    {ico:'T',text:'正文',act:'paragraph'},
    {ico:'H1',text:'标题 1',act:'h1'},{ico:'H2',text:'标题 2',act:'h2'},
    {ico:'H3',text:'标题 3',act:'h3'},{ico:'H4',text:'标题 4',act:'h4'},
    {ico:'H5',text:'标题 5',act:'h5'},{ico:'H6',text:'标题 6',act:'h6'},
    {ico:'"',text:'引用',act:'blockquote'},
    {ico:'< >',text:'代码块',act:'code'},
    {ico:'•',text:'无序列表',act:'bullet'},
    {ico:'1.',text:'有序列表',act:'ordered'},
    {ico:'☑',text:'任务清单',act:'task'},
    {ico:'▦',text:'表格',act:'table'},
    {ico:'—',text:'分割线',act:'hr'},
    {ico:'🖼',text:'图片',act:'image'},
    {ico:'🔗',text:'链接',act:'link'},
  ];
  function renderSlash(filter){
    var list=filter? slashCommands.filter(function(c){return c.text.indexOf(filter)>=0 || c.act.indexOf(filter)>=0;}) : slashCommands;
    slashList.innerHTML='';
    slashItems=[];
    list.forEach(function(c){
      var d=document.createElement('div'); d.className='slash-item'; d.dataset.act=c.act;
      d.innerHTML='<span class="si-ico">'+c.ico+'</span><span class="si-text">'+c.text+'</span><span class="si-hint"></span>';
      d.addEventListener('mousedown',function(e){ e.preventDefault(); applySlash(c.act); });
      slashList.appendChild(d); slashItems.push(d);
    });
    slashIdx=0; updateSlashActive();
  }
  function updateSlashActive(){
    slashItems.forEach(function(el,i){ el.classList.toggle('active', i===slashIdx); });
    if(slashItems[slashIdx]) slashItems[slashIdx].scrollIntoView({block:'nearest'});
  }
  function showSlash(){
    var sel=quill.getSelection(true);
    if(!sel) return;
    var bounds=quill.getBounds(sel.index);
    var w=slashMenu.offsetWidth||220;
    var x=bounds.left+editorRoot.getBoundingClientRect().left;
    var y=bounds.bottom+editorRoot.getBoundingClientRect().top+4;
    if(x+w>window.innerWidth-6) x=window.innerWidth-w-6;
    if(y+320>window.innerHeight-6) y=bounds.top+editorRoot.getBoundingClientRect().top-320;
    slashMenu.style.left=Math.max(4,x)+'px';
    slashMenu.style.top=Math.max(4,y)+'px';
    slashMenu.classList.add('open'); slashOpen=true;
    renderSlash('');
  }
  function hideSlash(){ slashMenu.classList.remove('open'); slashOpen=false; }
  function applySlash(act){
    if(slashStartIdx<0){ hideSlash(); return; }
    var sel=quill.getSelection();
    if(!sel){ hideSlash(); return; }
    // 删除 / 及其后输入的字符
    var len=sel.index-slashStartIdx;
    quill.deleteText(slashStartIdx, len, 'user');
    setTimeout(function(){
      if(act==='paragraph'){ quill.format('header',false); }
      else if(act==='blockquote'){ quill.format('blockquote',true); }
      else if(act==='code'){ quill.format('code-block',true); }
      else if(act.indexOf('h')===0){ quill.format('header', parseInt(act.slice(1),10)); }
      else if(act==='bullet'){ quill.format('list','bullet'); }
      else if(act==='ordered'){ quill.format('list','ordered'); }
      else if(act==='task'){ quill.format('list','unchecked'); }
      else if(act==='table'){ insertTable(3,3); }
      else if(act==='hr'){ try{ quill.insertEmbed(quill.getSelection().index,'divider',true); }catch(e){} }
      else if(act==='image'){ pendingImageIndex = quill.getSelection() ? quill.getSelection().index : 0; document.getElementById('imageInput').click(); }
      else if(act==='link'){ openLinkDialog(); }
      slashStartIdx=-1; hideSlash(); refreshToolbar();
    },10);
  }
  quill.on('text-change',function(delta,oldSrc,src){
    if(src!=='user') return;
    var sel=quill.getSelection();
    if(!sel) return;
    // 检测是否输入了 /
    var ops=delta.ops||[];
    for(var i=0;i<ops.length;i++){
      if(ops[i].insert==='/'){
        slashStartIdx=sel.index-1;
        showSlash();
        return;
      }
    }
    // 如果斜杠面板打开，检测输入内容用于过滤或关闭
    if(slashOpen){
      if(slashStartIdx>=0 && sel.index>slashStartIdx){
        var text=quill.getText(slashStartIdx, sel.index-slashStartIdx);
        if(text.indexOf('/')!==0){ hideSlash(); slashStartIdx=-1; return; }
        var filter=text.slice(1);
        renderSlash(filter);
      } else {
        hideSlash(); slashStartIdx=-1;
      }
    }
  });
  document.addEventListener('keydown',function(e){
    if(!slashOpen) return;
    if(e.key==='ArrowDown'){ e.preventDefault(); slashIdx=(slashIdx+1)%Math.max(1,slashItems.length); updateSlashActive(); }
    else if(e.key==='ArrowUp'){ e.preventDefault(); slashIdx=(slashIdx-1+slashItems.length)%Math.max(1,slashItems.length); updateSlashActive(); }
    else if(e.key==='Enter'){ e.preventDefault(); if(slashItems[slashIdx]) applySlash(slashItems[slashIdx].dataset.act); }
    else if(e.key==='Escape'){ e.preventDefault(); hideSlash(); }
  });
  document.addEventListener('click',function(e){ if(!slashMenu.contains(e.target)){ hideSlash(); slashStartIdx=-1; } });

  /* ===== 划词浮动工具栏（石墨：选中文字后弹出） ===== */
  var floatBar=document.getElementById('floatBar');
  function showFloatBar(){
    var sel=quill.getSelection();
    if(!sel || !sel.length){ floatBar.classList.remove('open'); return; }
    var bounds=quill.getBounds(sel.index, sel.length);
    var rootRect=editorRoot.getBoundingClientRect();
    var cx=bounds.left+rootRect.left+bounds.width/2;
    var y=bounds.top+rootRect.top-44;
    var w=floatBar.offsetWidth||280;
    if(cx-w/2<4) cx=w/2+4;
    if(cx+w/2>window.innerWidth-4) cx=window.innerWidth-w/2-4;
    if(y<4) y=bounds.bottom+rootRect.top+4;
    floatBar.style.left=(cx-w/2)+'px';
    floatBar.style.top=y+'px';
    floatBar.classList.add('open');
    // 刷新激活态
    var f=quill.getFormat()||{};
    ['bold','italic','underline','strike'].forEach(function(k){
      var btn=floatBar.querySelector('[data-act="'+k+'"]');
      if(btn) btn.classList.toggle('on', !!f[k]);
    });
    document.getElementById('fbColorBar').style.background=f.color||'#000';
  }
  function hideFloatBar(){ floatBar.classList.remove('open'); }
  quill.on('selection-change',function(range){
    if(range && range.length>0){ setTimeout(showFloatBar,10); }
    else hideFloatBar();
  });
  floatBar.addEventListener('mousedown',function(e){ e.preventDefault(); });
  floatBar.querySelectorAll('.fb-btn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var act=btn.dataset.act;
      if(act==='link'){ var l=prompt('链接 URL：'); if(l) quill.format('link',l); }
      else if(act==='color'){
        var c=prompt('文字颜色（如 #e95555）：'); if(c) quill.format('color',c);
      }
      else if(act==='comment'){ toast('已添加评论（演示）'); }
      else quill.format(act, !(quill.getFormat()[act]));
      refreshToolbar(); showFloatBar();
    });
  });
  scrollArea.addEventListener('scroll',hideFloatBar,true);

  /* ===== 石墨风格快捷键 ===== */
  document.addEventListener('keydown',function(e){
    var mod=e.ctrlKey||e.metaKey;
    if(!mod) return;
    var k=e.key.toLowerCase();
    // Ctrl+Alt+1~6 → 标题
    if(e.altKey && /^[1-6]$/.test(k)){
      e.preventDefault(); quill.format('header', parseInt(k,10)); refreshToolbar(); return;
    }
    // Ctrl+0 → 正文
    if(e.altKey && k==='0'){ e.preventDefault(); quill.format('header',false); refreshToolbar(); return; }
    // Ctrl+B/I/U 已由 Quill 处理，这里补充 K（链接）
    if(k==='k'){ e.preventDefault(); var l=prompt('链接 URL：'); if(l) quill.format('link',l); return; }
    // Ctrl+Shift+L → 切换大纲
    if(e.shiftKey && k==='l'){ e.preventDefault(); setOutline(outline.classList.contains('collapsed')); return; }
    // Ctrl+/ → 焦点到编辑器
    if(k==='/'){ e.preventDefault(); quill.focus(); return; }
  });

  /* ---- 新建 / 删除 / 列表 / 抽屉 / 顶部栏按钮 ---- */
  document.getElementById('backBtn').addEventListener('click',function(){
    var ret=localStorage.getItem('shimo_return');
    if(ret){ localStorage.removeItem('shimo_return'); location.href=ret; }
    else{ location.href='/'; }
  });
  document.getElementById('shareBtn').addEventListener('click',function(){
    var url=location.href; var ta=document.createElement('textarea'); ta.value=url; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
    toast('分享链接已复制');
  });
  /* 「更多」按钮：导出下拉菜单（HTML / Markdown / Word / EPUB / 纯文本） */
  bindDrop('headerMoreBtn','exportMenu');
  document.getElementById('exportMenu').addEventListener('mousedown',function(e){ e.preventDefault(); });
  document.getElementById('exportMenu').addEventListener('click',function(e){
    var item=e.target.closest('[data-export]'); if(!item) return;
    var fmt=item.dataset.export;
    if(!store.docId){ toast('请先打开一篇文档'); closeAllMenus(); return; }
    EditorAPI.docs.exportDoc(store.docId, fmt);
    closeAllMenus();
    toast('正在导出 '+fmt.toUpperCase()+'…');
  });
  document.getElementById('newBtn').addEventListener('click',async function(){
    var d=await EditorAPI.docs.create({title:'未命名文档'});
    openDoc(d.id); toast('已新建文档'); refreshList();
  });
  document.getElementById('delBtn').addEventListener('click',async function(){
    if(!store.docId||!confirm('确定删除这篇文档吗？')) return;
    await EditorAPI.docs.remove(store.docId);
    toast('已删除'); store.docId=null; quill.setText(''); syncTitle('未命名文档'); setStatus('已保存'); refreshList();
  });
  async function openDoc(id,skipSave){
    if(!id) return;
    if(!skipSave) await doSave();
    var d;
    try{ d=await EditorAPI.docs.get(id); }
    catch(e){ toast('文档不存在'); return; }
    store.docId=d.id; syncTitle(d.title); quill.clipboard.dangerouslyPasteHTML(d.content_html||'');
    history.replaceState(null,'','/docs/'+id+'/'); setStatus('已保存'); closeDrawer(); buildOutline();
  }
  function refreshList(){
    EditorAPI.docs.list().then(function(docs){
      var box=document.getElementById('docList'); box.innerHTML='';
      if(!docs.length){ box.innerHTML='<div style="padding:14px;color:var(--muted);font-size:13px">暂无文档</div>'; return; }
      docs.forEach(function(d){
        var row=document.createElement('div'); row.className='doc-row'+(String(d.id)===String(store.docId)?' on':'');
        var dt=document.createElement('div'); dt.className='dt'; dt.textContent=d.title;
        var du=document.createElement('div'); du.className='du'; du.textContent=(d.updated_at||'').slice(5,16);
        row.appendChild(dt); row.appendChild(du);
        row.addEventListener('click',function(){ openDoc(d.id); });
        box.appendChild(row);
      });
    });
  }
  var drawer=document.getElementById('drawer'), mask=document.getElementById('mask');
  function openDrawer(){ refreshList(); drawer.classList.add('open'); mask.classList.add('show'); }
  function closeDrawer(){ drawer.classList.remove('open'); mask.classList.remove('show'); }
  document.getElementById('listBtn').addEventListener('click',openDrawer);
  document.getElementById('drawerClose').addEventListener('click',closeDrawer);
  mask.addEventListener('click',closeDrawer);

  (async function(){
    if(store.docId){ openDoc(store.docId,true); return; }
    var d=await EditorAPI.docs.create({title:'未命名文档'});
    store.docId=d.id; history.replaceState(null,'','/docs/'+d.id+'/'); setStatus('已保存'); buildOutline();
  })();
})();
