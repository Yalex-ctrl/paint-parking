import { useEffect, useState } from 'react';

import { isVip, vipStatus, type VipStatus } from '../game/vip';
import { useProfile } from './profile';

/** The clock the pass is read against: it ticks every half minute, so a pass that ends while the app is open is noticed. */
function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** Whether the VIP pass works right now (paid period or grace). */
export function useIsVip(): boolean {
  const profile = useProfile();
  return isVip(profile.vip, useClock());
}

/** The status of the pass and the time it was read at. */
export function useVipStatus(): { status: VipStatus; now: number } {
  const profile = useProfile();
  const now = useClock();
  return { status: vipStatus(profile.vip, now), now };
}
