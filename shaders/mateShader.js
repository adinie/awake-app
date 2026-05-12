import * as THREE from 'three';

// --- 1. The Yerba Mate Liquid (Solid Dark Green) ---
export const liquidMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x1b3312,          // Deep dark green color for the liquid surface
    roughness: 0.3,           // Lowered roughness to make it look wet
    metalness: 0.0,
    clearcoat: 0.5,           // Increased clearcoat for a liquid-like reflection
    clearcoatRoughness: 0.1
});

// --- 2. The Metal Bombilla (Straw) ---
export const strawMaterial = new THREE.MeshStandardMaterial({
    color: 0xe0e0e0,          // Light silver/grey
    metalness: 1.0,           // Fully metallic
    roughness: 0.25           // Slightly brushed metal finish
});

// --- 3. The Procedural Wood/Gourd Material (Cup) ---
export const cupMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,          // Base overridden by shader
    roughness: 0.8,           // Bare wood/gourd finish
    metalness: 0.0,
    clearcoat: 0,             // Slight polish/wax
});

// Inject 3D noise for the organic wood grain
cupMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vPosition;`
    );
    shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vPosition = position;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vPosition;

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
        // 1. Create Wood Grain Rings
        // Adjust the multiplier (e.g., 50.0) based on the scale of your .glb model
        vec3 pos = vPosition * 50.0; 
        
        // Add distortion so the rings look organic, not perfectly round
        float distortion = noise(pos * 0.5) * 5.0; 
        float distFromCenter = length(vPosition.xz) * 100.0;
        
        // Use a sine wave to create the repeating dark/light ring pattern
        float grain = sin(distFromCenter + distortion);
        grain = smoothstep(-0.5, 0.5, grain); // Soften the edges of the grain
        
        // 2. Define Wood Colors (Palo Santo / Dark Oak)
        vec3 darkWood = vec3(0.20, 0.10, 0.05); 
        vec3 lightWood = vec3(0.40, 0.22, 0.12);
        
        vec3 finalColor = mix(darkWood, lightWood, grain);
        
        // 3. Add fine wood pores (high frequency noise)
        float pores = noise(pos * 5.0);
        finalColor = mix(finalColor, darkWood * 0.6, smoothstep(0.7, 1.0, pores) * 0.5);

        vec4 diffuseColor = vec4( finalColor, opacity );
        `
    );
};