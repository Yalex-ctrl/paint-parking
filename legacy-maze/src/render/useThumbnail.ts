import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';

import { THUMB_VERSION, itemThumbnail, thumbnailPng } from './thumbnails';

/**
 * The pictures of the shop cards, drawn once and saved on the phone (in the cache folder, so the system may clear it and
 * they are simply drawn again). A card asks for its picture when it appears on screen; pictures are made one at a time, with
 * a pause between them, so scrolling never stalls. Until a picture is ready the card shows a plain placeholder.
 */
const memory = new Map<string, string>();
let queue: Promise<unknown> = Promise.resolve();

const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function loadThumbnail(kind: 'ball' | 'paint', id: string): Promise<string> {
  const key = `${kind}:${id}`;
  const hit = memory.get(key);
  if (hit) return Promise.resolve(hit);
  const job = queue.then(async () => {
    const again = memory.get(key);
    if (again) return again;
    await pause();
    let uri: string;
    try {
      const file = new File(Paths.cache, `thumb-${THUMB_VERSION}-${kind}-${id}.png`);
      if (!file.exists) {
        file.create({ overwrite: true });
        file.write(thumbnailPng(kind, id));
      }
      uri = file.uri;
    } catch {
      // No disk (or no permission): the picture lives in memory only.
      uri = itemThumbnail(kind, id);
    }
    memory.set(key, uri);
    return uri;
  });
  queue = job.catch(() => undefined);
  return job;
}

/** The picture of a shop item, or null while it is being prepared. */
export function useThumbnail(kind: 'ball' | 'paint', id: string): string | null {
  const [uri, setUri] = useState<string | null>(() => memory.get(`${kind}:${id}`) ?? null);
  useEffect(() => {
    let alive = true;
    loadThumbnail(kind, id).then((u) => alive && setUri(u));
    return () => {
      alive = false;
    };
  }, [kind, id]);
  return uri;
}
