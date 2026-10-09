'use strict';
(() => {
  const key = 'splintermetrics-transfer-brain-theme';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference = null;
  try { preference = localStorage.getItem(key); } catch {}
  if (!['light', 'dark'].includes(preference)) preference = null;

  function apply() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    const button = document.getElementById('theme-toggle');
    if (button) {
      button.querySelector('.theme-label').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
      button.querySelector('.theme-icon').textContent = theme === 'dark' ? '☀' : '☾';
      button.setAttribute('aria-label', 'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' mode');
    }
  }

  // Apply the stored choice before the stylesheet paints the page.
  apply();
  system.addEventListener('change', () => { if (!preference) apply(); });
  addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      preference = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
      apply();
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('theme-toggle').addEventListener('click', () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    });
    apply();
  });
})();
