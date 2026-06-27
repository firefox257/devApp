/* =========================================================
   Custom console capture
   ========================================================= */
const ConsolePanel = (() => {
  const list = document.getElementById('console-list');
  const panel = document.getElementById('console-panel');
  const toggle = document.getElementById('console-toggle');
  const badge = document.getElementById('console-badge');
  const copyBtn = document.getElementById('copy-all');
  const clearBtn = document.getElementById('clear-console');
  const closeBtn = document.getElementById('close-console');

  const entries = [];
  let unread = 0;
  const orig = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  function fmtArgs(args) {
    return args.map(a => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === 'object') {
        try { return JSON.stringify(a, null, 2); }
        catch { return String(a); }
      }
      return String(a);
    }).join(' ');
  }

  function push(level, args) {
    const text = fmtArgs(args);
    const time = new Date().toLocaleTimeString();
    entries.push({ level, text, time });

    const el = document.createElement('div');
    el.className = 'log-entry ' + level;
    el.innerHTML = `<span class="ts">${time}</span><b>[${level.toUpperCase()}]</b> ${escapeHtml(text)}`;
    list.appendChild(el);
    list.scrollTop = list.scrollHeight;

    if (!panel.classList.contains('open')) {
      unread++;
      badge.textContent = unread;
      badge.style.display = 'flex';
    }
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }

  console.log   = (...a) => { orig.log(...a);   push('log',   a); };
  console.warn  = (...a) => { orig.warn(...a);  push('warn',  a); };
  console.error = (...a) => { orig.error(...a); push('error', a); };

  toggle.addEventListener('click', () => {
    panel.classList.add('open');
    unread = 0;
    badge.style.display = 'none';
  });
  closeBtn.addEventListener('click', () => panel.classList.remove('open'));
  clearBtn.addEventListener('click', () => {
    entries.length = 0;
    list.innerHTML = '';
  });
  copyBtn.addEventListener('click', async () => {
    const text = entries.map(e => `[${e.time}] [${e.level.toUpperCase()}] ${e.text}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast('Copied to clipboard ✓');
    } catch (err) {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); ta.remove();
      showToast('Copied ✓');
    }
  });

  return { push };
})();

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 1800);
}