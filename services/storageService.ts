import { supabase } from '../lib/supabase';

const BUCKET = 'scene-images';

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
    console.warn(`Storage upload failed for ${path}:`, error.message);
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
