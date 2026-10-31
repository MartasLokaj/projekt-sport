import * as THREE from 'three';
import { TUNING } from '../../shared/tuning.ts';

// Graybox look for the prototype: plain sand, a court with white lines, a net, a shuttle and rackets.
// The real beach (palms, waves, sky) comes in phase B5; keep this file the only place that builds the venue.

export function buildCourt(): THREE.Group {
  const cfg = TUNING.badminton;
  const group = new THREE.Group();

  const sand = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: cfg.sandColour, roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.receiveShadow = true;
  group.add(sand);

  const w = cfg.courtHalfWidth;
  const l = cfg.courtHalfLength;
  const court = new THREE.Mesh(new THREE.PlaneGeometry(w * 2 + 0.6, l * 2 + 0.6), new THREE.MeshStandardMaterial({ color: cfg.courtColour, roughness: 1 }));
  court.rotation.x = -Math.PI / 2;
  court.position.y = 0.005;
  court.receiveShadow = true;
  group.add(court);

  // Lines: sidelines, baselines, centre line and the short service lines.
  const lineMaterial = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const line = (x: number, z: number, sx: number, sz: number): void => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(sx, sz), lineMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.01, z);
    group.add(mesh);
  };
  const t = 0.05;
  for (const sx of [-1, 1]) line(sx * w, 0, t, l * 2);
  for (const sz of [-1, 1]) {
    line(0, sz * l, w * 2, t);
    const s = cfg.shortServiceLine;
    line(0, sz * s, w * 2, t);
    line(0, (sz * (s + l)) / 2, t, l - s);
  }

  // Net: two posts, a see-through mesh and a white band on top.
  const postMaterial = new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.5 });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, cfg.netHeight + 0.05, 10), postMaterial);
    post.position.set(sx * (w + 0.15), (cfg.netHeight + 0.05) / 2, 0);
    post.castShadow = true;
    group.add(post);
  }
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 2 + 0.3, 0.76),
    new THREE.MeshStandardMaterial({ color: '#2f3a56', transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  );
  net.position.set(0, cfg.netHeight - 0.38, 0);
  const band = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.3, 0.06, 0.02), postMaterial);
  band.position.set(0, cfg.netHeight - 0.03, 0);
  group.add(net, band);
  return group;
}

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
