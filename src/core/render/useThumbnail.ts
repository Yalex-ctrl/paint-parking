import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';

/**
 * The pictures of the shop cards, drawn once and saved on the phone (in the cache folder, so the system may clear it and they are
 * simply drawn again). A card asks for its picture when it appears on screen; pictures are made one at a time, with a pause between
 * them, so scrolling never stalls. Until a picture is ready the card shows a plain placeholder.
 *
 * What the pictures look like is the game's business: it gives its drawer with `setThumbnailRenderer` (see render/thumbnails.ts).
 */
export type ThumbnailKind = 'ball' | 'paint';

export type ThumbnailRenderer = {
  /** Changes when the look of a picture changes: the pictures saved on the phone are drawn again. */
  version: string;
  png: (kind: ThumbnailKind, id: string) => Uint8Array;
  /** The picture as a data URI (when nothing can be saved on the phone). */
  uri: (kind: ThumbnailKind, id: string) => string;
};

let renderer: ThumbnailRenderer | null = null;
const memory = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

export function setThumbnailRenderer(next: ThumbnailRenderer) {
  renderer = next;
  memory.clear();
}

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function loadThumbnail(kind: ThumbnailKind, id: string): Promise<string | null> {
  const key = `${kind}:${id}`;
  const hit = memory.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    const draw = renderer;
    if (!draw) return null;
    const again = memory.get(key);
    if (again) return again;
    await pause();
    let uri: string;
    try {
      const file = new File(Paths.cache, `thumb-${draw.version}-${kind}-${id}.png`);
      if (!file.exists) {
        file.create({ overwrite: true });
        file.write(draw.png(kind, id));
      }
      uri = file.uri;
    } catch {
      // No disk (or no permission): the picture lives in memory only.
      uri = draw.uri(kind, id);
    }
    memory.set(key, uri);
    return uri;
  });
  queue = job.catch(() => undefined);
  return job;
}

/** The picture of a shop item, or null while it is being prepared. */
export function useThumbnail(kind: ThumbnailKind | 'vehicle', id: string): string | null {
  const k: ThumbnailKind = kind === 'vehicle' ? 'ball' : kind;
  const [uri, setUri] = useState<string | null>(() => memory.get(`${k}:${id}`) ?? null);
  useEffect(() => {
    let alive = true;
    loadThumbnail(k, id).then((u) => alive && u && setUri(u));
    return () => {
      alive = false;
    };
  }, [k, id]);
  return uri;
}
