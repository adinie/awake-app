import * as THREE from 'three';

// --- 1. The Glass Cup Material ---
export const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.02,          // Very slight smudging on the glass
    transmission: 1.0,        // Fully transparent glass
    ior: 1.5,                 // Index of Refraction for standard glass
    thickness: 0.02,          // Simulates the thickness of the glass wall
    transparent: true,
    side: THREE.DoubleSide
});

// --- 2. The Light Green Tea Liquid Material ---
export const liquidMaterial = new THREE.MeshPhysicalMaterial({
    // A pale light green base tint
    color: 0xe6f7d5,          
    metalness: 0.0,
    
    // The secret to the green tea "haze":
    roughness: 0.08,          // Slightly rough to scatter light inside (suspended particles)
    transmission: 0.92,       // Dropped from 1.0 to make it slightly cloudy/translucent
    
    // Keep the top surface looking like wet liquid despite the internal roughness
    clearcoat: 1.0,           
    clearcoatRoughness: 0.02, 
    
    ior: 1.33,                // Water IOR
    
    // VOLUMETRIC ABSORPTION
    thickness: 0.2,           // Softens the depth effect
    attenuationColor: new THREE.Color('#9add59'), // 📍 CHANGED: Bright, light green
    attenuationDistance: 0.15, // 📍 CHANGED: Increased distance so the green stays very light and luminous
    
    transparent: true
});