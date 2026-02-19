import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Tab } from '@/lib/types';
import { arrayMove } from '@dnd-kit/sortable';
import { ALL_TAB_ID } from './useTasks';

const STORAGE_KEY = 'active_tab_id';

/**
 * Tab CRUD 로직을 관리하는 커스텀 훅
 *
 * - 탭 목록 조회, 추가, 이름 변경, 삭제
 * - 기본 탭 자동 생성 (탭이 하나도 없을 때)
 * - 활성 탭 ID 관리
 * - localStorage로 선택된 탭 유지 (새로고침 시 복원)
 */
export const useTabs = (userId: string | null) => {
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
    if (userId === null) {
      setIsLoading(false);
      setTabs([]);
      setSelectedTabId(null);
      return;
    }
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('tabs')
        .select('*')
        .order('order_index', { ascending: true });

      if (error) throw error;

      let tabsList = data || [];

      // 탭이 하나도 없으면 기본 탭 생성
      if (tabsList.length === 0) {
        const { data: newTab, error: insertError } = await supabase
          .from('tabs')
          .insert([{ title: 'My Memo', user_id: userId }])
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
          // 1) All 탭(-1) 복원
          if (savedTabId === ALL_TAB_ID) return ALL_TAB_ID;
          // 2) 저장된 ID가 유효하면 복원
          if (savedTabId !== null && tabsList.some((t) => t.id === savedTabId)) {
            return savedTabId;
          }
          // 3) 이미 선택된 탭이 유효하면 유지
          if (prev !== null && prev !== ALL_TAB_ID && tabsList.some((t) => t.id === prev)) {
            return prev;
          }
          // 4) 둘 다 아니면 첫 번째 탭
          return tabsList[0].id;
        });
      }
    } catch (err) {
      console.error('탭 불러오기 에러:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, setSelectedTabId]);

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
    // 새 탭은 항상 맨 끝에 추가 — 기존 최대 order_index + 1
    const nextOrderIndex = tabs.length > 0
      ? Math.max(...tabs.map((t) => t.order_index ?? 0)) + 1
      : 0;

    const optimisticTab: Tab = {
      id: -Date.now(),
      title,
      created_at: new Date().toISOString(),
      order_index: nextOrderIndex,
    };

    // 동기적 state update — 호출자의 flushSync에 의해 즉시 DOM에 반영됨
    setTabs((prev) => [...prev, optimisticTab]);
    setSelectedTabId(optimisticTab.id);

    // 서버 동기화 (fire-and-forget — User Gesture 체인 유지를 위해 await하지 않음)
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('tabs')
          .insert([{ title, order_index: nextOrderIndex, ...(userId && { user_id: userId }) }])
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
   *
   * Nearest Neighbor 전략:
   * - 비활성 탭 삭제: 현재 선택 유지 (Passive Delete)
   * - 활성 탭 삭제: 왼쪽 탭 → 오른쪽 탭 → null 순으로 fallback
   */
  const deleteTab = async (id: number) => {
    const previousTabs = tabs;
    const previousSelectedTabId = selectedTabId;
    const deletedIndex = tabs.findIndex((tab) => tab.id === id);
    const remaining = tabs.filter((tab) => tab.id !== id);

    // Optimistic Update
    setTabs(remaining);

    // 활성 탭을 삭제한 경우에만 선택 변경 (Passive Delete: 비활성 탭 삭제 시 유지)
    if (selectedTabId === id && remaining.length > 0) {
      // 왼쪽 탭 우선, 첫 번째 탭이었으면 오른쪽(새 index 0)으로 fallback
      const nextIndex = deletedIndex > 0 ? deletedIndex - 1 : 0;
      setSelectedTabId(remaining[nextIndex].id);
    } else if (selectedTabId === id) {
      setSelectedTabId(null);
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
   * 탭 순서 변경 (Drag & Drop)
   *
   * Optimistic UI:
   * - arrayMove로 즉시 로컬 배열 재정렬
   * - 백그라운드에서 각 탭의 order_index를 서버에 동기화
   * - 실패 시 이전 순서로 롤백
   */
  const reorderTabs = async (activeId: number, overId: number) => {
    const oldIndex = tabs.findIndex((t) => t.id === activeId);
    const newIndex = tabs.findIndex((t) => t.id === overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const previousTabs = tabs;
    const reordered = arrayMove(tabs, oldIndex, newIndex);

    // Optimistic Update — order_index도 로컬에서 재계산
    const reorderedWithIndex = reordered.map((tab, i) => ({
      ...tab,
      order_index: i,
    }));
    setTabs(reorderedWithIndex);

    // 서버 동기화 — 각 탭의 order_index 개별 업데이트
    try {
      const results = await Promise.all(
        reorderedWithIndex.map(({ id, order_index }) =>
          supabase.from('tabs').update({ order_index }).eq('id', id)
        )
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    } catch (err) {
      console.error('탭 순서 변경 에러:', err);
      setTabs(previousTabs);
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
    reorderTabs,
  };
};
