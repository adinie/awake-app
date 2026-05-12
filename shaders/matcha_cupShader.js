import * as THREE from 'three';

// --- The Japanese Glazed Ceramic Material ---
export const cupMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,          // Base overridden by shader
    roughness: 0.1,           // Mostly smooth for the glaze
    metalness: 0.0,
    clearcoat: 0.8,           // Glossy ceramic finish
    clearcoatRoughness: 0.8   // Soft reflections
});

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

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
         varying vec3 vPosition;

         // 3D Hash and Noise functions
         float hash(vec3 p) {
             p = fract(p * vec3(443.897, 441.423, 437.195));
             p += dot(p, p.yxz + 19.19);
             return fract((p.x + p.y) * p.z);
         }

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
        // 1. Generate Organic Glaze Variation & Speckles
        float glazeNoise = noise(vPosition * 25.0);
        float speckles = smoothstep(0.7, 0.9, noise(vPosition * 600.0));
        
        // 2. Define the Colors
        vec3 clayColor = vec3(0.15, 0.12, 0.10);  // Dark raw earthy clay
        vec3 baseGlaze = vec3(0.25, 0.35, 0.20);  // Vibrant Matcha green glaze
        vec3 darkGlaze = vec3(0.12, 0.18, 0.10);  // Darker pooling in the glaze
        vec3 speckleColor = vec3(0.05, 0.06, 0.04);
        
        // 3. Create the uneven "Dripping" edge based on Y height
        // NOTE: Adjust 0.01 and 0.02 based on the actual physical scale of your .glb!
        float dripEdge = smoothstep(
            0.010 + glazeNoise * 0.02, 
            0.020 + glazeNoise * 0.02, 
            vPosition.y
        );
        
        // Mix the glaze colors and add speckles
        vec3 mixedGlaze = mix(darkGlaze, baseGlaze, smoothstep(0.2, 0.8, glazeNoise));
        mixedGlaze = mix(mixedGlaze, speckleColor, speckles);
        
        // Final mix: Clay at the bottom, dripping glaze on top
        vec3 finalColor = mix(clayColor, mixedGlaze, dripEdge);
        
        vec4 diffuseColor = vec4( finalColor, opacity );
        `
    );
};