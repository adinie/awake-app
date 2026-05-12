import * as THREE from 'three';


// ======================================================
// GLASS MATERIAL
// ======================================================

export const glassMaterial = new THREE.MeshPhysicalMaterial({

    color: new THREE.Color('#ffffff'),

    transmission: 1.0,
    transparent: true,
    opacity: 0.98,

    ior: 1.52,
    thickness: 0.03,

    roughness: 0.03,
    metalness: 0.0,

    clearcoat: 1.0,
    clearcoatRoughness: 0.03,

    envMapIntensity: 1.5,

    side: THREE.FrontSide,

    // IMPORTANT
    depthWrite: false,
    depthTest: true
});



// ======================================================
// TEA LIQUID MATERIAL
// ======================================================

export const liquidMaterial = new THREE.MeshPhysicalMaterial({

    // IMPORTANT:
    // don't use white here
    color: new THREE.Color('#d9481c'),

    transmission: 0.92,
    transparent: true,
    opacity: 0.95,

    ior: 1.33,

    roughness: 0.08,
    metalness: 0.0,

    clearcoat: 0.3,
    clearcoatRoughness: 0.08,

    // MUCH smaller than before
    thickness: 0.02,

    // Warm amber tea color from reference
    attenuationColor: new THREE.Color('#e25524'),

    // THIS was the main issue making tea black
    attenuationDistance: 1.2,

    envMapIntensity: 0.8,

    side: THREE.FrontSide,

    // IMPORTANT FIXES
    depthWrite: false,
    depthTest: true
});



// ======================================================
// PREP FUNCTION
// ======================================================

export function setupTeaCup(cupMesh, liquidMesh) {

    // Prevent z-fighting
    liquidMesh.scale.set(0.985, 0.985, 0.985);

    // VERY IMPORTANT
    // liquid renders first
    liquidMesh.renderOrder = 0;

    // glass renders after
    cupMesh.renderOrder = 1;

    // shadows
    cupMesh.castShadow = true;
    cupMesh.receiveShadow = true;

    liquidMesh.castShadow = false;
    liquidMesh.receiveShadow = true;
}



// ======================================================
// RENDERER SETUP
// ======================================================

export function setupRenderer(renderer) {

    renderer.outputColorSpace = THREE.SRGBColorSpace;

    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    renderer.toneMappingExposure = 1.15;

    renderer.shadowMap.enabled = true;

    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}