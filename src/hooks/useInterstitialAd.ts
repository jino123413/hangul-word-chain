/**
 * 전면 광고 Hook
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleAdMob } from '@apps-in-toss/web-framework';

interface AdCallback {
  onDismiss?: () => void;
}

export function useInterstitialAd(adGroupId: string) {
  const [loading, setLoading] = useState(true);
  const dismissRef = useRef<(() => void) | undefined>();
  const cleanupRef = useRef<(() => void) | undefined>();

  const loadAd = useCallback(() => {
    setLoading(true);

    try {
      if (!GoogleAdMob || typeof GoogleAdMob.loadAppsInTossAdMob !== 'function') {
        setLoading(false);
        return;
      }

      const isUnsupported = GoogleAdMob.loadAppsInTossAdMob.isSupported?.() === false;
      if (isUnsupported) {
        setLoading(false);
        return;
      }

      cleanupRef.current?.();
      cleanupRef.current = GoogleAdMob.loadAppsInTossAdMob({
        options: { adGroupId },
        onEvent: (event: any) => {
          if (event.type === 'loaded') {
            setLoading(false);
          }
        },
        onError: () => {
          setLoading(false);
        },
      });
    } catch {
      setLoading(false);
    }
  }, [adGroupId]);

  useEffect(() => {
    loadAd();
    return () => {
      cleanupRef.current?.();
    };
  }, [loadAd]);

  const showAd = useCallback(({ onDismiss }: AdCallback = {}) => {
    try {
      if (!GoogleAdMob || typeof GoogleAdMob.showAppsInTossAdMob !== 'function') {
        onDismiss?.();
        return;
      }

      if (loading) {
        onDismiss?.();
        return;
      }

      dismissRef.current = onDismiss;

      GoogleAdMob.showAppsInTossAdMob({
        options: { adGroupId },
        onEvent: (event: any) => {
          if (event.type === 'dismissed' || event.type === 'closed') {
            dismissRef.current?.();
            loadAd();
          }
        },
        onError: () => {
          dismissRef.current?.();
          loadAd();
        },
      });
    } catch {
      onDismiss?.();
    }
  }, [loading, adGroupId, loadAd]);

  return { loading, showAd };
}
