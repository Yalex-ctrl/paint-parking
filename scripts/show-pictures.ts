/** Prints pixel-art pictures as ASCII: `npx tsx scripts/show-pictures.ts 0 7 16`. */
import { PICTURES, drawPicture } from '../src/game/gallery';

for (const i of process.argv.slice(2).map(Number)) {
  console.log(`#${i} ${PICTURES[i].name}`);
  const px = drawPicture(i);
  for (let y = 0; y < 16; y++) {
    console.log(
      Array.from({ length: 16 }, (_, x) => {
        const c = px[y * 16 + x];
        if (c === null) return ' .';
        const lum = ((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11;
        return lum > 190 ? ' o' : lum > 110 ? ' O' : ' #';
      }).join(''),
    );
  }
  console.log();
}
