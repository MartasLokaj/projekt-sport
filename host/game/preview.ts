import type RAPIER from '@dimforge/rapier3d-compat';
import { TUNING } from '../../shared/tuning.ts';
import { applyCurve, applyRollingResistance, createBall, shotSpeed } from './ball.ts';

// Estimates roughly how far a shot would roll, for the distance marker on the aim line.
// It runs the same ball physics on an invisible, endless flat floor (no walls, no cup),
// so it shows "about this far" without giving away bounces.

export class DistancePreview {
  private readonly world: RAPIER.World;
  private readonly ball: RAPIER.RigidBody;

  constructor(private readonly R: typeof RAPIER) {
    this.world = new R.World({ x: 0, y: -TUNING.physics.gravity, z: 0 });
    this.world.timestep = 1 / TUNING.physics.stepsPerSecond;
    const floor = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -0.1, 0));
    this.world.createCollider(R.ColliderDesc.cuboid(500, 0.1, 500).setFriction(TUNING.course.floorFriction), floor);
    this.ball = createBall(this.world, R);
    this.world.step();
  }

  /** Where the ball would stop, starting at the origin and rolling along +z. */
  predict(power: number, curve: number): { x: number; z: number } {
    const b = TUNING.ball;
    this.ball.setTranslation({ x: 0, y: b.radius + 0.005, z: 0 }, true);
    this.ball.setLinvel({ x: 0, y: 0, z: shotSpeed(power) }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const dt = this.world.timestep;
    const maxSteps = TUNING.aimLine.previewSeconds / dt;
    for (let i = 0; i < maxSteps; i++) {
      applyRollingResistance(this.ball, this.world, this.R, dt);
      applyCurve(this.ball, curve, dt);
      this.world.step();
      const v = this.ball.linvel();
      if (Math.hypot(v.x, v.z) < b.restSpeed) break;
    }
    const p = this.ball.translation();
    return { x: p.x, z: p.z };
  }
}
