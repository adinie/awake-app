import * as THREE from 'three';

// --- 1. The Swirling Procedural Coffee Liquid Material ---
export const liquidMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0.0 },
    uColorDark: { value: new THREE.Color('#2a1508') }, 
    uColorLight: { value: new THREE.Color('#d8a16d') } 
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColorDark;
    uniform vec3 uColorLight;
    varying vec2 vUv;

    // Procedural random and noise functions
    float random (in vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
    }

    float noise (in vec2 st) {
      vec2 i = floor(st);
      vec2 f = fract(st);
      float a = random(i);
      float b = random(i + vec2(1.0, 0.0));
      float c = random(i + vec2(0.0, 1.0));
      float d = random(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }

    void main() {
      // Scale of the noise
      vec2 pos = vUv * 8.0; 
      
      // Generate swirling noise using uTime
      float n = noise(pos + uTime * 0.2);
      n += 0.5 * noise(pos * 2.0 - uTime * 0.15);
      
      // Mix between dark coffee and lighter crema swirls
      vec3 color = mix(uColorDark, uColorLight, smoothstep(0.2, 0.8, n));
      
      // Add a vignette effect so it gets darker where it touches the cup edges
      float dist = distance(vUv, vec2(0.5));
      color = mix(color, uColorDark, smoothstep(0.35, 0.5, dist));

      gl_FragColor = vec4(color, 1.0);
    }
  `
});

// --- 2. The Procedural "Dipped" Speckled Ceramic Material ---
export const cupMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,          // Base color (overridden by shader)
    roughness: 0.4,           // Matte/satin ceramic finish
    metalness: 0.0,
    clearcoat: 0.6,           // Slight glaze over the whole cup
    clearcoatRoughness: 0.1
});

// These uniforms allow you to easily tweak the dip in your code
const dipUniforms = {
    uDipColor: { value: new THREE.Color('#3b6e8c') }, 
    uBaseColor: { value: new THREE.Color('#fbfaf7') }, // Off-white top half
    uDipLevel: { value: 0.065 }, 
    uDipFeather: { value: 0.001 } 
};

cupMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uDipColor = dipUniforms.uDipColor;
    shader.uniforms.uBaseColor = dipUniforms.uBaseColor;
    shader.uniforms.uDipLevel = dipUniforms.uDipLevel;
    shader.uniforms.uDipFeather = dipUniforms.uDipFeather;

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

    // Inject the noise functions and uniforms into the fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uDipColor;
         uniform vec3 uBaseColor;
         uniform float uDipLevel;
         uniform float uDipFeather;
         varying vec3 vLocalPos;

         // 3D Hash
         float hash(vec3 p) {
             p = fract(p * vec3(443.897, 441.423, 437.195));
             p += dot(p, p.yxz + 19.19);
             return fract((p.x + p.y) * p.z);
         }

         // 3D Value Noise
         float noise(vec3 x) {
             vec3 p = floor(x);
             vec3 f = fract(x);
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
        // 1. Generate high-frequency noise for speckles
        float speckleNoise = noise(vLocalPos * 800.0); 
        
        // 2. Threshold the noise to create isolated, sharp dots (0.70 gives more speckles)
        float speckles = smoothstep(0.70, 0.95, speckleNoise); 
        
        // 3. Define the speckle color (dark brown/black)
        vec3 speckleColor = vec3(0.15, 0.10, 0.08);
        
        // 4. Mix speckles ONLY onto the top base color
        vec3 speckledBase = mix(uBaseColor, speckleColor, speckles);

        // 5. Calculate the horizontal split line
        float mixFactor = smoothstep(
            uDipLevel - uDipFeather, 
            uDipLevel + uDipFeather, 
            vLocalPos.y
        );
        
        // 6. Mix the bottom (dip) and top (speckled base) colors
        vec3 finalColor = mix(uDipColor, speckledBase, mixFactor);
        
        vec4 diffuseColor = vec4( finalColor, opacity );
        `
    );
};