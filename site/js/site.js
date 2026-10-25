// Tea Rex Woodworks — small progressive enhancements. Page works fully without this file.
(function () {
  // Quote form. Posts to the Cloudflare Worker in worker/ (the action attribute on the form).
  // Without JS the browser posts there directly and comes back to /?sent=1 or /?sent=0&why=...
  var form = document.getElementById('quote-form');
  var status = document.getElementById('form-status');
  if (form) {
    // Timestamp the form so the backend can flag instant bot submissions.
    var stamp = document.getElementById('f-t');
    if (stamp) stamp.value = String(Date.now());

    var messages = {
      ok: 'Sent. You’ll hear back by email.',
      name: 'That didn’t send: please add your name.',
      email: 'That didn’t send: that email address doesn’t look right.',
      details: 'That didn’t send: tell us a little more about the piece (a sentence is plenty).',
      verify: 'That didn’t send: the bot check didn’t pass. Please wait for it to finish and try again.',
      busy: 'That didn’t send: too many requests from this connection. Please wait a few minutes and try again.',
      network: 'That didn’t send: couldn’t reach the server. Check your connection and try again in a minute.',
      other: 'That didn’t send. Check your name, email and details, then try again.'
    };
    function show(kind) {
      status.textContent = messages[kind] || messages.other;
      status.className = 'form-status ' + (kind === 'ok' ? 'is-ok' : 'is-err');
      status.hidden = false;
      if (kind === 'ok') form.reset();
      setTimeout(function () {
        status.scrollIntoView({ block: 'center', behavior: 'auto' });
        status.setAttribute('tabindex', '-1');
        status.focus({ preventScroll: true });
      }, 0);
    }

    // Result message after the no-JS redirect back from the backend.
    var params = new URLSearchParams(location.search);
    var sent = params.get('sent');
    if (sent !== null && status) {
      show(sent === '1' ? 'ok' : (params.get('why') || 'other'));
      history.replaceState(null, '', location.pathname + '#quote-form');
    }

    // Turnstile (bot check) loads only when the form carries a site key. Without one the form
    // works as before and the backend relies on the honeypot, timing and rate limit alone.
    var sitekey = form.getAttribute('data-turnstile-sitekey');
    var slot = document.getElementById('turnstile');
    if (sitekey && slot) {
      window.__trexTurnstile = function () {
        window.turnstile.render(slot, { sitekey: sitekey, theme: 'auto', size: 'flexible' });
      };
      var ts = document.createElement('script');
      ts.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=__trexTurnstile';
      ts.async = true; ts.defer = true;
      document.head.appendChild(ts);
    }

    // With JS: send in the background and show the result in place, so the page never
    // reloads and a failure is visible instead of silent.
    var button = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', function (e) {
      if (!window.fetch || !window.URLSearchParams) return; // old browser: plain POST + redirect
      e.preventDefault();
      if (button) { button.disabled = true; button.textContent = 'Sending…'; }
      status.hidden = true;
      fetch(form.action, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: new URLSearchParams(new FormData(form))
      }).then(function (res) {
        return res.json().catch(function () { return { ok: false, why: 'other' }; });
      }).then(function (r) {
        show(r.ok ? 'ok' : (r.why || 'other'));
      }).catch(function () {
        show('network');
      }).then(function () {
        if (button) { button.disabled = false; button.textContent = 'Send request'; }
        if (stamp) stamp.value = String(Date.now());
        if (window.turnstile && slot && sitekey) window.turnstile.reset(slot);
      });
    });
  }

  // Mobile nav
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    var mq = window.matchMedia('(max-width: 760px)');
    function sync() { nav.hidden = mq.matches; toggle.setAttribute('aria-expanded', 'false'); }
    sync();
    mq.addEventListener ? mq.addEventListener('change', sync) : mq.addListener(sync);
    toggle.addEventListener('click', function () {
      var open = nav.hidden;
      nav.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A' && mq.matches) { nav.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
    });
  }

  // Gallery filters
  var filters = document.querySelectorAll('.filter');
  var pieces = Array.prototype.slice.call(document.querySelectorAll('.piece'));
  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var kind = btn.getAttribute('data-filter');
      filters.forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      pieces.forEach(function (p) {
        p.hidden = kind !== 'all' && p.getAttribute('data-kind') !== kind;
      });
    });
  });

  // Lightbox
  var dlg = document.getElementById('lightbox');
  if (!dlg || typeof dlg.showModal !== 'function') return;
  var img = dlg.querySelector('img');
  var cap = dlg.querySelector('.lightbox-caption');
  var current = -1;

  function visible() { return pieces.filter(function (p) { return !p.hidden; }); }
  function show(i) {
    var list = visible();
    if (!list.length) return;
    current = (i + list.length) % list.length;
    var p = list[current];
    var b = p.querySelector('button');
    img.src = b.getAttribute('data-full');
    img.alt = p.querySelector('img').alt;
    cap.textContent = p.querySelector('strong').textContent + ' — ' + (current + 1) + ' / ' + list.length;
  }
  pieces.forEach(function (p) {
    p.querySelector('button').addEventListener('click', function () {
      show(visible().indexOf(p));
      dlg.showModal();
    });
  });
  dlg.querySelector('[data-prev]').addEventListener('click', function () { show(current - 1); });
  dlg.querySelector('[data-next]').addEventListener('click', function () { show(current + 1); });
  dlg.querySelector('[data-close]').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
  dlg.addEventListener('close', function () { img.removeAttribute('src'); });
})();
