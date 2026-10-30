import type RAPIER from '@dimforge/rapier3d-compat';
import { TUNING } from '../../shared/tuning.ts';

// Ball physics shared by the game (and by test scripts).

export function createBall(world: RAPIER.World, R: typeof RAPIER): RAPIER.RigidBody {
  const b = TUNING.ball;
  const ball = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setLinearDamping(b.linearDamping)
      .setAngularDamping(b.angularDamping)
      .setCcdEnabled(true)
      .setCanSleep(false),
  );
  world.createCollider(R.ColliderDesc.ball(b.radius).setRestitution(b.bounce).setFriction(0.5), ball);
  return ball;
}

/**
 * Starting speed for a hit. Speed grows with the square root of power,
 * so the rolling distance grows evenly: 50 % power rolls about half as far as 100 %.
 */
export function shotSpeed(power: number): number {
  const b = TUNING.ball;
  const t = Math.pow(Math.max(0, Math.min(100, power)) / 100, b.shotCurveExponent);
  return b.minShotSpeed + (b.maxShotSpeed - b.minShotSpeed) * t;
}

/** Grass slows a rolling ball down by a steady amount, so it stops cleanly instead of creeping. Call every physics step. */
export function applyRollingResistance(ball: RAPIER.RigidBody, dt: number): void {
  const p = ball.translation();
  const onFloor = p.y > 0 && p.y < TUNING.ball.radius + 0.02;
  if (!onFloor) return;
  const v = ball.linvel();
  const speed = Math.hypot(v.x, v.z);
  if (speed === 0) return;
  const scale = Math.max(0, speed - TUNING.ball.rollingResistance * dt) / speed;
  ball.setLinvel({ x: v.x * scale, y: v.y, z: v.z * scale }, true);
}
