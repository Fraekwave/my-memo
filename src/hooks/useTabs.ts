import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Tab } from '@/lib/types';

const STORAGE_KEY = 'active_tab_id';

/**
 * Tab CRUD 로직을 관리하는 커스텀 훅
 *
 * - 탭 목록 조회, 추가, 이름 변경, 삭제
 * - 기본 탭 자동 생성 (탭이 하나도 없을 때)
 * - 활성 탭 ID 관리
 * - localStorage로 선택된 탭 유지 (새로고침 시 복원)
 */
export const useTabs = () => {
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [selectedTabId, _setSelectedTabId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // selectedTabId 변경 시 localStorage에도 저장하는 래퍼
  const setSelectedTabId = useCallback((value: number | null | ((prev: number | null) => number | null)) => {
    _setSelectedTabId((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      if (next !== null) {
        localStorage.setItem(STORAGE_KEY, String(next));
      }
      return next;
    });
  }, []);

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

      // localStorage에서 이전에 선택했던 탭 ID 복원
      if (tabsList.length > 0) {
        const savedId = localStorage.getItem(STORAGE_KEY);
        const savedTabId = savedId ? Number(savedId) : null;

        setSelectedTabId((prev) => {
          // 1) 저장된 ID가 유효하면 복원
          if (savedTabId !== null && tabsList.some((t) => t.id === savedTabId)) {
            return savedTabId;
          }
          // 2) 이미 선택된 탭이 유효하면 유지
          if (prev !== null && tabsList.some((t) => t.id === prev)) {
            return prev;
          }
          // 3) 둘 다 아니면 첫 번째 탭
          return tabsList[0].id;
        });
      }
    } catch (err) {
      console.error('탭 불러오기 에러:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * 새 탭 추가 (Synchronous Optimistic Update)
   *
   * 동기적으로 optimistic 탭을 생성하고 ID를 반환합니다.
   * 호출자가 flushSync와 함께 사용하여 iOS User Gesture 체인을 유지할 수 있습니다.
   * 서버 동기화는 백그라운드에서 비동기로 처리합니다.
   *
   * @returns 생성된 탭의 optimistic ID
   */
  const addTab = (title: string = 'New Tab'): number => {
    const optimisticTab: Tab = {
      id: -Date.now(),
      title,
      created_at: new Date().toISOString(),
    };

    // 동기적 state update — 호출자의 flushSync에 의해 즉시 DOM에 반영됨
    setTabs((prev) => [...prev, optimisticTab]);
    setSelectedTabId(optimisticTab.id);

    // 서버 동기화 (fire-and-forget — User Gesture 체인 유지를 위해 await하지 않음)
    void (async () => {
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
    })();

    return optimisticTab.id;
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
