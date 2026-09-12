/** This file belongs ONLY to the separate custom development build. Never import it into Expo Go. */
import React, { useEffect, useRef } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import { Delegate, RunningMode, usePoseDetection } from 'react-native-mediapipe-posedetection';
import type { PoseFrame } from '@vyra/core';

export interface NativePoseCameraProps {
  active: boolean;
  onFrame(frame: PoseFrame): void;
  onError(message: string): void;
  onTrackingLoss?(): void;
}

/** Adapts the package's documented result bundle into VYRA's shared pose-frame contract. */
export function NativePoseCamera({ active, onFrame, onError, onTrackingLoss }: NativePoseCameraProps) {
  const device = useCameraDevice('front');
  const { hasPermission, requestPermission } = useCameraPermission();
  const lastResult = useRef<number | null>(null), lossSent = useRef(false);
  const viewport = useRef({ width: 0, height: 0 });
  const pose = usePoseDetection(
    {
      onResults: (result, coordinator) => {
        if (!active) return;
        const view = viewport.current;
        if (view.width <= 0 || view.height <= 0) return;
        const frameDims = coordinator.getFrameDims(result);
        lastResult.current = performance.now(); lossSent.current = false;
        onFrame({
          // Version0.4's installed TS types and Android/iOS serializers use this bundle shape.
          // Its README example and TurboModule declaration show an older, conflicting shape.
          // Sensor coordinates can be sideways. Use the package's orientation transform into
          // an unmirrored, uncropped viewport; the shared features preserve scale/translation.
          landmarks: (result.results[0]?.landmarks[0] ?? []).map(landmark => {
            const point = coordinator.convertPoint(frameDims, landmark);
            return { ...landmark, x: point.x / view.width, y: point.y / view.height };
          }),
          width: view.width,
          height: view.height,
          // Callback receipt time is monotonic. Validate native capture latency on the actual device.
          timestamp: performance.now(),
        });
      },
      onError: error => onError(error.message),
    },
    RunningMode.LIVE_STREAM,
    'pose_landmarker_lite.task',
    { numPoses: 1, delegate: Delegate.CPU, shouldOutputSegmentationMasks: false,
      minPoseDetectionConfidence: 0.6, minPosePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6, mirrorMode: 'no-mirror', fpsMode: 10 },
  );
  useEffect(() => { pose.cameraDeviceChangeHandler(device); }, [device, pose.cameraDeviceChangeHandler]);
  useEffect(() => { pose.resizeModeChangeHandler('contain'); }, [pose.resizeModeChangeHandler]);
  useEffect(() => {
    lastResult.current = null; lossSent.current = false;
    if (!active) return;
    // The native package can omit empty-pose callbacks. Invalidate tracking without inventing frames.
    const timer = setInterval(() => {
      if (lastResult.current !== null && performance.now() - lastResult.current > 650 && !lossSent.current) {
        lossSent.current = true; onTrackingLoss?.();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [active, onTrackingLoss]);
  if (!hasPermission) return <View style={styles.permission}><Text style={styles.text}>Native camera permission is required.</Text><Button title="Allow camera" onPress={() => void requestPermission()} /></View>;
  if (!device) return <View style={styles.permission}><Text style={styles.text}>No front camera is available on this device.</Text></View>;
  return <Camera style={StyleSheet.absoluteFill} device={device} isActive={active}
    pixelFormat="rgb" resizeMode="contain"
    frameProcessor={pose.frameProcessor} onLayout={event => {
      const { width, height } = event.nativeEvent.layout;
      if (viewport.current.width > 0 && (viewport.current.width !== width || viewport.current.height !== height)) onTrackingLoss?.();
      viewport.current = { width, height }; pose.cameraViewLayoutChangeHandler(event);
    }}
    onOutputOrientationChanged={pose.cameraOrientationChangedHandler}
    onError={error => onError(error.message)} />;
}
const styles = StyleSheet.create({ permission: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }, text: { color: '#F2F5F8' } });
