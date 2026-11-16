// 모든 소리를 Web Audio API 오실레이터/노이즈로 직접 만든다. (효과음 파일 없음)
//
//  - 대사 "삑" 소리: 인물별 목소리 프로필(data/voices.json)
//  - 알림 진동음: 문자/정산/입금 등
//  - 배경 소리: 빗소리, 물방울, 컨베이어, 냉장고 모터 등
//  - 정적(silence): 수확/붕괴 연출에서 모든 소리를 끊는다
//
// 아이패드 사파리는 사용자 터치 이벤트 안에서 AudioContext를 만들고/재개해야 소리가 난다.
// 그래서 첫 터치(및 이후 모든 터치)에서 unlock()을 호출한다.

import { Save } from './save.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.voices = {};
    this.settings = Save.settings();
    this.ambienceWanted = [];
    this.ambienceNodes = {};
    this.timers = {};
    this.silenced = false;
    this.lastBlip = 0;
    this.stepToggle = 0;
  }

  setVoices(voices) {
    this.voices = voices || {};
  }

  installUnlock() {
    const unlock = () => this.unlock();
    ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click'].forEach((ev) => {
      window.addEventListener(ev, unlock, { capture: true, passive: true });
    });
    // 앱 전환 후 돌아왔을 때 다시 깨우기
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.ctx && this.ctx.state !== 'running') {
        try { this.ctx.resume(); } catch (e) { /* 무시 */ }
      }
    });
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
      } catch (e) {
        return;
      }
      const ctx = this.ctx;
      this.master = ctx.createGain();
      this.master.connect(ctx.destination);
      this.voiceBus = ctx.createGain();
      this.voiceBus.connect(this.master);
      this.ambBus = ctx.createGain();
      this.ambBus.connect(this.master);
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);
      this.noiseBuffer = this.makeNoise('white');
      this.brownBuffer = this.makeNoise('brown');
      this.applySettings(this.settings);
      if (this.silenced) this.master.gain.value = 0;
      this.setAmbience(this.ambienceWanted);
    }
    if (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted') {
      try { this.ctx.resume(); } catch (e) { /* 무시 */ }
    }
    if (!this.primed) {
      // iOS: 사용자 제스처 안에서 무음 버퍼를 한 번 재생해 오디오 출력을 연다
      try {
        const b = this.ctx.createBuffer(1, 1, 22050);
        const s = this.ctx.createBufferSource();
        s.buffer = b;
        s.connect(this.ctx.destination);
        s.start(0);
        this.primed = true;
      } catch (e) { /* 무시 */ }
    }
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  makeNoise(kind) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        d[i] = w;
      }
    }
    return buf;
  }

  applySettings(settings) {
    this.settings = Object.assign({}, this.settings, settings);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.voiceBus.gain.setTargetAtTime(this.settings.voice ? this.settings.voiceVolume : 0, t, 0.02);
    this.ambBus.gain.setTargetAtTime(this.settings.ambienceVolume, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfxVolume, t, 0.02);
  }

  // ---------------------------------------------------------------
  // 대사 글자 소리
  // ---------------------------------------------------------------
  voiceProfile(id) {
    return this.voices[id] || this.voices.default || { wave: 'triangle', freq: 280, dur: 0.04, vol: 0.4 };
  }

  blip(voiceId, opts = {}) {
    if (!this.ready || this.silenced || !this.settings.voice) return;
    const v = this.voiceProfile(voiceId);
    if (v.mute) return;
    const thought = !!opts.thought;
    const tv = this.voices.thought || {};
    if (thought && tv.mute) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005;
    const minGap = v.minGap || 0.025;
    if (t - this.lastBlip < minGap) return;
    this.lastBlip = t;

    const dur = v.dur || 0.04;
    let f = v.freq || 280;
    if (v.steps && v.steps.length) {
      // 기계적인 소리: 정해진 음을 번갈아
      f = v.steps[this.stepToggle++ % v.steps.length];
    }
    f *= 1 + (Math.random() * 2 - 1) * (v.jitter || 0);
    // 변질된 잔상: 음이 조금씩 처지고 흔들린다 (opts.glitch 0~1)
    if (opts.glitch) f *= 1 - Math.random() * 0.25 * opts.glitch;
    if (opts.freqMul) f *= opts.freqMul;
    let vol = (v.vol || 0.4) * (opts.volMul != null ? opts.volMul : 1);
    if (thought) {
      f *= tv.freqMul || 0.7;
      vol *= tv.volMul || 0.15;
    }

    const osc = ctx.createOscillator();
    osc.type = v.wave || 'triangle';
    osc.frequency.setValueAtTime(f, t);
    if (v.slide) osc.frequency.linearRampToValueAtTime(f * v.slide, t + dur);

    const g = ctx.createGain();
    const atk = Math.min(v.attack || 0.004, dur / 3);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    let node = osc;
    const lp = thought ? Math.min(v.lowpass || 2000, 900) : v.lowpass;
    if (lp) {
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = lp;
      node.connect(filt);
      node = filt;
    }
    node.connect(g);
    g.connect(this.voiceBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);

    if (v.grit) {
      // 거친 목소리: 짧은 노이즈를 섞는다
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f * 2;
      bp.Q.value = 1.2;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * v.grit, t);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(this.voiceBus);
      n.start(t, Math.random());
      n.stop(t + dur + 0.02);
    }
  }

  // ---------------------------------------------------------------
  // 효과음
  // ---------------------------------------------------------------

  // 휴대폰 진동 같은 짧은 알림음 (문자/정산/입금)
  notify() {
    if (!this.ready || this.silenced) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.01;
    [0, 0.16].forEach((off) => {
      const t = t0 + off;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 38;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.5;
      const amp = ctx.createGain();
      amp.gain.value = 0.5;
      lfo.connect(lfoGain);
      lfoGain.connect(amp.gain);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.9, t + 0.01);
      env.gain.setValueAtTime(0.9, t + 0.09);
      env.gain.linearRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(amp);
      amp.connect(lp);
      lp.connect(env);
      env.connect(this.sfxBus);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + 0.14);
      lfo.stop(t + 0.14);
    });
  }

  // 전화 진동 (길게)
  vibrate(seconds = 0.9) {
    if (!this.ready || this.silenced) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 120;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 33;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.5;
    const amp = ctx.createGain();
    amp.gain.value = 0.5;
    lfo.connect(lfoGain);
    lfoGain.connect(amp.gain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.8, t + 0.02);
    env.gain.setValueAtTime(0.8, t + seconds - 0.04);
    env.gain.linearRampToValueAtTime(0.0001, t + seconds);
    osc.connect(amp);
    amp.connect(lp);
    lp.connect(env);
    env.connect(this.sfxBus);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + seconds + 0.02);
    lfo.stop(t + seconds + 0.02);
  }

  // "똑" — 양동이에 떨어지는 물방울
  drip(gain = 0.55, dest = null) {
    if (!this.ready || this.silenced) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(g);
    g.connect(dest || this.ambBus);
    osc.start(t);
    osc.stop(t + 0.2);
    // 물 위로 퍼지는 작은 울림
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.setValueAtTime(700, t + 0.03);
    o2.frequency.exponentialRampToValueAtTime(300, t + 0.2);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.0001, t + 0.03);
    g2.gain.linearRampToValueAtTime(gain * 0.25, t + 0.04);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o2.connect(g2);
    g2.connect(dest || this.ambBus);
    o2.start(t + 0.03);
    o2.stop(t + 0.3);
  }

  // 간단한 액션 효과음
  sfx(name, opts = {}) {
    if (!this.ready || this.silenced) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.005 + (opts.delay || 0);
    const vm = opts.vol != null ? opts.vol : 1;
    const tone = (type, f1, f2, dur, vol0, lp) => {
      const vol = Math.max(0.0002, vol0 * vm);
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f1, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let n = o;
      if (lp) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = lp;
        n.connect(f);
        n = f;
      }
      n.connect(g);
      g.connect(this.sfxBus);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const noise = (dur, vol0, freq, q = 1) => {
      const vol = Math.max(0.0002, vol0 * vm);
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      n.start(t, Math.random());
      n.stop(t + dur + 0.02);
    };
    // 바람 소리: 띠 통과 잡음의 중심 주파수를 위로 쓸어 올림
    const whoosh = (dur, vol, f1, f2) => {
      const n = ctx.createBufferSource();
      n.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.4;
      f.frequency.setValueAtTime(f1, t);
      f.frequency.exponentialRampToValueAtTime(f2, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(f);
      f.connect(g);
      g.connect(this.sfxBus);
      n.start(t, Math.random());
      n.stop(t + dur + 0.02);
    };
    switch (name) {
      case 'swing': whoosh(0.11, 0.28, 900, 3200); break;
      case 'swingHeavy': whoosh(0.16, 0.36, 600, 2600); break;
      // 둔탁한 타격음: 낮은 쿵 + 짧은 퍽
      case 'hit': tone('sine', 150, 55, 0.12, 0.5); noise(0.07, 0.45, 700, 0.9); tone('square', 260, 120, 0.05, 0.08, 900); break;
      // 3연타 마지막: 더 무겁게
      case 'hitHeavy': tone('sine', 110, 38, 0.22, 0.7); noise(0.12, 0.55, 420, 0.8); noise(0.05, 0.3, 2200, 1.5); tone('square', 180, 70, 0.1, 0.12, 700); break;
      // 패링 성공: 날카로운 금속음 (어긋난 배음이 길게 울림)
      case 'parryClang': [1870, 2630, 3410, 4980].forEach((fq, i) => tone('sine', fq, fq * 0.995, 0.6 - i * 0.1, 0.14 - i * 0.02)); noise(0.04, 0.4, 5000, 1.2); tone('triangle', 900, 700, 0.08, 0.15); break;
      // 패링 실패(너무 일찍): 짧고 둔한 소리
      case 'parryFail': tone('triangle', 160, 110, 0.09, 0.22, 600); noise(0.05, 0.15, 300); break;
      // 종이 상자: 들기(가벼운 바스락+퍽), 놓기(둔탁한 쿵)
      case 'boxPick': noise(0.06, 0.25, 1400, 0.7); tone('sine', 180, 120, 0.06, 0.2); break;
      case 'boxPut': tone('sine', 120, 55, 0.16, 0.55); noise(0.1, 0.35, 380, 0.7); noise(0.05, 0.12, 1800, 1); break;
      // 캡슐 뚜껑: 공기 빠지는 짧은 소리 / 잠기는 딸깍
      case 'capsuleHiss': {
        const n = ctx.createBufferSource();
        n.buffer = this.noiseBuffer;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 0.9;
        f.frequency.setValueAtTime(5200, t);
        f.frequency.exponentialRampToValueAtTime(900, t + 0.45);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.32, t + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
        n.connect(f);
        f.connect(g);
        g.connect(this.sfxBus);
        n.start(t, Math.random());
        n.stop(t + 0.55);
        break;
      }
      case 'capsuleLock': tone('square', 1800, 1200, 0.025, 0.12, 5000); setTimeout(() => this.sfx('capsuleLock2'), 70); break;
      case 'capsuleLock2': tone('square', 1300, 900, 0.03, 0.14, 4000); tone('sine', 160, 90, 0.08, 0.25); break;
      // 하린 빛 구슬: 맑은 '핑' / 맞음
      case 'orb': tone('sine', 1320, 1760, 0.12, 0.12); tone('triangle', 660, 990, 0.08, 0.06); break;
      case 'orbHit': tone('sine', 1760, 880, 0.1, 0.1); noise(0.05, 0.12, 4000, 1.5); break;
      // 따뜻한 등불 / 등불이 피어나지 못함
      case 'lamp': tone('sine', 520, 780, 0.5, 0.12); tone('sine', 780, 1040, 0.6, 0.07); break;
      case 'fizzle': noise(0.18, 0.08, 1800, 2); tone('sine', 440, 300, 0.18, 0.05); break;
      // 엄마 콧노래 (짧은 가락). broken 이면 음이 군데군데 끊긴다
      case 'hum':
      case 'humBroken': {
        const notes = [392, 440, 494, 440, 392, 330, 392];
        notes.forEach((f, i) => {
          if (name === 'humBroken' && Math.random() < 0.35) return;
          const d = name === 'humBroken' && Math.random() < 0.3 ? 0.12 : 0;
          this.sfx('humNote', { delay: (opts.delay || 0) + i * 0.32 + d, vol: vm, f });
        });
        break;
      }
      case 'humNote': {
        const f = opts.f || 392;
        tone('sine', f, f * 0.995, 0.3, 0.08);
        tone('triangle', f * 2, f * 2, 0.2, 0.015);
        break;
      }
      // 씹는 소리 (작아지게 vol 로)
      case 'chew': noise(0.07, 0.3, 700, 1.4); noise(0.05, 0.18, 1500, 1.2); break;
      // 고기 굽는 소리 한 번
      case 'sizzle': noise(0.5, 0.12, 5200, 0.7); break;
      case 'pop': noise(0.03, 0.2, 3000, 2); break;
      // 신발장·액자 등을 살필 때의 작은 소리 없음. 형태 공백의 속삭임은 목소리로
      // 튜토리얼 단계 성공
      case 'success': tone('triangle', 660, null, 0.09, 0.14); setTimeout(() => this.sfx('success2'), 90); break;
      case 'success2': tone('triangle', 990, null, 0.16, 0.14); break;
      case 'dash': noise(0.15, 0.2, 900, 0.6); break;
      case 'jump': tone('triangle', 260, 420, 0.08, 0.15); break;
      case 'parry': tone('square', 1200, 900, 0.18, 0.18, 4000); tone('sine', 2400, 2000, 0.25, 0.12); break;
      case 'parryReady': tone('sine', 900, 1100, 0.05, 0.08); break;
      case 'thud': tone('sine', 120, 50, 0.15, 0.5); noise(0.08, 0.25, 300); break;
      case 'pick': tone('triangle', 400, 600, 0.06, 0.15); break;
      case 'select': tone('square', 700, null, 0.04, 0.08, 2500); break;
      // 단말기 버튼: 짧고 깔끔한 전자음 / 켜짐 / 알림
      case 'ui': tone('sine', 1760, null, 0.035, 0.07); break;
      case 'uiSoft': tone('sine', 1320, null, 0.05, 0.035); break;
      case 'uiOn': tone('sine', 880, 1760, 0.18, 0.06); this.sfx('ui', { delay: 0.22, vol: 0.6 }); break;
      case 'ok': tone('triangle', 600, 900, 0.12, 0.15); break;
      case 'miss': tone('triangle', 200, 140, 0.12, 0.12); break;
      case 'stamp': tone('sine', 90, 40, 0.18, 0.5); noise(0.05, 0.3, 400); break;
      case 'pen': noise(0.05, 0.05, 3000, 2); break;
      case 'door': tone('sine', 180, 120, 0.2, 0.2); noise(0.12, 0.1, 500); break;
      case 'drip': this.drip(0.55, this.sfxBus); break;
      case 'breath': {
        // 캡슐 안 숨소리 (들숨-날숨)
        [0, 1.3].forEach((off, k) => {
          const n = ctx.createBufferSource();
          n.buffer = this.noiseBuffer;
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = k ? 500 : 800;
          f.Q.value = 0.7;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t + off);
          g.gain.linearRampToValueAtTime(0.35, t + off + 0.5);
          g.gain.linearRampToValueAtTime(0.0001, t + off + 1.1);
          n.connect(f);
          f.connect(g);
          g.connect(this.sfxBus);
          n.start(t + off, Math.random());
          n.stop(t + off + 1.2);
        });
        break;
      }
      case 'pot': tone('triangle', 900, 700, 0.12, 0.12); tone('sine', 1500, 1300, 0.2, 0.06); noise(0.06, 0.12, 2500); break;
      case 'elevator': tone('sine', 880, null, 0.5, 0.12); break;
      case 'vanish': noise(0.3, 0.2, 400, 0.5); break;
      default: break;
    }
  }

  // ---------------------------------------------------------------
  // 배경 소리
  // ---------------------------------------------------------------
  setAmbience(list) {
    this.ambienceWanted = (list || []).slice();
    if (!this.ctx) return;
    const want = new Set(this.ambienceWanted);
    Object.keys(this.ambienceNodes).forEach((name) => {
      if (!want.has(name)) this.stopAmb(name);
    });
    want.forEach((name) => {
      if (!this.ambienceNodes[name]) this.startAmb(name);
    });
  }

  startAmb(name) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.connect(this.ambBus);
    const nodes = [];
    const timers = [];
    const loopNoise = (buf, type, freq, q) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (q) f.Q.value = q;
      src.connect(f);
      src.start(t, Math.random() * 1.5);
      nodes.push(src);
      return f;
    };
    let level = 0.3;

    switch (name) {
      case 'rain': {
        const hiss = loopNoise(this.noiseBuffer, 'bandpass', 2600, 0.5);
        const hg = ctx.createGain();
        hg.gain.value = 0.22;
        hiss.connect(hg);
        hg.connect(out);
        const body = loopNoise(this.brownBuffer, 'lowpass', 900);
        const bg = ctx.createGain();
        bg.gain.value = 0.5;
        body.connect(bg);
        bg.connect(out);
        // 빗방울이 창에 부딪히는 작은 소리
        timers.push(setInterval(() => {
          if (!this.ready || this.silenced) return;
          const tt = ctx.currentTime + Math.random() * 0.2;
          const n = ctx.createBufferSource();
          n.buffer = this.noiseBuffer;
          const f = ctx.createBiquadFilter();
          f.type = 'highpass';
          f.frequency.value = 3000;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.06 + Math.random() * 0.05, tt);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.03);
          n.connect(f);
          f.connect(g);
          g.connect(out);
          n.start(tt, Math.random());
          n.stop(tt + 0.05);
        }, 90));
        level = 0.35;
        break;
      }
      case 'drip': {
        // 일정한 간격의 "똑"
        timers.push(setInterval(() => this.drip(0.5), 1700));
        level = 1;
        break;
      }
      case 'conveyor': {
        // 컨베이어: 낮게 웅웅거리는 모터 + 일정한 간격으로 덜컥거리는 롤러.
        // 멈추면(setConveyorRunning(false)) 롤러 소리는 끊기고 모터만 잦아든다. 크기는 setAmbLevel 로 (거리)
        const motorBus = ctx.createGain();
        motorBus.gain.value = 1;
        motorBus.connect(out);
        const rumble = loopNoise(this.brownBuffer, 'lowpass', 220);
        const rg = ctx.createGain();
        rg.gain.value = 0.8;
        rumble.connect(rg);
        rg.connect(motorBus);
        [55, 110.5].forEach((fq, i) => {
          const motor = ctx.createOscillator();
          motor.type = i ? 'triangle' : 'sawtooth';
          motor.frequency.value = fq;
          const mf = ctx.createBiquadFilter();
          mf.type = 'lowpass';
          mf.frequency.value = 180;
          const mg = ctx.createGain();
          mg.gain.value = i ? 0.08 : 0.22;
          // 살짝 떨리는 웅웅거림
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 3.3 + i;
          const lg = ctx.createGain();
          lg.gain.value = 0.04;
          lfo.connect(lg);
          lg.connect(mg.gain);
          lfo.start(t);
          nodes.push(lfo);
          motor.connect(mf);
          mf.connect(mg);
          mg.connect(motorBus);
          motor.start(t);
          nodes.push(motor);
        });
        // 롤러 덜컥: 낮은 쿵 + 금속 덜그럭, 두 번에 한 번 약하게
        let k = 0;
        timers.push(setInterval(() => {
          if (!this.ready || this.silenced || this.conveyorStopped) return;
          const tt = ctx.currentTime + 0.01;
          const strong = (k++ % 2) === 0;
          const n = ctx.createBufferSource();
          n.buffer = this.noiseBuffer;
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.frequency.value = strong ? 420 : 620;
          f.Q.value = 3;
          const g = ctx.createGain();
          g.gain.setValueAtTime(strong ? 0.4 : 0.22, tt);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.06);
          n.connect(f);
          f.connect(g);
          g.connect(out);
          n.start(tt, Math.random());
          n.stop(tt + 0.08);
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(strong ? 95 : 120, tt);
          o.frequency.exponentialRampToValueAtTime(50, tt + 0.08);
          const og = ctx.createGain();
          og.gain.setValueAtTime(strong ? 0.35 : 0.15, tt);
          og.gain.exponentialRampToValueAtTime(0.0001, tt + 0.1);
          o.connect(og);
          og.connect(out);
          o.start(tt);
          o.stop(tt + 0.12);
        }, 380));
        this.conveyorMotor = motorBus;
        level = 0.4;
        break;
      }
      case 'grill': {
        // 휴대용 버너 위 고기 굽는 소리: 지글지글 + 가끔 톡
        const sz = loopNoise(this.noiseBuffer, 'highpass', 3800);
        const sg = ctx.createGain();
        sg.gain.value = 0.16;
        sz.connect(sg);
        sg.connect(out);
        timers.push(setInterval(() => {
          if (!this.ready || this.silenced) return;
          if (Math.random() < 0.5) this.sfx('pop', { vol: 0.5 });
        }, 700));
        level = 0.5;
        break;
      }
      case 'aircon': {
        // 사무실 공조기: 아주 작은 바람 소리
        const air = loopNoise(this.brownBuffer, 'lowpass', 700);
        const ag = ctx.createGain();
        ag.gain.value = 0.5;
        air.connect(ag);
        ag.connect(out);
        level = 0.05;
        break;
      }
      case 'fridge': {
        // 냉장고 모터 / 형광등 웅웅거림
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 120;
        const o2 = ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.value = 240.5;
        const g2 = ctx.createGain();
        g2.gain.value = 0.25;
        o.connect(out);
        o2.connect(g2);
        g2.connect(out);
        o.start(t);
        o2.start(t);
        nodes.push(o, o2);
        const air = loopNoise(this.brownBuffer, 'lowpass', 400);
        const ag = ctx.createGain();
        ag.gain.value = 0.3;
        air.connect(ag);
        ag.connect(out);
        level = 0.12;
        break;
      }
      case 'street': {
        const traffic = loopNoise(this.brownBuffer, 'lowpass', 500);
        traffic.connect(out);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07;
        const lg = ctx.createGain();
        lg.gain.value = 0.3;
        lfo.connect(lg);
        lg.connect(out.gain);
        lfo.start(t);
        nodes.push(lfo);
        level = 0.35;
        break;
      }
      case 'stew': {
        // 부엌에서 된장찌개 끓는 소리: 낮은 보글보글 + 가끔 뽀글
        const body = loopNoise(this.brownBuffer, 'lowpass', 420);
        const bg = ctx.createGain();
        bg.gain.value = 0.35;
        body.connect(bg);
        bg.connect(out);
        timers.push(setInterval(() => {
          if (!this.ready || this.silenced) return;
          const tt = ctx.currentTime + Math.random() * 0.2;
          const o = ctx.createOscillator();
          o.type = 'sine';
          const f0 = 180 + Math.random() * 140;
          o.frequency.setValueAtTime(f0, tt);
          o.frequency.exponentialRampToValueAtTime(f0 * 1.8, tt + 0.05);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, tt);
          g.gain.exponentialRampToValueAtTime(0.18, tt + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.07);
          o.connect(g);
          g.connect(out);
          o.start(tt);
          o.stop(tt + 0.09);
        }, 260));
        level = 0.45;
        break;
      }
      case 'hum': {
        // 건물/기계실의 낮은 웅웅거림
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 90;
        o.connect(out);
        o.start(t);
        nodes.push(o);
        const air = loopNoise(this.noiseBuffer, 'lowpass', 300);
        const ag = ctx.createGain();
        ag.gain.value = 0.15;
        air.connect(ag);
        ag.connect(out);
        level = 0.1;
        break;
      }
      default:
        break;
    }
    out.gain.linearRampToValueAtTime(level, t + 1.2);
    this.ambienceNodes[name] = { out, nodes, timers, level, mult: 1 };
  }

  // 배경 소리 하나의 크기 배율 (0~1). 예: 도윤이 컨베이어에서 멀어지면 작게
  setAmbLevel(name, mult) {
    const a = this.ambienceNodes[name];
    if (!a || !this.ctx || Math.abs(a.mult - mult) < 0.01) return;
    a.mult = mult;
    const t = this.ctx.currentTime;
    a.out.gain.cancelScheduledValues(t);
    a.out.gain.setTargetAtTime(Math.max(0.0001, a.level * mult), t, 0.15);
  }

  // 컨베이어가 멈추면 롤러 소리를 끊고 모터를 잦아들게
  setConveyorRunning(on) {
    this.conveyorStopped = !on;
    if (!this.ctx || !this.conveyorMotor) return;
    const t = this.ctx.currentTime;
    this.conveyorMotor.gain.setTargetAtTime(on ? 1 : 0.15, t, on ? 0.2 : 0.5);
  }

  stopAmb(name, fast = false) {
    const a = this.ambienceNodes[name];
    if (!a) return;
    delete this.ambienceNodes[name];
    a.timers.forEach((id) => clearInterval(id));
    const t = this.ctx.currentTime;
    const fade = fast ? 0.02 : 0.8;
    try {
      a.out.gain.cancelScheduledValues(t);
      a.out.gain.setValueAtTime(a.out.gain.value, t);
      a.out.gain.linearRampToValueAtTime(0.0001, t + fade);
    } catch (e) { /* 무시 */ }
    setTimeout(() => {
      a.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* 무시 */ } });
      try { a.out.disconnect(); } catch (e) { /* 무시 */ }
    }, fade * 1000 + 100);
  }

  // 모든 소리를 끊는다. (수확, 붕괴 연출)
  silence() {
    this.silenced = true;
    if (!this.ctx) return;
    Object.keys(this.ambienceNodes).forEach((n) => this.stopAmb(n, true));
    this.ambienceWanted = [];
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0, t + 0.03);
  }

  // 정적 해제
  restore() {
    if (!this.silenced) return;
    this.silenced = false;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(0, t);
    this.master.gain.linearRampToValueAtTime(1, t + 0.05);
  }
}

export const Audio = new AudioEngine();
