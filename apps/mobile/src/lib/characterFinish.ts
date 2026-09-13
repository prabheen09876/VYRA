import { COSMETICS } from '@vyra/core';
import { Color, type Material, MeshStandardMaterial } from 'three';

const ionColor = new Color(COSMETICS.find(item => item.id === 'ion-skin')!.color);

/** Apply only to a private material clone. Texture detail remains visible under the blue finish. */
export function applyIonFinish(material: Material): void {
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.vyraIonColor = { value: ionColor };
    shader.fragmentShader = 'uniform vec3 vyraIonColor;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      float vyraIonLight = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
      vec3 vyraIonFinish = mix(vec3(0.012, 0.022, 0.055), vyraIonColor, clamp(vyraIonLight * 1.65, 0.0, 1.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, vyraIonFinish, 0.94);
    `);
  };
  material.customProgramCacheKey = () => `${previousKey}:vyra-ion-finish-v1`;
  if (material instanceof MeshStandardMaterial) {
    material.metalness = Math.max(material.metalness, 0.18);
    material.roughness = Math.min(material.roughness, 0.6);
    material.emissive.copy(ionColor);
    material.emissiveIntensity = 0.035;
  }
  material.needsUpdate = true;
}
