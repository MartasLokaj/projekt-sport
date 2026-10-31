import { TUNING } from '../../shared/tuning.ts';

// Sounds and music on the big screen (all CC0, see README): short effects, one music track at a time that
// fades over to the next, and the sea's waves now and then on the beach. Browsers only allow sound after the
// first key press or click on the page, so everything waits until then. M mutes everything (remembered).

export type SoundName =
  | 'ui-click'
  | 'ui-select'
  | 'ui-play'
  | 'ui-back'
  | 'ui-join'
  | 'ui-leave'
  | 'sparkle'
  | 'golf-putt'
  | 'golf-wall'
  | 'golf-cup'
  | 'golf-splash'
  | 'shuttle-hit'
  | 'shuttle-smash'
  | 'shuttle-sand'
  | 'shuttle-net'
  | 'jingle-hole-in'
  | 'jingle-hole-in-one'
  | 'jingle-point'
  | 'jingle-win'
  | 'jingle-super-smash';

export type MusicName = 'lobby' | 'minigolf' | 'badminton';

const MUTE_KEY = 'cubeworld.muted';

class Sound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private music: { name: MusicName; source: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wantedMusic: MusicName | null = null;
  private wavesTimer = 0;
  private readonly lastPlayed = new Map<SoundName, number>();
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // Storage blocked: start with sound on.
    }
    // Sound may only start after the first key press or click.
    const unlock = (): void => {
      this.start();
      if (this.context?.state === 'running') {
        window.removeEventListener('keydown', unlock, true);
        window.removeEventListener('pointerdown', unlock, true);
      }
    };
    window.addEventListener('keydown', unlock, true);
    window.addEventListener('pointerdown', unlock, true);
  }

  /** Plays a short sound. volume 0..1 on top of its own level; rate = pitch (1 = as recorded). */
  play(name: SoundName, volume = 1, rate = 1): void {
    const ctx = this.context;
    if (!ctx || !this.effects || ctx.state !== 'running') return;
    // The same sound at most once in a short moment (bounces in quick succession would pile up).
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -1e9) < TUNING.audio.repeatGapMs) return;
    this.lastPlayed.set(name, now);
    const level = TUNING.audio.levels[name] ?? 1;
    void this.buffer(name).then((buffer) => {
      if (!buffer || !this.effects) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = rate;
      const gain = ctx.createGain();
      gain.gain.value = Math.max(0, Math.min(4, volume * level));
      source.connect(gain).connect(this.effects);
      source.start();
    });
  }

  /** Switches the background music (null = none), fading the old track out and the new one in. */
  playMusic(name: MusicName | null): void {
    this.wantedMusic = name;
    this.updateWaves();
    if (!this.context || this.context.state !== 'running') return; // starts on unlock
    if (this.music?.name === name) return;
    const fade = TUNING.audio.musicFadeMs / 1000;
    const ctx = this.context;
    const old = this.music;
    if (old) {
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      old.source.stop(ctx.currentTime + fade * 2);
    }
    this.music = null;
    if (!name) return;
    void this.buffer(`music-${name}`).then((buffer) => {
      if (!buffer || !this.musicBus || this.wantedMusic !== name || this.music?.name === name) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(TUNING.audio.musicLevels[name], ctx.currentTime, fade / 3);
      source.connect(gain).connect(this.musicBus);
      source.start();
      this.music = { name, source, gain };
    });
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // Not remembered, but still works now.
    }
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.muted ? 0 : TUNING.audio.master, this.context.currentTime, 0.05);
    return this.muted;
  }

  private start(): void {
    if (!this.context) {
      const a = TUNING.audio;
      const ctx = new AudioContext();
      this.context = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : a.master;
      this.master.connect(ctx.destination);
      this.effects = ctx.createGain();
      this.effects.gain.value = a.effects;
      this.effects.connect(this.master);
      this.musicBus = ctx.createGain();
      this.musicBus.gain.value = a.music;
      this.musicBus.connect(this.master);
    }
    if (this.context.state === 'running') this.playMusic(this.wantedMusic);
    else void this.context.resume().then(() => this.playMusic(this.wantedMusic));
  }

  private buffer(file: string): Promise<AudioBuffer | null> {
    let loading = this.buffers.get(file);
    if (!loading) {
      const ctx = this.context!;
      loading = fetch(`/host/assets/audio/${file}.m4a`)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .catch((error: unknown) => {
          console.warn(`Sound ${file} could not load`, error);
          return null;
        });
      this.buffers.set(file, loading);
    }
    return loading;
  }

  /** On the beach a wave rolls in every few seconds, a little different each time. */
  private updateWaves(): void {
    window.clearTimeout(this.wavesTimer);
    if (this.wantedMusic !== 'badminton') return;
    const a = TUNING.audio.waves;
    const next = (): void => {
      if (this.wantedMusic !== 'badminton') return;
      this.playWave();
      this.wavesTimer = window.setTimeout(next, a.everyMs[0] + Math.random() * (a.everyMs[1] - a.everyMs[0]));
    };
    this.wavesTimer = window.setTimeout(next, 600);
  }

  private playWave(): void {
    const ctx = this.context;
    if (!ctx || !this.effects || ctx.state !== 'running') return;
    const a = TUNING.audio.waves;
    void this.buffer('ambient-waves').then((buffer) => {
      if (!buffer || !this.effects) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = a.rate[0] + Math.random() * (a.rate[1] - a.rate[0]);
      const gain = ctx.createGain();
      gain.gain.value = a.level * (0.7 + Math.random() * 0.3);
      source.connect(gain).connect(this.effects);
      source.start();
    });
  }
}

export const sound = new Sound();
