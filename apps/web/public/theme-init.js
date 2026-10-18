/* Applies the saved colour mode before the page paints, so dark mode never flashes light. */
try {
  var saved = localStorage.getItem('fl-theme');
  if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
} catch {
  /* storage can be blocked; the page then follows the device setting */
}
