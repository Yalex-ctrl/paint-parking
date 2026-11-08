import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');

describe('nothing is allocated while the game runs', () => {
  it('no useFrame callback of src builds an object, a closure or an array (scripts/audit-frame-allocations.js prints nothing)', () => {
    const out = execFileSync('node', ['scripts/audit-frame-allocations.js'], { cwd: root, encoding: 'utf8' });
    expect(out.trim()).toBe('');
  });

  it('the per-frame update of the scene uses plain loops only', () => {
    const src = readFileSync(join(root, 'src/render/ParkingScene.ts'), 'utf8');
    const start = src.indexOf('  update(dtRaw: number)');
    const end = src.indexOf('  private updateExit');
    const body = src.slice(start, end);
    expect(body).not.toMatch(/for \(const /);
    expect(body).not.toMatch(/\.(map|filter|forEach|some|slice)\(/);
    expect(body).not.toMatch(/new [A-Z]/);
  });
});
