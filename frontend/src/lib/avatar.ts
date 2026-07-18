// Turns a picked photo into a small square avatar. Whatever the source size
// (a phone camera shot is easily 10+ MB), the stored result is a center-
// cropped 256px JPEG data URL — a few dozen KB — so localStorage stays light
// and the header renders instantly.

const AVATAR_SIZE = 256;
const JPEG_QUALITY = 0.85;
// Refuse absurd inputs outright rather than decoding them.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("could not read the image"));
    img.src = url;
  });
}

export async function fileToAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("not an image");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("image is too large");

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (side === 0) throw new Error("empty image");
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } finally {
    URL.revokeObjectURL(url);
  }
}
