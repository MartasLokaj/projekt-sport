import type RAPIER from '@dimforge/rapier3d-compat';
import { TUNING } from '../../shared/tuning.ts';
import { applyRollingResistance, createBall, shotSpeed } from './ball.ts';
import { buildCourse, isInCup, type HoleDef } from './course.ts';

// Predicts where a shot would roll, for the practice swing.
// It runs the same physics in a separate, invisible copy of the hole, much faster than real time.

export type Prediction = { points: { x: number; z: number }[]; holed: boolean };

export class ShotPreview {
  private readonly world: RAPIER.World;
  private readonly ball: RAPIER.RigidBody;

  constructor(
    private readonly hole: HoleDef,
    R: typeof RAPIER,
  ) {
    this.world = new R.World({ x: 0, y: -TUNING.physics.gravity, z: 0 });
    this.world.timestep = 1 / TUNING.physics.stepsPerSecond;
    buildCourse(hole, this.world, R); // the meshes it returns are not needed here
    this.ball = createBall(this.world, R);
    this.world.step();
  }

  predict(from: { x: number; z: number }, yaw: number, power: number): Prediction {
    const b = TUNING.ball;
    const speed = shotSpeed(power);
    this.ball.setTranslation({ x: from.x, y: b.radius + 0.005, z: from.z }, true);
    this.ball.setLinvel({ x: Math.sin(yaw) * speed, y: 0, z: Math.cos(yaw) * speed }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);

    const dt = this.world.timestep;
    const points = [{ x: from.x, z: from.z }];
    const maxSteps = TUNING.practice.previewSeconds / dt;
    let rest = 0;
    for (let i = 0; i < maxSteps; i++) {
      applyRollingResistance(this.ball, dt);
      this.world.step();
      const p = this.ball.translation();
      const last = points[points.length - 1];
      if (Math.hypot(p.x - last.x, p.z - last.z) >= TUNING.practice.dotSpacing) points.push({ x: p.x, z: p.z });
      if (isInCup(p, this.hole)) return { points, holed: true };
      if (p.y < TUNING.physics.outOfBoundsY) break;
      const v = this.ball.linvel();
      rest = Math.hypot(v.x, v.y, v.z) < b.restSpeed ? rest + dt : 0;
      if (rest * 1000 >= b.restTimeMs) break;
    }
    const p = this.ball.translation();
    points.push({ x: p.x, z: p.z });
    return { points, holed: false };
  }
}
