import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// 1. MATTE SPECKLED CUP MATERIAL WITH COLOR DIP
// ─────────────────────────────────────────────────────────────────────────────
export const cappuccinoCupMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf4eee6,          // Warm off-white base color
    roughness: 0.85,          // High roughness for a dry, matte ceramic feel
    metalness: 0.0,
    clearcoat: 0.05,          // Minimal glaze to preserve matte look
    clearcoatRoughness: 0.5
});

// Configuration for the "Dip" effect
const dipSettings = {
    uDipColor:   { value: new THREE.Color('#df90b1') }, // Color of the bottom dip
    uDipLevel:   { value: 0.0025 },                    // Height of the dip (adjust based on model)
    uDipFeather: { value: 0.001 }                      // Sharpness of the transition line
};

cappuccinoCupMaterial.onBeforeCompile = (shader) => {
    // Inject Uniforms
    shader.uniforms.uSpeckleColor = { value: new THREE.Color('#3d2b1f') };
    shader.uniforms.uDipColor    = dipSettings.uDipColor;
    shader.uniforms.uDipLevel    = dipSettings.uDipLevel;
    shader.uniforms.uDipFeather  = dipSettings.uDipFeather;

    // Pass the local vertex position to the fragment shader
    shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vLocalPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vLocalPos = position;`
    );

    // Inject noise functions and Dip logic into the fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uSpeckleColor;
         uniform vec3 uDipColor;
         uniform float uDipLevel;
         uniform float uDipFeather;
         varying vec3 vLocalPos;

         float hash(vec3 p) {
             p = fract(p * vec3(443.897, 441.423, 437.195));
             p += dot(p, p.yxz + 19.19);
             return fract((p.x + p.y) * p.z);
         }

         float noise(vec3 x) {
             vec3 p = floor(x); vec3 f = fract(x);
             f = f * f * (3.0 - 2.0 * f);
             return mix(mix(mix( hash(p+vec3(0,0,0)), hash(p+vec3(1,0,0)),f.x),
                            mix( hash(p+vec3(0,1,0)), hash(p+vec3(1,1,0)),f.x),f.y),
                        mix(mix( hash(p+vec3(0,0,1)), hash(p+vec3(1,0,1)),f.x),
                            mix( hash(p+vec3(0,1,1)), hash(p+vec3(1,1,1)),f.x),f.y),f.z);
         }
        `
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        `
        // 1. Generate fine speckles
        float n = noise(vLocalPos * 1200.0); 
        float speckleMask = smoothstep(0.7, 0.9, n);
        vec3 speckledBase = mix(diffuse, uSpeckleColor, speckleMask * 0.6);

        // 2. Calculate the "Dip" transition line
        float dipFactor = smoothstep(
            uDipLevel - uDipFeather, 
            uDipLevel + uDipFeather, 
            vLocalPos.y
        );
        
        // 3. Final Color: Mix the Dip color (bottom) with the Speckled Base (top)
        vec3 finalColor = mix(uDipColor, speckledBase, dipFactor);
        
        vec4 diffuseColor = vec4( finalColor, opacity );
        `
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. FOAM / LATTE-ART MATERIAL
// ─────────────────────────────────────────────────────────────────────────────
export function createCappuccinoFoamMaterial(foamTexture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0.0 },
      uFoamTex: { value: foamTexture },
      uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.75).normalize() },
      uCameraPos: { value: new THREE.Vector3() },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPos.xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform sampler2D uFoamTex;
      uniform vec3 uLightDir;
      varying vec2 vUv;
      varying vec3 vWorldNormal;

      void main() {
        // Position and Scale Controls
        vec2 offset = vec2(0.33, 0.03);          
        vec2 scale  = vec2(2.8);     
        
        vec2 adjustedUv = (vUv - vec2(0.5) + offset) * scale + vec2(0.5);

        if(adjustedUv.x < 0.0 || adjustedUv.x > 1.0 || adjustedUv.y < 0.0 || adjustedUv.y > 1.0) {
            discard; 
        }

        vec3 baseColor = texture2D(uFoamTex, adjustedUv).rgb;
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uLightDir);
        float NdL = max(dot(N, L), 0.0);
        
        gl_FragColor = vec4(baseColor * (0.4 + NdL * 0.6), 1.0);
      }
    `
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. APPLY FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
export function applyCappuccinoShaders(gltfScene) {
  const loader = new THREE.TextureLoader();
  const foamTexture = loader.load('shader_images/cappuccino_foam.png');

  foamTexture.wrapS = THREE.ClampToEdgeWrapping;
  foamTexture.wrapT = THREE.ClampToEdgeWrapping;

  const foamMat = createCappuccinoFoamMaterial(foamTexture);

  gltfScene.traverse((child) => {
    if (child.isMesh) {
      const name = child.name.toLowerCase();
      if (name.includes('liquid')) {
        child.material = foamMat;
      } else if (name.includes('cup')) {
        child.material = cappuccinoCupMaterial;
      }
    }
  });

  return { foamMat };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. UPDATE UNIFORMS
// ─────────────────────────────────────────────────────────────────────────────
export function updateCappuccinoUniforms(delta, foamMat, camera) {
  if (foamMat.uniforms.uTime) {
    foamMat.uniforms.uTime.value += delta * 0.6;
  }
  
  if (camera) {
    const cp = camera.position;
    if (foamMat.uniforms.uCameraPos) {
      foamMat.uniforms.uCameraPos.value.set(cp.x, cp.y, cp.z);
    }
    if (cappuccinoCupMaterial.uniforms.uCameraPos) {
      cappuccinoCupMaterial.uniforms.uCameraPos.value.set(cp.x, cp.y, cp.z);
    }
  }
}