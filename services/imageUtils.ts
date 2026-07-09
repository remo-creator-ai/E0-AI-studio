/**
 * Image input normalization shared by Gemini, Kling, and download flows.
 *
 * Scene images may arrive in three shapes:
 *   1. Supabase HTTPS URL (after autosave uploaded a base64 to Storage)
 *   2. data URI (fresh from Gemini generateContent or a FileReader read)
 *   3. raw base64 (rare, legacy)
 *
 * Anything that posts image bytes to an external API (Gemini inlineData,
 * Kling start_image) must convert URLs to base64 first.
 */

function getMimeTypeFromDataPrefix(input: string): string {
  if (input.startsWith('data:image/jpeg')) return 'image/jpeg';
  if (input.startsWith('data:image/webp')) return 'image/webp';
  return 'image/png';
}

export async function normalizeImageInput(input: string): Promise<{ mimeType: string; base64: string }> {
  if (/^https?:\/\//i.test(input)) {
    const res = await fetch(input);
    if (!res.ok) throw new Error(`Failed to fetch image (${res.status}): ${input}`);
    const blob = await res.blob();
    const mimeType = blob.type || (/\.jpe?g($|\?)/i.test(input) ? 'image/jpeg'
                                : /\.webp($|\?)/i.test(input) ? 'image/webp'
                                : 'image/png');
    const buf = await blob.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
    }
    return { mimeType, base64: btoa(binary) };
  }
  const base64 = input.split(',')[1] || input;
  return { mimeType: getMimeTypeFromDataPrefix(input), base64 };
}

/**
 * Fetches a scene image (URL or data URI) as a Blob, for download/zip.
 */
export async function sceneImageToBlob(imageUrl: string): Promise<Blob | null> {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('data:')) {
    const [header, base64Data] = imageUrl.split(',');
    if (!base64Data) return null;
    const mimeMatch = header.match(/data:([^;]+);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bin = atob(base64Data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  try {
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    return await res.blob();
  } catch (err) {
    console.warn('sceneImageToBlob fetch failed:', err);
    return null;
  }
}
