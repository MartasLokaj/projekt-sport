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
import { FaceSign } from './sign.ts';
import { Confetti } from './confetti.ts';
import { buildFace, canvasTexture, FACES, seededRandom, type FaceInfo, type FaceKit, type Tick } from './faces.ts';

// Cube World: the lobby is a cute cube floating in starry space, one little world per side for each
// game. Drag it with the mouse to spin it round. Click a side (or use the arrows) to choose that game:
// its side turns up towards you, the game's card appears, and the players' chibi characters pop up on it.
// Click into empty space (or press Esc) to let the cube go again.

/** `drop`: seconds since a newly joined player jumped down onto the cube (-1 = not dropping). */
type Guest = { player: PlayerInfo; character: Character; tag: HTMLElement; age: number; hitUntil: number; hitText: string; drop: number; spot: THREE.Vector3 };

const UP = new THREE.Vector3(0, 1, 0);
const GRAVITY = new THREE.Vector3(0, -6, 0);
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
  /** Star layers, nearest first: they turn a little with the cube, the near ones more (depth). */
  private readonly starLayers: THREE.Points[];
  private readonly dust: THREE.Points;
  /** Far colour clouds and the planets: they also follow the cube's turning a little, at their own depth. */
  private readonly nebula = new THREE.Group();
  private readonly planets = new THREE.Group();
  private readonly shootingStar = new ShootingStar();
  /** A thin light outline round the cube in the chosen game's colour. */
  private readonly outline: THREE.Mesh;
  private readonly faces: THREE.Group[] = [];
  /** A glowing frame around each side, lit while that side's game is chosen. */
  private readonly frames: THREE.Mesh[] = [];
  /** A soft glow lying on each side, lit with its frame. */
  private readonly glows: THREE.Mesh[] = [];
  /** Every side's materials with their own colours, so the sides that are not chosen can be dimmed. */
  private readonly palettes: { material: THREE.Material & { color: THREE.Color }; colour: THREE.Color; emissive: THREE.Color | null }[][] = [];
  /** How bright each side is drawn now (1 = its own colours). */
  private readonly brightness: number[] = [];
  private readonly sign = new FaceSign();
  private readonly confetti = new Confetti();
  /** Characters of players who left or were kicked: they spin up and shrink away, then go. */
  private readonly leaving: { guest: Guest; t: number }[] = [];
  /** Players who joined since the last update: they jump down onto the cube instead of popping up. */
  private readonly arrivals = new Set<string>();
  /** True when the last selection chose a game (the cube hops), false when it let go. */
  private hop = false;
  /** Little moons going round the cube: a golf ball, a shuttlecock and a tiny cube. */
  private readonly orbiters: { pivot: THREE.Group; body: THREE.Object3D; seconds: number; spinSelf: boolean }[] = [];
  private readonly haloColour = new THREE.Color(TUNING.hub.glowColour);
  /** Seconds since a game was chosen (drives the little pop of the cube). */
  private chosenAge = 10;
  /** Fingers on the screen, for the two-finger pinch zoom. */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinch = 0;
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
  /** Behind the title menu the cube turns a little faster, like a showcase. */
  showcase = false;
  /** Camera distance from the cube: where it is now and where the zoom wants it. */
  private distance: number = TUNING.hub.cameraDistance;
  private targetDistance: number = TUNING.hub.cameraDistance;
  /** Extra camera distance on narrow screens, so the whole cube fits across. */
  private fit = 1;

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

    this.nebula.add(...makeNebula());
    this.planets.add(...makePlanets());
    this.scene.add(makeSky(), this.nebula, this.planets, this.shootingStar.mesh);
    this.starLayers = [makeStars(0, 0.55, 1.5), makeStars(1, 0.35, 1.0), makeStars(2, 0.1, 0.7)];
    this.dust = makeDust();
    this.scene.add(...this.starLayers, this.dust);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('#ffffff'), color: c.glowColour, transparent: true, depthWrite: false, opacity: 0.55 }));
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
      new THREE.MeshPhysicalMaterial({ color: c.cubeColour, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') }),
    );
    body.receiveShadow = true;
    this.spinner.add(body);
    this.outline = new THREE.Mesh(body.geometry, outlineMaterial(c.glowColour));
    this.outline.scale.setScalar(c.outlineScale);
    this.spinner.add(this.outline);
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
      this.palettes.push(collectPalette(world));
      this.brightness.push(1);
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(size * 1.04, size * 1.04),
        new THREE.MeshBasicMaterial({ map: sideGlowTexture(), color: face.accent, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.2;
      glow.renderOrder = 1;
      world.add(glow);
      this.glows.push(glow);
      const frame = new THREE.Mesh(
        frameGeometry(size - 0.25, size - 0.62, 0.55),
        new THREE.MeshBasicMaterial({ color: face.accent, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
      );
      frame.rotation.x = -Math.PI / 2;
      frame.position.y = 0.16;
      frame.renderOrder = 2;
      world.add(frame);
      this.frames.push(frame);
      this.spinner.add(world);
      // Turning the cube by the opposite of that puts the side up, facing us; then tip it towards us.
      this.poses.push(tilt.clone().multiply(world.quaternion.clone().invert()));
    });
    this.spinner.quaternion.setFromEuler(
      new THREE.Euler(THREE.MathUtils.degToRad(c.startTiltDegrees), THREE.MathUtils.degToRad(c.startTurnDegrees), 0),
    );
    this.planet.add(this.spinner);
    this.scene.add(this.planet, this.confetti.mesh);
    for (const o of c.orbiters) {
      // Each one rides on a tilted ring round the cube.
      const pivot = new THREE.Group();
      pivot.rotation.set(THREE.MathUtils.degToRad(o.tilt), Math.random() * Math.PI * 2, THREE.MathUtils.degToRad(o.tilt * 0.4));
      const body = makeOrbiter(o.kind, o.size);
      body.position.x = o.radius;
      pivot.add(body);
      this.planet.add(pivot);
      this.orbiters.push({ pivot, body, seconds: o.seconds, spinSelf: o.kind !== 'shuttle' });
    }

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
    this.chosenAge = 0;
    this.hop = index >= 0;
    this.sign.show(this.selected, index < 0 ? null : this.faces[index]);
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
    for (const p of players) if (this.players.length > 0 && !this.players.some((q) => q.id === p.id)) this.arrivals.add(p.id);
    this.players = players;
    for (const [id, guest] of this.guests) {
      if (players.some((p) => p.id === id)) continue;
      this.guests.delete(id);
      this.leave(guest);
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
    this.chosenAge += dt;
    const before = this.spinner.quaternion.clone();
    if (this.chosen >= 0) {
      // Turn the chosen side up towards us.
      this.spinner.quaternion.slerp(this.poses[this.chosen], 1 - Math.exp(-c.turnSpeed * dt));
    } else if (!this.drag) {
      // Let go: keep spinning a little after a drag, slowing down, then drift slowly round by itself.
      this.spin.multiplyScalar(Math.exp(-c.spinFriction * dt));
      const idle = this.showcase ? c.titleSpin : c.idleSpin;
      if (this.spin.length() < idle) this.spin.x += (idle - this.spin.x) * Math.min(1, dt);
      this.turnBy(this.spin.x * dt, this.spin.y * dt);
    }
    // Glide smoothly to the zoomed distance, along the same line of view.
    this.distance += (this.targetDistance - this.distance) * (1 - Math.exp(-8 * dt));
    this.camera.position.set(0, c.cameraHeight, c.cameraDistance).multiplyScalar((this.distance / c.cameraDistance) * this.fit);
    this.camera.lookAt(0, 0, 0);
    // The gentle float, plus a bouncy little hop when a game is chosen.
    const hop = this.hop && this.chosenAge < 1.2 ? c.switchHop * Math.exp(-5 * this.chosenAge) * Math.abs(Math.sin(this.chosenAge * 9)) : 0;
    this.planet.position.y = Math.sin(this.time * c.bobSpeed) * c.bobHeight + hop;
    this.halo.position.copy(this.planet.position).add(new THREE.Vector3(0, 0, -c.cubeSize));

    // The little worlds move; the chosen side's frame glows in its game's colour, and so does the halo.
    for (const face of this.faces) (face.userData.tick as Tick | undefined)?.(this.time, dt);
    this.frames.forEach((frame, i) => {
      const material = frame.material as THREE.MeshBasicMaterial;
      const want = i === this.chosen ? c.frameOpacity * (0.8 + 0.2 * Math.sin(this.time * 3)) : 0;
      material.opacity += (want - material.opacity) * (1 - Math.exp(-6 * dt));
      frame.visible = material.opacity > 0.01;
      const glow = this.glows[i].material as THREE.MeshBasicMaterial;
      glow.opacity = material.opacity * c.sideGlow;
      this.glows[i].visible = frame.visible;
      // The sides that are not chosen fade back a little, so the chosen one stands out.
      const bright = this.chosen < 0 || i === this.chosen ? 1 : c.dimOthers;
      const before = this.brightness[i];
      this.brightness[i] += (bright - before) * (1 - Math.exp(-5 * dt));
      if (Math.abs(this.brightness[i] - before) > 0.0005) {
        for (const p of this.palettes[i]) {
          if (p.material instanceof THREE.ShaderMaterial) {
            p.material.uniforms.brightness.value = this.brightness[i];
            continue;
          }
          p.material.color.copy(p.colour).multiplyScalar(this.brightness[i]);
          if (p.emissive) (p.material as THREE.MeshStandardMaterial).emissive.copy(p.emissive).multiplyScalar(this.brightness[i]);
        }
      }
    });
    this.haloColour.lerp(new THREE.Color(this.chosen >= 0 ? FACES[this.chosen].accent : c.glowColour), 1 - Math.exp(-3 * dt));
    this.halo.material.color.copy(this.haloColour);
    // A small happy pop when a game is chosen.
    const pop = this.chosenAge < 0.5 ? Math.sin((this.chosenAge / 0.5) * Math.PI) * c.choosePop : 0;
    this.spinner.scale.setScalar(1 + pop);

    // Depth: when the cube turns, the near stars turn a little with it and the far ones barely.
    const turned = before.invert().premultiply(this.spinner.quaternion);
    const yaw = new THREE.Euler().setFromQuaternion(turned, 'YXZ');
    for (const [group, depth] of [[this.nebula, c.nebulaParallax], [this.planets, c.planetParallax]] as const) {
      group.rotation.y += yaw.y * depth;
      group.rotation.x += yaw.x * depth;
    }
    this.shootingStar.update(dt);
    (this.outline.material as THREE.ShaderMaterial).uniforms.colour.value.copy(this.haloColour);
    this.starLayers.forEach((layer, i) => {
      const depth = c.starParallax[i];
      layer.rotation.y += yaw.y * depth + dt * 0.006;
      layer.rotation.x += yaw.x * depth;
      (layer.material as THREE.ShaderMaterial).uniforms.time.value = this.time;
    });
    this.dust.rotation.y += dt * 0.04;
    for (const o of this.orbiters) {
      o.pivot.rotation.y += ((Math.PI * 2) / o.seconds) * dt;
      if (o.spinSelf) o.body.rotation.y += dt * 0.8;
    }
    (this.dust.material as THREE.ShaderMaterial).uniforms.time.value = this.time;

    // Characters wait until their side has (nearly) turned up, then pop up one after another.
    const settled = this.chosen >= 0 && this.spinner.quaternion.angleTo(this.poses[this.chosen]) < 0.2;
    this.sign.update(dt, settled, this.time);
    [...this.guests.values()].forEach((guest, i) => {
      if (settled || guest.age > 0) guest.age += dt;
      const t = Math.max(0, guest.age - i * c.popInStagger) / c.popInSeconds;
      const root = guest.character.root;
      root.scale.setScalar(Math.max(0.001, easeOutBack(Math.min(1, t)) * c.characterScale));
      guest.character.update(dt);
      if (guest.drop >= 0 && settled) this.dropIn(guest, dt);
      // Now and then somebody waves.
      if (t >= 1 && Math.random() < dt * 0.12) guest.character.play('cheer');
    });
    this.updateLeaving(dt);
    this.confetti.update(dt, GRAVITY);
    this.composer.render();
    this.placeTags();
  }

  /** A newly joined player falls from above onto the chosen side, lands with a squash and a burst of confetti. */
  private dropIn(guest: Guest, dt: number): void {
    const c = TUNING.hub;
    const root = guest.character.root;
    guest.drop += dt;
    const fall = Math.min(1, guest.drop / c.dropSeconds);
    root.scale.setScalar(c.characterScale);
    if (fall < 1) {
      root.position.y = guest.spot.y + c.dropHeight * (1 - fall * fall);
      root.scale.y = c.characterScale * 1.12; // stretched while falling
      return;
    }
    // Landed: squash, then spring back.
    const after = guest.drop - c.dropSeconds;
    if (guest.drop - dt < c.dropSeconds) {
      // The frame it touches down.
      const at = root.getWorldPosition(new THREE.Vector3());
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(root.parent!.getWorldQuaternion(new THREE.Quaternion()));
      this.confetti.burst(at.addScaledVector(up, 0.3), guest.player.colour, up);
      guest.character.play('cheer');
    }
    const squash = after < 0.35 ? Math.sin((after / 0.35) * Math.PI) * 0.22 : 0;
    root.scale.set(c.characterScale * (1 + squash * 0.6), c.characterScale * (1 - squash), c.characterScale * (1 + squash * 0.6));
    if (after >= 0.35) guest.drop = -1;
  }

  private resize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.fit = Math.max(1, TUNING.hub.fitAspect / this.camera.aspect);
    // Upright screens have the game card at the bottom: show the cube a little higher.
    if (this.camera.aspect < 1) this.camera.setViewOffset(width, height, 0, height * TUNING.hub.portraitLift, width, height);
    else this.camera.clearViewOffset();
  }

  /** Turns the cube around the screen's up axis (yaw) and side axis (pitch), like grabbing it. */
  private turnBy(yaw: number, pitch: number): void {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(SIDE, pitch));
    this.spinner.quaternion.premultiply(q).normalize();
  }

  /** Drag to spin the cube; a click (no drag) on a side chooses that game, a click into space lets go. */
  private listenToPointer(): void {
    const canvas = this.renderer.domElement;
    const zoomTo = (distance: number): void => {
      const c = TUNING.hub;
      this.targetDistance = THREE.MathUtils.clamp(distance, c.zoomMin, c.zoomMax);
    };
    const spread = (): number => {
      const [a, b] = [...this.touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    canvas.addEventListener('pointerdown', (e) => {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        // A second finger: stop turning, pinch to zoom instead.
        this.drag = null;
        this.spin.set(0, 0);
        this.pinch = spread();
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = 'grabbing';
      this.drag = { x: e.clientX, y: e.clientY, moved: 0, time: performance.now() };
      this.spin.set(0, 0);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        const now = spread();
        if (this.pinch > 0 && now > 0) zoomTo(this.targetDistance * (this.pinch / now));
        this.pinch = now;
        return;
      }
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
      this.touches.delete(e.pointerId);
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
        zoomTo(this.targetDistance * Math.exp(amount));
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
        // Someone who just joined jumps down onto the cube (if its side is already turned up).
        const arriving = this.arrivals.has(player.id) && this.spinner.quaternion.angleTo(this.poses[this.chosen]) < 0.2;
        guest = { player, character, tag: makeTag(), age: arriving ? 10 : 0, hitUntil: 0, hitText: '', drop: arriving ? 0 : -1, spot: new THREE.Vector3() };
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
      guest.spot.copy(spot);
      if (guest.age === 0 || guest.drop === 0) guest.character.place(spot, -x * 0.1);
      else guest.character.setTarget(spot, -x * 0.1);
      (guest.tag.firstChild as HTMLElement).style.background = player.colour;
      guest.tag.style.opacity = player.connected ? '1' : '0.6';
    });
    this.arrivals.clear();
  }

  private clearGuests(): void {
    for (const guest of this.guests.values()) this.removeGuest(guest);
    this.guests.clear();
  }

  /** Starts the goodbye: a puff of confetti in the player's colour, then spin, hop up and shrink away. */
  private leave(guest: Guest): void {
    guest.tag.remove();
    const root = guest.character.root;
    if (!root.parent) return;
    const at = root.getWorldPosition(new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(root.parent.getWorldQuaternion(new THREE.Quaternion()));
    this.confetti.burst(at.addScaledVector(up, 0.3), guest.player.colour, up);
    this.leaving.push({ guest, t: 0 });
  }

  private updateLeaving(dt: number): void {
    const c = TUNING.hub;
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const l = this.leaving[i];
      l.t += dt / 0.5;
      const root = l.guest.character.root;
      if (l.t >= 1) {
        this.removeGuest(l.guest);
        this.leaving.splice(i, 1);
        continue;
      }
      root.rotation.y += dt * 18;
      root.position.y += dt * 2.2 * (1 - l.t);
      root.scale.setScalar(Math.max(0.001, c.characterScale * (1 - l.t * l.t)));
      l.guest.character.update(dt);
    }
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

/** One layer of stars that twinkle (each at its own pace). Layer 0 is the nearest and brightest. */
function makeStars(layer: number, share: number, size: number): THREE.Points {
  const random = seededRandom(7 + layer * 13);
  const count = Math.round(TUNING.hub.stars * share);
  const positions: number[] = [];
  const phases: number[] = [];
  const radius = 110 + layer * 30;
  for (let k = 0; k < count; k++) {
    const v = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize().multiplyScalar(radius + random() * 20);
    positions.push(v.x, v.y, v.z);
    phases.push(random() * 100);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  return new THREE.Points(geometry, pointMaterial(size * 2.2, '#ffffff', 0.35, 1.0, false));
}

/** Soft glowing specks drifting slowly round the cube. */
function makeDust(): THREE.Points {
  const random = seededRandom(31);
  const positions: number[] = [];
  const phases: number[] = [];
  for (let k = 0; k < TUNING.hub.dust; k++) {
    const a = random() * Math.PI * 2;
    const r = 6 + random() * 9;
    positions.push(Math.cos(a) * r, (random() - 0.5) * 10, Math.sin(a) * r);
    phases.push(random() * 100);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.Float32BufferAttribute(phases, 1));
  return new THREE.Points(geometry, pointMaterial(9, TUNING.hub.glowColour, 0.0, 0.5, true));
}

/** Round soft points whose brightness breathes between `low` and `high`. */
function pointMaterial(size: number, colour: string, low: number, high: number, attenuate: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, colour: { value: new THREE.Color(colour) }, size: { value: size * Math.min(window.devicePixelRatio, 2) } },
    vertexShader: `
      attribute float phase; uniform float time; uniform float size; varying float glow;
      void main() {
        glow = mix(${low.toFixed(2)}, ${high.toFixed(2)}, 0.5 + 0.5 * sin(time * (0.6 + fract(phase) * 1.8) + phase));
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * view;
        gl_PointSize = ${attenuate ? 'size * 10.0 / -view.z' : 'size'};
      }`,
    fragmentShader: `
      uniform vec3 colour; varying float glow;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        gl_FragColor = vec4(colour * glow, a * a * glow);
      }`,
  });
}

/** Big faint clouds of colour far behind the cube, so space has depth without stealing the show. */
function makeNebula(): THREE.Sprite[] {
  const clouds: [string, number, number, number, number][] = [
    ['#6b3fd1', -70, 25, -120, 120],
    ['#2a6ad8', 80, -20, -130, 110],
    ['#c4479b', 30, 45, -150, 90],
  ];
  return clouds.map(([colour, x, y, z, scale]) => {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTexture(colour), transparent: true, opacity: TUNING.hub.nebulaOpacity, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(scale);
    return sprite;
  });
}

/** A small thing that circles the cube like a moon. */
function makeOrbiter(kind: string, size: number): THREE.Object3D {
  if (kind === 'golfball') {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(size, 32, 20),
      new THREE.MeshStandardMaterial({ color: '#f4f6ff', roughness: 0.45, bumpMap: dimpleTexture(), bumpScale: 1.5 }),
    );
    ball.castShadow = true;
    return ball;
  }
  if (kind === 'shuttle') {
    // Flies cork first along its ring.
    const shuttle = new THREE.Group();
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6, side: THREE.DoubleSide }));
    skirt.position.y = 0.1;
    const cork = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshStandardMaterial({ color: '#ff5b3a', emissive: '#ff3a1a', emissiveIntensity: 0.8 }));
    cork.position.y = -0.04;
    shuttle.add(skirt, cork);
    shuttle.scale.setScalar(size);
    shuttle.rotation.x = Math.PI / 2;
    return shuttle;
  }
  const cube = new THREE.Mesh(new RoundedBoxGeometry(size, size, size, 3, size * 0.2), new THREE.MeshStandardMaterial({ color: '#b9a6ff', roughness: 0.35, emissive: '#5b46c9', emissiveIntensity: 0.4 }));
  cube.rotation.set(0.5, 0, 0.6);
  return cube;
}

/** Dimples for the golf ball (a bump map of little round dents). */
function dimpleTexture(): THREE.Texture {
  return canvasTexture(256, 128, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#9a9a9a';
    for (let y = 6; y < 128; y += 11) {
      for (let x = (y / 11) % 2 ? 6 : 12; x < 256; x += 12) {
        c.beginPath();
        c.arc(x, y, 3.6, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
}

/** All colour-carrying materials of a side, with their own colours (for dimming). */
function collectPalette(world: THREE.Object3D): { material: THREE.Material & { color: THREE.Color }; colour: THREE.Color; emissive: THREE.Color | null }[] {
  const seen = new Set<THREE.Material>();
  const palette: { material: THREE.Material & { color: THREE.Color }; colour: THREE.Color; emissive: THREE.Color | null }[] = [];
  world.traverse((o) => {
    const materials = (o as THREE.Mesh).material;
    for (const material of Array.isArray(materials) ? materials : materials ? [materials] : []) {
      if (seen.has(material)) continue;
      // Shaders that can be dimmed say so with a "brightness" uniform; the palette keeps them with no colour.
      if (material instanceof THREE.ShaderMaterial && material.uniforms.brightness) {
        seen.add(material);
        palette.push({ material: material as unknown as THREE.Material & { color: THREE.Color }, colour: new THREE.Color(), emissive: null });
        continue;
      }
      if (!('color' in material)) continue;
      seen.add(material);
      const m = material as THREE.Material & { color: THREE.Color; emissive?: THREE.Color };
      palette.push({ material: m, colour: m.color.clone(), emissive: m.emissive ? m.emissive.clone() : null });
    }
  });
  return palette;
}

/** A soft glow that is strongest along the edges of a side and fades towards its middle. */
function sideGlowTexture(): THREE.Texture {
  return canvasTexture(256, 256, (c) => {
    c.filter = 'blur(14px)';
    c.strokeStyle = '#ffffff';
    c.lineWidth = 26;
    c.beginPath();
    c.roundRect(28, 28, 200, 200, 30);
    c.stroke();
    c.filter = 'none';
    const fill = c.createRadialGradient(128, 128, 20, 128, 128, 130);
    fill.addColorStop(0, 'rgba(255,255,255,0.18)');
    fill.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = fill;
    c.fillRect(0, 0, 256, 256);
  });
}

/** A square ring (a frame around one side of the cube) with rounded corners. */
function frameGeometry(outer: number, inner: number, corner: number): THREE.ShapeGeometry {
  const rounded = (size: number, r: number): THREE.Shape | THREE.Path => {
    const h = size / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-h + r, -h);
    shape.lineTo(h - r, -h);
    shape.quadraticCurveTo(h, -h, h, -h + r);
    shape.lineTo(h, h - r);
    shape.quadraticCurveTo(h, h, h - r, h);
    shape.lineTo(-h + r, h);
    shape.quadraticCurveTo(-h, h, -h, h - r);
    shape.lineTo(-h, -h + r);
    shape.quadraticCurveTo(-h, -h, -h + r, -h);
    return shape;
  };
  const shape = rounded(outer, corner) as THREE.Shape;
  shape.holes.push(rounded(inner, corner * 0.6) as THREE.Path);
  return new THREE.ShapeGeometry(shape, 12);
}

/** Two little pastel planets far away. */
/** Planets far away: a pink one with a ring, a small icy one and a big striped one in the distance. */
function makePlanets(): THREE.Object3D[] {
  const planet = (radius: number, colours: string[], x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 40, 24),
      new THREE.MeshStandardMaterial({ map: bandTexture(colours), roughness: 0.7, emissive: colours[0], emissiveIntensity: 0.12 }),
    );
    mesh.position.set(x, y, z);
    mesh.rotation.z = 0.3;
    return mesh;
  };
  const pink = planet(6, ['#ff9ad1', '#ffc2e3', '#e478b8'], -45, 18, -70);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(8, 12, 64),
    new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.8 }),
  );
  ring.rotation.set(1.2, 0.2, 0.3);
  pink.add(ring);
  const icy = planet(3, ['#7ff3ff', '#bffaff', '#5fd4e6'], 40, -12, -60);
  const giant = planet(14, ['#ffb35c', '#ffd59a', '#e58a3a', '#ffc77e'], 95, 48, -150);
  return [pink, icy, giant];
}

/** Soft horizontal stripes, like a gas planet. */
function bandTexture(colours: string[]): THREE.Texture {
  return canvasTexture(64, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    colours.concat(colours).forEach((colour, k, all) => g.addColorStop(k / (all.length - 1), colour));
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 256);
  });
}

/** A planet ring: faint bands that fade at the inner and outer edge. */
function ringTexture(): THREE.Texture {
  return canvasTexture(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 85, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,220,240,0)');
    g.addColorStop(0.2, 'rgba(255,220,240,0.7)');
    g.addColorStop(0.45, 'rgba(255,190,225,0.35)');
    g.addColorStop(0.6, 'rgba(255,230,245,0.75)');
    g.addColorStop(1, 'rgba(255,220,240,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 256);
  });
}

/** Light along the cube's silhouette: drawn on the inside of a slightly bigger copy, brightest where it turns away. */
function outlineMaterial(colour: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { colour: { value: new THREE.Color(colour) }, strength: { value: TUNING.hub.outlineStrength } },
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-view.xyz);
        gl_Position = projectionMatrix * view;
      }`,
    fragmentShader: `
      uniform vec3 colour; uniform float strength; varying vec3 vNormal; varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 4.0);
        gl_FragColor = vec4(colour * rim * strength, rim);
      }`,
  });
}

/** Now and then a shooting star streaks across the sky far behind the cube. */
class ShootingStar {
  readonly mesh: THREE.Mesh;
  private wait = 3;
  private age = 1;
  private readonly velocity = new THREE.Vector3();

  constructor() {
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: streakTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
    );
    this.mesh.scale.set(18, 0.5, 1);
    this.mesh.visible = false;
  }

  update(dt: number): void {
    const c = TUNING.hub;
    this.wait -= dt;
    if (this.wait <= 0) {
      // A new one: somewhere high up, flying down and sideways.
      this.wait = c.shootingStarEvery[0] + Math.random() * (c.shootingStarEvery[1] - c.shootingStarEvery[0]);
      this.age = 0;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.mesh.position.set(-side * (20 + Math.random() * 60), 25 + Math.random() * 35, -90);
      this.velocity.set(side * (60 + Math.random() * 30), -(25 + Math.random() * 20), 0);
      this.mesh.rotation.z = Math.atan2(this.velocity.y, this.velocity.x);
      this.mesh.visible = true;
    }
    if (!this.mesh.visible) return;
    this.age += dt;
    const life = this.age / c.shootingStarSeconds;
    this.mesh.position.addScaledVector(this.velocity, dt);
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = Math.sin(Math.min(1, life) * Math.PI);
    if (life >= 1) this.mesh.visible = false;
  }
}

/** A bright head on the right fading into a long tail on the left. */
function streakTexture(): THREE.Texture {
  return canvasTexture(256, 16, (c) => {
    const g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(180,220,255,0)');
    g.addColorStop(0.85, 'rgba(220,240,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,1)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 8);
    c.lineTo(250, 3);
    c.arc(250, 8, 5, -Math.PI / 2, Math.PI / 2);
    c.closePath();
    c.fill();
  });
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

/** A dark glass label with a dot in the player's colour and their name. */
function makeTag(): HTMLElement {
  const tag = document.createElement('div');
  tag.style.cssText =
    'position:absolute;left:0;top:0;display:flex;align-items:center;gap:8px;padding:5px 14px 5px 7px;border-radius:999px;' +
    'background:var(--cw-surface-strong);border:1px solid var(--cw-stroke-strong);color:var(--cw-text);' +
    'font:800 clamp(13px,1.2vw,20px) var(--cw-font);white-space:nowrap;max-width:14vw;' +
    'box-shadow:var(--cw-shadow-pop);transform-origin:50% 100%';
  const dot = document.createElement('span');
  dot.style.cssText = 'width:0.85em;height:0.85em;border-radius:50%;flex:0 0 auto;box-shadow:0 0 0 2px rgba(255,255,255,0.25)';
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
