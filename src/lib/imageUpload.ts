const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']);
const MAX_RAW_FILE_BYTES = 8 * 1024 * 1024; // 8 MB raw file cap
const MAX_PASSTHROUGH_GIF_BYTES = 1.5 * 1024 * 1024; // 1.5 MB animated GIF cap

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read image file.'));
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Invalid or corrupted image file.'));
    img.src = src;
  });
}

/**
 * Validates and normalizes a user-selected image into a compact, square data URL
 * suitable for profile pictures and server icons.
 */
export async function processImageUpload(file: File, targetSize = 256): Promise<string> {
  const mime = (file.type || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    throw new Error('Please choose a PNG, JPG, WebP, or GIF image.');
  }
  if (file.size > MAX_RAW_FILE_BYTES) {
    throw new Error('Image is too large. Please select an image under 8 MB.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);

  // Preserve animated GIFs when reasonably sized
  if (mime === 'image/gif' && file.size <= MAX_PASSTHROUGH_GIF_BYTES) {
    return rawDataUrl;
  }

  const img = await loadImage(rawDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Unable to process image in this browser.');
  }

  // Center-crop square
  const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const sx = Math.max(0, Math.floor(((img.naturalWidth || img.width) - side) / 2));
  const sy = Math.max(0, Math.floor(((img.naturalHeight || img.height) - side) / 2));
  ctx.clearRect(0, 0, targetSize, targetSize);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);

  const outputType = mime === 'image/png' ? 'image/png' : 'image/jpeg';
  let result = canvas.toDataURL(outputType, 0.88);
  // If PNG is still oversized, compress to JPEG
  if (result.length > 600_000) {
    result = canvas.toDataURL('image/jpeg', 0.82);
  }
  return result;
}
