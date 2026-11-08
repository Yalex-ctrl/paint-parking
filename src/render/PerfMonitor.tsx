import { useFrame, useThree } from '@react-three/fiber/native';

import { perf } from '../core/render/perf';
import { benchFrame } from '../core/render/bench';
import { traceFrame } from '../core/render/transitionTrace';

const gpu = { programs: 0, geometries: 0, textures: 0 };

/** Inside a Canvas: reports every frame to the frame-rate watch. Renders nothing. */
export function PerfMonitor({ adapt = true, phase }: { adapt?: boolean; phase?: string }) {
  const gl = useThree((s) => s.gl);
  useFrame((_, dt) => {
    if (phase) perf.setPhase(phase);
    perf.frame(dt, gl.info.render.calls, adapt);
    // For the trace of the passage between two levels: what the GPU was given in this frame (see transitionTrace.ts).
    gpu.programs = gl.info.programs?.length ?? 0;
    gpu.geometries = gl.info.memory.geometries;
    gpu.textures = gl.info.memory.textures;
    traceFrame(dt, gpu);
    benchFrame(dt, gpu);
  });
  return null;
}
