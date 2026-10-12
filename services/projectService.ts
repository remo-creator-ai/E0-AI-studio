import { MOCK_MODE } from '../lib/mockAuth';
import { localProjects, saveLocalProject, removeLocalProject } from '../lib/localProjects';
import { supabase } from '../lib/supabase';
import type { Project } from '../types';
import { AspectRatio, SceneCount } from '../types';
import { uploadProjectImages, isBase64DataUri } from './storageService';

export async function saveProject(
  userId: string,
  project: Project
): Promise<{ id: string; processedProject: Project | null }> {
  if (MOCK_MODE) { saveLocalProject(userId, project); return { id: project.id, processedProject: null }; }
  // Check if any images need uploading to Storage
  const hasBase64 =
    project.scenes.some((s) => isBase64DataUri(s.image_url)) ||
    project.grid_images.some((g) => isBase64DataUri(g));

  let scenes = project.scenes;
  let gridImages = project.grid_images;

  if (hasBase64 && project.id) {
    const result = await uploadProjectImages(
      project.id,
      project.scenes,
      project.grid_images
    );
    scenes = result.scenes;
    gridImages = result.gridImages;
  }

  const projectData = {
    id: project.id,
    user_id: userId,
    title: project.title,
    key_message: project.key_message || null,
    duration: project.duration,
    style: project.style,
    idea: project.idea,
    scenes: JSON.parse(JSON.stringify(scenes)),
    grid_images: JSON.parse(JSON.stringify(gridImages)),
    layout: project.layout,
    thumbnail: project.thumbnail || null,
    current_stage: project.current_stage || null,
    original_creator_id: project.original_creator_id || userId,
    aspect_ratio: project.aspect_ratio || AspectRatio.LANDSCAPE,
    scene_count: project.scene_count || SceneCount.CUTS_9,
    // migration 042. NULL 이면 각각 DEFAULT_IMAGE_MODEL / 'ko' 로 해석된다.
    image_model: project.image_model || null,
    generation_language: project.generation_language || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('projects')
    .upsert(projectData, { onConflict: 'id' })
    .select('id')
    .single();

  if (error) throw error;

  // Return processed project if images were uploaded (so caller can update store)
  const processedProject = hasBase64
    ? { ...project, scenes, grid_images: gridImages }
    : null;
  return { id: data.id, processedProject };
}

export async function loadProject(projectId: string): Promise<Project | null> {
  if (MOCK_MODE) return localProjects().find(p => p.id === projectId) ?? null;
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (error) {
    console.error('Failed to load project:', error);
    return null;
  }

  // Fetch creator profile separately
  let creatorName: string | null = null;
  let creatorAvatar: string | null = null;
  if (data.original_creator_id) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', data.original_creator_id)
      .single();
    if (profile) {
      creatorName = profile.display_name;
      creatorAvatar = profile.avatar_url;
    }
  }

  return {
    id: data.id,
    title: data.title,
    key_message: data.key_message,
    duration: data.duration,
    style: data.style,
    idea: data.idea,
    scenes: data.scenes as unknown as Project['scenes'],
    grid_images: data.grid_images as unknown as Project['grid_images'],
    layout: data.layout,
    thumbnail: data.thumbnail,
    current_stage: data.current_stage,
    original_creator_id: data.original_creator_id,
    creator_display_name: creatorName,
    creator_avatar_url: creatorAvatar,
    aspect_ratio: ((data as Record<string, unknown>).aspect_ratio as AspectRatio) || AspectRatio.LANDSCAPE,
    scene_count: ((data as Record<string, unknown>).scene_count as unknown as SceneCount) || SceneCount.CUTS_9,
    image_model: ((data as Record<string, unknown>).image_model as Project['image_model']) || undefined,
    generation_language: ((data as Record<string, unknown>).generation_language as Project['generation_language']) || undefined,
  } as Project;
}

/** 프로젝트 제목만 업데이트 (전체 saveProject 는 무거워서 헤더 인라인 편집엔 부적합). */
export async function renameProject(projectId: string, title: string): Promise<void> {
  const clean = title.trim();
  if (!clean) throw new Error('제목이 비어 있습니다.');
  if (MOCK_MODE) { const project = localProjects().find(p => p.id === projectId); if (!project) throw new Error('프로젝트를 찾을 수 없습니다.'); saveLocalProject(project.user_id, { ...project, title: clean }); return; }
  const { error } = await supabase
    .from('projects')
    .update({ title: clean, updated_at: new Date().toISOString() })
    .eq('id', projectId);
  if (error) throw error;
}

export async function deleteProject(projectId: string): Promise<void> {
  if (MOCK_MODE) { removeLocalProject(projectId); return; }
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) throw error;
}

/**
 * 이 id 의 프로젝트가 내 것인지 확인한다.
 *
 * projects 의 RLS 는 SELECT 를 `auth.uid() = user_id` 로 제한하므로
 * "행이 보이면 내 것" 이 그대로 성립한다(001_initial.sql). 관리자용 우회
 * 정책도 없어서 예외가 없다.
 *
 * 조회가 실패하면(네트워크 오류, id 가 UUID 가 아님 등) 소유가 아닌 쪽으로
 * 판단한다 — 남의 행 id 를 그대로 쓰면 자동저장 upsert 가 RLS 42501 로
 * 막혀 저장이 통째로 사라지지만, 사본을 만드는 쪽은 최악이라도 프로젝트가
 * 하나 더 생길 뿐이다.
 */
export async function isOwnProject(projectId: string): Promise<boolean> {
  if (MOCK_MODE) return localProjects().some(p => p.id === projectId);
  const { data, error } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();

  if (error) {
    console.warn('Project ownership check failed:', error.message);
    return false;
  }
  return !!data;
}
