import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { saveProject } from '../services/projectService';

export function useAutoSave() {
  const project = useStore((s) => s.project);
  const setProject = useStore((s) => s.setProject);
  const user = useAuthStore((s) => s.user);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'forbidden'>('idle');
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');

  const save = useCallback(async () => {
    if (!user || !project) return;

    const projectJson = JSON.stringify(project);
    if (projectJson === lastSavedRef.current) return;

    setSaveStatus('saving');
    try {
      const { processedProject } = await saveProject(user.id, project);

      // If images were uploaded to Storage, update store with URL-based project.
      // Storing the processedProject's JSON here prevents the next tick from
      // re-saving the same content — important because uploadImageToStorage
      // adds a ?v=<timestamp> cache-buster, so URLs differ from the input
      // payload. See services/storageService.ts.
      if (processedProject) {
        setProject(processedProject);
        lastSavedRef.current = JSON.stringify(processedProject);
      } else {
        lastSavedRef.current = projectJson;
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: unknown) {
      const pgError = err as { code?: string; message?: string };
      if (pgError.code === '42501' || pgError.message?.includes('row-level security')) {
        console.warn('Auto-save blocked: not project owner');
        setSaveStatus('forbidden');
        return;
      }
      console.error('Auto-save failed:', err);
      setSaveStatus('error');
      try {
        localStorage.setItem(`remo_project_${project.id}`, projectJson);
      } catch (e) {
        // localStorage also failed, ignore
      }
    }
  }, [user, project, setProject]);

  const flush = useCallback(async () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    await save();
  }, [save]);

  useEffect(() => {
    if (!user || !project) return;

    // Clear previous timer
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Debounce: save after 2 seconds of no changes
    timeoutRef.current = setTimeout(save, 2000);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [project, user, save]);

  return { saveStatus, flush };
}
