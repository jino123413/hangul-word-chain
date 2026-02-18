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
    const styles: Record<string, string> = {
      '--min-height': `${window.innerHeight}px`,
    };

    if (isIOS) {
      Object.assign(styles, {
        '--bottom-padding': `max(env(safe-area-inset-bottom), 20px)`,
        '--top-padding': `max(env(safe-area-inset-top), 20px)`,
      });
    }

    for (const [key, value] of Object.entries(styles)) {
      document.documentElement.style.setProperty(key, value);
    }
  }, []);

  return null;
}
