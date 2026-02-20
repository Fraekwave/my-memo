import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface Profile {
  membership_level: 'free' | 'pro';
  max_tabs: number;
  max_tasks: number;
  app_title: string;
}

const DEFAULT_PROFILE: Profile = {
  membership_level: 'free',
  max_tabs: 3,
  max_tasks: 30,
  app_title: '',
};

/**
 * 유저 프로필 & 멤버십 정보 훅
 *
 * - public.profiles 테이블에서 membership_level, max_tabs, max_tasks 조회
 * - userId가 null이면 즉시 기본값(free) 반환
 * - 조회 실패 시 안전 기본값(free) 폴백
 * - isProfileLoading: useTasks가 Pro/Free 분기를 결정하기 전에
 *   완료를 기다릴 수 있도록 노출
 */
export const useProfile = (userId: string | null) => {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  // true on mount so useTasks defers fetching until membership is known
  const [isProfileLoading, setIsProfileLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    if (userId === null) {
      setProfile(DEFAULT_PROFILE);
      setIsProfileLoading(false);
      return;
    }

    setIsProfileLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('membership_level, max_tabs, max_tasks, app_title')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (data) {
        setProfile({
          membership_level: (data.membership_level as 'free' | 'pro') ?? 'free',
          max_tabs: data.max_tabs ?? DEFAULT_PROFILE.max_tabs,
          max_tasks: data.max_tasks ?? DEFAULT_PROFILE.max_tasks,
          app_title: data.app_title ?? '',
        });
      }
    } catch (err) {
      console.error('Profile fetch error:', err);
      setProfile(DEFAULT_PROFILE);
    } finally {
      setIsProfileLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateAppTitle = useCallback(
    async (newTitle: string) => {
      if (!userId) return;
      const trimmed = newTitle.trim();

      // Optimistic update
      setProfile((prev) => ({ ...prev, app_title: trimmed }));

      try {
        const { error } = await supabase
          .from('profiles')
          .update({ app_title: trimmed })
          .eq('id', userId);
        if (error) throw error;
      } catch (err) {
        console.error('updateAppTitle error:', err);
        // Re-fetch to restore correct server state on failure
        fetchProfile();
      }
    },
    [userId, fetchProfile]
  );

  return {
    profile,
    isPro: profile.membership_level === 'pro',
    maxTabs: profile.max_tabs,
    maxTasks: profile.max_tasks,
    appTitle: profile.app_title,
    updateAppTitle,
    isProfileLoading,
  };
};
