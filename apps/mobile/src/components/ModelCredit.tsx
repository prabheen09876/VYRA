import React from 'react';
import { Linking, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { creditLine, type ModelAttribution } from '../lib/attribution';
import { colors, fonts } from '../theme';

// Visible credit for a bundled third-party model. CC BY 4.0 asks for the author, a link to the
// source and the licence, shown to whoever sees the work — so this renders wherever the model does,
// driven by the character's own `attribution` record rather than by a per-screen hardcoded string.
//
// Inline pressable <Text> rather than <Pressable> deliberately: the author and licence are words
// inside a sentence, and wrapping them in views would break the line at every viewport width.

const open = (url: string) => { void Linking.openURL(url).catch(() => undefined); };

function Link({ url, label, children }: React.PropsWithChildren<{ url: string; label: string }>) {
  return <Text accessibilityRole="link" accessibilityLabel={label} accessibilityHint="Opens in your browser"
    onPress={() => open(url)} style={styles.link}>{children}</Text>;
}

export default function ModelCredit({ attribution, style, align = 'right' }: {
  attribution: ModelAttribution;
  style?: StyleProp<ViewStyle>;
  align?: TextStyle['textAlign'];
}) {
  return <View style={style}>
    {/* The plain sentence is the accessible label, so a screen reader hears the credit in one
        piece instead of three disconnected link fragments. */}
    <Text style={[styles.credit, { textAlign: align }]} accessibilityLabel={creditLine(attribution)}>
      3D character model by <Link url={attribution.authorUrl} label={`${attribution.author} on Sketchfab`}>{attribution.author}</Link>
      {' · Licensed under '}<Link url={attribution.licenseUrl} label={`${attribution.license} licence terms`}>{attribution.license}</Link>
      {' · '}<Link url={attribution.sourceUrl} label={`${attribution.title} original model page`}>Source</Link>
    </Text>
  </View>;
}

const styles = StyleSheet.create({
  credit: { fontFamily: fonts.body, color: colors.faint, fontSize: 10, lineHeight: 16 },
  link: { color: colors.muted, textDecorationLine: 'underline' },
});
