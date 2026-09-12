import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import HeroView from './HeroView';
import { useScreenFocus } from '../lib/useScreenFocus';

// Deferred by a frame so an outgoing screen's Canvas fully unmounts before
// an incoming screen's Canvas mounts; mounting both in the same commit
// races the WebGL canvas ref against react-three-fiber's own mount effect.
export default function HeroShowcase(props: React.ComponentProps<typeof HeroView>) {
  const focused = useScreenFocus();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!focused) { setReady(false); return; }
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [focused]);
  return focused && ready ? <HeroView {...props} /> : <View style={props.style} />;
}
