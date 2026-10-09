/* 公共工具函数 —— index.html / folder.html 共用
   通过 <script src="{% static 'js/common.js' %}"></script> 引入，
   挂载到 window.showToast，避免与页面内 toast 变量冲突 */
(function(){
  var toastTimer=null;
  function showToast(msg){
    var t=document.createElement('div');
    t.className='toast';
    t.textContent=msg;
    document.body.appendChild(t);
    requestAnimationFrame(function(){ t.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){
      t.classList.remove('show');
      setTimeout(function(){ t.remove(); },200);
    },1600);
  }
  window.showToast=showToast;
  /* 兼容：如果页面定义了全局 toast，代理过去 */
  window.toast=window.toast||showToast;
})();
