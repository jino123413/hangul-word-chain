import { useEffect } from 'react';

function getIsIOS(): boolean {
  try {
    const { getPlatformOS } = require('@apps-in-toss/web-framework');
    return getPlatformOS() === 'ios';
  } catch {
    return false;
  }
}

export function DeviceViewport() {
  useEffect(() => {
    const isIOS = getIsIOS();

    const updateHeight = () => {
      document.documentElement.style.setProperty('--min-height', `${window.innerHeight}px`);
    };

    updateHeight();

    const styles: Record<string, string> = {};

    if (isIOS) {
      Object.assign(styles, {
        '--bottom-padding': `max(env(safe-area-inset-bottom), 20px)`,
        '--top-padding': `max(env(safe-area-inset-top), 20px)`,
      });
    } else {
      // Android: add extra bottom padding for system navigation bar
      Object.assign(styles, {
        '--bottom-padding': '32px',
        '--top-padding': '0px',
      });
    }

    for (const [key, value] of Object.entries(styles)) {
      document.documentElement.style.setProperty(key, value);
    }

    // Listen for viewport resize (e.g., keyboard open/close, navigation bar changes)
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  return null;
}
