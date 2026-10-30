const detectedPlatform = typeof navigator === 'undefined'
  ? ''
  : navigator.userAgentData?.platform || navigator.platform || '';

export const isApplePlatform = (platformName = detectedPlatform) => /Mac|iPhone|iPad|iPod/i.test(platformName);

export const getSearchShortcut = (platformName = detectedPlatform) => (
  isApplePlatform(platformName) ? '⌘K' : 'Ctrl K'
);

export const getQuickSwitchShortcut = (number, platformName = detectedPlatform) => (
  isApplePlatform(platformName) ? `⌘${number}` : `Ctrl ${number}`
);

export const SEARCH_SHORTCUT = getSearchShortcut();
