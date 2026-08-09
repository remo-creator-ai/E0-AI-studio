import { useEffect, useRef, useCallback, useState } from 'react';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { saveProject } from '../services/projectService';
import { isBase64DataUri } from '../services/storageService';
import type { Project } from '../types';

/** 업로드로 base64 → Storage URL 이 된 값만 현재 store 프로젝트 위에 얹는다.
 *  저장 도중 다른 화면이 갱신한 필드(scene.video_url 등)는 그대로 보존된다. */
function mergeUploadedUrls(live: Project, processed: Project): Project {
  const uploadedScene = new Map(processed.scenes.map((s) => [s.id, s.image_url]));
  return {
    ...live,
    scenes: live.scenes.map((s) => {
      const uploaded = uploadedScene.get(s.id);
      // live 가 아직 base64 인 씬만 치환 — 그 사이 다른 이미지로 바뀌었으면 live 우선
      return uploaded && !isBase64DataUri(uploaded) && isBase64DataUri(s.image_url)
        ? { ...s, image_url: uploaded }
        : s;
    }),
    grid_images: live.grid_images.map((g, i) => {
      const uploaded = processed.grid_images[i];
      return uploaded && !isBase64DataUri(uploaded) && isBase64DataUri(g) ? uploaded : g;
    }),
  };
}

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
      //
      // 주의: processedProject 는 저장 시작 시점의 스냅샷에서 파생된다. 업로드가
      // 도는 수 초 사이에 다른 화면이 store 를 갱신했다면(예: 모드 B 가 만료된
      // signed URL 을 재발급해 scene.video_url 을 갱신, 씬 영상 생성 완료) 통째로
      // setProject 하면 그 갱신이 조용히 되돌아간다 — 사용자에겐 "대표로 지정돼
      // 있는데 검은 플레이어" 로 보인다. 그래서 업로드로 실제 바뀐 것(base64 →
      // Storage URL)만 현재 store 값 위에 얹는다.
      if (processedProject) {
        const live = useStore.getState().project;
        const merged: Project = live && live.id === processedProject.id
          ? mergeUploadedUrls(live, processedProject)
          : processedProject;
        setProject(merged);
        // 저장된 내용은 어디까지나 processedProject. merged 에 그 사이 생긴 변경이
        // 섞여 있으면 다음 debounce 에서 그 차이만큼 다시 저장된다.
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
