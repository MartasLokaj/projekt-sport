import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TUNING } from '../../../shared/tuning.ts';

// The beach's sky, clouds and sea. The sea knows how far every spot is from the land, so it can be
// turquoise and foamy at the shore, show a line of white surf breaking on a reef further out, and turn
// deep blue towards the horizon. All of it is cheap: the clouds are one mesh, the sea one shader.

/** A big dome: deep blue overhead, pale at the horizon, a soft bright glow around the sun. */
export function makeSky(sunDirection: THREE.Vector3): THREE.Mesh {
  const c = TUNING.badminton.beach;
  return new THREE.Mesh(
    new THREE.SphereGeometry(170, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(c.skyTop) },
        horizon: { value: new THREE.Color(c.skyHorizon) },
        sun: { value: sunDirection.clone().normalize() },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sun; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 colour = mix(horizon, top, pow(h, 0.55));
          float glow = pow(max(dot(normalize(vDir), sun), 0.0), 18.0);
          colour += vec3(1.0, 0.95, 0.8) * glow * 0.35;
          gl_FragColor = vec4(colour, 1.0);
        }`,
    }),
  );
}

/** Fluffy clouds all around the sky: puffs heaped into one mesh (a single draw call). */
export function makeClouds(random: () => number): THREE.Mesh {
  const c = TUNING.badminton.beach;
  const parts: THREE.BufferGeometry[] = [];
  const puff = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < c.clouds; i++) {
    const angle = (i / c.clouds) * Math.PI * 2 + random() * 0.5;
    const distance = 95 + random() * 50;
    const centre = new THREE.Vector3(Math.cos(angle) * distance, 22 + random() * 30, Math.sin(angle) * distance);
    const across = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const width = 3 + Math.floor(random() * 4);
    const scale = 1.4 + random() * 1.4;
    for (let k = 0; k < width * 2 - 1; k++) {
      const low = k < width;
      const size = (low ? 2.4 : 1.9) * (0.8 + random() * 0.5) * scale;
      const offset = ((low ? k : k - width + 0.5) - (width - 1) / 2) * 2.4 * scale;
      const p = centre.clone().addScaledVector(across, offset).add(new THREE.Vector3(0, low ? 0 : 1.9 * scale, (random() - 0.5) * 2));
      const g = puff.clone();
      g.scale(size, size * (low ? 0.7 : 0.9), size);
      g.translate(p.x, p.y, p.z);
      parts.push(g);
    }
  }
  const mesh = new THREE.Mesh(
    mergeGeometries(parts),
    new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#eef6ff', emissiveIntensity: 0.55, roughness: 1, flatShading: true, fog: false }),
  );
  return mesh;
}

/**
 * The sea: a big sheet with gentle rolling waves. `shore(x, z)` tells how far a spot is from the land
 * (metres; 0 at the waterline). Colour, foam and the reef surf come from that distance.
 */
export function makeSea(shore: (x: number, z: number) => number, centre: THREE.Vector3): { mesh: THREE.Mesh; update: (time: number) => void } {
  const c = TUNING.badminton.beach;
  const size = 420;
  const detail = 110;
  const geometry = new THREE.PlaneGeometry(size, size, detail, detail);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(centre.x, 0, centre.z);
  const position = geometry.getAttribute('position');
  const distances = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) distances[i] = shore(position.getX(i), position.getZ(i));
  geometry.setAttribute('shore', new THREE.BufferAttribute(distances, 1));
  const material = new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        shallow: { value: new THREE.Color(c.seaShallow) },
        mid: { value: new THREE.Color(c.seaMid) },
        deep: { value: new THREE.Color(c.seaDeep) },
        reef: { value: c.reefDistance },
      },
    ]),
    vertexShader: `
      attribute float shore;
      uniform float time;
      varying float vShore;
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vShore = shore;
        vec3 p = position;
        // Gentle swell far out, calmer close to the beach.
        float calm = smoothstep(0.0, 12.0, shore);
        p.y += (sin(p.x * 0.18 + time * 0.9) * 0.18 + sin(p.z * 0.23 - time * 1.1) * 0.14) * calm;
        vWorld = p;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float time; uniform vec3 shallow; uniform vec3 mid; uniform vec3 deep; uniform float reef;
      varying float vShore; varying vec3 vWorld;
      #include <fog_pars_fragment>
      float wave(vec2 p){ return sin(p.x) * sin(p.y); }
      void main() {
        // Turquoise over the sand, deeper blue past the reef.
        vec3 colour = mix(shallow, mid, smoothstep(1.0, reef * 0.8, vShore));
        colour = mix(colour, deep, smoothstep(reef * 1.1, reef * 3.0, vShore));
        // Little sparkles and ripples.
        float ripple = wave(vWorld.xz * 0.9 + vec2(time * 0.6, time * 0.4)) * wave(vWorld.zx * 1.3 - vec2(time * 0.3, 0.0));
        colour += vec3(0.06, 0.09, 0.1) * smoothstep(0.55, 0.95, ripple);
        // Foam where the water laps the sand: a band that slides up and back.
        float lap = 0.9 + 0.5 * sin(time * 0.8 + vWorld.x * 0.15 + vWorld.z * 0.1);
        float foam = smoothstep(lap + 0.6, lap, vShore) * (0.6 + 0.4 * wave(vWorld.xz * 2.5 + time));
        // White surf breaking on the reef: wavy bands that roll in.
        float band = abs(vShore - reef + 1.5 * sin(vWorld.x * 0.07 + vWorld.z * 0.05 + time * 0.5));
        float surf = smoothstep(2.2, 0.0, band) * (0.55 + 0.45 * sin(time * 1.6 + vWorld.x * 0.3 + vWorld.z * 0.21));
        // The surf breaks in patches, not one endless line.
        surf *= smoothstep(-0.2, 0.5, sin(vWorld.x * 0.09 + 1.0) * sin(vWorld.z * 0.07 + 2.0) + 0.3 * sin(time * 0.3 + vWorld.x * 0.05));
        colour = mix(colour, vec3(1.0), clamp(max(foam, surf * 0.9), 0.0, 1.0));
        gl_FragColor = vec4(colour, 1.0);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = c.seaLevel;
  return { mesh, update: (time) => (material.uniforms.time.value = time) };
}
