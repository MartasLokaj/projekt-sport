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

/**
 * How much the ball curves for a phone twisted by `twist` degrees at impact:
 * a sideways pull, positive = to the left. Small twists do nothing.
 */
export function curveFromTwist(twist: number | null): number {
  const b = TUNING.ball;
  if (twist === null || Math.abs(twist) <= b.curveDeadzone) return 0;
  const degrees = Math.min(b.curveMaxDegrees, Math.abs(twist) - b.curveDeadzone);
  return Math.sign(twist) * degrees * b.curvePerDegree * b.curveSign;
}

/** Bends a rolling ball sideways. The pull grows with speed, so curves show most on long shots. Call every physics step. */
export function applyCurve(ball: RAPIER.RigidBody, curve: number, dt: number): void {
  if (curve === 0) return;
  const v = ball.linvel();
  const speed = Math.hypot(v.x, v.z);
  if (speed < 0.05) return;
  // Left of the direction of travel (seen from above, y up).
  const leftX = v.z / speed;
  const leftZ = -v.x / speed;
  const push = curve * speed * speed * dt;
  ball.setLinvel({ x: v.x + leftX * push, y: v.y, z: v.z + leftZ * push }, true);
}
