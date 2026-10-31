import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';

// The shuttle and the rackets. The court and everything around it (the venue) is built in venue/.

/** The shuttle, built pointing along +y (cork at the origin, feathers above). */
export function buildShuttle(): THREE.Group {
  const shuttle = new THREE.Group();
  // Glowing red, so it is easy to follow against the sky and the sand.
  const red = new THREE.MeshStandardMaterial({ color: '#ff1a1a', emissive: '#ff0000', emissiveIntensity: 0.7, roughness: 0.5, side: THREE.DoubleSide });
  const cork = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), red);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.03, 0.12, 14, 1, true), red);
  skirt.position.y = 0.075;
  shuttle.add(cork, skirt);
  shuttle.traverse((o) => (o.castShadow = true));
  return shuttle;
}

/** A racket for a character's hand (in the arm's own coordinates: the arm hangs along -y, the hand is at y = -0.17). */
export function buildRacket(colour: string): THREE.Group {
  const racket = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.4 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), new THREE.MeshStandardMaterial({ color: '#222831' }));
  handle.position.y = -0.24;
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.009, 6, 20), frame);
  head.scale.set(0.8, 1.1, 1);
  head.position.y = -0.42;
  const strings = new THREE.Mesh(
    new THREE.CircleGeometry(0.072, 18),
    new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
  );
  strings.scale.copy(head.scale);
  strings.position.copy(head.position);
  racket.add(handle, head, strings);
  racket.traverse((o) => (o.castShadow = true));
  return racket;
}
