import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { TITLE_MAX_LENGTH } from '@/lib/constants';

const DEFAULT_TITLE = "Today's Tasks";

const truncateToLimit = (s: string) => s.slice(0, TITLE_MAX_LENGTH);

/**
 * 사용자별 앱 제목 관리 (profiles.app_title)
 * - Optimistic UI: 즉시 반영 후 Supabase 동기화
 * - 빈 입력 시 기본값으로 리셋
 */
export const useAppTitle = (userId: string | null) => {
  const [title, setTitle] = useState(DEFAULT_TITLE);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTitle = useCallback(async () => {
    if (userId === null) {
      setTitle(DEFAULT_TITLE);
      setIsLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('app_title')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      const raw = data?.app_title?.trim();
      const value = raw && raw.length > 0 ? truncateToLimit(raw) : DEFAULT_TITLE;
      setTitle(value);
    } catch (err) {
      console.error('앱 제목 불러오기 에러:', err);
      setTitle(DEFAULT_TITLE);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchTitle();
  }, [fetchTitle]);

  const updateTitle = useCallback(
    async (newTitle: string) => {
      const trimmed = newTitle.trim();
      const displayValue =
        trimmed.length > 0 ? truncateToLimit(trimmed) : DEFAULT_TITLE;
      const previousTitle = title;

      setTitle(displayValue);

      if (userId === null) return;

      try {
        const { error } = await supabase
          .from('profiles')
          .upsert(
            { id: userId, app_title: displayValue },
            { onConflict: 'id' }
          );

        if (error) throw error;
      } catch (err) {
        console.error('앱 제목 저장 에러:', err);
        setTitle(previousTitle);
      }
    },
    [userId, title]
  );

  return { title, updateTitle, isLoading };
};
