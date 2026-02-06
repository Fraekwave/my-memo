import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Tab } from '@/lib/types';

/**
 * Tab CRUD 로직을 관리하는 커스텀 훅
 *
 * - 탭 목록 조회, 추가, 이름 변경, 삭제
 * - 기본 탭 자동 생성 (탭이 하나도 없을 때)
 * - 활성 탭 ID 관리
 */
export const useTabs = () => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedTabId, setSelectedTabId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * 탭 목록 가져오기
   * 탭이 없으면 기본 탭 'My Memo'를 자동 생성
   */
  const fetchTabs = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('tabs')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      let tabsList = data || [];

      // 탭이 하나도 없으면 기본 탭 생성
      if (tabsList.length === 0) {
        const { data: newTab, error: insertError } = await supabase
          .from('tabs')
          .insert([{ title: 'My Memo' }])
          .select();

        if (insertError) throw insertError;

        tabsList = newTab || [];
      }

      setTabs(tabsList);

      // 활성 탭이 없거나, 현재 활성 탭이 목록에 존재하지 않으면 첫 번째 탭 선택
      if (tabsList.length > 0) {
        setSelectedTabId((prev) => {
          if (prev === null || !tabsList.some((t) => t.id === prev)) {
            return tabsList[0].id;
          }
          return prev;
        });
      }
    } catch (err) {
      console.error('탭 불러오기 에러:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 새 탭 추가
   */
  const addTab = async (title: string = 'New Tab') => {
    // Optimistic: 임시 탭 추가
    const optimisticTab: Tab = {
      id: -Date.now(),
      title,
      created_at: new Date().toISOString(),
    };

    setTabs((prev) => [...prev, optimisticTab]);
    setSelectedTabId(optimisticTab.id);

    try {
      const { data, error } = await supabase
        .from('tabs')
        .insert([{ title }])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        setTabs((prev) =>
          prev.map((tab) => (tab.id === optimisticTab.id ? data[0] : tab))
        );
        setSelectedTabId(data[0].id);
      }
    } catch (err) {
      console.error('탭 추가 에러:', err);
      // 롤백
      setTabs((prev) => prev.filter((tab) => tab.id !== optimisticTab.id));
      // 이전 탭으로 복귀
      setSelectedTabId((prev) => {
        const remaining = tabs.filter((t) => t.id !== optimisticTab.id);
        return remaining.length > 0 ? remaining[0].id : prev;
      });
    }
  };

  /**
   * 탭 이름 변경
   */
  const updateTab = async (id: number, newTitle: string) => {
    if (!newTitle.trim()) return;

    const previousTabs = tabs;

    // Optimistic Update
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === id ? { ...tab, title: newTitle.trim() } : tab
      )
    );

    try {
      const { error } = await supabase
        .from('tabs')
        .update({ title: newTitle.trim() })
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('탭 수정 에러:', err);
      setTabs(previousTabs);
      alert('⚠️ 탭 이름 변경 실패. 다시 시도해주세요.');
    }
  };

  /**
   * 탭 삭제
   * Cascade로 해당 탭의 task도 함께 삭제됨
   */
  const deleteTab = async (id: number) => {
    if (!confirm('정말 이 탭을 삭제하시겠습니까?\n탭에 포함된 모든 할 일도 함께 삭제됩니다.')) {
      return;
    }

    const previousTabs = tabs;
    const previousSelectedTabId = selectedTabId;
    const remaining = tabs.filter((tab) => tab.id !== id);

    // Optimistic Update
    setTabs(remaining);

    // 삭제한 탭이 활성 탭이면 다른 탭 선택
    if (selectedTabId === id) {
      setSelectedTabId(remaining.length > 0 ? remaining[0].id : null);
    }

    try {
      const { error } = await supabase.from('tabs').delete().eq('id', id);

      if (error) throw error;

      // 탭이 전부 삭제되면 기본 탭 재생성
      if (remaining.length === 0) {
        await fetchTabs();
      }
    } catch (err) {
      console.error('탭 삭제 에러:', err);
      setTabs(previousTabs);
      setSelectedTabId(previousSelectedTabId);
      alert('⚠️ 탭 삭제 실패. 다시 시도해주세요.');
    }
  };

  /**
   * 초기 데이터 로드
   */
  useEffect(() => {
    fetchTabs();
  }, [fetchTabs]);

  return {
    tabs,
    selectedTabId,
    setSelectedTabId,
    isLoading,
    addTab,
    updateTab,
    deleteTab,
  };
};
