import { type BallResult, type GameState } from '../shared/protocol.ts';
import { TUNING } from '../shared/tuning.ts';

// Turns, strokes and scores over the game's holes (its course). The server is the referee: it decides whose turn it is,
// counts strokes and keeps the score. The host only reports what the ball did.

type Done = 'holed' | 'picked_up';

export class Match {
  private phase: GameState['phase'] = 'lobby';
  private order: string[] = [];
  private current: string | null = null;
  private turn = 0;
  private hole = 0;
  /** The holes of this game, in order (indexes into the host's HOLES). */
  private course: number[] = [];
  /** Scores of the finished holes, per player. */
  private holeScores = new Map<string, number[]>();
  private strokes = new Map<string, number>();
  private done = new Map<string, Done>();
  /** True between a stroke and the host's report of where the ball ended up. */
  private waitingForBall = false;

  get playing(): boolean {
    return this.phase === 'playing';
  }

  /** A new game may start from the lobby or after the last hole. */
  get canStart(): boolean {
    return this.phase === 'lobby' || this.phase === 'game_end';
  }

  get currentPlayer(): string | null {
    return this.current;
  }

  /**
   * course: the holes to play, in order (indexes into HOLES). firstHole: a testing shortcut to start later in the
   * course (the skipped holes show "–" on the scoreboard).
   */
  start(playerIds: string[], isConnected: (id: string) => boolean, course: number[], firstHole = 0): void {
    this.order = [...playerIds];
    this.course = [...course];
    this.holeScores = new Map(playerIds.map((id) => [id, []]));
    this.startHole(Math.min(firstHole, course.length - 1), isConnected);
  }

  /** After a hole's scoreboard: on to the next hole. */
  nextHole(isConnected: (id: string) => boolean): void {
    if (this.phase === 'hole_end') this.startHole(this.hole + 1, isConnected);
  }

  private startHole(hole: number, isConnected: (id: string) => boolean): void {
    this.phase = 'playing';
    this.hole = hole;
    this.strokes = new Map(this.order.map((id) => [id, 0]));
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
      hole: this.hole,
      holeCount: this.course.length,
      course: [...this.course],
      leaderId,
      current: this.current,
      turn: this.turn,
      players: this.order.map((id) => {
        const strokes = this.strokes.get(id) ?? 0;
        const done = this.done.get(id) ?? null;
        const score = this.score(id);
        const holeScores = this.holeScores.get(id) ?? [];
        const finished = holeScores.reduce((sum, s) => sum + (s ?? 0), 0);
        return { id, strokes, done, score, holeScores, total: finished + (this.phase === 'playing' ? score : 0) };
      }),
    };
  }

  private score(id: string): number {
    return this.done.get(id) === 'picked_up' ? TUNING.rules.pickedUpScore : (this.strokes.get(id) ?? 0);
  }

  /** Next player in the fixed order who has not finished. Players whose phone is away are skipped while others can play. */
  private nextTurn(isConnected: (id: string) => boolean): void {
    this.turn++;
    const waiting = this.order.filter((id) => !this.done.has(id));
    if (waiting.length === 0) {
      for (const id of this.order) {
        const scores = this.holeScores.get(id);
        if (scores) scores[this.hole] = this.score(id);
      }
      this.phase = this.hole + 1 >= this.course.length ? 'game_end' : 'hole_end';
      this.current = null;
      return;
    }
    const startAt = this.current === null ? 0 : this.order.indexOf(this.current) + 1;
    const rotated = [...this.order.slice(startAt), ...this.order.slice(0, startAt)].filter((id) => !this.done.has(id));
    this.current = rotated.find(isConnected) ?? rotated[0];
  }
}
