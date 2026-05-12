import * as THREE from 'three';

// 1. Load the texture directly in the shader file
const textureLoader = new THREE.TextureLoader();
// Ensure this path exactly matches where you saved the matcha foam image
const foamTexture = textureLoader.load('shader_images/matcha_foam.png');

// Prevent the texture from repeating if you scale it down
foamTexture.wrapS = THREE.ClampToEdgeWrapping;
foamTexture.wrapT = THREE.ClampToEdgeWrapping;
foamTexture.colorSpace = THREE.SRGBColorSpace;

// 2. The Solid Foam Material (Direct Texture Mapping)
export const liquidMaterial = new THREE.ShaderMaterial({
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
            vec2 offset = vec2(-0.4, 0.0); 

            // SCALE: < 1.0 to zoom IN (make image larger) | > 1.0 to zoom OUT (make image smaller)
            vec2 scale  = vec2(1.2); 
            
            // =========================================================================
            
            // Apply scale and offset while keeping the image anchored to the center
            vec2 centeredUv = (vUv - vec2(0.5) - offset) * scale + vec2(0.5);

            // Base Matcha Green color for the fallback edges (#59913f)
            vec3 matchaBaseColor = vec3(0.35, 0.57, 0.25);

            // Hide texture if it gets pushed outside the boundaries (outputs solid dark matcha)
            if(centeredUv.x < 0.0 || centeredUv.x > 1.0 || centeredUv.y < 0.0 || centeredUv.y > 1.0) {
                gl_FragColor = vec4(matchaBaseColor * 0.8, 1.0); // Slightly darker edge color
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
            vec3 finalColor = mix(litColor, litColor * 0.4, smoothstep(0.40, 0.5, dist));

            gl_FragColor = vec4(finalColor, 1.0);
        }
    `
});