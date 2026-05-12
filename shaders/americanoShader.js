import * as THREE from 'three';

// --- 1. The Reflective Black Coffee Material ---
export const liquidMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x1a0b02,          // Deep dark coffee brown/black
    metalness: 0.0,
    roughness: 0.05,          // Very low roughness for a wet liquid look
    clearcoat: 1.0,           // Maximum clearcoat for sharp HDRI reflections
    clearcoatRoughness: 0.02
});

// --- 2. The Organic Glazed Ceramic Material ---
export const cupMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xd6c9b8,          // Base earthy beige/cream color
    roughness: 0.7,           // The underlying ceramic is matte
    metalness: 0.0,
    clearcoat: 1.0,           // The thick, shiny glaze layered on top
    clearcoatRoughness: 0.08  // Smooth reflections from the HDRI
});

// Inject 3D noise to create speckles and uneven glaze colors
cupMaterial.onBeforeCompile = (shader) => {
    // Pass 3D position to the fragment shader
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

    // Inject the noise functions and color mixing logic
    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vPosition;

         // Quick 3D Hash for noise generation
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
        // 1. Generate High-Frequency Speckles
        // Scale controls how small the speckles are. Adjust the 500.0 if needed!
        float speckleNoise = noise(vPosition * 500.0); 
        // Only keep the absolute highest peaks of the noise to make isolated dots
        float speckles = smoothstep(0.75, 0.95, speckleNoise); 
        
        // 2. Generate Low-Frequency Glaze Variation (Uneven color)
        float organicNoise = noise(vPosition * 30.0);
        float variation = smoothstep(0.2, 0.8, organicNoise);
        
        // 3. Define our colors
        vec3 baseColor = diffuse;                      // Our earthy beige
        vec3 darkerGlaze = baseColor * 0.8;            // A slightly darker version
        vec3 speckleColor = vec3(0.15, 0.10, 0.05);    // Dark brown speckles
        
        // Mix the base colors for the uneven, handmade look
        vec3 finalColor = mix(baseColor, darkerGlaze, variation);
        
        // Apply the dark speckles on top
        finalColor = mix(finalColor, speckleColor, speckles);
        
        vec4 diffuseColor = vec4( finalColor, opacity );
        `
    );
};