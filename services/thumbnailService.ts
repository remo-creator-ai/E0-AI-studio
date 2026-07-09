/**
 * Generate a small JPEG thumbnail from a base64 image.
 * Returns a lightweight base64 string (~10-20KB) suitable for project cards.
 */
export function generateThumbnail(
  base64Image: string,
  maxWidth = 320,
  quality = 0.6
): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.height / img.width;
      const width = Math.min(maxWidth, img.width);
      const height = Math.round(width * ratio);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      const thumbnail = canvas.toDataURL('image/jpeg', quality);
      resolve(thumbnail);
    };
    img.onerror = () => resolve(null);
    img.src = base64Image;
  });
}
