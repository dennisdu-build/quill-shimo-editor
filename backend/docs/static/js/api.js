/* =============================================================================
 * api.js — 前后端对接层（统一 API 客户端）
 *
 * 所有页面统一通过 window.EditorAPI 调用后端，集中管理：
 *   1. 接口地址（端点只在此处维护，后端改路径时改这一个文件）
 *   2. 公共请求头与 JSON 序列化
 *   3. 响应解析与错误归一化（非 2xx 抛出带 status 的 Error）
 *
 * 约定：
 *   - JSON 接口：自动带 Content-Type: application/json，body 传对象即可
 *   - 上传接口：传 FormData，客户端不手动设 Content-Type（由浏览器生成 boundary）
 *   - 所有方法均返回 Promise，成功 resolve 为响应体对象，失败 reject(Error)
 * ========================================================================== */
(function () {
  'use strict';

  var BASE = '/api/';

  /* 统一请求入口 */
  function request(path, options) {
    options = options || {};
    var method = options.method || 'GET';
    var headers = {};
    if (options.headers) {
      Object.keys(options.headers).forEach(function (k) { headers[k] = options.headers[k]; });
    }
    var body = options.body;
    /* 非 FormData 的请求体默认按 JSON 发送 */
    if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof FormData)) {
      body = JSON.stringify(body);
      if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
    }

    return fetch(BASE + path, { method: method, headers: headers, body: body }).then(function (resp) {
      /* 无论成功失败都尝试解析 JSON，失败回退为空对象 */
      return resp.json().catch(function () { return {}; }).then(function (data) {
        if (!resp.ok) {
          var err = new Error(data.error || data.detail || ('请求失败（HTTP ' + resp.status + '）'));
          err.status = resp.status;
          err.data = data;
          throw err;
        }
        return data;
      });
    });
  }

  function qs(params) {
    var usp = new URLSearchParams();
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] !== undefined && params[k] !== null) usp.append(k, params[k]);
    });
    var s = usp.toString();
    return s ? ('?' + s) : '';
  }

  window.EditorAPI = {
    /* 暴露底层方法，便于未覆盖的场景直接使用 */
    request: request,

    /* 空间 */
    spaces: {
      list: function () { return request('spaces/'); },
      create: function (name) {
        return request('spaces/create/', { method: 'POST', body: { name: name } });
      },
      remove: function (id) {
        return request('spaces/' + id + '/delete/', { method: 'DELETE' });
      }
    },

    /* 文件夹（自引用树） */
    folders: {
      list: function (spaceId) {
        return request('folders/' + qs({ space: spaceId }));
      },
      create: function (data) {
        return request('folders/create/', { method: 'POST', body: data });
      },
      rename: function (id, name) {
        return request('folders/' + id + '/rename/', { method: 'PUT', body: { name: name } });
      },
      remove: function (id) {
        return request('folders/' + id + '/delete/', { method: 'DELETE' });
      }
    },

    /* 文档 */
    docs: {
      list: function (params) { return request('docs/' + qs(params)); },
      create: function (data) {
        return request('docs/create/', { method: 'POST', body: data || { title: '未命名文档' } });
      },
      get: function (id) { return request('docs/' + id + '/'); },
      /* update 传已序列化好的 JSON 字符串（保存防抖场景复用同一字符串） */
      update: function (id, rawJson) {
        return request('docs/' + id + '/update/', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: rawJson
        });
      },
      remove: function (id) {
        return request('docs/' + id + '/delete/', { method: 'DELETE' });
      },
      /* 页面卸载前兜底保存：sendBeacon 不阻塞关闭 */
      beacon: function (id, rawJson) {
        if (!navigator.sendBeacon) return false;
        return navigator.sendBeacon(
          BASE + 'docs/' + id + '/update/',
          new Blob([rawJson], { type: 'application/json' })
        );
      }
    },

    /* 上传 */
    upload: {
      image: function (formData) { return request('upload/', { method: 'POST', body: formData }); },
      file: function (formData) { return request('upload-file/', { method: 'POST', body: formData }); }
    }
  };
})();
