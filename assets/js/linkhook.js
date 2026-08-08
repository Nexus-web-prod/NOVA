// Nova link hook — injected into every proxied page
// Intercepts target=_blank anchor clicks and routes them through the proxy
// instead of opening a new tab.
(function() {
  'use strict';

  function interceptClick(e) {
    var el = e.target;
    // Walk up the DOM to find an anchor tag
    while (el && el.tagName !== 'A') el = el.parentElement;
    if (!el) return;

    var target = el.getAttribute('target');
    if (!target || target === '_self' || target === '_parent' || target === '_top') return;

    // It's a _blank (or named) target — intercept it
    var href = el.href || el.getAttribute('href');
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('#')) return;

    e.preventDefault();
    e.stopImmediatePropagation();

    // Tell the parent frame to navigate to this URL in the proxy
    try {
      window.parent.open(href, '_self');
    } catch(_) {
      window.open(href, '_self');
    }
  }

  // Use capture phase so we get it before the page's own handlers
  document.addEventListener('click', interceptClick, true);
})();
