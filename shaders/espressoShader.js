import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// 1. IMPROVED CERAMICS CUP MATERIAL (Glazed Look)
// ─────────────────────────────────────────────────────────────────────────────
export const espressoCupMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf4eee6,          // Warm off-white base color
    roughness: 0.15,          // Lower roughness for a smoother glaze feel
    metalness: 0.0,
    clearcoat: 1.0,           // Maximum clearcoat for sharp HDRI reflections
    clearcoatRoughness: 0.05,
    ior: 1.5,                 // Index of Refraction for glazed ceramic
    reflectivity: 0.6
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SOLID FOAM MATERIAL (Direct Texture Mapping)
// ─────────────────────────────────────────────────────────────────────────────
export function createEspressoLiquidMaterial(foamTexture) {
  
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
        
        // OFFSET: 
        // - X (First value): Positive moves image RIGHT, Negative moves LEFT
        // - Y (Second value): Positive moves image UP, Negative moves DOWN
        vec2 offset = vec2(-0.35, -0.3); 

        // SCALE:
        // - Decrease value (< 1.0) to zoom IN and make the image LARGER
        // - Increase value (> 1.0) to zoom OUT and make the image SMALLER
        vec2 scale  = vec2(1.75); 
        
        // =========================================================================
        
        // Apply scale and offset while keeping the image anchored to the center
        vec2 centeredUv = (vUv - vec2(0.5) - offset) * scale + vec2(0.5);

        // Hide texture if it gets pushed outside the boundaries (outputs dark brown)
        if(centeredUv.x < 0.0 || centeredUv.x > 1.0 || centeredUv.y < 0.0 || centeredUv.y > 1.0) {
            gl_FragColor = vec4(0.16, 0.08, 0.03, 1.0); // Edge fallback color
            return;
        }

        // Sample the foam texture directly as a solid
        vec4 texColor = texture2D(uFoamTex, centeredUv);

        // Simple Lighting to give the surface volume
        vec3 N = normalize(vWorldNormal);
        vec3 L = normalize(uLightDir);
        float NdL = max(dot(N, L), 0.0);
        
        // Multiply the base image color by the lighting
        vec3 litColor = texColor.rgb * (0.5 + NdL * 0.5);

        // Add a slight vignette around the edges of the cup so it doesn't look flat
        float dist = distance(vUv, vec2(0.5));
        vec3 finalColor = mix(litColor, litColor * 0.4, smoothstep(0.42, 0.5, dist));

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. APPLY FUNCTION (Connects to app.js)
// ─────────────────────────────────────────────────────────────────────────────
export function applyEspressoShaders(gltfScene) {
  const loader = new THREE.TextureLoader();
  
  // Ensure this path exactly matches where you saved the espresso foam image
  const foamTexture = loader.load('shader_images/espresso_foam.png');

  const liquidMat = createEspressoLiquidMaterial(foamTexture);

  gltfScene.traverse((child) => {
    if (child.isMesh) {
      const name = child.name.toLowerCase();
      
      // Apply the solid foam texture to the liquid surface
      if (name.includes('liquid') || name.includes('foam')) {
        child.material = liquidMat;
        child.castShadow = false;
        child.receiveShadow = false;
      } 
      // Apply glazed ceramic to the cup
      else if (name.includes('cup')) {
        child.material = espressoCupMaterial;
        child.castShadow = true;
        child.receiveShadow = true;
      }
    }
  });

  return { liquidMat };
}