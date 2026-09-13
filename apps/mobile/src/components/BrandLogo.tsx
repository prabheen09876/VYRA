import React from 'react';
import { Image } from 'react-native';

const logo = require('../../../../packages/brand/assets/logo.png');

export default function BrandLogo({ size = 38 }: { size?: number }) {
  return <Image source={logo} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />;
}
