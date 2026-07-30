// Keep profile photos small enough for local mode and inexpensive in shared mode.
const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 420 * 1024;
const MAX_EDGE = 720;

export function isSupportedAvatar(file) {
  return Boolean(file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
}

export async function prepareAvatar(file) {
  if (!isSupportedAvatar(file)) throw new Error('Unsupported image format');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Profile photo must be 5 MB or smaller');

  const source = await readDataUrl(file);
  const image = await loadImage(source);
  const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = 0.84;
  let output = canvas.toDataURL('image/jpeg', quality);
  while (output.length > MAX_OUTPUT_BYTES && quality > 0.45) {
    quality -= 0.1;
    output = canvas.toDataURL('image/jpeg', quality);
  }
  if (output.length > MAX_OUTPUT_BYTES) throw new Error('Profile photo could not be compressed enough');
  return output;
}

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read profile photo'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not process profile photo'));
    image.src = source;
  });
}
