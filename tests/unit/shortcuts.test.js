const assert = require('node:assert/strict');

(async () => {
  const {
    getQuickSwitchShortcut,
    getSearchShortcut,
    isApplePlatform,
  } = await import('../../apps/web/src/lib/shortcuts.js');

  assert.equal(getSearchShortcut('MacIntel'), '⌘K');
  assert.equal(getSearchShortcut('iPhone'), '⌘K');
  assert.equal(getSearchShortcut('Win32'), 'Ctrl K');
  assert.equal(getSearchShortcut('Linux x86_64'), 'Ctrl K');
  assert.equal(getQuickSwitchShortcut(4, 'MacIntel'), '⌘4');
  assert.equal(getQuickSwitchShortcut(4, 'Win32'), 'Ctrl 4');
  assert.equal(isApplePlatform('iPad'), true);
  assert.equal(isApplePlatform('Linux x86_64'), false);

  console.log('Platform keyboard-shortcut label checks passed.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
