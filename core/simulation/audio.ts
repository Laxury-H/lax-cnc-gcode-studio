export class CncAudio {
  private ctx: AudioContext | null = null;
  
  private spindleOsc: OscillatorNode | null = null;
  private spindleGain: GainNode | null = null;
  
  private moveOsc: OscillatorNode | null = null;
  private moveGain: GainNode | null = null;
  private moveFilter: BiquadFilterNode | null = null;
  
  private isEnabled = false;

  constructor() {}

  public async init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    await this.ctx.resume();
    
    // Spindle graph
    this.spindleGain = this.ctx.createGain();
    this.spindleGain.gain.value = 0;
    this.spindleGain.connect(this.ctx.destination);
    
    this.spindleOsc = this.ctx.createOscillator();
    this.spindleOsc.type = 'triangle';
    this.spindleOsc.frequency.value = 100;
    this.spindleOsc.connect(this.spindleGain);
    this.spindleOsc.start();

    // Movement graph
    this.moveGain = this.ctx.createGain();
    this.moveGain.gain.value = 0;
    this.moveFilter = this.ctx.createBiquadFilter();
    this.moveFilter.type = 'lowpass';
    this.moveFilter.frequency.value = 1000;
    this.moveFilter.connect(this.moveGain);
    this.moveGain.connect(this.ctx.destination);
    
    this.moveOsc = this.ctx.createOscillator();
    this.moveOsc.type = 'sawtooth';
    this.moveOsc.frequency.value = 150;
    this.moveOsc.connect(this.moveFilter);
    this.moveOsc.start();

    this.isEnabled = true;
  }

  public setSpindle(on: boolean, rpm: number = 10000) {
    if (!this.isEnabled || !this.ctx || !this.spindleGain || !this.spindleOsc) return;
    
    if (on) {
      this.spindleGain.gain.setTargetAtTime(0.15, this.ctx.currentTime, 0.1);
      // Map RPM to frequency (rough approximation for sound effect)
      const freq = 100 + (rpm / 24000) * 300;
      this.spindleOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.5);
    } else {
      this.spindleGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    }
  }

  public setMove(isMoving: boolean, isRapid: boolean, feedrate: number = 1000) {
    if (!this.isEnabled || !this.ctx || !this.moveGain || !this.moveOsc || !this.moveFilter) return;

    if (isMoving) {
      if (isRapid) {
        // Smooth whir for rapids
        this.moveOsc.type = 'sine';
        this.moveFilter.frequency.setTargetAtTime(800, this.ctx.currentTime, 0.05);
        this.moveOsc.frequency.setTargetAtTime(300, this.ctx.currentTime, 0.1);
        this.moveGain.gain.setTargetAtTime(0.1, this.ctx.currentTime, 0.05);
      } else {
        // Grinding/cutting sound for feeds
        this.moveOsc.type = 'sawtooth';
        this.moveFilter.frequency.setTargetAtTime(2000, this.ctx.currentTime, 0.05);
        // Pitch based on feedrate
        const freq = 150 + Math.min(feedrate / 3000, 1) * 400;
        this.moveOsc.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.05);
        this.moveGain.gain.setTargetAtTime(0.2, this.ctx.currentTime, 0.05);
      }
    } else {
      this.moveGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  public playComplete() {
    if (!this.isEnabled || !this.ctx) return;
    
    // Play a nice completion chime (e.g., C6 and E6)
    const t = this.ctx.currentTime;
    
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1046.50, t); // C6
    gain1.gain.setValueAtTime(0, t);
    gain1.gain.linearRampToValueAtTime(0.3, t + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.51, t + 0.1); // E6
    gain2.gain.setValueAtTime(0, t + 0.1);
    gain2.gain.linearRampToValueAtTime(0.3, t + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);

    osc1.start(t);
    osc1.stop(t + 1.5);
    osc2.start(t + 0.1);
    osc2.stop(t + 2.0);
  }

  public stopAll() {
    this.setSpindle(false);
    this.setMove(false, false);
  }
}

export const cncAudio = new CncAudio();
