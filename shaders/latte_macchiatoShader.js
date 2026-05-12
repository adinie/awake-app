import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// 1. GLASS MATERIAL
//    Fresnel rim opacity + vertical highlight streaks + cool tint.
//    FrontSide only — culls the interior faces so the liquid is unobstructed.
// ─────────────────────────────────────────────────────────────────────────────
export const glassMaterial = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite:  false,           // let liquid show through
  side:        THREE.FrontSide,
  blending:    THREE.NormalBlending,

  uniforms: {
    uCameraPos:    { value: new THREE.Vector3() },
    uGlassTint:    { value: new THREE.Color('#bdd4e0') },  // cool blue-grey
    uReflectColor: { value: new THREE.Color('#e8f4ff') },  // edge reflection
    uRimStrength:  { value: 0.55 },
  },

  vertexShader: /* glsl */`
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    varying vec2 vUv;

    void main() {
      vUv          = uv;
      vec4 wPos    = modelMatrix * vec4(position, 1.0);
      vWorldPos    = wPos.xyz;
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      gl_Position  = projectionMatrix * viewMatrix * wPos;
    }
  `,

  fragmentShader: /* glsl */`
    uniform vec3  uCameraPos;
    uniform vec3  uGlassTint;
    uniform vec3  uReflectColor;
    uniform float uRimStrength;

    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;
    varying vec2 vUv;

    void main() {
      vec3  N     = normalize(vWorldNormal);
      vec3  V     = normalize(uCameraPos - vWorldPos);
      float NdotV = max(dot(N, V), 0.0);

      // Fresnel — grazing angle = more opaque / reflective
      float fresnel = pow(1.0 - NdotV, 2.8);

      // Subtle vertical highlight streaks (two opposite specular bands)
      float angle   = vUv.x * 6.2832;                    // 0→2π around circumference
      float streak1 = exp(-40.0 * pow(sin(angle + 0.4), 2.0));
      float streak2 = exp(-40.0 * pow(sin(angle + 3.5), 2.0));
      float streaks = (streak1 + streak2) * 0.18;

      // Base glass colour + Fresnel edge reflection
      vec3 color = mix(uGlassTint, uReflectColor, fresnel * 0.65);
      color      = mix(color, vec3(1.0), streaks);

      // Alpha: nearly transparent at centre, more visible at rim
      float alpha = 0.04 + fresnel * uRimStrength + streaks * 0.25;
      alpha = clamp(alpha, 0.0, 0.88);

      gl_FragColor = vec4(color, alpha);
    }
  `,
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. LIQUID MATERIAL
//    Layered latte macchiato seen through glass.
// ─────────────────────────────────────────────────────────────────────────────
export const liquidMaterial = new THREE.ShaderMaterial({
  side: THREE.FrontSide,

  uniforms: {
    uTime:      { value: 0.0 },
    uCameraPos: { value: new THREE.Vector3() },

    // Layer colours
    uMilk:     { value: new THREE.Color('#f5f1e8') }, // steamed milk (bottom)
    uEspresso: { value: new THREE.Color('#1e0800') }, // dark espresso band
    uCaramel:  { value: new THREE.Color('#7a3610') }, // caramel-coffee mix
    uFoam:     { value: new THREE.Color('#ede5d0') }, // milk foam (top)

    // Lighting
    uLightDir: { value: new THREE.Vector3(0.5, 1.0, 0.75).normalize() },
  },

  vertexShader: /* glsl */`
    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;

    void main() {
      vUv          = uv;
      vec4 wPos    = modelMatrix * vec4(position, 1.0);
      vWorldPos    = wPos.xyz;
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      gl_Position  = projectionMatrix * viewMatrix * wPos;
    }
  `,

  fragmentShader: /* glsl */`
    uniform float uTime;
    uniform vec3  uCameraPos;
    uniform vec3  uMilk;
    uniform vec3  uEspresso;
    uniform vec3  uCaramel;
    uniform vec3  uFoam;
    uniform vec3  uLightDir;

    varying vec2 vUv;
    varying vec3 vWorldNormal;
    varying vec3 vWorldPos;

    // ── Noise for organic layer boundaries ──────────────────────────────────
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(
        mix(hash(i),             hash(i + vec2(1.0, 0.0)), u.x),
        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
        u.y
      );
    }

    void main() {
      vec3  N     = normalize(vWorldNormal);
      vec3  V     = normalize(uCameraPos - vWorldPos);
      vec3  L     = normalize(uLightDir);

      // ── Detect surface type ──────────────────────────────────────────────
      bool isSide = (vUv.y >= 0.5);
      bool isTop  = (N.y > 0.65);         // upward-facing normal = foam surface

      // Remap side UV to [0, 1]  (0 = bottom of liquid, 1 = top)
      float t = clamp((vUv.y - 0.5) * 2.0, 0.0, 1.0);

      // For cap faces not on top, clamp to bottom-milk colour
      if (!isSide) t = isTop ? 1.0 : 0.0;

      // ── Organic layer boundary waviness ──────────────────────────────────
      float wave = (noise(vec2(vUv.x * 6.0, uTime * 0.08)) - 0.5) * 0.04;
      float tw   = clamp(t + wave, 0.0, 1.0);

      // ── Layer gradient ────────────────────────────────────────────────────
      vec3 color = uMilk;
      color = mix(color, uEspresso, smoothstep(0.38, 0.52, tw)); // tight milk→esp
      color = mix(color, uCaramel,  smoothstep(0.62, 0.75, tw)); // gap keeps band dark
      color = mix(color, uFoam,     smoothstep(0.83, 0.95, tw));

      // ── Top foam surface override ─────────────────────────────────────────
      if (isTop) {
        float b = noise(vUv * 22.0 + uTime * 0.04) * 0.12;
        vec3 foamSurface = mix(uFoam, vec3(0.82, 0.74, 0.60), b);
        color = foamSurface;
      }

      // ── Glass-tint compensation ───────────────────────────────────────────
      color = mix(color, color * vec3(1.06, 1.02, 0.94), 0.4);

      // ── Lighting ─────────────────────────────────────────────────────────
      float NdotL  = max(dot(N, L), 0.0);
      float ambient = 0.30;
      color *= ambient + NdotL * 0.70;

      // Subtle specular highlight on foam top
      vec3  H    = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 48.0) * 0.25;
      if (isTop) color += vec3(spec);

      // Slight translucency brightening where light hits thin milk layer
      float sss = smoothstep(0.0, 0.35, tw) * (1.0 - smoothstep(0.35, 0.58, tw));
      color += uMilk * sss * NdotL * 0.18;

      gl_FragColor = vec4(color, 1.0);
    }
  `,
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. APPLY FUNCTION
// ─────────────────────────────────────────────────────────────────────────────
export function applyLatteMacchiatoShaders(modelScene) {
  modelScene.traverse(child => {
    if (!child.isMesh) return;
    const name = child.name.toLowerCase();

    if (name.includes('liquid')) {
      child.material    = liquidMaterial;
      child.renderOrder = 0;       // render liquid first (opaque base)
    } else if (name.includes('cup') || name.includes('glass')) {
      child.material    = glassMaterial;
      child.renderOrder = 1;       // render glass after, blended over liquid
      child.castShadow  = false;
    }
  });

  return { liquidMat: liquidMaterial, glassMat: glassMaterial };
}