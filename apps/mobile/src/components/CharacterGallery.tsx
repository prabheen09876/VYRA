import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import CharacterShowcase from './CharacterShowcase';
import { useScreenFocus } from '../lib/useScreenFocus';

// Same one-frame mount defer as HeroShowcase.tsx, for the same reason: mounting a Canvas in the
// same commit as an outgoing screen's Canvas unmount races react-three-fiber's own mount effect.
export default function CharacterGallery(props: React.ComponentProps<typeof CharacterShowcase>) {
  const focused = useScreenFocus();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!focused) { setReady(false); return; }
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [focused]);
  return focused && ready ? <CharacterShowcase {...props} /> : <View style={props.style} />;
}
