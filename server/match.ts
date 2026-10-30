import type { BallResult, GameState } from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';

// Turns, strokes and scores. The server is the referee: it decides whose turn it is,
// counts strokes and keeps the score. The host only reports what the ball did.

type Done = 'holed' | 'picked_up';

export class Match {
  private phase: GameState['phase'] = 'lobby';
  private order: string[] = [];
  private current: string | null = null;
  private turn = 0;
  private strokes = new Map<string, number>();
  private done = new Map<string, Done>();
  /** True between a stroke and the host's report of where the ball ended up. */
  private waitingForBall = false;

  get playing(): boolean {
    return this.phase === 'playing';
  }

  get currentPlayer(): string | null {
    return this.current;
  }

  start(playerIds: string[], isConnected: (id: string) => boolean): void {
    this.phase = 'playing';
    this.order = [...playerIds];
    this.strokes = new Map(playerIds.map((id) => [id, 0]));
    this.done.clear();
    this.current = null;
    this.waitingForBall = false;
    this.nextTurn(isConnected);
  }

  end(): void {
    this.phase = 'lobby';
    this.order = [];
    this.current = null;
    this.waitingForBall = false;
    this.turn++;
  }

  /** May this player hit (or aim, or practise) right now? */
  canAct(playerId: string): boolean {
    return this.phase === 'playing' && this.current === playerId && !this.waitingForBall;
  }

  stroke(playerId: string): void {
    if (!this.canAct(playerId)) return;
    this.strokes.set(playerId, (this.strokes.get(playerId) ?? 0) + 1);
    this.waitingForBall = true;
  }

  ballResult(result: BallResult, isConnected: (id: string) => boolean): void {
    const id = this.current;
    if (!this.waitingForBall || id === null) return;
    this.waitingForBall = false;
    if (result === 'out') this.strokes.set(id, (this.strokes.get(id) ?? 0) + 1); // penalty
    if (result === 'holed') this.done.set(id, 'holed');
    else if ((this.strokes.get(id) ?? 0) >= TUNING.rules.maxStrokes) this.done.set(id, 'picked_up');
    this.nextTurn(isConnected);
  }

  /** The current player's phone went away before hitting: let the next player go. */
  skipIfAway(isConnected: (id: string) => boolean): void {
    if (this.phase === 'playing' && this.current && !this.waitingForBall && !isConnected(this.current)) {
      this.nextTurn(isConnected);
    }
  }

  state(leaderId: string | null): GameState {
    return {
      phase: this.phase,
      leaderId,
      current: this.current,
      turn: this.turn,
      players: this.order.map((id) => {
        const strokes = this.strokes.get(id) ?? 0;
        const done = this.done.get(id) ?? null;
        return { id, strokes, done, score: done === 'picked_up' ? TUNING.rules.pickedUpScore : strokes };
      }),
    };
  }

  /** Next player in the fixed order who has not finished. Players whose phone is away are skipped while others can play. */
  private nextTurn(isConnected: (id: string) => boolean): void {
    this.turn++;
    const waiting = this.order.filter((id) => !this.done.has(id));
    if (waiting.length === 0) {
      this.phase = 'hole_end';
      this.current = null;
      return;
    }
    const startAt = this.current === null ? 0 : this.order.indexOf(this.current) + 1;
    const rotated = [...this.order.slice(startAt), ...this.order.slice(0, startAt)].filter((id) => !this.done.has(id));
    this.current = rotated.find(isConnected) ?? rotated[0];
  }
}
