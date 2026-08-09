import { supabase } from '../lib/supabase';

const BUCKET = 'scene-images';

/** 버킷 부재 경고는 세션당 1회만 (씬 수만큼 중복 출력 방지) */
let warnedMissingBucket = false;

/**
 * Check if a string is a base64 data URI
 */
export function isBase64DataUri(url: string | undefined | null): boolean {
  return !!url && url.startsWith('data:');
}

/**
 * Convert base64 data URI to Blob
 */
function base64ToBlob(dataUri: string): Blob {
  const [header, base64Data] = dataUri.split(',');
  const mimeMatch = header.match(/data:([^;]+);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';

  const byteString = atob(base64Data);
  const byteArray = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    byteArray[i] = byteString.charCodeAt(i);
  }
  return new Blob([byteArray], { type: mime });
}

/**
 * Upload a base64 image to Supabase Storage and return the public URL.
 * Returns the original string if it's already a URL or if upload fails.
 */
export async function uploadImageToStorage(
  projectId: string,
  fileName: string,
  base64DataUri: string
): Promise<string> {
  if (!isBase64DataUri(base64DataUri)) return base64DataUri;

  const blob = base64ToBlob(base64DataUri);
  const path = `${projectId}/${fileName}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type });

  if (error) {
    // 버킷 자체가 없으면 모든 씬 업로드가 같은 이유로 실패한다. 씬마다 warn 을
    // 쏟아내면 진짜 원인이 묻히므로 한 번만 크게 알린다.
    // 이 상태에서는 base64 가 projects.scenes 에 그대로 저장돼 행이 비대해지고,
    // hasBase64 게이트가 계속 열려 자동저장마다 업로드를 재시도한다.
    if (/bucket not found/i.test(error.message) && !warnedMissingBucket) {
      warnedMissingBucket = true;
      console.error(
        `[storage] '${BUCKET}' 버킷이 없습니다. supabase/migrations/041_storage_scene_images.sql 을 적용하세요. ` +
        `그때까지 씬 이미지는 base64 로 DB 에 저장됩니다.`,
      );
    } else if (!/bucket not found/i.test(error.message)) {
      console.warn(`Storage upload failed for ${path}:`, error.message);
    }
    return base64DataUri; // Fallback: keep base64
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
  // Append cache-buster: upsert reuses the same path so the public URL is identical
  // to the previous upload. Without a query param, the browser serves the stale
  // cached image and "교체(Upload)" appears to do nothing.
  //
  // INVARIANT: Date.now() means every call returns a new URL even for unchanged
  // bytes. This is safe only because saveProject() short-circuits the upload
  // when !hasBase64 (see projectService.ts:11-18). If that gate is ever removed,
  // useAutoSave will loop — see hooks/useAutoSave.ts:27.
  const sep = urlData.publicUrl.includes('?') ? '&' : '?';
  return `${urlData.publicUrl}${sep}v=${Date.now()}`;
}

/**
 * Process all scenes in a project: upload base64 images to Storage.
 * Returns new scenes array with URLs instead of base64.
 */
export async function uploadProjectImages(
  projectId: string,
  scenes: any[],
  gridImages: (string | null)[]
): Promise<{ scenes: any[]; gridImages: (string | null)[] }> {
  // Upload scene images in parallel
  const scenePromises = scenes.map(async (scene, idx) => {
    const updated = { ...scene };
    if (isBase64DataUri(scene.image_url)) {
      updated.image_url = await uploadImageToStorage(
        projectId,
        `scenes/${scene.id || idx}.png`,
        scene.image_url
      );
    }
    return updated;
  });

  // Upload grid images in parallel
  const gridPromises = gridImages.map(async (img, idx) => {
    if (!img || !isBase64DataUri(img)) return img;
    return await uploadImageToStorage(
      projectId,
      `grid/${idx}.png`,
      img
    );
  });

  const [processedScenes, processedGrid] = await Promise.all([
    Promise.all(scenePromises),
    Promise.all(gridPromises),
  ]);

  return { scenes: processedScenes, gridImages: processedGrid };
}
