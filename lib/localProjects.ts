import type { Project } from '../types';

type LocalProject = Project & { user_id: string; created_at: string; updated_at: string };
const KEY = 'e0-preview-projects-v1';
export function localProjects(): LocalProject[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  const rows: unknown = JSON.parse(raw);
  if (!Array.isArray(rows)) throw new Error('미리보기 프로젝트를 읽을 수 없습니다.');
  return rows as LocalProject[];
}
export function saveLocalProject(userId: string, project: Project) {
  const rows = localProjects();
  const previous = rows.find(p => p.id === project.id);
  const now = new Date().toISOString();
  const next = { ...project, user_id: userId, created_at: previous?.created_at ?? now, updated_at: now };
  // Quota errors must surface to the UI rather than pretending the save succeeded.
  localStorage.setItem(KEY, JSON.stringify([next, ...rows.filter(p => p.id !== project.id)]));
}
export function removeLocalProject(id: string) {
  localStorage.setItem(KEY, JSON.stringify(localProjects().filter(p => p.id !== id)));
}
