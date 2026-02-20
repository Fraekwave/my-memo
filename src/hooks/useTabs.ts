import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Tab } from '@/lib/types';
import { arrayMove } from '@dnd-kit/sortable';
import { ALL_TAB_ID } from './useTasks';

const STORAGE_KEY = 'active_tab_id';

/** Default categories for new users (when DB has no tabs). */
const DEFAULT_TAB_TITLES = ['Job', 'Family', 'Personal'] as const;

export interface UseTabsOptions {
  /** Maximum number of tabs allowed for the user's plan (default: Infinity). */
  maxTabs?: number;
}

/**
 * Tab CRUD 로직을 관리하는 커스텀 훅
 *
 * - 탭 목록 조회 (user_id 필터), 추가, 이름 변경, 삭제
 * - 신규 유저: 기본 탭 (Job, Family, Personal) 자동 생성
 * - "All" 탭: Virtual System Tab (DB 없음, TabBar에서 항상 마지막에 고정)
 * - localStorage로 선택된 탭 유지
 * - maxTabs 초과 시 addTab이 null을 반환 (낙관적 업데이트 차단)
 */
export const useTabs = (userId: string | null, options: UseTabsOptions = {}) => {
  const { maxTabs = Infinity } = options;
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
   * 탭 목록 가져오기 (현재 유저 전용)
   * 탭이 없으면 기본 카테고리(Job, Family, Personal) 자동 생성
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
        .eq('user_id', userId)
        .order('order_index', { ascending: true });

      if (error) throw error;

      let tabsList = data || [];

      // 신규 유저: 기본 카테고리 생성
      if (tabsList.length === 0) {
        const { data: newTabs, error: insertError } = await supabase
          .from('tabs')
          .insert(
            DEFAULT_TAB_TITLES.map((title, i) => ({
              title,
              order_index: i,
              user_id: userId,
            }))
          )
          .select();

        if (insertError) throw insertError;

        tabsList = newTabs || [];
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
   * @returns 생성된 탭의 optimistic ID, 또는 한도 초과 시 null
   */
  const addTab = (title: string = 'New Tab'): number | null => {
    // ── 멤버십 한도 초과 시 낙관적 업데이트 차단 ──
    if (tabs.length >= maxTabs) return null;

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
   * System "All" 탭(id=-1)은 변경 불가
   */
  const updateTab = async (id: number, newTitle: string) => {
    if (id === ALL_TAB_ID || !newTitle.trim() || userId === null) return;

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
        .eq('id', id)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (err) {
      console.error('탭 수정 에러:', err);
      setTabs(previousTabs);
      alert('⚠️ 탭 이름 변경 실패. 다시 시도해주세요.');
    }
  };

  /**
   * 탭 삭제 (Soft Delete Cascade)
   * System "All" 탭(id=-1)은 삭제 불가.
   *
   * 1. 해당 탭의 모든 task를 Soft Delete (deleted_at) → 휴지통으로 이동
   * 2. 탭 레코드 삭제
   * 실패 시 Optimistic UI 롤백
   *
   * Nearest Neighbor 전략:
   * - 비활성 탭 삭제: 현재 선택 유지 (Passive Delete)
   * - 활성 탭 삭제: 왼쪽 탭 → 오른쪽 탭 → null 순으로 fallback
   */
  const deleteTab = async (id: number) => {
    if (id === ALL_TAB_ID || userId === null) return;

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
      const deletedAt = new Date().toISOString();
      const targetTab = tabs.find((t) => t.id === id);
      const targetTabTitle = targetTab?.title ?? 'Recovered';

      // 1. Safe Deportation: 해당 탭의 모든 task를 휴지통으로 (이미 휴지통인 것 포함)
      // last_tab_title 저장 → Intelligent Rebirth 시 탭 재생성용
      const { error: tasksError } = await supabase
        .from('mytask')
        .update({
          deleted_at: deletedAt,
          last_tab_title: targetTabTitle,
        })
        .eq('tab_id', id)
        .eq('user_id', userId);

      if (tasksError) throw tasksError;

      // 2. 탭 삭제
      const { error: tabError } = await supabase
        .from('tabs')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (tabError) throw tabError;

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
   * 탭이 존재하는지 확인, 없으면 생성하여 ID 반환
   * 복구 시 tab이 삭제된 task의 last_tab_title로 탭 재생성용
   */
  const ensureTabExists = useCallback(
    async (title: string): Promise<number> => {
      if (userId === null) throw new Error('No user');

      const existing = tabs.find((t) => t.title === title);
      if (existing) return existing.id;

      const nextOrderIndex =
        tabs.length > 0 ? Math.max(...tabs.map((t) => t.order_index ?? 0)) + 1 : 0;
      const { data, error } = await supabase
        .from('tabs')
        .insert([{ title, order_index: nextOrderIndex, user_id: userId }])
        .select();

      if (error) throw error;
      const newTab = data?.[0];
      if (!newTab) throw new Error('Tab insert failed');

      setTabs((prev) => [...prev, newTab]);
      return newTab.id;
    },
    [userId, tabs]
  );

  /**
   * 탭 순서 변경 (Drag & Drop)
   * System "All" 탭은 SortableContext에 없어 드래그 불가
   *
   * Optimistic UI:
   * - arrayMove로 즉시 로컬 배열 재정렬
   * - 백그라운드에서 각 탭의 order_index를 서버에 동기화
   * - 실패 시 이전 순서로 롤백
   */
  const reorderTabs = async (activeId: number, overId: number) => {
    if (activeId === ALL_TAB_ID || overId === ALL_TAB_ID) return;

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
    if (userId === null) return;

    try {
      const results = await Promise.all(
        reorderedWithIndex.map(({ id, order_index }) =>
          supabase
            .from('tabs')
            .update({ order_index })
            .eq('id', id)
            .eq('user_id', userId)
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
    ensureTabExists,
  };
};
