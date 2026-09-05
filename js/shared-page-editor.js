(function (root) {
  const tokenByPage = {};

  function storageKey(page) {
    return 'vidshare-page-editor-token:' + page;
  }

  function getToken(page) {
    if (tokenByPage[page]) return tokenByPage[page];
    try {
      tokenByPage[page] = root.localStorage.getItem(storageKey(page)) || '';
    } catch (_err) {
      tokenByPage[page] = '';
    }
    return tokenByPage[page];
  }

  function setToken(page, token) {
    tokenByPage[page] = token || '';
    try {
      if (token) root.localStorage.setItem(storageKey(page), token);
      else root.localStorage.removeItem(storageKey(page));
    } catch (_err) {
      // localStorage can be blocked (private mode / iframe); in-memory token still works.
    }
  }

  function headers(page, token) {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (token || getToken(page) || '')
    };
  }

  function verify(page, token) {
    return fetch('/.netlify/functions/verify-page-editor', {
      method: 'POST',
      headers: headers(page, token),
      body: JSON.stringify({ page: page })
    });
  }

  root.PageEditorAuth = {
    storageKey: storageKey,
    getToken: getToken,
    setToken: setToken,
    headers: headers,
    verify: verify
  };
})(typeof window !== 'undefined' ? window : globalThis);
