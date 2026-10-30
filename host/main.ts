import * as THREE from 'three';
import { WS_PATH, type ClientMessage, type ServerMessage } from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';

// Phase 0: a spinning cube proves Three.js works, and the label proves the server connection.

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fd3ff');
const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 5);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight('#ffffff', '#88aa66', 1.5));
const sun = new THREE.DirectionalLight('#fff4e0', 2);
sun.position.set(3, 5, 2);
scene.add(sun);

const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: '#5bc85b' }));
scene.add(cube);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  cube.rotation.y += TUNING.demoCube.spinSpeed * dt;
  cube.rotation.x += TUNING.demoCube.spinSpeed * 0.5 * dt;
  renderer.render(scene, camera);
});

const statusEl = document.getElementById('status')!;

function connect(): void {
  const ws = new WebSocket(`wss://${location.host}${WS_PATH}`);
  ws.addEventListener('open', () => {
    const hello: ClientMessage = { type: 'hello', role: 'host' };
    ws.send(JSON.stringify(hello));
  });
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data) as ServerMessage;
    if (msg.type === 'status') statusEl.textContent = `Server connected · Phones: ${msg.controllers}`;
  });
  ws.addEventListener('close', () => {
    statusEl.textContent = 'Server disconnected. Reconnecting…';
    setTimeout(connect, TUNING.network.reconnectDelayMs);
  });
}
connect();
