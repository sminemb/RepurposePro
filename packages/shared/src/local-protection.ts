import { protectionPolicies, type ProtectionAction, type ProtectionDecision } from "./protection";

/** Single-process throttling for explicitly isolated local development only. */
export function createLocalProtection(now: () => number = Date.now) {
  const windows = new Map<string, { count: number; reset: number }>();
  return (action: ProtectionAction, identity: string): ProtectionDecision => {
    const timestamp = now();
    for (const [key, window] of windows) {
      if (window.reset <= timestamp) windows.delete(key);
    }
    const key = JSON.stringify([action, identity]);
    const policy = protectionPolicies[action];
    let window = windows.get(key);
    if (!window && windows.size < 1_000) {
      window = { count: 0, reset: timestamp + Number(policy.window.slice(0, -1)) * 60_000 };
      windows.set(key, window);
    }
    const denied = !window || window.count >= policy.max;
    if (window && !denied) window.count++;
    return {
      isDenied: () => denied,
      isErrored: () => false,
      reason: { isRateLimit: () => true, resetTime: new Date(window?.reset ?? timestamp + 60_000) },
    };
  };
}
