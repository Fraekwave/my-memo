// Fix TWA/standalone viewport scale race on Android (Samsung Galaxy etc.)
// The WebView ignores the viewport meta on TWA cold start, defaulting to 980px
// desktop layout width. A forced reload makes it re-evaluate properly —
// same reason OAuth redirect "fixes" the scale.
(function() {
  var VIEWPORT = 'width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

  function stamp() {
    var vp = document.querySelector('meta[name="viewport"]');
    if (!vp) return;
    vp.setAttribute('content', '');
    vp.setAttribute('content', VIEWPORT);
  }

  function needsReload() {
    // If layout viewport (innerWidth) is much wider than physical screen,
    // the WebView ignored the viewport meta tag
    return window.innerWidth > window.screen.width * 1.5;
  }

  function forceReload() {
    if (needsReload() && !sessionStorage.getItem('__vp_reloaded')) {
      sessionStorage.setItem('__vp_reloaded', '1');
      location.reload();
    }
  }

  // Try re-stamping first
  stamp();
  requestAnimationFrame(stamp);

  // Check after WebView has settled — if still broken, force reload
  setTimeout(function() {
    stamp();
    forceReload();
  }, 150);

  // Background → foreground: re-stamp + check
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      // Clear reload flag so a fresh background→foreground can retry if needed
      sessionStorage.removeItem('__vp_reloaded');
      stamp();
      setTimeout(forceReload, 150);
    }
  });

  // bfcache restoration
  window.addEventListener('pageshow', function(e) {
    if (e.persisted) {
      sessionStorage.removeItem('__vp_reloaded');
      stamp();
      setTimeout(forceReload, 150);
    }
  });
})();
