// Tea Rex Woodworks — small progressive enhancements. Page works fully without this file.
(function () {
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
