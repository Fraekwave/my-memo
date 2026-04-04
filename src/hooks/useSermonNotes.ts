import { useState, useEffect, useCallback, useRef } from 'react';
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

  // Fetch all notes for user
  useEffect(() => {
    if (!userId) {
      setNotes([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchNotes() {
      // Only show spinner if no cached data
      if (!hasCachedData) setIsLoading(true);

      const { data, error } = await supabase
        .from('sermon_notes')
        .select('*')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('date', { ascending: false });

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
    const optimistic: SermonNote = {
      id: -Date.now(),
      user_id: userId,
      date: today,
      pastor: '',
      topic: '',
      bible_ref: '',
      content: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Optimistic insert
    const prev = [...cacheRef.current];
    cacheRef.current = [optimistic, ...cacheRef.current];
    moduleCache = cacheRef.current;
    setNotes(cacheRef.current);

    const { data, error } = await supabase
      .from('sermon_notes')
      .insert({
        user_id: userId,
        date: today,
        pastor: '',
        topic: '',
        bible_ref: '',
        content: '',
      })
      .select()
      .single();

    if (error || !data) {
      // Rollback
      cacheRef.current = prev;
      moduleCache = prev;
      setNotes(prev);
      return null;
    }

    // Replace optimistic with server data
    cacheRef.current = cacheRef.current.map(n => n.id === optimistic.id ? data : n);
    moduleCache = cacheRef.current;
    setNotes(cacheRef.current);
    return data;
  }, [userId]);

  const updateNote = useCallback(async (
    id: number,
    updates: Partial<Pick<SermonNote, 'pastor' | 'topic' | 'bible_ref' | 'content' | 'date'>>
  ): Promise<boolean> => {
    const prev = [...cacheRef.current];

    // Optimistic update
    cacheRef.current = cacheRef.current.map(n =>
      n.id === id ? { ...n, ...updates, updated_at: new Date().toISOString() } : n
    );
    moduleCache = cacheRef.current;
    setNotes(cacheRef.current);

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
  }, []);

  const deleteNote = useCallback(async (id: number): Promise<boolean> => {
    const prev = [...cacheRef.current];

    // Optimistic: soft delete (remove from list)
    cacheRef.current = cacheRef.current.filter(n => n.id !== id);
    moduleCache = cacheRef.current;
    setNotes(cacheRef.current);

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
  }, []);

  return { notes, isLoading, addNote, updateNote, deleteNote };
}
