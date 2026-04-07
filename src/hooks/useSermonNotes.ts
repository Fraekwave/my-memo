import { useState, useEffect, useCallback, useRef } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { supabase } from '@/lib/supabase';
import { SermonNote } from '@/lib/types';

// Module-level cache: persists across component mounts (mode switches)
let moduleCache: SermonNote[] | null = null;
let moduleCacheUserId: string | null = null;

export function useSermonNotes(userId: string | null) {
  // Initialize from cache if available for this user
  const hasCachedData = userId != null && moduleCacheUserId === userId && moduleCache !== null;
  const [notes, setNotes] = useState<SermonNote[]>(hasCachedData ? moduleCache! : []);
  const [isLoading, setIsLoading] = useState(!hasCachedData);
  const cacheRef = useRef<SermonNote[]>(hasCachedData ? moduleCache! : []);

  // Trash state
  const [deletedNotes, setDeletedNotes] = useState<SermonNote[]>([]);
  const [isTrashLoading, setIsTrashLoading] = useState(false);

  // Sync helper
  const updateCache = useCallback((updater: (prev: SermonNote[]) => SermonNote[]) => {
    setNotes(prev => {
      const next = updater(prev);
      cacheRef.current = next;
      moduleCache = next;
      return next;
    });
  }, []);

  // Fetch all notes for user
  useEffect(() => {
    if (!userId) {
      setNotes([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchNotes() {
      if (!hasCachedData) setIsLoading(true);

      const { data, error } = await supabase
        .from('sermon_notes')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('order_index', { ascending: true });

      if (cancelled) return;

      if (!error && data) {
        cacheRef.current = data;
        moduleCache = data;
        moduleCacheUserId = userId;
        setNotes(data);
      }
      setIsLoading(false);
    }

    fetchNotes();
    return () => { cancelled = true; };
  }, [userId]);

  const addNote = useCallback(async (): Promise<SermonNote | null> => {
    if (!userId) return null;

    const today = new Date().toISOString().split('T')[0];
    const maxOrder = cacheRef.current.reduce((max, n) => Math.max(max, n.order_index ?? 0), -1);
    const optimistic: SermonNote = {
      id: -Date.now(),
      user_id: userId,
      date: today,
      pastor: '',
      topic: '',
      bible_ref: '',
      content: '',
      order_index: maxOrder + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const prev = [...cacheRef.current];
    updateCache(p => [...p, optimistic]);

    const { data, error } = await supabase
      .from('sermon_notes')
      .insert({
        user_id: userId,
        date: today,
        pastor: '',
        topic: '',
        bible_ref: '',
        content: '',
        order_index: maxOrder + 1,
      })
      .select()
      .single();

    if (error || !data) {
      cacheRef.current = prev;
      moduleCache = prev;
      setNotes(prev);
      return null;
    }

    updateCache(p => p.map(n => n.id === optimistic.id ? data : n));
    return data;
  }, [userId, updateCache]);

  const updateNote = useCallback(async (
    id: number,
    updates: Partial<Pick<SermonNote, 'pastor' | 'topic' | 'bible_ref' | 'content' | 'date'>>
  ): Promise<boolean> => {
    const prev = [...cacheRef.current];

    updateCache(p => p.map(n =>
      n.id === id ? { ...n, ...updates, updated_at: new Date().toISOString() } : n
    ));

    const { error } = await supabase
      .from('sermon_notes')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      cacheRef.current = prev;
      moduleCache = prev;
      setNotes(prev);
      return false;
    }

    return true;
  }, [updateCache]);

  const deleteNote = useCallback(async (id: number): Promise<boolean> => {
    const prev = [...cacheRef.current];

    updateCache(p => p.filter(n => n.id !== id));

    const { error } = await supabase
      .from('sermon_notes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      cacheRef.current = prev;
      moduleCache = prev;
      setNotes(prev);
      return false;
    }

    return true;
  }, [updateCache]);

  const reorderNotes = useCallback(async (activeId: number, overId: number) => {
    const current = [...cacheRef.current];
    const oldIndex = current.findIndex(n => n.id === activeId);
    const newIndex = current.findIndex(n => n.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(current, oldIndex, newIndex)
      .map((note, i) => ({ ...note, order_index: i }));

    const prev = [...cacheRef.current];
    updateCache(() => reordered);

    try {
      await Promise.all(
        reordered.map(({ id, order_index }) =>
          supabase.from('sermon_notes')
            .update({ order_index })
            .eq('id', id)
        )
      );
    } catch {
      cacheRef.current = prev;
      moduleCache = prev;
      setNotes(prev);
    }
  }, [updateCache]);

  // Trash: fetch deleted notes (show spinner only on first load)
  const trashFetchedRef = useRef(false);
  const fetchDeletedNotes = useCallback(async () => {
    if (!userId) return;
    if (!trashFetchedRef.current) setIsTrashLoading(true);
    const { data } = await supabase
      .from('sermon_notes')
      .select('*')
      .eq('user_id', userId)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });
    setDeletedNotes(data || []);
    setIsTrashLoading(false);
    trashFetchedRef.current = true;
  }, [userId]);

  // Trash: restore a note
  const restoreNote = useCallback(async (note: SermonNote): Promise<boolean> => {
    const maxOrder = cacheRef.current.reduce((max, n) => Math.max(max, n.order_index ?? 0), -1);

    const { error } = await supabase
      .from('sermon_notes')
      .update({ deleted_at: null, order_index: maxOrder + 1 })
      .eq('id', note.id);

    if (error) return false;

    // Remove from trash list
    setDeletedNotes(prev => prev.filter(n => n.id !== note.id));

    // Add back to active notes
    const restored = { ...note, deleted_at: undefined, order_index: maxOrder + 1 };
    updateCache(p => [...p, restored]);

    return true;
  }, [updateCache]);

  return {
    notes,
    isLoading,
    addNote,
    updateNote,
    deleteNote,
    reorderNotes,
    deletedNotes,
    isTrashLoading,
    fetchDeletedNotes,
    restoreNote,
  };
}
