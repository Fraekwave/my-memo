// Fix TWA/standalone viewport scale race on Android (Samsung Galaxy etc.)
// This file lives in public/ so Vite copies it as-is to dist/ — inline scripts get stripped.
(function() {
  var VIEWPORT = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

  function stamp() {
    var vp = document.querySelector('meta[name="viewport"]');
    if (!vp) return;
    vp.setAttribute('content', '');
    vp.setAttribute('content', VIEWPORT);
  }

  // 1. Synchronous — runs during head parse
  stamp();

  // 2. After first paint
  requestAnimationFrame(stamp);

  // 3. Delayed — covers slow WebView init on Samsung
  setTimeout(stamp, 100);
  setTimeout(stamp, 500);

  // 4. TWA brought back from background / task-switcher
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') stamp();
  });

  // 5. bfcache restoration
  window.addEventListener('pageshow', function(e) {
    if (e.persisted) stamp();
  });
})();
