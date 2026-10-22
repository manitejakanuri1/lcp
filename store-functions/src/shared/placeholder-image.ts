export function placeholderImage(seed: string, width = 900, height = 1150): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${width}/${height}`;
}
