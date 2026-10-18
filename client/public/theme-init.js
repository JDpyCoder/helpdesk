// Applies the saved theme before first paint, so the page never flashes the wrong one. A file rather than
// an inline script, because the server's Content-Security-Policy blocks inline scripts. Mirrors useTheme in
// src/lib/theme.ts: keep the storage key and the rule in step.
try {
  var theme = localStorage.getItem('helpdesk-theme')
  if (theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark')
  }
} catch (e) {}
