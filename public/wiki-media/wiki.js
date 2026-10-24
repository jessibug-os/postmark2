/* POSTMARK Wiki — hash routing, search, table filters, spoiler control. */
(function () {
  'use strict';

  var pages = function () { return Array.prototype.slice.call(document.querySelectorAll('.page')); };
  var navLinks = function () { return Array.prototype.slice.call(document.querySelectorAll('.sidebar a')); };

  /* ------------------------------------------------------------- routing */
  function show(id) {
    var found = false;
    pages().forEach(function (p) {
      var on = p.id === id;
      p.hidden = !on;
      if (on) found = true;
    });
    if (!found) { show('main'); return; }
    navLinks().forEach(function (a) {
      a.classList.toggle('on', a.getAttribute('href') === '#' + id);
    });
    var h1 = document.querySelector('#' + CSS.escape(id) + ' h1');
    document.title = (h1 ? h1.textContent + ' — ' : '') + 'POSTMARK Wiki';
  }

  function route() {
    var id = (location.hash || '#main').slice(1).split('?')[0];
    show(id || 'main');
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }

  window.addEventListener('hashchange', route);

  /* In-page links to another article should route, not just jump. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var target = document.getElementById(id);
    if (target && target.classList.contains('page')) return; // hashchange handles it
    // Anchor inside the current article: let the browser do its thing.
  });

  /* -------------------------------------------------------------- search */
  var index = [];
  function buildIndex() {
    pages().forEach(function (p) {
      var h1 = p.querySelector('h1');
      var title = h1 ? h1.textContent.trim() : p.id;
      index.push({ id: p.id, title: title, kind: 'page', hay: (title + ' ' + p.textContent).toLowerCase() });
      Array.prototype.forEach.call(p.querySelectorAll('h2, h3'), function (h) {
        var t = h.textContent.replace(/\s+/g, ' ').trim();
        if (t) index.push({ id: p.id, title: t, kind: title, hay: t.toLowerCase() });
      });
      /* Every catalogue row is a searchable entity, the way a real wiki has a
         page per species. Jumping to the table is close enough. */
      Array.prototype.forEach.call(p.querySelectorAll('table.data tbody tr td.name'), function (td) {
        var t = td.textContent.replace(/\s+/g, ' ').trim();
        if (t) index.push({ id: p.id, title: t, kind: title, hay: t.toLowerCase() });
      });
    });
  }

  var search = document.getElementById('search');
  var results = document.getElementById('results');

  function renderResults(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) { results.hidden = true; results.innerHTML = ''; return; }
    var seen = {};
    var hits = [];
    index.forEach(function (row) {
      if (hits.length >= 12) return;
      var pos = row.hay.indexOf(q);
      if (pos === -1) return;
      var key = row.id + '|' + row.title;
      if (seen[key]) return;
      seen[key] = 1;
      hits.push({ row: row, score: (row.title.toLowerCase().indexOf(q) === 0 ? 0 : 1) + pos / 1000 });
    });
    hits.sort(function (a, b) { return a.score - b.score; });
    if (!hits.length) {
      results.innerHTML = '<li class="empty">No page matches “' + q.replace(/[<>&]/g, '') + '”.</li>';
      results.hidden = false;
      return;
    }
    results.innerHTML = hits.map(function (h) {
      return '<li><a href="#' + h.row.id + '">' + h.row.title +
        '<span class="rkind">' + (h.row.kind === 'page' ? 'page' : h.row.kind) + '</span></a></li>';
    }).join('');
    results.hidden = false;
  }

  if (search) {
    search.addEventListener('input', function () { renderResults(search.value); });
    search.addEventListener('focus', function () { renderResults(search.value); });
    document.addEventListener('click', function (e) {
      if (!results.contains(e.target) && e.target !== search) results.hidden = true;
    });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { results.hidden = true; search.blur(); }
      if (e.key === 'Enter') {
        var first = results.querySelector('a');
        if (first) { location.hash = first.getAttribute('href'); results.hidden = true; search.blur(); }
      }
    });
  }

  /* ------------------------------------------------------- table filters */
  function wireFilters() {
    Array.prototype.forEach.call(document.querySelectorAll('.filterbar'), function (bar) {
      var table = document.getElementById(bar.dataset.for);
      if (!table) return;
      var text = bar.querySelector('input');
      var buttons = Array.prototype.slice.call(bar.querySelectorAll('button[data-filter]'));
      var count = bar.querySelector('.filtercount');
      var active = '';

      function apply() {
        var q = (text && text.value || '').trim().toLowerCase();
        var shown = 0, total = 0;
        Array.prototype.forEach.call(table.tBodies[0].rows, function (tr) {
          total++;
          var hay = tr.textContent.toLowerCase();
          var tags = (tr.dataset.tags || '').toLowerCase();
          var ok = (!q || hay.indexOf(q) !== -1) && (!active || tags.indexOf(active) !== -1);
          tr.hidden = !ok;
          if (ok) shown++;
        });
        if (count) count.textContent = shown === total ? total + ' entries' : shown + ' of ' + total + ' shown';
      }

      buttons.forEach(function (b) {
        b.addEventListener('click', function () {
          var f = b.dataset.filter;
          active = (active === f) ? '' : f;
          buttons.forEach(function (o) { o.classList.toggle('on', o.dataset.filter === active); });
          apply();
        });
      });
      if (text) text.addEventListener('input', apply);
      apply();
    });
  }

  /* ------------------------------------------------------------ spoilers */
  var spoilerAll = document.getElementById('spoilerAll');
  if (spoilerAll) {
    var saved = null;
    try { saved = localStorage.getItem('postmark-wiki-spoilers'); } catch (e) { /* private mode */ }
    if (saved === '1') spoilerAll.checked = true;
    var sync = function () {
      Array.prototype.forEach.call(document.querySelectorAll('details.spoilerbox'), function (d) {
        d.open = spoilerAll.checked;
      });
      try { localStorage.setItem('postmark-wiki-spoilers', spoilerAll.checked ? '1' : '0'); } catch (e) { /* ignore */ }
    };
    spoilerAll.addEventListener('change', sync);
    if (spoilerAll.checked) sync();
  }

  buildIndex();
  wireFilters();
  route();
})();
