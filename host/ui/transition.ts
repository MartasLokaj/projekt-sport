import { TUNING } from '../../shared/tuning.ts';

/** A soft full-screen flash that hides the switch between the cube and a game. */
export class Flash {
  private readonly el = document.createElement('div');

  constructor() {
    this.el.id = 'scene-flash';
    this.el.style.background = TUNING.transition.flashColour;
    document.body.append(this.el);
  }

  /** Fades the flash in; resolves when the screen is fully covered. */
  cover(): Promise<void> {
    const ms = TUNING.transition.flashInMs;
    this.el.style.transition = `opacity ${ms}ms ease-in`;
    this.el.style.opacity = '1';
    return new Promise((done) => setTimeout(done, ms));
  }

  /** Fades the flash out again, showing what is behind it now. */
  reveal(): void {
    this.el.style.transition = `opacity ${TUNING.transition.flashOutMs}ms ease-out`;
    this.el.style.opacity = '0';
  }
}
