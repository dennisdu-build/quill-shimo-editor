(function(){
'use strict';
var boot=JSON.parse(document.getElementById('bootData').textContent);
var curSpace=String(boot.space), curFolder=boot.folder?String(boot.folder):null;

var $=function(s){return document.querySelector(s);};
var fileList=$('#fileList'), ckAll=$('#ckAll');
var spaces=[], folders=[], docs=[];
var selected=new Set();           /* "d:147" / "f:5" */
var sortKey='updated_at', sortAsc=false;
var renaming=false;

/* ================= 图标 ================= */
var ICON={
  doc:'<svg width="24" height="24" viewBox="0 0 24 24"><path d="M5.5 3h9L19 7.5V20a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" fill="#fff" stroke="var(--sm-primary)" stroke-width="1.5" stroke-linejoin="round"/><path d="M14.5 3v4.5H19" fill="none" stroke="var(--sm-primary)" stroke-width="1.5" stroke-linejoin="round"/><path d="M8.5 12.5h7M8.5 16h7" stroke="var(--sm-primary)" stroke-width="1.5" stroke-linecap="round"/></svg>',
  folder:'<svg width="24" height="24" viewBox="0 0 24 24"><path d="M2.5 7c0-.8.7-1.5 1.5-1.5h4.6c.4 0 .8.2 1.1.5l.8 1c.3.3.6.5 1 .5h6c.8 0 1.5.7 1.5 1.5v8c0 .8-.7 1.5-1.5 1.5H4c-.8 0-1.5-.7-1.5-1.5V7z" fill="#FFD666"/><path d="M2.5 9.5h19" stroke="#F0B429" stroke-width="1" opacity=".6"/></svg>',
  doc16:'<svg width="16" height="16" viewBox="0 0 16 16"><path d="M3.5 1.5h6L13 5v8.8c0 .4-.3.7-.7.7H3.7c-.4 0-.7-.3-.7-.7V2.2c0-.4.3-.7.5-.7z" fill="#fff" stroke="var(--sm-primary)" stroke-width="1.2"/><path d="M9.5 1.5V5H13" fill="none" stroke="var(--sm-primary)" stroke-width="1.2"/></svg>',
  folder16:'<svg width="16" height="16" viewBox="0 0 16 16"><path d="M1.8 4.5c0-.5.4-.9.9-.9h3c.3 0 .5.1.7.3l.6.7h6.3c.5 0 .9.4.9.9v5.9c0 .5-.4.9-.9.9H2.7c-.5 0-.9-.4-.9-.9V4.5z" fill="#FFD666"/></svg>',
  space16:'<svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="var(--sm-primary)"/><path d="M5.2 5.5h5.6M5.2 8h5.6M5.2 10.5h3.4" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/></svg>',
  more:'<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="2.8" cy="7" r="1" fill="currentColor"/><circle cx="7" cy="7" r="1" fill="currentColor"/><circle cx="11.2" cy="7" r="1" fill="currentColor"/></svg>'
};

/* ================= 工具 ================= */
function parseSize(s){
  var m=/^([\d.]+)\s*(B|KB|MB|GB)$/.exec((s||'').trim());
  if(!m) return 0;
  var unit={B:1,KB:1024,MB:1048576,GB:1073741824}[m[2]];
  return Math.round(parseFloat(m[1])*unit);
}
/* toast 由 common.js 提供 */
function getSpace(id){ return spaces.filter(function(s){return String(s.id)===String(id);})[0]; }
function getFolder(id){ return folders.filter(function(f){return String(f.id)===String(id);})[0]; }

/* ================= URL 与导航 ================= */
function spaceRoot(id){
  var sp=getSpace(id);
  if(sp&&sp.kind==='personal') return '/';
  return '/space/'+id+'/';
}
function folderUrl(spId,fId){ return '/space/'+spId+'/folder/'+fId+'/'; }
function openDocEditor(id){
  localStorage.setItem('shimo_return', location.pathname);
  location.href='/docs/'+id+'/';
}
function folderPath(fId){
  var path=[]; var f=getFolder(fId), guard=0;
  while(f&&guard++<50){ path.unshift({id:f.id,name:f.name}); f=f.parent?getFolder(f.parent):null; }
  return path;
}

/* ================= 通用弹出菜单 ================= */
function popMenu(anchor, items, width){
  closePop();
  var menu=document.createElement('div');
  menu.className='pop-menu'+(width==='wide'?' wide':'');
  menu.id='__popMenu';
  items.forEach(function(it){
    if(it.divider){ var d=document.createElement('div'); d.className='pm-divider'; menu.appendChild(d); return; }
    var el=document.createElement('div');
    el.className='pm-item'+(it.disabled?' disabled':'');
    el.innerHTML=(it.icon||'<span style="width:16px"></span>')+'<span>'+it.label+'</span>';
    if(!it.disabled){
      /* 石墨同款：按下即激活（pointerdown/mousedown/click 三重兜底，fired 防重触发） */
      var fired=false;
      var activate=function(){ if(fired) return; fired=true; closePop(); it.onClick&&it.onClick(); };
      el.addEventListener('pointerdown',function(e){ e.preventDefault(); e.stopPropagation(); activate(); });
      el.addEventListener('mousedown',function(e){ e.preventDefault(); e.stopPropagation(); activate(); });
      el.addEventListener('click',function(e){ e.stopPropagation(); activate(); });
    }
    menu.appendChild(el);
  });
  document.body.appendChild(menu);
  var r=anchor.getBoundingClientRect();
  var w=menu.offsetWidth, h=menu.offsetHeight;
  var left=Math.min(r.left, window.innerWidth-w-8);
  var top=r.bottom+4;
  if(top+h>window.innerHeight-8) top=r.top-h-4;
  menu.style.left=left+'px'; menu.style.top=top+'px';
  setTimeout(function(){
    document.addEventListener('mousedown',outsideClose,true);
  },0);
}
function outsideClose(e){ if(!e.target.closest('#__popMenu')) closePop(); }
function closePop(){
  var m=$('#__popMenu'); if(m) m.remove();
  document.removeEventListener('mousedown',outsideClose,true);
}
document.addEventListener('keydown',function(e){ if(e.key==='Escape') closePop(); });

/* ================= 创建下拉 ================= */
function createMenuItems(){
  return [
    {icon:ICON.doc16,label:'新建文档',onClick:createDocHere},
    {icon:ICON.folder16,label:'新建文件夹',onClick:createFolderHere},
    {divider:true},
    {icon:ICON.space16,label:'新建团队空间',onClick:openSpaceModal}
  ];
}
$('#tbCreateMain').addEventListener('click',function(e){ popMenu(this,createMenuItems()); });
$('#tbCreateArrow').addEventListener('click',function(e){ popMenu($('#tbCreateWrap'),createMenuItems()); });
$('#sbCreate').addEventListener('click',function(e){ popMenu(this,createMenuItems()); });
$('#newHereBtn').addEventListener('click',function(e){ popMenu(this,createMenuItems()); });
$('#emptyCreate').addEventListener('click',createDocHere);

/* ================= 新建空间弹窗 ================= */
var spaceModal=$('#spaceModal'), spaceInput=$('#spaceNameInput'), spaceOk=$('#spaceOk'), spaceError=$('#spaceError');
function openSpaceModal(){
  spaceInput.value=''; spaceError.textContent=''; spaceOk.disabled=true;
  spaceModal.classList.add('show');
  setTimeout(function(){spaceInput.focus();},50);
}
function closeSpaceModal(){ spaceModal.classList.remove('show'); }
spaceInput.addEventListener('input',function(){ spaceOk.disabled=!this.value.trim(); spaceError.textContent=''; });
$('#addSpaceBtn').addEventListener('click',openSpaceModal);
$('#addSpaceNav').addEventListener('click',openSpaceModal);
$('#spaceCancel').addEventListener('click',closeSpaceModal);
spaceModal.addEventListener('click',function(e){ if(e.target===spaceModal) closeSpaceModal(); });
spaceOk.addEventListener('click',async function(){
  var name=spaceInput.value.trim();
  if(!name) return;
  var sp;
  try{ sp=await EditorAPI.spaces.create(name); }
  catch(e){ spaceError.textContent='创建失败，请重试'; return; }
  location.href=spaceRoot(sp.id);
});
spaceInput.addEventListener('keydown',function(e){ if(e.key==='Enter'&&!spaceOk.disabled) spaceOk.click(); });

/* ================= 新建文档/文件夹 ================= */
async function createDocHere(){
  var body={title:'未命名文档',space:curSpace};
  if(curFolder) body.folder=curFolder;
  var d;
  try{ d=await EditorAPI.docs.create(body); }catch(e){ toast('创建失败'); return; }
  openDocEditor(d.id);
}

async function createFolderHere(){
  var body={space:curSpace,name:'新建文件夹'};
  if(curFolder) body.parent=curFolder;
  var f;
  try{ f=await EditorAPI.folders.create(body); }catch(e){ toast('创建失败'); return; }
  /* 就地进入重命名，形成“创建→立刻可见”闭环 */
  await reloadContext();
  startRename(f.id,true);
}

/* ================= 行内重命名 ================= */
function startRename(folderId,isNew){
  if(renaming) return;
  var row=fileList.querySelector('.folder-row[data-id="'+folderId+'"]');
  if(!row){ return; }
  renaming=true;
  var nameWrap=row.querySelector('.fr-name');
  var span=nameWrap.querySelector('.doc-title');
  var oldName=span.textContent;
  var input=document.createElement('input');
  input.className='rename-input'; input.value=oldName;
  nameWrap.replaceChild(input,span);
  input.focus(); input.select();
  var done=false;
  async function commit(){
    if(done) return; done=true; renaming=false;
    var name=input.value.trim();
    if(!name || name===oldName){
      if(!name && isNew){ await EditorAPI.folders.remove(folderId); }
      await reloadContext(); return;
    }
    try{ await EditorAPI.folders.rename(folderId,name); }catch(e){ toast('重命名失败'); }
    await reloadContext();
  }
  function cancel(){
    if(done) return; done=true; renaming=false;
    if(isNew){ EditorAPI.folders.remove(folderId).then(reloadContext); }
    else reloadContext();
  }
  input.addEventListener('keydown',function(e){
    if(e.key==='Enter'){ e.preventDefault(); commit(); }
    if(e.key==='Escape'){ e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur',commit);
  /* 阻止行点击在编辑时触发跳转 */
  input.addEventListener('click',function(e){e.stopPropagation();});
}

/* ================= 行渲染 ================= */
function curFolders(){
  return folders.filter(function(f){ return String(f.parent||'')===String(curFolder||''); })
    .sort(function(a,b){ return a.name.localeCompare(b.name,'zh'); });
}
function curDocs(){
  var arr=docs.slice(), dir=sortAsc?1:-1;
  if(sortKey==='size') arr.sort(function(a,b){return (parseSize(a.size)-parseSize(b.size))*dir;});
  else if(sortKey==='title') arr.sort(function(a,b){return (a.title||'').localeCompare(b.title||'','zh')*dir;});
  else arr.sort(function(a,b){var va=a[sortKey]||'',vb=b[sortKey]||'';return va<vb?-dir:va>vb?dir:0;});
  return arr;
}

function makeCk(selKey){
  var ck=document.createElement('span');
  ck.className='ck'+(selected.has(selKey)?' checked':'');
  ck.innerHTML='<svg class="check" width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5.2L4 7.7l4.5-5.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  ck.addEventListener('click',function(e){ e.stopPropagation(); toggleSel(selKey); });
  return ck;
}

function buildFolderRow(f){
  var row=document.createElement('div');
  var key='f:'+f.id;
  row.className='tr file-row folder-row'+(selected.has(key)?' selected':'');
  row.dataset.id=f.id;

  var c1=document.createElement('div'); c1.className='fr-ck'; c1.appendChild(makeCk(key)); row.appendChild(c1);

  var c2=document.createElement('div'); c2.className='fr-name';
  c2.innerHTML=ICON.folder;
  var tt=document.createElement('span'); tt.className='doc-title'; tt.textContent=f.name;
  c2.appendChild(tt); row.appendChild(c2);

  var c3=document.createElement('div'); c3.className='fr-meta'; c3.textContent='我'; row.appendChild(c3);
  var c4=document.createElement('div'); c4.className='fr-meta'; c4.textContent=f.updated_at||''; row.appendChild(c4);
  var c5=document.createElement('div'); c5.className='fr-meta'; c5.textContent='—'; row.appendChild(c5);

  var c6=document.createElement('div'); c6.className='fr-pub';
  var more=document.createElement('span'); more.className='fr-more'; more.innerHTML=ICON.more;
  more.addEventListener('click',function(e){
    e.stopPropagation();
    popMenu(this,[
      {icon:ICON.folder16,label:'打开',onClick:function(){location.href=folderUrl(curSpace,f.id);}},
      {label:'重命名',icon:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.8l1.7 1.7c.3.3.3.8 0 1.1L6 12.8l-2.6.7.7-2.6 7.1-7.1a.8.8 0 0 1 1.1 0z" stroke="currentColor" stroke-width="1.2"/></svg>',onClick:function(){startRename(f.id,false);}},
      {divider:true},
      {label:'删除',icon:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.8 4h10.4M5.8 4V2.8a.8.8 0 0 1 .8-.8h2.8a.8.8 0 0 1 .8.8V4M4.2 4l.6 8.6a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9L11.8 4" stroke="#E0564F" stroke-width="1.2"/></svg>',onClick:function(){delItems([key]);}}
    ]);
  });
  c6.appendChild(more); row.appendChild(c6);

  row.addEventListener('click',function(){ if(!renaming) location.href=folderUrl(curSpace,f.id); });
  row.draggable=true;
  row.addEventListener('dragstart',function(e){
    e.dataTransfer.setData('text/shimo-item','folder:'+f.id+':'+f.name);
    e.dataTransfer.effectAllowed='copyLink';
    quickBox.classList.add('dragging');
  });
  return row;
}

function buildDocRow(d){
  var row=document.createElement('div');
  var key='d:'+d.id;
  row.className='tr file-row doc-row'+(selected.has(key)?' selected':'');
  row.dataset.id=d.id;

  var c1=document.createElement('div'); c1.className='fr-ck'; c1.appendChild(makeCk(key)); row.appendChild(c1);

  var c2=document.createElement('div'); c2.className='fr-name';
  c2.innerHTML=ICON.doc;
  var tt=document.createElement('span'); tt.className='doc-title'; tt.textContent=d.title||'未命名文档';
  c2.appendChild(tt); row.appendChild(c2);

  var c3=document.createElement('div'); c3.className='fr-meta'; c3.textContent='我'; row.appendChild(c3);
  var c4=document.createElement('div'); c4.className='fr-meta'; c4.textContent=d.updated_at||''; row.appendChild(c4);
  var c5=document.createElement('div'); c5.className='fr-meta'; c5.textContent=d.size||''; row.appendChild(c5);

  var c6=document.createElement('div'); c6.className='fr-pub';
  var more=document.createElement('span'); more.className='fr-more'; more.innerHTML=ICON.more;
  more.addEventListener('click',function(e){
    e.stopPropagation();
    popMenu(this,[
      {icon:ICON.doc16,label:'打开',onClick:function(){openDocEditor(d.id);}},
      {divider:true},
      {label:'删除',icon:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.8 4h10.4M5.8 4V2.8a.8.8 0 0 1 .8-.8h2.8a.8.8 0 0 1 .8.8V4M4.2 4l.6 8.6a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9L11.8 4" stroke="#E0564F" stroke-width="1.2"/></svg>',onClick:function(){delItems([key]);}}
    ]);
  });
  c6.appendChild(more); row.appendChild(c6);

  row.addEventListener('click',function(){ openDocEditor(d.id); });
  row.draggable=true;
  row.addEventListener('dragstart',function(e){
    e.dataTransfer.setData('text/shimo-item','doc:'+d.id+':'+(d.title||'未命名文档'));
    e.dataTransfer.effectAllowed='copyLink';
    quickBox.classList.add('dragging');
  });
  return row;
}

function render(){
  fileList.innerHTML='';
  var fRows=curFolders(), dRows=curDocs();
  var total=fRows.length+dRows.length;
  fRows.forEach(function(f){ fileList.appendChild(buildFolderRow(f)); });
  dRows.forEach(function(d){ fileList.appendChild(buildDocRow(d)); });

  $('#emptyState').style.display=total?'none':'flex';
  $('#tableHeader').style.display=total?'grid':'none';

  updateCkAll(total); updateDetail(); renderCrumbs(); renderSpaceList();
}

/* ================= 快速访问（拖拽固定，localStorage 持久化） ================= */
var quickBox=$('#quickBox'), quickList=$('#quickList'), quickDrop=$('#quickDrop');
var QUICK_KEY='shimo_quick_access';
function loadQuick(){ try{ return JSON.parse(localStorage.getItem(QUICK_KEY)||'[]'); }catch(e){ return []; } }
function saveQuick(list){ localStorage.setItem(QUICK_KEY,JSON.stringify(list)); }

function renderQuick(){
  var items=loadQuick();
  quickList.innerHTML='';
  if(!items.length){
    var em=document.createElement('li'); em.className='quick-empty'; em.textContent='拖动文件/文件夹到这里固定';
    quickList.appendChild(em);
    return;
  }
  items.forEach(function(it){
    var li=document.createElement('li'); li.className='quick-item';
    var ic=document.createElement('span'); ic.className='q-ic';
    ic.innerHTML= it.type==='folder'?ICON.folder16:ICON.doc16;
    li.appendChild(ic);
    var nm=document.createElement('span'); nm.className='q-name'; nm.textContent=it.name;
    li.appendChild(nm);
    var more=document.createElement('span'); more.className='q-more'; more.innerHTML=ICON.more; more.title='更多';
    more.addEventListener('click',function(e){
      e.stopPropagation();
      popMenu(this,[{label:'移除快速访问',icon:'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M9 1.8L3.4 9h3.4l-.8 5.2L11.8 7H8.4L9 1.8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',onClick:function(){ removeQuick(it); }}]);
    });
    li.appendChild(more);
    li.addEventListener('click',function(){
      if(it.type==='folder') location.href=folderUrl(it.space||curSpace,it.id);
      else openDocEditor(it.id);
    });
    quickList.appendChild(li);
  });
}
function addQuick(item){
  var items=loadQuick();
  if(items.some(function(x){ return x.type===item.type&&String(x.id)===String(item.id); })){ toast('已在快速访问中'); return; }
  items.unshift(item); saveQuick(items); renderQuick(); toast('已添加到快速访问');
}
function removeQuick(item){
  saveQuick(loadQuick().filter(function(x){ return !(x.type===item.type&&String(x.id)===String(item.id)); }));
  renderQuick(); toast('已移除');
}
/* 拖放接收：进入高亮，松手添加 */
quickDrop.addEventListener('dragover',function(e){ e.preventDefault(); e.dataTransfer.dropEffect='copy'; });
quickDrop.addEventListener('drop',function(e){
  e.preventDefault(); quickBox.classList.remove('dragging');
  var raw=e.dataTransfer.getData('text/shimo-item');
  if(!raw) return;
  var p=raw.split(':'); var type=p[0], id=p[1], name=p.slice(2).join(':');
  addQuick({type:type,id:id,name:name,space:curSpace});
});
document.addEventListener('dragend',function(){ quickBox.classList.remove('dragging'); });
document.addEventListener('drop',function(){ quickBox.classList.remove('dragging'); });

/* ================= 面包屑 ================= */
function renderCrumbs(){
  var box=$('#crumbs'); box.innerHTML='';
  var sp=getSpace(curSpace);
  var rootA=document.createElement('a');
  rootA.textContent=sp?sp.name:'我的桌面';
  rootA.addEventListener('click',function(){ location.href=spaceRoot(curSpace); });
  box.appendChild(rootA);
  if(curFolder){
    folderPath(curFolder).forEach(function(p){
      var sep=document.createElement('span'); sep.className='sep'; sep.innerHTML='<svg width="8" height="12" viewBox="0 0 8 12"><path d="M2.5 1.5L6 6l-3.5 4.5" stroke="currentColor" stroke-width="1.2" fill="none"/></svg>';
      box.appendChild(sep);
      var a=document.createElement('a'); a.textContent=p.name;
      a.addEventListener('click',function(){ location.href=folderUrl(curSpace,p.id); });
      box.appendChild(a);
    });
  }
}

/* ================= 侧边空间列表 ================= */
function renderSpaceList(){
  var box=$('#spaceList'); box.innerHTML='';
  spaces.filter(function(s){return s.kind!=='personal';}).forEach(function(s){
    var item=document.createElement('div');
    item.className='nav-item nav-sub'+(String(s.id)===curSpace?' active':'');
    var mark=document.createElement('span'); mark.className='space-mark'; mark.textContent=(s.name||' ').slice(0,1);
    item.appendChild(mark);
    var nm=document.createElement('span'); nm.textContent=s.name;
    nm.style.overflow='hidden'; nm.style.textOverflow='ellipsis'; nm.style.whiteSpace='nowrap';
    item.appendChild(nm);
    var del=document.createElement('span'); del.className='space-del'; del.title='删除空间';
    del.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>';
    del.addEventListener('click',function(e){
      e.stopPropagation();
      if(!confirm('确定删除空间「'+s.name+'」？其中的文档和文件夹将一并删除。')) return;
      EditorAPI.spaces.remove(s.id).then(function(){
        if(String(s.id)===curSpace){ location.href='/'; return; }
        loadSpaces();
      },function(err){ alert(err.message||'删除失败'); });
    });
    item.appendChild(del);
    item.addEventListener('click',function(){ location.href=spaceRoot(s.id); });
    box.appendChild(item);
  });
  $('#navDesktop').classList.toggle('active', (getSpace(curSpace)||{}).kind==='personal');
}

/* ================= 选择 ================= */
function toggleSel(key){
  if(selected.has(key)) selected.delete(key); else selected.add(key);
  render();
}
function updateCkAll(total){
  ckAll.classList.remove('checked','half');
  if(total&&selected.size===total) ckAll.classList.add('checked');
  else if(selected.size>0) ckAll.classList.add('half');
  var showBatch=selected.size>0;
  $('#batchBar').style.display=showBatch?'flex':'none';
  $('#tableHeader').style.display=showBatch?'none':(total?'grid':'none');
  $('#batchCount').textContent='已选 '+selected.size+' 项';
  document.querySelectorAll('#tableHeader .th-sort').forEach(function(th){
    th.classList.remove('asc','desc');
    if(th.dataset.sort===sortKey) th.classList.add(sortAsc?'asc':'desc');
  });
}
ckAll.addEventListener('click',function(){
  var keys=[];
  curFolders().forEach(function(f){keys.push('f:'+f.id);});
  curDocs().forEach(function(d){keys.push('d:'+d.id);});
  var all=keys.length&&keys.every(function(k){return selected.has(k);});
  if(all) keys.forEach(function(k){selected.delete(k);});
  else keys.forEach(function(k){selected.add(k);});
  render();
});
$('#batchCancel').addEventListener('click',function(){ selected.clear(); render(); });

/* ================= 详情面板 ================= */
function metaRow(k,v){
  return '<div class="mrow"><span class="k">'+k+'</span><span class="v">'+v+'</span></div>';
}
function updateDetail(){
  var ph=$('#dpPlaceholder'), ct=$('#dpContent');
  if(selected.size===0){ ph.style.display='flex'; ct.classList.remove('show'); return; }
  ph.style.display='none'; ct.classList.add('show');

  if(selected.size>1){
    $('#dpPreview').innerHTML='<svg width="48" height="48" viewBox="0 0 48 48"><rect x="8" y="12" width="32" height="28" rx="3" fill="#fff" stroke="rgba(65,70,75,.3)" stroke-width="1.5"/></svg>';
    $('#dpTitle').textContent='已选 '+selected.size+' 个项目';
    $('#dpMeta').innerHTML=metaRow('类型','混合');
    $('#dpOpen').style.display='none'; $('#dpRename').style.display='none';
    return;
  }
  $('#dpOpen').style.display='flex';
  var key=selected.values().next().value;
  if(key.indexOf('f:')===0){
    var f=getFolder(key.slice(2));
    $('#dpPreview').innerHTML=ICON.folder;
    $('#dpTitle').textContent=f.name;
    var sp=getSpace(curSpace);
    $('#dpMeta').innerHTML=
      metaRow('类型','文件夹')+
      metaRow('所在空间',sp?sp.name:'—')+
      metaRow('创建时间',f.created_at||'—')+
      metaRow('最近更新',f.updated_at||'—');
    $('#dpRename').style.display='flex';
    $('#dpOpen').textContent='打开';
    $('#dpOpen').onclick=function(){location.href=folderUrl(curSpace,f.id);};
    $('#dpRename').onclick=function(){startRename(f.id,false);};
  }else{
    var d=docs.filter(function(x){return 'd:'+x.id===key;})[0];
    $('#dpPreview').innerHTML=ICON.doc;
    $('#dpTitle').textContent=d.title||'未命名文档';
    $('#dpMeta').innerHTML=
      metaRow('类型','文档')+
      metaRow('创建者','我')+
      metaRow('创建时间',d.created_at||'—')+
      metaRow('最近更新',d.updated_at||'—')+
      metaRow('大小',d.size||'—');
    $('#dpRename').style.display='none';
    $('#dpOpen').textContent='打开';
    $('#dpOpen').onclick=function(){openDocEditor(d.id);};
  }
  $('#dpDel').onclick=function(){ delItems(Array.from(selected)); };
}

/* ================= 删除 ================= */
async function delItems(keys){
  if(!keys.length) return;
  if(!confirm('确定删除选中的 '+keys.length+' 个项目？文件夹内的文档会移到空间根目录。')) return;
  for(var i=0;i<keys.length;i++){
    var k=keys[i];
    if(k.indexOf('f:')===0){ await EditorAPI.folders.remove(k.slice(2)); }
    else{ await EditorAPI.docs.remove(k.slice(2)); }
  }
  selected.clear();
  toast('已删除');
  reloadContext();
}
$('#batchDel').addEventListener('click',function(){ delItems(Array.from(selected)); });

/* ================= 排序 ================= */
document.querySelectorAll('#tableHeader .th-sort').forEach(function(th){
  th.addEventListener('click',function(){
    var k=th.dataset.sort;
    if(sortKey===k) sortAsc=!sortAsc; else { sortKey=k; sortAsc=true; }
    render();
  });
});

/* ================= 搜索（就地过滤） ================= */
$('#searchInput').addEventListener('input',function(){
  var kw=this.value.trim().toLowerCase();
  var vis=0;
  fileList.querySelectorAll('.file-row').forEach(function(row){
    var hit=!kw||(row.querySelector('.doc-title').textContent.toLowerCase().indexOf(kw)>-1);
    row.style.display=hit?'':'none';
    if(hit) vis++;
  });
  $('#emptyState').style.display=vis?'none':'flex';
  $('#tableHeader').style.display=vis?'grid':'none';
});

/* ================= 数据加载 ================= */
async function reloadContext(){
  selected.clear();
  var fParam=curFolder||'root';
  var results=await Promise.all([
    EditorAPI.folders.list(curSpace),
    EditorAPI.docs.list({space:curSpace,folder:fParam})
  ]);
  folders=results[0]; docs=results[1];
  render();
}

async function init(){
  spaces=await EditorAPI.spaces.list();
  if(!getSpace(curSpace)){ curSpace=String(spaces[0]&&spaces[0].id||1); }
  /* 容量：拉一次全量轻量列表统计 */
  var all=await EditorAPI.docs.list();
  var total=0; all.forEach(function(d){ total+=parseSize(d.size); });
  var quota=1073741824;
  var used=total<1048576?(total/1024).toFixed(2)+' KB':(total/1048576).toFixed(2)+' MB';
  $('#capText').textContent=used+'/1 GB';
  $('#capFill').style.width=Math.min(100,total/quota*100)+'%';

  reloadContext();
  renderQuick();
}
init();
})();
