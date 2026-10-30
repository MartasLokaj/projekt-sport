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
import { buildFace, canvasTexture, FACES, seededRandom, type FaceInfo, type FaceKit } from './faces.ts';

// Cube World: the lobby is a cute cube floating in starry space, one little world per side for each
// game. Drag it with the mouse to spin it round. Click a side (or use the arrows) to choose that game:
// its side turns up towards you, the game's card appears, and the players' chibi characters pop up on it.
// Click into empty space (or press Esc) to let the cube go again.

type Guest = { player: PlayerInfo; character: Character; tag: HTMLElement; age: number; hitUntil: number; hitText: string };

const UP = new THREE.Vector3(0, 1, 0);
const SIDE = new THREE.Vector3(1, 0, 0);

export class Hub {
  /** Called when a game is chosen (its side turns up) or let go (null). */
  onSelect: (face: FaceInfo | null) => void = () => {};

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly planet = new THREE.Group();
  private readonly spinner = new THREE.Group();
  private readonly halo: THREE.Sprite;
  private readonly stars: THREE.Points;
  private readonly faces: THREE.Group[] = [];
  /** For every side: the cube's pose that puts that side up, tipped towards the camera. */
  private readonly poses: THREE.Quaternion[] = [];
  private readonly guests = new Map<string, Guest>();
  /** Name tags are plain page elements over the 3D view, so they stay sharp and don't glow. */
  private readonly tagLayer = document.createElement('div');
  private readonly clock = new THREE.Clock();
  private players: PlayerInfo[] = [];
  private chosen = -1;
  /** Spin left over after a drag (radians per second around the screen's up and side axes). */
  private readonly spin = new THREE.Vector2();
  private drag: { x: number; y: number; moved: number; time: number } | null = null;
  private time = 0;
  private running = false;
  /** Camera distance from the cube: where it is now and where the zoom wants it. */
  private distance: number = TUNING.hub.cameraDistance;
  private targetDistance: number = TUNING.hub.cameraDistance;

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
    this.renderer.domElement.style.cursor = 'grab';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);
    this.tagLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    container.appendChild(this.tagLayer);

    this.camera = new THREE.PerspectiveCamera(c.cameraFov, 1, 0.1, 400);
    this.camera.position.set(0, c.cameraHeight, c.cameraDistance);
    this.camera.lookAt(0, 0, 0);

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
    const size = c.cubeSize;
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(size, size, size, 6, c.cubeRounding),
      new THREE.MeshStandardMaterial({ color: c.cubeColour, roughness: 0.35 }),
    );
    body.receiveShadow = true;
    this.spinner.add(body);
    const tilt = new THREE.Quaternion().setFromAxisAngle(SIDE, THREE.MathUtils.degToRad(c.chosenTiltDegrees));
    FACES.forEach((face, i) => {
      const normal = new THREE.Vector3(...face.normal);
      const forward = new THREE.Vector3(...face.forward);
      // The side's own axes on the cube: x to its right, y out of the cube, z towards the viewer once it is up.
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(normal, forward), normal, forward);
      const world = buildFace(face, kit, size);
      world.quaternion.setFromRotationMatrix(basis);
      world.position.copy(normal).multiplyScalar(size / 2 + 0.1);
      world.userData.face = i;
      this.faces.push(world);
      this.spinner.add(world);
      // Turning the cube by the opposite of that puts the side up, facing us; then tip it towards us.
      this.poses.push(tilt.clone().multiply(world.quaternion.clone().invert()));
    });
    this.spinner.quaternion.setFromEuler(
      new THREE.Euler(THREE.MathUtils.degToRad(c.startTiltDegrees), THREE.MathUtils.degToRad(c.startTurnDegrees), 0),
    );
    this.planet.add(this.spinner);
    this.scene.add(this.planet);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), c.bloomStrength, 0.6, 0.85));
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.listenToPointer();
    this.resize();
  }

  /** The chosen game, or null while the cube floats freely. */
  get selected(): FaceInfo | null {
    return this.chosen < 0 ? null : FACES[this.chosen];
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

  /** Chooses a game by id (its side turns up and the characters pop up on it), or lets go with null. */
  select(id: string | null): void {
    const index = id === null ? -1 : FACES.findIndex((f) => f.id === id);
    if (index === this.chosen) return;
    this.chosen = index;
    this.spin.set(0, 0);
    this.clearGuests();
    this.addGuests();
    this.onSelect(this.selected);
  }

  /** The arrows: choose the next or previous game going round the list. */
  cycle(steps: number): void {
    const from = this.chosen < 0 ? (steps > 0 ? -1 : 0) : this.chosen;
    this.select(FACES[(((from + steps) % FACES.length) + FACES.length) % FACES.length].id);
  }

  /** The players who joined. While a game is chosen, new ones pop up on its side and players who left disappear. */
  setPlayers(players: PlayerInfo[]): void {
    this.players = players;
    for (const [id, guest] of this.guests) {
      if (players.some((p) => p.id === id)) continue;
      this.removeGuest(guest);
      this.guests.delete(id);
    }
    this.addGuests();
  }

  /** A player hit from their phone while waiting: their character jumps and shows the power. */
  showHit(playerId: string, power: number): void {
    const guest = this.guests.get(playerId);
    if (!guest) return;
    guest.character.play('jump');
    guest.hitText = `${Math.round(power)} %`;
    guest.hitUntil = this.time + 2.5;
  }

  /** One frame. Public for checks in the browser console. */
  frame(dt = Math.min(this.clock.getDelta(), 0.05)): void {
    const c = TUNING.hub;
    this.time += dt;
    if (this.chosen >= 0) {
      // Turn the chosen side up towards us.
      this.spinner.quaternion.slerp(this.poses[this.chosen], 1 - Math.exp(-c.turnSpeed * dt));
    } else if (!this.drag) {
      // Let go: keep spinning a little after a drag, slowing down, then drift slowly round by itself.
      this.spin.multiplyScalar(Math.exp(-c.spinFriction * dt));
      if (this.spin.length() < c.idleSpin) this.spin.x += (c.idleSpin - this.spin.x) * Math.min(1, dt);
      this.turnBy(this.spin.x * dt, this.spin.y * dt);
    }
    // Glide smoothly to the zoomed distance, along the same line of view.
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-8 * dt));
    this.camera.position.set(0, c.cameraHeight, c.cameraDistance).multiplyScalar(this.distance / c.cameraDistance);
    this.camera.lookAt(0, 0, 0);
    this.planet.position.y = Math.sin(this.time * c.bobSpeed) * c.bobHeight;
    this.halo.position.copy(this.planet.position).add(new THREE.Vector3(0, 0, -c.cubeSize));
    this.stars.rotation.y += dt * 0.01;

    // Characters wait until their side has (nearly) turned up, then pop up one after another.
    const settled = this.chosen >= 0 && this.spinner.quaternion.angleTo(this.poses[this.chosen]) < 0.2;
    [...this.guests.values()].forEach((guest, i) => {
      if (settled || guest.age > 0) guest.age += dt;
      const t = Math.max(0, guest.age - i * c.popInStagger) / c.popInSeconds;
      guest.character.root.scale.setScalar(Math.max(0.001, easeOutBack(Math.min(1, t)) * c.characterScale));
      guest.character.update(dt);
      // Now and then somebody waves.
      if (t >= 1 && Math.random() < dt * 0.12) guest.character.play('cheer');
    });
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

  /** Turns the cube around the screen's up axis (yaw) and side axis (pitch), like grabbing it. */
  private turnBy(yaw: number, pitch: number): void {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(SIDE, pitch));
    this.spinner.quaternion.premultiply(q).normalize();
  }

  /** Drag to spin the cube; a click (no drag) on a side chooses that game, a click into space lets go. */
  private listenToPointer(): void {
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, time: performance.now() };
      this.spin.set(0, 0);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      const dy = e.clientY - this.drag.y;
      this.drag.moved += Math.hypot(dx, dy);
      if (this.drag.moved < 6) return;
      // Grabbing the cube lets go of the chosen game.
      if (this.chosen >= 0) this.select(null);
      const speed = TUNING.hub.dragSpeed;
      const seconds = Math.max(0.008, (performance.now() - this.drag.time) / 1000);
      this.turnBy(dx * speed, dy * speed);
      this.spin.set((dx * speed) / seconds, (dy * speed) / seconds);
      Object.assign(this.drag, { x: e.clientX, y: e.clientY, time: performance.now() });
    });
    const release = (e: PointerEvent): void => {
      if (!this.drag) return;
      const click = this.drag.moved < 6;
      // A drag that stopped before letting go doesn't keep spinning.
      if (performance.now() - this.drag.time > 80) this.spin.set(0, 0);
      this.drag = null;
      canvas.style.cursor = 'grab';
      if (click) this.clickAt(e.clientX, e.clientY);
    };
    // The mouse wheel, or pinching on a trackpad, zooms in and out.
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const c = TUNING.hub;
        const amount = e.deltaY * (e.ctrlKey ? 4 : 1) * c.zoomSpeed; // a pinch sends small steps, so it counts more
        this.targetDistance = THREE.MathUtils.clamp(this.targetDistance * Math.exp(amount), c.zoomMin, c.zoomMax);
      },
      { passive: false },
    );
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
  }

  private clickAt(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(pointer, this.camera);
    const hit = ray.intersectObjects([...this.faces, this.spinner], true)[0];
    if (!hit) return this.select(null);
    let object: THREE.Object3D | null = hit.object;
    while (object && object.userData.face === undefined) object = object.parent;
    if (object) this.select(FACES[object.userData.face as number].id);
  }

  // ---------- Characters on the chosen side ----------

  /** Puts every player who has no character yet on the chosen side, in a row facing the camera. */
  private addGuests(): void {
    if (this.chosen < 0) return;
    const c = TUNING.hub;
    const side = this.faces[this.chosen];
    this.players.forEach((player, i) => {
      let guest = this.guests.get(player.id);
      if (!guest) {
        const character = new Character({ shirt: player.colour, skin: player.skinTone, handedness: player.handedness });
        guest = { player, character, tag: makeTag(), age: 0, hitUntil: 0, hitText: '' };
        character.root.scale.setScalar(0.001);
        character.play('cheer');
        this.guests.set(player.id, guest);
        side.add(character.root);
        this.tagLayer.append(guest.tag);
      }
      guest.player = player;
      guest.character.setLook({ shirt: player.colour, skin: player.skinTone, handedness: player.handedness });
      const x = (i - (this.players.length - 1) / 2) * c.characterSpacing;
      const spot = new THREE.Vector3(x, 0.12, c.characterForward - Math.abs(x) * 0.12);
      if (guest.age === 0) guest.character.place(spot, -x * 0.1);
      else guest.character.setTarget(spot, -x * 0.1);
      (guest.tag.firstChild as HTMLElement).style.background = player.colour;
      guest.tag.style.opacity = player.connected ? '1' : '0.6';
    });
  }

  private clearGuests(): void {
    for (const guest of this.guests.values()) this.removeGuest(guest);
    this.guests.clear();
  }

  private removeGuest(guest: Guest): void {
    guest.character.root.removeFromParent();
    guest.tag.remove();
  }

  /** Keeps every name tag just above its character's head on screen. */
  private placeTags(): void {
    const c = TUNING.hub;
    const width = this.tagLayer.clientWidth;
    const height = this.tagLayer.clientHeight;
    [...this.guests.values()].forEach((guest, i) => {
      const head = guest.character.root.localToWorld(new THREE.Vector3(0, TUNING.character.height + 0.02, 0)).project(this.camera);
      const pop = THREE.MathUtils.clamp((guest.age - i * c.popInStagger) / c.popInSeconds, 0, 1);
      // Every second tag sits a step higher, so long names next to each other don't overlap.
      const lift = i % 2 === 1 ? '- 115%' : '- 0%';
      guest.tag.style.transform = `translate(${((head.x + 1) / 2) * width}px, calc(${((1 - head.y) / 2) * height}px ${lift})) translate(-50%, -100%) scale(${pop})`;
      const label = guest.player.connected ? guest.player.name : `${guest.player.name} (away)`;
      const text = this.time < guest.hitUntil ? guest.hitText : label;
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
