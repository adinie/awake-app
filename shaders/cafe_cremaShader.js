import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// 1. DARK SPECKLED CUP MATERIAL (Recreated from image_1b3279.png)
// ─────────────────────────────────────────────────────────────────────────────
export const cafeCremaCupMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x2a2a2a,          // Dark charcoal/black base color
    roughness: 0.4,          // Matte ceramic finish
    metalness: 0.1,           // Slight metallic/cast iron weight
    clearcoat: 0.2,           // Minimal glaze
    clearcoatRoughness: 0.4
});

cafeCremaCupMaterial.onBeforeCompile = (shader) => {
    // Light grey/white speckles for contrast on the dark cup
    shader.uniforms.uSpeckleColor = { value: new THREE.Color('#a0a0a0') };

    // Pass the local vertex position to the fragment shader
    shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>\n varying vec3 vLocalPos;`
    );
    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n vLocalPos = position;`
    );

    // Inject noise functions into the fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uSpeckleColor;
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
        float n = noise(vLocalPos * 1000.0); 
        float speckleMask = smoothstep(0.75, 0.95, n);
        
        // 2. Mix light speckles into the dark base color
        vec3 finalColor = mix(diffuse, uSpeckleColor, speckleMask * 0.8);
        
        vec4 diffuseColor = vec4( finalColor, opacity );
        `
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. SOLID FOAM MATERIAL (Direct Texture Mapping)
// ─────────────────────────────────────────────────────────────────────────────
export function createCafeCremaLiquidMaterial(foamTexture) {
  
  // Prevent the texture from repeating if you scale it down
  foamTexture.wrapS = THREE.ClampToEdgeWrapping;
  foamTexture.wrapT = THREE.ClampToEdgeWrapping;
  foamTexture.colorSpace = THREE.SRGBColorSpace;

  return new THREE.ShaderMaterial({
    uniforms: {
      uFoamTex: { value: foamTexture },
      uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.75).normalize() }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uFoamTex;
      uniform vec3 uLightDir;
      varying vec2 vUv;
      varying vec3 vWorldNormal;

      void main() {
        // =========================================================================
        // 📍 ADJUST POSITION AND SCALE HERE 📍
        // =========================================================================
        
        // OFFSET: Positive X = Right, Negative X = Left | Positive Y = Up, Negative Y = Down
        vec2 offset = vec2(-0.34, -0.04); 

        // SCALE: < 1.0 to zoom IN (make larger) | > 1.0 to zoom OUT (make smaller)
        vec2 scale  = vec2(2.45); 
        
        // =========================================================================
        
        // Apply scale and offset while keeping the image anchored to the center
        vec2 centeredUv = (vUv - vec2(0.5) - offset) * scale + vec2(0.5);

        // Hide texture if it gets pushed outside the boundaries (outputs a rich dark coffee color)
        if(centeredUv.x < 0.0 || centeredUv.x > 1.0 || centeredUv.y < 0.0 || centeredUv.y > 1.0) {
            gl_FragColor = vec4(0.20, 0.09, 0.04, 1.0); // Edge fallback color
            return;
        }

        // Sample the foam texture directly as a solid
        vec4 texColor = texture2D(uFoamTex, centeredUv);

        // Simple Lighting to give the surface volume
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uLightDir);
        float NdL = max(dot(N, L), 0.0);
        
        // Multiply the base image color by the lighting
        vec3 litColor = texColor.rgb * (0.6 + NdL * 0.4);

        // Add a slight vignette around the edges of the cup so it doesn't look flat
        float dist = distance(vUv, vec2(0.5));
        vec3 finalColor = mix(litColor, litColor * 0.3, smoothstep(0.40, 0.5, dist));

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. APPLY FUNCTION (Connects to app.js)
// ─────────────────────────────────────────────────────────────────────────────
export function applyCafeCremaShaders(gltfScene) {
  const loader = new THREE.TextureLoader();
  
  // Ensure this path exactly matches where you saved the cafe crema foam image
  const foamTexture = loader.load('shader_images/cafe_crema_foam.png');

  const liquidMat = createCafeCremaLiquidMaterial(foamTexture);

  gltfScene.traverse((child) => {
    if (child.isMesh) {
      const name = child.name.toLowerCase();
      
      // Apply the solid foam texture to the liquid surface
      if (name.includes('liquid') || name.includes('foam')) {
        child.material = liquidMat;
        child.castShadow = false;
        child.receiveShadow = false;
      } 
      // Apply dark speckled ceramic to the cup
      else if (name.includes('cup')) {
        child.material = cafeCremaCupMaterial;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    }
  });

  return { liquidMat };
}