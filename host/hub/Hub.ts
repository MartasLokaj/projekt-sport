import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { PlayerInfo } from '../../shared/protocol.ts';
import { TUNING } from '../../shared/tuning.ts';
import { Character } from '../game/character.ts';
import { loadForest } from '../game/vegetation.ts';
import { buildFace, buildPlaza, canvasTexture, FACES, seededRandom, type FaceInfo, type FaceKit } from './faces.ts';

// Cube World: the lobby is a cute cube floating in starry space. Each of its four sides is a little
// world for one game; the arrows (or a click) turn the cube to another side. The players who joined
// stand on top of the cube as their chibi characters, with their names above their heads.

type Guest = { character: Character; tag: HTMLElement; age: number; hitUntil: number; hitText: string; label: string };

export class Hub {
  /** Called whenever another side of the cube comes to the front. */
  onSelect: (face: FaceInfo) => void = () => {};

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly planet = new THREE.Group();
  private readonly spinner = new THREE.Group();
  private readonly halo: THREE.Sprite;
  private readonly stars: THREE.Points;
  private readonly faces: THREE.Group[] = [];
  private readonly guests = new Map<string, Guest>();
  /** Name tags are plain page elements over the 3D view, so they stay sharp and don't glow. */
  private readonly tagLayer = document.createElement('div');
  private readonly clock = new THREE.Clock();
  private index = 0;
  private targetAngle = 0;
  private time = 0;
  private running = false;

  static async create(container: HTMLElement): Promise<Hub> {
    const loader = new GLTFLoader();
    const [windmill, flag, forest] = await Promise.all([
      loader.loadAsync('/host/assets/minigolf/windmill.glb'),
      loader.loadAsync('/host/assets/minigolf/flag-red.glb'),
      loadForest(),
    ]);
    return new Hub(container, { windmill, flag, forest });
  }

  private constructor(
    private readonly container: HTMLElement,
    kit: FaceKit,
  ) {
    const c = TUNING.hub;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, TUNING.scenery.maxPixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = c.exposure;
    container.appendChild(this.renderer.domElement);
    this.tagLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    container.appendChild(this.tagLayer);

    this.camera = new THREE.PerspectiveCamera(c.cameraFov, 1, 0.1, 400);
    this.camera.position.set(0, c.cameraHeight, c.cameraDistance);
    this.camera.position.x = c.cameraSideShift;
    this.camera.lookAt(c.cameraSideShift, -0.4, 0);

    this.scene.add(makeSky());
    this.stars = makeStars();
    this.scene.add(this.stars, ...makePlanets());
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(c.glowColour), transparent: true, depthWrite: false, opacity: 0.55 }));
    this.halo.scale.setScalar(c.cubeSize * 3);
    this.halo.renderOrder = -1;
    this.scene.add(this.halo);

    this.scene.add(new THREE.HemisphereLight(c.skyTop, c.skyBottom, 1.1));
    this.scene.add(new THREE.AmbientLight('#ffffff', 0.35));
    const sun = new THREE.DirectionalLight('#e6e4ff', 2.6);
    sun.position.set(8, 14, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // The cube: a rounded block that turns (spinner) inside a group that floats (planet).
    // The meadow on top stays put while the cube turns underneath, so the characters keep facing us.
    const size = c.cubeSize;
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(size, size, size, 6, c.cubeRounding),
      new THREE.MeshStandardMaterial({ color: c.cubeColour, roughness: 0.35 }),
    );
    body.receiveShadow = true;
    this.spinner.add(body);
    FACES.forEach((face, i) => {
      const world = buildFace(face, kit, size);
      // Side i faces outwards at i quarter turns: 0 = towards the camera, 1 = right, 2 = back, 3 = left.
      const normal = new THREE.Vector3(Math.sin((i * Math.PI) / 2), 0, Math.cos((i * Math.PI) / 2));
      world.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
      world.position.copy(normal).multiplyScalar(size / 2 + 0.1);
      world.userData.face = i;
      this.faces.push(world);
      this.spinner.add(world);
    });
    const plaza = buildPlaza(kit, size);
    plaza.position.y = size / 2 - 0.02;
    this.planet.add(this.spinner, plaza);
    this.scene.add(this.planet);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), c.bloomStrength, 0.6, 0.85));
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('click', (e) => this.clickAt(e.clientX, e.clientY));
    this.resize();
  }

  get selected(): FaceInfo {
    return FACES[this.index];
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Stops drawing (while a game is on screen), so the hub costs nothing. */
  stop(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  /** Turns the cube by whole sides: +1 brings the right-hand side to the front, -1 the left-hand one. */
  turn(steps: number): void {
    this.index = (((this.index + steps) % FACES.length) + FACES.length) % FACES.length;
    this.targetAngle -= (steps * Math.PI) / 2;
    this.onSelect(this.selected);
  }

  /** Turns the cube so this game's side faces the camera (the short way round). */
  show(id: string): void {
    const target = FACES.findIndex((f) => f.id === id);
    if (target < 0) return;
    let steps = target - this.index;
    if (steps > 2) steps -= 4;
    if (steps < -2) steps += 4;
    if (steps !== 0) this.turn(steps);
    else this.onSelect(this.selected);
  }

  /** The players who joined: new ones pop in on top of the cube and wave, players who left disappear. */
  setPlayers(players: PlayerInfo[]): void {
    for (const [id, guest] of this.guests) {
      if (players.some((p) => p.id === id)) continue;
      this.planet.remove(guest.character.root);
      guest.tag.remove();
      this.guests.delete(id);
    }
    players.forEach((player, i) => {
      let guest = this.guests.get(player.id);
      if (!guest) {
        const character = new Character({ shirt: player.colour, skin: player.skinTone, handedness: player.handedness });
        guest = { character, tag: makeTag(), age: 0, hitUntil: 0, hitText: '', label: '' };
        character.root.scale.setScalar(0.001);
        character.play('cheer');
        this.guests.set(player.id, guest);
        this.planet.add(character.root);
        this.tagLayer.append(guest.tag);
      } else {
        guest.character.setLook({ shirt: player.colour, skin: player.skinTone, handedness: player.handedness });
      }
      const c = TUNING.hub;
      const x = (i - (players.length - 1) / 2) * c.characterSpacing;
      const spot = new THREE.Vector3(x, c.cubeSize / 2 + 0.22, 1.1 - Math.abs(x) * 0.15);
      const yaw = -x * 0.12;
      if (guest.age === 0) guest.character.place(spot, yaw);
      else guest.character.setTarget(spot, yaw);
      guest.label = player.connected ? player.name : `${player.name} (away)`;
      (guest.tag.firstChild as HTMLElement).style.background = player.colour;
      guest.tag.style.opacity = player.connected ? '1' : '0.6';
    });
  }

  /** A player hit from their phone while waiting: their character jumps and shows the power. */
  showHit(playerId: string, power: number): void {
    const guest = this.guests.get(playerId);
    if (!guest) return;
    guest.character.play('jump');
    guest.hitText = `${Math.round(power)} %`;
    guest.hitUntil = this.time + 2.5;
  }

  /** For checks in the browser console. */
  frame(dt = Math.min(this.clock.getDelta(), 0.05)): void {
    const c = TUNING.hub;
    this.time += dt;
    // Turn towards the chosen side, then float and sway gently.
    this.spinner.rotation.y += (this.targetAngle - this.spinner.rotation.y) * (1 - Math.exp(-c.turnSpeed * dt));
    this.planet.position.y = Math.sin(this.time * c.bobSpeed) * c.bobHeight;
    this.planet.rotation.y = Math.sin(this.time * 0.3) * THREE.MathUtils.degToRad(c.swayDegrees);
    this.planet.rotation.x = Math.sin(this.time * 0.23) * THREE.MathUtils.degToRad(c.swayDegrees * 0.3);
    this.halo.position.copy(this.planet.position).add(new THREE.Vector3(0, 0, -c.cubeSize));
    this.stars.rotation.y += dt * 0.01;

    for (const guest of this.guests.values()) {
      guest.age += dt;
      const pop = easeOutBack(Math.min(1, guest.age / c.popInSeconds));
      guest.character.root.scale.setScalar(Math.max(0.001, pop * c.characterScale));
      guest.character.update(dt);
      // Now and then somebody waves.
      if (Math.random() < dt * 0.12) guest.character.play('cheer');
    }
    this.composer.render();
    this.placeTags();
  }

  private resize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  /** Clicking a side of the cube turns it to the front. */
  private clickAt(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, this.camera);
    const hit = ray.intersectObjects(this.faces, true)[0];
    let object: THREE.Object3D | null = hit?.object ?? null;
    while (object && object.userData.face === undefined) object = object.parent;
    if (object) this.show(FACES[object.userData.face as number].id);
  }

  /** Keeps every name tag just above its character's head on screen. */
  private placeTags(): void {
    const c = TUNING.hub;
    const width = this.tagLayer.clientWidth;
    const height = this.tagLayer.clientHeight;
    [...this.guests.values()].forEach((guest, i) => {
      const head = guest.character.root.localToWorld(new THREE.Vector3(0, TUNING.character.height + 0.02, 0)).project(this.camera);
      const pop = Math.min(1, guest.age / c.popInSeconds);
      // Every second tag sits a step higher, so long names next to each other don't overlap.
      const lift = i % 2 === 1 ? '- 115%' : '- 0%';
      guest.tag.style.transform = `translate(${((head.x + 1) / 2) * width}px, calc(${((1 - head.y) / 2) * height}px ${lift})) translate(-50%, -100%) scale(${pop})`;
      const text = this.time < guest.hitUntil ? guest.hitText : guest.label;
      const name = guest.tag.lastChild as HTMLElement;
      if (name.textContent !== text) name.textContent = text;
    });
  }
}

// ---------- Space backdrop ----------

function makeSky(): THREE.Mesh {
  const c = TUNING.hub;
  return new THREE.Mesh(
    new THREE.SphereGeometry(200, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color(c.skyTop) }, bottom: { value: new THREE.Color(c.skyBottom) } },
      vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; varying vec3 p; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.9, 0.35, p.y)), 1.0); }',
    }),
  );
}

function makeStars(): THREE.Points {
  const random = seededRandom(7);
  const positions: number[] = [];
  for (let k = 0; k < TUNING.hub.stars; k++) {
    const v = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize().multiplyScalar(120 + random() * 60);
    positions.push(v.x, v.y, v.z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#ffffff', size: 1.1, sizeAttenuation: true }));
}

/** Two little pastel planets far away. */
function makePlanets(): THREE.Mesh[] {
  const pink = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 16), new THREE.MeshStandardMaterial({ color: '#ff9ad1', roughness: 0.6 }));
  pink.position.set(-45, 18, -70);
  const cyan = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 16), new THREE.MeshStandardMaterial({ color: '#7ff3ff', roughness: 0.6 }));
  cyan.position.set(40, -12, -60);
  return [pink, cyan];
}

function glowTexture(colour: string): THREE.Texture {
  return canvasTexture(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, colour);
    g.addColorStop(0.25, colour + 'aa');
    g.addColorStop(1, colour + '00');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

/** A white rounded label with a dot in the player's colour and their name. */
function makeTag(): HTMLElement {
  const tag = document.createElement('div');
  tag.style.cssText =
    'position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;padding:4px 14px 4px 8px;border-radius:999px;' +
    'background:#fff;color:#1f3247;font:800 clamp(14px,1.5vw,24px) ui-rounded,"SF Pro Rounded",system-ui,sans-serif;' +
    'white-space:nowrap;max-width:14vw;box-shadow:0 4px 12px rgba(0,0,0,0.3);transform-origin:50% 100%';
  const dot = document.createElement('span');
  dot.style.cssText = 'width:0.9em;height:0.9em;border-radius:50%;flex:0 0 auto';
  const name = document.createElement('span');
  name.style.cssText = 'overflow:hidden;text-overflow:ellipsis';
  tag.append(dot, name);
  return tag;
}

function easeOutBack(t: number): number {
  const s = 1.70158;
  const u = t - 1;
  return 1 + u * u * ((s + 1) * u + s);
}
