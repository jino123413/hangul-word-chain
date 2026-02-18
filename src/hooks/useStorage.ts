/**
 * 저장소 Hook
 */

import { useState, useEffect, useCallback } from 'react';
import { Storage } from '@apps-in-toss/web-framework';

export function useStorage(key: string) {
  const [value, setValue] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const stored = await Storage.getItem(key);
        setValue(stored ?? '');
      } catch (error) {
        console.error('[Storage] 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [key]);

  const save = useCallback(async (newValue: string) => {
    try {
      await Storage.setItem(key, newValue);
      setValue(newValue);
    } catch (error) {
      console.error('[Storage] 저장 실패:', error);
    }
  }, [key]);

  const remove = useCallback(async () => {
    try {
      await Storage.removeItem(key);
      setValue('');
    } catch (error) {
      console.error('[Storage] 삭제 실패:', error);
    }
  }, [key]);

  return { value, save, remove, loading };
}

export function useJsonStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const stored = await Storage.getItem(key);
        if (stored) {
          setValue(JSON.parse(stored));
        }
      } catch (error) {
        console.error('[Storage] JSON 로드 실패:', error);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [key]);

  const save = useCallback(async (newValue: T) => {
    try {
      await Storage.setItem(key, JSON.stringify(newValue));
      setValue(newValue);
    } catch (error) {
      console.error('[Storage] JSON 저장 실패:', error);
    }
  }, [key]);

  return { value, save, loading };
}
