/**
 * Temporary development bypass for the camera/pose-detection requirement in the Arena flow.
 *
 * This does NOT touch the ML/camera architecture — CaptureFrame, CaptureSurface, the capture web
 * app, and the pose baseline are all untouched and still fully functional. It only controls which
 * *input provider* feeds AppProvider.sendRep/sendTracking during a battle: the real camera
 * (CaptureSurface) or a simulated one (SimulatedCaptureSurface). Both emit the exact same
 * CaptureMessage events into the exact same pathway, so the backend match engine cannot tell the
 * difference and is never bypassed.
 *
 * Enable with EXPO_PUBLIC_ARENA_TEST_MODE=true in apps/mobile/.env, then restart Metro (Expo only
 * inlines EXPO_PUBLIC_* vars at bundle time). Remove that line (or set it to anything else) to
 * fully restore the real camera flow — no code changes needed to turn it back off.
 */
export const ARENA_TEST_MODE = process.env.EXPO_PUBLIC_ARENA_TEST_MODE === 'true';
