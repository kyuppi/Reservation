(function () {
  'use strict';

  function getGasUrl() {
    const url = window.APP_CONFIG && window.APP_CONFIG.GAS_WEB_APP_URL;
    if (!url || url.includes('PASTE_YOUR_')) {
      throw new Error('Google Apps ScriptのウェブアプリURLが未設定です。js/config.jsを1回だけ設定してください。');
    }
    return url.replace(/\/+$/, '');
  }

  function makeCallbackName() {
    return '__gas_callback_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }

  function request(action, params) {
    params = params || {};
    return new Promise((resolve, reject) => {
      let url;
      try { url = new URL(getGasUrl()); } catch (error) { reject(error); return; }
      const callback = makeCallbackName();
      url.searchParams.set('action', action);
      url.searchParams.set('callback', callback);
      Object.keys(params).forEach((key) => {
        const value = params[key];
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      });

      const script = document.createElement('script');
      let done = false;
      const cleanup = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[callback]; } catch (_) { window[callback] = undefined; }
      };
      const finish = (fn, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        fn(value);
      };
      window[callback] = (result) => {
        if (!result || result.ok !== true) {
          finish(reject, new Error((result && result.error) || 'APIエラーが発生しました。'));
          return;
        }
        finish(resolve, result.data);
      };
      script.onerror = () => finish(reject, new Error('Google Apps Scriptへ接続できませんでした。公開設定とURLを確認してください。'));
      const timer = setTimeout(() => finish(reject, new Error('通信がタイムアウトしました。')), 20000);
      script.src = url.toString();
      document.head.appendChild(script);
    });
  }

  async function hashPassword(password) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('このブラウザでは安全なパスワードハッシュ機能が利用できません。HTTPSで開いてください。');
    }
    const data = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  window.AppApi = { request, hashPassword };
})();
