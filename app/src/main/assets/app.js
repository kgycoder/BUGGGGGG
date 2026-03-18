/* ════════════════════════════════════════════
   ANDROID BRIDGE POLYFILL
   window.chrome.webview → AndroidBridge.postMessage
   이 폴리필로 기존 callCs() / post() 코드를 무수정 재사용
════════════════════════════════════════════ */
(function() {
  'use strict';
  // If already exists (WebView2 on Windows), skip
  if (window.chrome && window.chrome.webview) return;
  // Inject Android bridge shim
  window.chrome = window.chrome || {};
  window.chrome.webview = {
    postMessage: function(json) {
      try {
        if (window.AndroidBridge) {
          window.AndroidBridge.postMessage(json);
        }
      } catch(e) {
        console.warn('[XWare] Bridge unavailable:', e.message);
      }
    }
  };
})();

/* ════════════════════════════════════════════
   ANDROID BACK BUTTON
════════════════════════════════════════════ */
window.androidBack = function() {
  // If NP is open, close it
  if (document.getElementById('np').classList.contains('on')) {
    closeNP(); return;
  }
  // If not on home view, go home
  const home = document.querySelector('[data-v="home"]');
  if (!document.getElementById('v-home').classList.contains('on')) {
    gv('home', home); return;
  }
  // Otherwise exit the app
  try { window.AndroidBridge.exitApp(); } catch(e) {}
};

/* ════════════════════════════════════════════
   DYNAMIC BACKGROUND — Canvas orbs + beat reactor
════════════════════════════════════════════ */
const CVS = document.getElementById('bgc'), CX = CVS.getContext('2d');
const BG = {
  h: 240, th: 240, e: .05, te: .05, orbs: [], f: 0, playing: false,
  beat: 0, beatDecay: .04, energyLevel: 0, tEnergyLevel: 0
};

function szCvs() {
  CVS.width = innerWidth; CVS.height = innerHeight;
  BG.orbs = Array.from({ length: 7 }, (_, i) => ({
    x: Math.random() * CVS.width, y: Math.random() * CVS.height,
    vx: (Math.random() - .5) * .28, vy: (Math.random() - .5) * .28,
    r: 140 + Math.random() * 280, h: i * 51,
    a: .06 + Math.random() * .10, phase: Math.random() * Math.PI * 2
  }));
}
addEventListener('resize', szCvs); szCvs();

function triggerBeat() { BG.beat = Math.min(1, BG.beat + 0.85 * (0.3 + BG.energyLevel * 0.7)); }
let _beatTimer = null;
function startBeatTimer(bpm = 120) { clearInterval(_beatTimer); _beatTimer = setInterval(() => { if (BG.playing) triggerBeat(); }, 60000 / bpm); }
function stopBeatTimer() { clearInterval(_beatTimer); _beatTimer = null; }

(function bgLoop() {
  requestAnimationFrame(bgLoop);
  BG.f++; BG.h += (BG.th - BG.h) * .005; BG.e += (BG.te - BG.e) * .014;
  BG.energyLevel += (BG.tEnergyLevel - BG.energyLevel) * .03;
  if (BG.beat > 0) BG.beat = Math.max(0, BG.beat - BG.beatDecay * (1 + BG.energyLevel));
  const beat = BG.beat, en = BG.energyLevel;
  CX.clearRect(0, 0, CVS.width, CVS.height);
  const cx = CVS.width / 2, cy = CVS.height / 2;
  const baseL = BG.playing ? 3 + beat * 5 : 1.5;
  const g = CX.createRadialGradient(cx, cy, 0, cx, cy, CVS.width * (.80 + beat * .20));
  g.addColorStop(0, `hsl(${BG.h},${16 + en*14}%,${baseL + 1}%)`);
  g.addColorStop(1, `hsl(${BG.h + 40},${10 + en*8}%,${baseL - 1}%)`);
  CX.fillStyle = g; CX.fillRect(0, 0, CVS.width, CVS.height);
  BG.orbs.forEach(o => {
    const speed = 1 + BG.e * 1.4 + beat * (1.5 + en * 3.5);
    o.x += o.vx * speed; o.y += o.vy * speed;
    if (o.x < -o.r) o.x = CVS.width + o.r; if (o.x > CVS.width + o.r) o.x = -o.r;
    if (o.y < -o.r) o.y = CVS.height + o.r; if (o.y > CVS.height + o.r) o.y = -o.r;
    const pulse = Math.sin(BG.f * .007 + o.phase) * .18 + beat * .40;
    const r = o.r * (1 + pulse);
    const og = CX.createRadialGradient(o.x, o.y, 0, o.x, o.y, r);
    const h = (BG.h + o.h) % 360;
    const alpha = (o.a * (BG.playing ? .60 : .28)) + beat * o.a * 1.1;
    og.addColorStop(0, `hsla(${h},${68 + beat*22}%,${52 + beat*14}%,${Math.min(alpha, .95)})`);
    og.addColorStop(1, `hsla(${h},68%,52%,0)`);
    CX.fillStyle = og; CX.beginPath(); CX.arc(o.x, o.y, r, 0, Math.PI * 2); CX.fill();
  });
  if (beat > 0.12 && BG.playing) {
    const fa = beat * .12 * en;
    const fg = CX.createRadialGradient(cx, cy * .5, 0, cx, cy, CVS.width * .75);
    fg.addColorStop(0, `hsla(${BG.h},80%,72%,${fa})`);
    fg.addColorStop(1, `hsla(${BG.h},80%,72%,0)`);
    CX.fillStyle = fg; CX.fillRect(0, 0, CVS.width, CVS.height);
  }
})();

/* ════════════════════════════════════════════
   MOOD SYSTEM
════════════════════════════════════════════ */
const MOODS = {
  calm:      { h: 210, e: .05, bpm: 68,  energy: .08 },
  happy:     { h: 42,  e: .40, bpm: 118, energy: .55 },
  energetic: { h: 5,   e: .90, bpm: 148, energy: .95 },
  sad:       { h: 200, e: .04, bpm: 64,  energy: .07 },
  romantic:  { h: 318, e: .20, bpm: 86,  energy: .28 },
  kpop:      { h: 268, e: .42, bpm: 128, energy: .65 },
  default:   { h: 240, e: .08, bpm: 100, energy: .30 }
};
const MOOD_COL = {
  calm:{ h:210,s:70,l:60 }, happy:{ h:42,s:90,l:60 },
  energetic:{ h:5,s:95,l:58 }, sad:{ h:200,s:65,l:55 },
  romantic:{ h:318,s:80,l:62 }, kpop:{ h:268,s:75,l:62 },
  default:{ h:240,s:60,l:58 }
};
let _curMood = 'default', _moodH = 240, _tMoodH = 240, _moodS = 60, _moodL = 58;

function setMood(mood) {
  _curMood = mood;
  const c = MOOD_COL[mood] || MOOD_COL.default;
  const m = MOODS[mood]    || MOODS.default;
  _tMoodH = c.h; _moodS = c.s; _moodL = c.l;
  BG.th = m.h; BG.te = m.e; BG.tEnergyLevel = m.energy;
  BG.beatDecay = .022 + (1 - m.energy) * .045;
  if (BG.playing) startBeatTimer(m.bpm);
}
function detectMood(title) {
  const s = title.toLowerCase();
  if (/calm|ambient|chill|sleep|relax|lo.?fi|acoustic|soft/.test(s)) return setMood('calm');
  if (/sad|heartbreak|cry|miss|alone|melanchol|hurt|pain/.test(s))   return setMood('sad');
  if (/happy|joy|sunshine|fun|party|upbeat|smile|good.?time/.test(s))return setMood('happy');
  if (/hype|trap|drill|rage|hard|workout|edm|rave|bass|drop|fire|savage|power/.test(s)) return setMood('energetic');
  if (/love|romantic|night|moon|slow|ballad|heart|forever/.test(s))   return setMood('romantic');
  if (/kpop|k-pop|bts|blackpink|aespa|twice|ive|newjeans|stray|nct|exo/.test(s)) return setMood('kpop');
  setMood('default');
}

/* ════════════════════════════════════════════
   NP BEAT REACTOR
════════════════════════════════════════════ */
const NP_PARTICLES = [];
const NP_MAX_PARTICLES = 60;
function spawnParticles(count, h, s, l) {
  const canvas = document.getElementById('np-particles'); if (!canvas) return;
  const { cx, cy } = _getArtCenter();
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.2 + Math.random() * 3.5 * BG.energyLevel;
    const size  = 1.5 + Math.random() * 3.5;
    NP_PARTICLES.push({ x: cx + (Math.random()-.5)*140, y: cy + (Math.random()-.5)*140, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed-1.2, life: 1.0, decay: .012+Math.random()*.022, size, h, s, l: l+Math.random()*20 });
    if (NP_PARTICLES.length > NP_MAX_PARTICLES) NP_PARTICLES.shift();
  }
}
function renderParticles() {
  const canvas = document.getElementById('np-particles');
  if (!canvas || !document.getElementById('np').classList.contains('on')) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || innerWidth; canvas.height = canvas.offsetHeight || innerHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = NP_PARTICLES.length - 1; i >= 0; i--) {
    const p = NP_PARTICLES[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.vx *= 0.98; p.life -= p.decay;
    if (p.life <= 0) { NP_PARTICLES.splice(i, 1); continue; }
    ctx.save(); ctx.globalAlpha = p.life * p.life * 0.85;
    ctx.fillStyle = `hsl(${p.h},${p.s}%,${p.l}%)`; ctx.shadowColor = `hsl(${p.h},${p.s}%,${p.l}%)`; ctx.shadowBlur = p.size * 3;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}
const SPEC_PHASES = Array.from({length:32}, () => Math.random() * Math.PI * 2);
const SPEC_FREQS  = Array.from({length:32}, (_, i) => 0.03 + i * 0.008 + Math.random() * .02);
const SPEC_VALS   = new Float32Array(32);
function updateSpectrum(beat, en, h, s, l) {
  const bars = document.querySelectorAll('.np-spec-bar'); if (!bars.length) return;
  bars.forEach((bar, i) => {
    const bassBoost = i < 8 ? (1 - i / 8) * 0.6 : 0;
    const midBoost  = i >= 8 && i < 20 ? 0.3 : 0;
    const noisePhase = Math.sin(BG.f * SPEC_FREQS[i] + SPEC_PHASES[i]);
    const beatBump   = beat * (bassBoost * 1.8 + midBoost * 1.2 + 0.4);
    const target = Math.max(0.04, (0.08 + bassBoost*0.3 + midBoost*0.15 + noisePhase*0.12*en) * (1 + beatBump*en));
    SPEC_VALS[i] += (target - SPEC_VALS[i]) * (beat > .1 ? .35 : .12);
    const heightPx = Math.max(3, SPEC_VALS[i] * 75);
    const brightness = 55 + SPEC_VALS[i] * 30;
    const alpha = 0.25 + SPEC_VALS[i] * 0.75;
    bar.style.transform = `scaleY(${(heightPx / 4).toFixed(2)})`;
    bar.style.background = `hsla(${Math.round(h + i * 2)},${s}%,${brightness}%,${alpha.toFixed(2)})`;
    bar.style.boxShadow = beat > .2 && i < 12 ? `0 0 ${4+beat*8}px hsla(${Math.round(h)},${s}%,70%,${(beat*.4).toFixed(2)})` : '';
  });
}
let _beatCount = 0;
function updateNpColor() {
  _moodH += (_tMoodH - _moodH) * .04;
  const h = Math.round(_moodH), s = _moodS, l = _moodL;
  const col = `hsl(${h},${s}%,${l}%)`, glow = `hsla(${h},${s}%,${l}%,0.4)`;
  const npEl = document.getElementById('np');
  if (npEl) { npEl.style.setProperty('--np-glow', glow); npEl.style.setProperty('--np-acc', col); }
  const npOpen = npEl?.classList.contains('on'), beat = BG.beat, en = BG.energyLevel;
  if (npOpen && S.playing) {
    const npBg = document.getElementById('np-bg');
    if (npBg) { npBg.style.transform = `scale(${(1.15 + beat*.06*en).toFixed(3)})`; npBg.style.filter = `blur(${82+beat*18*en}px) saturate(${1.8+beat*.6*en}) brightness(${(.28+beat*.08*en).toFixed(3)})`; }
    const ash = document.getElementById('np-ash');
    if (ash) { ash.style.transform = `scale(${(1+beat*.038*en).toFixed(4)})`; ash.style.boxShadow = `0 40px 120px rgba(0,0,0,0.85), 0 0 0 1.5px rgba(255,255,255,0.14), 0 0 ${60+beat*80*en}px ${8+beat*30*en}px ${glow}`; }
    const vinyl = document.getElementById('np-vinyl');
    if (vinyl) { vinyl.style.opacity = (.15+beat*.55*en).toFixed(3); vinyl.style.boxShadow = `0 0 ${10+beat*30*en}px ${2+beat*10*en}px hsla(${h},${s}%,${l}%,${(beat*.5).toFixed(2)})`; vinyl.style.border = `1.5px solid hsla(${h},${s}%,${l}%,${(.2+beat*.6).toFixed(2)})`; vinyl.style.borderRadius = '50%'; vinyl.style.position = 'absolute'; }
    const artGlow = document.getElementById('np-art-glow');
    if (artGlow && beat > .1) { artGlow.style.opacity = (beat*.45*en).toFixed(3); artGlow.style.background = `radial-gradient(ellipse at center, hsla(${h},${s}%,${l}%,${(beat*.3).toFixed(2)}) 0%, transparent 70%)`; } else if (artGlow) artGlow.style.opacity = '0';
    const pulse = document.getElementById('np-pulse');
    if (pulse) { pulse.style.background = glow; pulse.style.display = 'block'; if (beat>.08) { pulse.style.transform = `translateX(-50%) scaleX(${(1+beat*.8*en).toFixed(3)})`; pulse.style.opacity = (.5+beat*.5).toFixed(3); pulse.style.filter = `blur(${8+beat*8*en}px)`; } else { pulse.style.transform = 'translateX(-50%) scaleX(1)'; pulse.style.opacity = '.7'; pulse.style.filter = 'blur(9px)'; } }
    updateSpectrum(beat, en, h, s, l);
    if (beat > .35 && en > .2) spawnParticles(Math.round(beat*en*8), h, s, l);
    renderParticles();
    const ncPlay = document.getElementById('nc-play');
    if (ncPlay && beat > .15) ncPlay.style.boxShadow = `0 0 ${16+beat*24*en}px hsla(${h},${s}%,${l}%,${(beat*.6*en).toFixed(3)})`;
    else if (ncPlay) ncPlay.style.boxShadow = '';
    const npTitle = document.getElementById('np-title');
    if (npTitle && beat>.5 && en>.5) npTitle.style.textShadow = `0 0 ${beat*20*en}px hsla(${h},${s}%,${l+10}%,${(beat*.6).toFixed(2)})`;
    else if (npTitle) npTitle.style.textShadow = '';
  } else {
    const ash = document.getElementById('np-ash');
    if (ash) { ash.style.transform = ''; ash.style.boxShadow = ''; }
    const pulse = document.getElementById('np-pulse');
    if (pulse) pulse.style.display = S.playing ? 'block' : 'none';
    renderParticles();
  }
  _beatCount++;
  const vb = document.querySelectorAll('.vb');
  if (S.playing) { vb.forEach((b, i) => { b.style.background = `hsl(${h},${s}%,62%)`; if (beat>.06) { const ht = 1+beat*en*(0.8+Math.sin(i*1.4+BG.f*.08)*0.5); b.style.transform = `scaleY(${ht.toFixed(3)})`; } else b.style.transform = ''; }); }
  if (S.playing && beat > .04) {
    document.querySelectorAll('.card').forEach((card, ci) => {
      card.classList.add('beat-active');
      const isPlaying = card.classList.contains('playing');
      const phase = Math.sin(BG.f*.06+ci*0.72), jitter = phase*.008*en;
      if (isPlaying) { const sc = 1.028+beat*.038*en, glowPx = 8+beat*28*en, glowAmt = (.18+beat*.35*en).toFixed(3); card.style.transform = `translateY(-7px) scale(${sc.toFixed(4)})`; card.style.boxShadow = `0 ${14+beat*18}px ${40+beat*28}px rgba(0,0,0,.65),0 0 0 1.5px var(--acc),0 0 ${glowPx}px ${(glowPx*.4).toFixed(1)}px hsla(${h},${s}%,${l}%,${glowAmt})`; card.style.borderColor = `hsla(${h},${s}%,${l}%,${(.5+beat*.5).toFixed(2)})`; }
      else if (beat>.15 && en>.3) { const sc2 = 1+beat*.012*en+jitter; card.style.transform = `scale(${sc2.toFixed(4)})`; card.style.boxShadow = `0 ${6+beat*8}px ${18+beat*14}px rgba(0,0,0,${(.3+beat*.2).toFixed(2)})`; card.style.borderColor = `rgba(255,255,255,${(.07+beat*.10*en).toFixed(3)})`; }
    });
  } else if (!S.playing || beat <= .02) {
    document.querySelectorAll('.card.beat-active').forEach(card => { card.classList.remove('beat-active'); if (!card.matches(':active')) { card.style.transform = ''; card.style.boxShadow = ''; card.style.borderColor = ''; } });
  }
}
setInterval(updateNpColor, 50);

/* ════════════════════════════════════════════
   C# / Android ↔ JS BRIDGE
════════════════════════════════════════════ */
const _cb = {}; let _cid = 0;
window.__xw = function(j) {
  try {
    const m = JSON.parse(j);
    if (m.type === 'searchResult' || m.type === 'suggestResult' || m.type === 'lyricsResult') {
      const fn = _cb[m.id]; if (fn) { delete _cb[m.id]; fn(m); }
    }
  } catch(e) { console.error(e); }
};
function callCs(p) {
  return new Promise((ok, ng) => {
    const id = String(++_cid);
    _cb[id] = m => (m.success || m.type === 'lyricsResult') ? ok(m) : ng(new Error(m.error || '오류'));
    p.id = id;
    try { window.chrome.webview.postMessage(JSON.stringify(p)); }
    catch { ng(new Error('브릿지 없음')); }
    setTimeout(() => { if (_cb[id]) { delete _cb[id]; ng(new Error('타임아웃')); } }, 18000);
  });
}
function post(type, extra = {}) {
  try { window.chrome.webview.postMessage(JSON.stringify({ type, ...extra })); } catch {}
}

/* ════════════════════════════════════════════
   STATE
════════════════════════════════════════════ */
const S = {
  q: [], idx: -1, track: null,
  playing: false, shuffle: false, repeat: 0,
  vol: 80, muted: false, echo: 0, dur: 0, cur: 0,
  favs: JSON.parse(localStorage.getItem('xw_fav') || '[]'),
  ytReady: false, ytPlayer: null, ticker: null
};

/* ════════════════════════════════════════════
   BAR VISIBILITY
════════════════════════════════════════════ */
function updateBarVisibility() {
  const hasTrack = !!S.track;
  document.getElementById('mini-bar')?.classList.toggle('bar-hidden', !hasTrack);
  document.body.classList.toggle('has-track', hasTrack);
}

/* ════════════════════════════════════════════
   ECHO
════════════════════════════════════════════ */
let _echoTimer = null;
function setEcho(v) {
  S.echo = v;
  ['np-echo-sl'].forEach(id => { const el = document.getElementById(id); if (el) el.value = v; });
  clearInterval(_echoTimer);
  if (v <= 0) { applyVol(); return; }
  const depth = v / 100, period = 120 + (1 - depth) * 180;
  let phase = 0;
  _echoTimer = setInterval(() => {
    if (!S.ytPlayer || !S.ytReady) return; phase++;
    const wave = Math.abs(Math.sin(phase * Math.PI / 4)) * depth;
    try { S.ytPlayer.setVolume(S.muted ? 0 : Math.max(10, Math.round(S.vol * (1 - wave * .3)))); } catch {}
  }, period);
}

/* ════════════════════════════════════════════
   NATIVE PLAYER BRIDGE
   YouTube IFrame 완전 제거 → AndroidBridge + ExoPlayer
   S.ytPlayer 인터페이스 유지로 기존 코드 무수정 재사용
════════════════════════════════════════════ */
S.ytPlayer = {
  loadVideoById: function(id) { post('ytLoad', { videoId: id }); },
  playVideo:     function()   { post('ytPlay'); },
  pauseVideo:    function()   { post('ytPause'); },
  stopVideo:     function()   { post('ytPause'); },
  seekTo:        function(sec){ post('ytSeek', { seconds: sec }); },
  setVolume:     function(vol){ post('ytVolume', { volume: vol }); },
  getCurrentTime:function()   { return S.cur; },
  getDuration:   function()   { return S.dur; }
};
S.ytReady = true;

// Android 네이티브 플레이어 상태 수신
window.__xw = function(j) {
  try {
    const m = JSON.parse(j);

    // 검색/가사/자동완성 응답
    if (['searchResult','suggestResult','lyricsResult','ytTimeResult'].includes(m.type)) {
      const fn = _cb[m.id]; if (fn) { delete _cb[m.id]; fn(m); }
      return;
    }

    // 재생 상태 변경
    if (m.type === 'playerState') {
      const st = m.state;
      if (st === 'playing') {
        S.playing = true; BG.playing = true; updPlay(); startTick();
        document.getElementById('vizz').classList.remove('off');
        if (m.duration) { S.dur = m.duration; setT('np-tot', S.dur); }
        document.getElementById('np-ash').classList.add('playing');
        document.getElementById('np-pulse').style.display = 'block';
        if (S.echo > 0) setEcho(S.echo);
        startBeatTimer((MOODS[_curMood] || MOODS.default).bpm);
      } else if (st === 'paused') {
        S.playing = false; BG.playing = false; updPlay(); stopTick(); stopBeatTimer();
        document.getElementById('vizz').classList.add('off');
        document.getElementById('np-ash').classList.remove('playing');
        document.getElementById('np-pulse').style.display = 'none';
        clearInterval(_echoTimer);
      } else if (st === 'ready') {
        if (m.duration) { S.dur = m.duration; setT('np-tot', S.dur); }
      } else if (st === 'ended') {
        clearInterval(_echoTimer); stopBeatTimer();
        if (S.repeat === 2) { post('ytSeek',{seconds:0}); post('ytPlay'); }
        else if (S.repeat === 1 || S.idx < S.q.length - 1) nextT();
        else { S.playing = false; BG.playing = false; updPlay(); stopTick(); }
      }
      return;
    }

    // 재생 시간 tick (250ms마다)
    if (m.type === 'playerTime') {
      S.cur = m.cur || 0; S.dur = m.dur || 0;
      const pct = S.dur ? (S.cur / S.dur) * 100 : 0;
      const npb = document.getElementById('np-pb');
      if (!npb?.classList.contains('dragging')) npb?._setFill?.(pct);
      const mpf = document.getElementById('mini-pf');
      if (mpf) mpf.style.width = pct.toFixed(2) + '%';
      setT('np-cur', S.cur); setT('np-tot', S.dur);
      return;
    }

    // 에러
    if (m.type === 'playerError') {
      toast('⚠️ 재생 불가 — 다음 곡으로 이동합니다');
      setTimeout(nextT, 1200);
      return;
    }
  } catch(e) { console.error(e); }
};

/* ════════════════════════════════════════════
   AUTOCOMPLETE
════════════════════════════════════════════ */
let _sugTimer = null;
document.addEventListener('touchstart', e => {
  const item = e.target.closest('.sug-item');
  if (!item) return;
  const drop = item.closest('.sug-drop');
  const text = item.dataset.query;
  if (!text || !drop) return;
  const inp = drop.closest('.srch-wrap-full')?.querySelector('.srch-inp');
  if (inp) inp.value = text;
  drop.classList.remove('on');
  doSearch(text);
}, { passive: true });
document.addEventListener('mousedown', e => {
  const item = e.target.closest('.sug-item');
  if (!item) return;
  e.preventDefault();
  const drop = item.closest('.sug-drop');
  const text = item.dataset.query;
  if (!text || !drop) return;
  const inp = drop.closest('.srch-wrap-full')?.querySelector('.srch-inp');
  if (inp) inp.value = text;
  drop.classList.remove('on');
  doSearch(text);
});

async function onSuggest(inp, dropId) {
  const q = inp.value.trim();
  const drop = document.getElementById(dropId);
  if (!q) { drop.classList.remove('on'); return; }
  clearTimeout(_sugTimer);
  _sugTimer = setTimeout(async () => {
    try {
      const res = await callCs({ type: 'suggest', query: q });
      const sugs = res.suggestions || [];
      if (!sugs.length) { drop.classList.remove('on'); return; }
      drop.innerHTML = sugs.map(s => `<div class="sug-item" data-query="${esc(s)}"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="5" cy="5" r="3.5"/><path d="M8 8L11 11"/></svg><span>${esc(s)}</span></div>`).join('');
      drop.classList.add('on');
    } catch { drop.classList.remove('on'); }
  }, 280);
}
function hideSug(id) { document.getElementById(id)?.classList.remove('on'); }

/* ════════════════════════════════════════════
   SEARCH
════════════════════════════════════════════ */
async function doSearch(query) {
  if (!query?.trim()) return;
  gv('search', document.querySelector('[data-v="search"]'));
  const qi = document.getElementById('q-s'); if (qi) qi.value = query;
  hideSug('sug-s'); hideSug('sug-home');
  const area = document.getElementById('s-res');
  area.innerHTML = `<div class="state"><div class="spinner"></div><p style="margin-top:12px">검색 중...</p></div>`;
  try {
    const musicQuery = query.trim() + ' official audio OR music video OR mv OR lyrics';
    const res = await callCs({ type: 'search', query: musicQuery });
    S.q = res.tracks || [];
    if (!S.q.length) { area.innerHTML = `<div class="state"><h3>결과 없음</h3><p>다른 검색어를 시도해보세요</p></div>`; return; }
    area.innerHTML = `<div class="sh"><h2>검색 결과 <span style="font-size:12px;font-weight:400;color:var(--t3)">${S.q.length}개</span></h2></div><div class="cgrid" id="sg"></div>`;
    const sg = document.getElementById('sg');
    S.q.forEach((t, i) => { const card = mkCard(t, i, () => { S.idx = i; playTrack(t, i); }); sg.appendChild(card); });
    renderQueue();
  } catch(err) { area.innerHTML = `<div class="state"><h3>검색 실패</h3><p>${esc(err.message)}</p></div>`; }
}

async function loadRec(kw, rowId) {
  const row = document.getElementById(rowId); if (!row) return;
  row.innerHTML = `<div class="state" style="padding:28px 20px"><div class="spinner"></div></div>`;
  try {
    const res = await callCs({ type: 'search', query: kw });
    const tracks = res.tracks || [];
    if (!tracks.length) { row.innerHTML = `<div class="state" style="padding:28px"><p>결과 없음</p></div>`; return; }
    row.innerHTML = '';
    const rec = tracks.slice(0, 10);
    rec.forEach((t, i) => { const card = mkCard(t, i, () => { S.q = rec; S.idx = i; playTrack(t, i); }); row.appendChild(card); });
  } catch { row.innerHTML = `<div class="state" style="padding:28px"><p>로드 실패</p></div>`; }
}

/* ════════════════════════════════════════════
   THUMBNAILS
════════════════════════════════════════════ */
const getThumbHq = id => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
const getThumbMd = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const getThumbSd = id => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

/* ════════════════════════════════════════════
   CARD
════════════════════════════════════════════ */
function mkCard(t, i, playFn) {
  const f = isFav(t.id), pl = S.track?.id === t.id;
  const c = document.createElement('div');
  c.className = 'card' + (pl ? ' playing' : '');
  c.dataset.id = t.id;
  c.style.animationDelay = (i * .045) + 's';
  c.innerHTML = `
    <div class="c-thumb">
      <img class="c-img" src="${esc(getThumbHq(t.id))}" loading="lazy"
        onerror="if(!this.dataset.f1){this.dataset.f1=1;this.src='${esc(getThumbMd(t.id))}'}else if(!this.dataset.f2){this.dataset.f2=1;this.src='${esc(getThumbSd(t.id))}'}" alt="">
      <div class="c-shine"></div>
      <div class="c-overlay">
        <button class="c-play-btn"><svg width="20" height="20" viewBox="0 0 22 22" fill="currentColor"><polygon points="6,3 18,11 6,19"/></svg></button>
      </div>
      <button class="c-fav${f?' on':''}" onclick="event.stopPropagation();toggleFavT(${i})">
        <svg width="13" height="13" viewBox="0 0 13 13" fill="${f?'var(--acc)':'none'}" stroke="${f?'var(--acc)':'rgba(255,255,255,.85)'}" stroke-width="1.4" stroke-linecap="round">
          <path d="M6.5 11.5S1 8 1 5a2.8 2.8 0 0 1 5.5-1 2.8 2.8 0 0 1 5.5 1C12 8 6.5 11.5 6.5 11.5z"/>
        </svg>
      </button>
      <button class="c-pl-add" onclick="event.stopPropagation();plShowCtxById('${esc(t.id)}')" title="플레이리스트에 추가">
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5.5" y1="1" x2="5.5" y2="10"/><line x1="1" y1="5.5" x2="10" y2="5.5"/></svg>
      </button>
      ${t.dur ? `<span class="c-dur">${fmt(t.dur)}</span>` : ''}
      ${pl ? '<div class="c-now-bar"><span></span><span></span><span></span></div>' : ''}
    </div>
    <div class="c-info">
      <div class="c-title">${esc(t.title)}</div>
      <div class="c-ch">${esc(t.channel)}</div>
    </div>`;
  c.querySelector('.c-play-btn').addEventListener('click', e => { e.stopPropagation(); playFn(); });
  c.querySelector('.c-thumb').addEventListener('click', playFn);
  return c;
}

/* ════════════════════════════════════════════
   PLAYBACK
════════════════════════════════════════════ */
function playIdx(i) { if (S.q[i]) { S.idx = i; playTrack(S.q[i], i); } }

function playTrack(t, idx = -1) {
  if (!S.ytReady || !S.ytPlayer) { toast('⏳ 플레이어 준비 중...'); return; }
  S.track = t; S.idx = idx;
  try { S.ytPlayer.stopVideo(); } catch {}
  S.ytPlayer.loadVideoById(t.id);
  updateBarVisibility();

  const hq = getThumbHq(t.id), md = getThumbMd(t.id);

  // Mini bar
  const mArt = document.getElementById('mini-art');
  if (mArt) { mArt.src = hq; mArt.onerror = () => { mArt.src = md; }; }
  const mTitle = document.getElementById('mini-title'); if (mTitle) mTitle.textContent = t.title;
  const mCh = document.getElementById('mini-ch'); if (mCh) mCh.textContent = t.channel || 'YouTube';

  // NP overlay
  const npArt = document.getElementById('np-art');
  npArt.src = hq; npArt.onerror = () => { npArt.src = md; npArt.onerror = () => { npArt.src = t.thumb; }; };
  document.getElementById('np-title').textContent = t.title;
  document.getElementById('np-ch').textContent    = t.channel || 'YouTube';
  document.getElementById('np-bg').style.backgroundImage = `url('${hq}'),url('${md}')`;
  updFavBtn();

  document.querySelectorAll('.card').forEach(c => {
    const playing = c.dataset.id === t.id;
    c.classList.toggle('playing', playing);
    const nb = c.querySelector('.c-now-bar');
    if (playing && !nb) {
      const th = c.querySelector('.c-thumb'); if (th) { const d = document.createElement('div'); d.className = 'c-now-bar'; d.innerHTML = '<span></span><span></span><span></span>'; th.appendChild(d); }
    } else if (!playing && nb) nb.remove();
  });

  detectMood(t.title);
  post('setTitle', { title: t.title });
  renderQueue(); openNP();
  toast(`▶  ${t.title.length > 40 ? t.title.slice(0, 40) + '…' : t.title}`);

  _clearLyrics();
  fetchLyrics(t.id);
}

function togglePlay() {
  if (!S.ytPlayer || !S.ytReady) return;
  if (S.playing) S.ytPlayer.pauseVideo();
  else { if (S.track) S.ytPlayer.playVideo(); else toast('🎵 먼저 음악을 검색하세요'); }
}
function nextT() {
  if (!S.q.length) return;
  const n = S.shuffle ? Math.floor(Math.random() * S.q.length) : (S.idx + 1) % S.q.length;
  S.idx = n; playTrack(S.q[n], n);
}
function prevT() {
  if (!S.q.length) return;
  if (S.cur > 3) { S.ytPlayer?.seekTo(0); return; }
  const p = (S.idx - 1 + S.q.length) % S.q.length;
  S.idx = p; playTrack(S.q[p], p);
}
function updPlay() {
  const on = S.playing;
  // Mini bar play btn
  const miniPlay = document.getElementById('mini-play');
  if (miniPlay) miniPlay.innerHTML = on
    ? `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="2.5" y="2" width="4" height="12" rx="1"/><rect x="9.5" y="2" width="4" height="12" rx="1"/></svg>`
    : `<svg width="18" height="18" viewBox="0 0 17 17" fill="currentColor"><polygon points="4,2.5 14,8.5 4,14.5"/></svg>`;
  // NP play btn
  document.getElementById('nc-play').innerHTML = on
    ? `<svg width="22" height="22" viewBox="0 0 20 20" fill="#08080d"><rect x="3" y="2.5" width="5" height="15" rx="1.5"/><rect x="12" y="2.5" width="5" height="15" rx="1.5"/></svg>`
    : `<svg width="26" height="26" viewBox="0 0 22 22" fill="#08080d"><polygon points="6,3.5 18,11 6,18.5"/></svg>`;
}
function toggleShuf() {
  S.shuffle = !S.shuffle;
  document.getElementById('nc-sh')?.classList.toggle('on', S.shuffle);
  toast(S.shuffle ? '셔플 켜짐' : '셔플 꺼짐');
}
function toggleRep() {
  S.repeat = (S.repeat + 1) % 3;
  document.getElementById('nc-rep')?.classList.toggle('on', S.repeat > 0);
  toast(['반복 없음','전체 반복','한 곡 반복'][S.repeat]);
}
function setVol(v) {
  S.vol = v;
  const el = document.getElementById('np-vol-sl'); if (el) el.value = v;
  applyVol();
}
function applyVol() {
  if (!S.ytPlayer || !S.ytReady) return;
  if (S.echo > 0) return;
  S.ytPlayer.setVolume(S.muted ? 0 : S.vol);
}
function toggleMute() { S.muted = !S.muted; applyVol(); }

/* ════════════════════════════════════════════
   SEEK BARS
════════════════════════════════════════════ */
function initSeekBar(barId, fillId) {
  const bar = document.getElementById(barId), fill = document.getElementById(fillId);
  if (!bar || !fill) return;
  const thumb = bar.querySelector('.pbd, .np-pd');
  let dragging = false, animPct = 0, targetPct = 0, rafId = null;
  function setPos(pct) { fill.style.width = pct.toFixed(3)+'%'; if (thumb) thumb.style.left = pct.toFixed(3)+'%'; }
  function animStep() { const diff = targetPct - animPct; if (Math.abs(diff)>.02) { animPct+=diff*.14; setPos(animPct); rafId=requestAnimationFrame(animStep); } else { animPct=targetPct; setPos(targetPct); rafId=null; } }
  bar._setFill = (pct, instant) => { targetPct=pct; if (instant) { animPct=pct; setPos(pct); if (rafId){cancelAnimationFrame(rafId);rafId=null;} return; } if (!rafId) rafId=requestAnimationFrame(animStep); };
  function getP(e) { const r=bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX-r.left)/r.width)); }
  function seek(p, instant) { bar._setFill(p*100, instant); if (S.ytPlayer && S.ytReady && S.dur) S.ytPlayer.seekTo(p*S.dur, true); }
  bar.addEventListener('mousedown', e => { e.preventDefault(); dragging=true; bar.classList.add('dragging'); seek(getP(e), true); });
  document.addEventListener('mousemove', e => { if (dragging) seek(getP(e), true); });
  document.addEventListener('mouseup', () => { if (!dragging) return; dragging=false; bar.classList.remove('dragging'); });
  bar.addEventListener('touchstart', e => { dragging=true; bar.classList.add('dragging'); seek(getP(e.touches[0]), true); }, { passive: true });
  document.addEventListener('touchmove', e => { if (dragging) seek(getP(e.touches[0]), true); }, { passive: true });
  document.addEventListener('touchend', () => { dragging=false; bar.classList.remove('dragging'); });
}
initSeekBar('np-pb', 'np-pf');

/* ════════════════════════════════════════════
   TICK — Android playerTime 이벤트로 대체됨
   JS tick은 폴백용으로만 유지
════════════════════════════════════════════ */
function startTick() { stopTick(); /* Android 서비스가 250ms마다 playerTime 전송 */ }
function stopTick()  { clearInterval(S.ticker); }

/* ════════════════════════════════════════════
   NOW PLAYING (mobile: slide up from bottom)
════════════════════════════════════════════ */
function openNP() {
  const np = document.getElementById('np');
  np.style.display = 'flex';
  // Force reflow so the transition fires
  np.offsetHeight;
  np.classList.add('on');
  if (LY.lines.length > 0) _startLyricsTick();
}
function closeNP() {
  const np = document.getElementById('np');
  np.classList.remove('on');
  _stopLyricsTick();
  // Wait for slide-out animation then hide
  setTimeout(() => { if (!np.classList.contains('on')) np.style.display = 'none'; }, 420);
}

// Swipe-down to close NP
(function() {
  let startY = 0, startTime = 0;
  const np = document.getElementById('np');
  np.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY; startTime = Date.now();
  }, { passive: true });
  np.addEventListener('touchend', e => {
    const dy = e.changedTouches[0].clientY - startY;
    const dt = Date.now() - startTime;
    // Swipe down ≥60px in <400ms closes NP (only from drag handle area)
    if (dy > 60 && dt < 400) closeNP();
  }, { passive: true });
})();

/* ════════════════════════════════════════════
   FAVORITES
════════════════════════════════════════════ */
function isFav(id)  { return S.favs.some(f => f.id === id); }
function saveFavs() { localStorage.setItem('xw_fav', JSON.stringify(S.favs)); }
function toggleFavT(idx) {
  const t = S.q[idx]; if (!t) return;
  if (isFav(t.id)) { S.favs = S.favs.filter(f => f.id !== t.id); toast('즐겨찾기 제거'); }
  else             { S.favs.push(t); toast('✦ 즐겨찾기 추가'); }
  saveFavs(); refreshDots(); renderFavGrid();
  if (S.track?.id === t.id) updFavBtn();
}
function favCur() {
  if (!S.track) return;
  const i = S.q.findIndex(t => t.id === S.track.id);
  if (i >= 0) { toggleFavT(i); return; }
  if (isFav(S.track.id)) { S.favs = S.favs.filter(f => f.id !== S.track.id); toast('즐겨찾기 제거'); }
  else                   { S.favs.push(S.track); toast('✦ 즐겨찾기 추가'); }
  saveFavs(); renderFavGrid(); updFavBtn();
}
function updFavBtn() {
  const f = S.track && isFav(S.track.id);
  document.getElementById('np-fav')?.classList.toggle('on', !!f);
}
function refreshDots() {
  document.querySelectorAll('.c-fav').forEach(d => {
    const id = d.closest('.card')?.dataset?.id; if (!id) return;
    const f = isFav(id); d.classList.toggle('on', f);
    const p = d.querySelector('path'); if (p) { p.setAttribute('fill', f?'var(--acc)':'none'); p.setAttribute('stroke', f?'var(--acc)':'rgba(255,255,255,.85)'); }
  });
}
function renderFavGrid() {
  const g = document.getElementById('fav-grid');
  if (!S.favs.length) {
    g.innerHTML = `<div class="state" style="grid-column:1/-1"><svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M22 38S6 28 6 18a9 9 0 0 1 16-5.6A9 9 0 0 1 38 18C38 28 22 38 22 38z"/></svg><h3>즐겨찾기가 비었어요</h3></div>`; return;
  }
  g.innerHTML = '';
  S.favs.forEach((t, i) => { const card = mkCard(t, i, () => { S.q = [...S.favs]; S.idx = i; playTrack(t, i); }); g.appendChild(card); });
}
function playFav(i) { S.q = [...S.favs]; S.idx = i; playTrack(S.favs[i], i); }

/* ════════════════════════════════════════════
   QUEUE
════════════════════════════════════════════ */
function renderQueue() {
  const wrap = document.getElementById('q-list');
  if (!S.q.length) { wrap.innerHTML = `<div class="state"><svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6 11h32M6 22h22M6 33h28"/></svg><h3>대기열 없음</h3></div>`; return; }
  wrap.innerHTML = S.q.map((t, i) => `
    <div class="lcard${i===S.idx?' playing':''}" onclick="playIdx(${i})">
      <span class="lcard-n">${i+1}</span>
      <img class="lcard-art" src="${esc(getThumbMd(t.id))}" onerror="this.src='${esc(t.thumb)}'" alt="">
      <div class="lcard-m"><div class="lcard-t">${esc(t.title)}</div><div class="lcard-c">${esc(t.channel)}</div></div>
      <span class="lcard-d">${fmt(t.dur)}</span>
      ${i===S.idx?`<svg width="13" height="13" viewBox="0 0 13 13" fill="var(--acc)"><polygon points="3,2 11,6.5 3,11"/></svg>`:''}
    </div>`).join('');
}

/* ════════════════════════════════════════════
   VIEWS / ROUTING (uses .bn for mobile nav)
════════════════════════════════════════════ */
function gv(v, el) {
  document.querySelectorAll('.view').forEach(e => e.classList.remove('on'));
  document.getElementById('v-'+v)?.classList.add('on');
  document.querySelectorAll('.bn').forEach(e => e.classList.remove('on'));
  el?.classList.add('on');
  if (v==='fav')       renderFavGrid();
  if (v==='queue')     renderQueue();
  if (v==='playlists') plRenderGrid();
}

/* ════════════════════════════════════════════
   PLAYLIST SYSTEM
════════════════════════════════════════════ */
const PL = { lists: JSON.parse(localStorage.getItem('xw_pl') || '[]'), curId: null };
function plSave() { localStorage.setItem('xw_pl', JSON.stringify(PL.lists)); }
function plById(id) { return PL.lists.find(p => p.id === id); }
let _dlgResolve = null;
function plDialog(title, defaultVal = '') {
  return new Promise(resolve => {
    _dlgResolve = resolve;
    document.getElementById('pl-dialog-title').textContent = title;
    const inp = document.getElementById('pl-dialog-input'); inp.value = defaultVal;
    document.getElementById('pl-dialog-overlay').classList.add('on');
    setTimeout(() => inp.focus(), 80);
  });
}
function plDialogConfirm() { const val = document.getElementById('pl-dialog-input').value.trim(); document.getElementById('pl-dialog-overlay').classList.remove('on'); if (_dlgResolve) { _dlgResolve(val||null); _dlgResolve=null; } }
function plDialogCancel()  { document.getElementById('pl-dialog-overlay').classList.remove('on'); if (_dlgResolve) { _dlgResolve(null); _dlgResolve=null; } }
let _confirmResolve = null;
function plConfirm(title, msg) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    document.getElementById('pl-confirm-title').textContent = title;
    document.getElementById('pl-confirm-msg').textContent   = msg;
    document.getElementById('pl-confirm-overlay').classList.add('on');
  });
}
function plConfirmOk()     { document.getElementById('pl-confirm-overlay').classList.remove('on'); if (_confirmResolve) { _confirmResolve(true); _confirmResolve=null; } }
function plConfirmCancel() { document.getElementById('pl-confirm-overlay').classList.remove('on'); if (_confirmResolve) { _confirmResolve(false); _confirmResolve=null; } }
async function plNewPrompt(defaultName='') { const name = await plDialog('새 플레이리스트', defaultName); if (!name) return null; const pl={id:Date.now().toString(),name,tracks:[]}; PL.lists.unshift(pl); plSave(); plRenderGrid(); return pl.id; }
async function plRenamePrompt() { const pl=plById(PL.curId); if(!pl) return; const name=await plDialog('이름 변경',pl.name); if(!name||name===pl.name) return; pl.name=name; plSave(); document.getElementById('pl-detail-name').textContent=pl.name; plRenderGrid(); }
async function plDeleteCurrent() { const pl=plById(PL.curId); if(!pl) return; const ok=await plConfirm('플레이리스트 삭제',`"${pl.name}" 플레이리스트를 삭제할까요?`); if(!ok) return; PL.lists=PL.lists.filter(p=>p.id!==PL.curId); PL.curId=null; plSave(); plShowList(); }
function plAddTrack(plId,track) { const pl=plById(plId); if(!pl) return false; if(pl.tracks.some(t=>t.id===track.id)){toast('이미 추가된 곡이에요');return false;} pl.tracks.push({id:track.id,title:track.title,channel:track.channel,dur:track.dur,thumb:track.thumb}); plSave(); if(PL.curId===plId)plRenderDetail(plId); toast(`✦ "${pl.name}"에 추가됨`); return true; }
function plRemoveTrack(plId,trackId) { const pl=plById(plId); if(!pl) return; pl.tracks=pl.tracks.filter(t=>t.id!==trackId); plSave(); plRenderDetail(plId); }
function plPlayAll() { const pl=plById(PL.curId); if(!pl||!pl.tracks.length) return; S.q=[...pl.tracks]; S.idx=0; playTrack(pl.tracks[0],0); }

function plRenderGrid() {
  const g = document.getElementById('pl-grid'); if (!g) return;
  if (!PL.lists.length) { g.innerHTML = `<div class="state" style="grid-column:1/-1"><svg width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="14" height="14" rx="2"/><rect x="26" y="4" width="14" height="14" rx="2"/><rect x="4" y="26" width="14" height="14" rx="2"/><line x1="33" y1="26" x2="33" y2="40"/><line x1="26" y1="33" x2="40" y2="33"/></svg><h3>플레이리스트가 없어요</h3><p>상단의 + 버튼으로 만들어보세요</p></div>`; return; }
  g.innerHTML = '';
  PL.lists.forEach(pl => {
    const card = document.createElement('div'); card.className = 'pl-card';
    const thumbs = pl.tracks.slice(0,4).map(t=>getThumbMd(t.id));
    const coverHtml = thumbs.length === 0
      ? `<div class="pl-card-cover empty"><svg width="30" height="30" viewBox="0 0 40 40" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="1.4" stroke-linecap="round"><path d="M4 9h32M4 20h20M4 31h26"/></svg></div>`
      : `<div class="pl-card-cover">${thumbs.map(src=>`<img src="${esc(src)}" onerror="this.src=''" alt="">`).join('')}</div>`;
    card.innerHTML = `${coverHtml}<div class="pl-card-info"><div class="pl-card-name">${esc(pl.name)}</div><div class="pl-card-cnt">${pl.tracks.length}곡</div></div>`;
    card.addEventListener('click', () => plRenderDetail(pl.id));
    g.appendChild(card);
  });
}

function plRenderDetail(plId) {
  const pl=plById(plId); if(!pl) return;
  PL.curId=plId;
  document.getElementById('pl-list-view').style.display='none';
  document.getElementById('pl-detail-view').style.display='';
  document.getElementById('pl-detail-name').textContent=pl.name;
  document.getElementById('pl-detail-count').textContent=`${pl.tracks.length}곡`;
  const cover=document.getElementById('pl-detail-cover');
  const thumbs=pl.tracks.slice(0,4).map(t=>getThumbMd(t.id));
  cover.innerHTML=thumbs.length?thumbs.map(src=>`<img src="${esc(src)}" alt="">`).join(''):`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><svg width="28" height="28" viewBox="0 0 32 32" fill="none" stroke="rgba(255,255,255,.3)" stroke-width="1.4" stroke-linecap="round"><path d="M4 9h24M4 16h16M4 23h20"/></svg></div>`;
  const list=document.getElementById('pl-track-list');
  if (!pl.tracks.length) { list.innerHTML=`<div class="state"><h3 style="font-size:14px">곡이 없어요</h3><p>곡 추가 버튼을 눌러보세요</p></div>`; return; }
  list.innerHTML='';
  pl.tracks.forEach((t,i) => {
    const row=document.createElement('div'); row.className='pl-track'+(S.track?.id===t.id?' playing':'');
    row.innerHTML=`<span class="pl-track-num">${i+1}</span><img class="pl-track-art" src="${esc(getThumbMd(t.id))}" onerror="this.src='${esc(t.thumb)}'" alt=""><div class="pl-track-m"><div class="pl-track-t">${esc(t.title)}</div><div class="pl-track-c">${esc(t.channel)}</div></div><span class="pl-track-d">${fmt(t.dur)}</span><button class="pl-track-del" onclick="event.stopPropagation();plRemoveTrack('${esc(plId)}','${esc(t.id)}')"><svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="1.5" y1="1.5" x2="9.5" y2="9.5"/><line x1="9.5" y1="1.5" x2="1.5" y2="11.5"/></svg></button>`;
    row.addEventListener('click', () => { S.q=[...pl.tracks]; S.idx=i; playTrack(t,i); });
    list.appendChild(row);
  });
}

function plShowList() { PL.curId=null; document.getElementById('pl-list-view').style.display=''; document.getElementById('pl-detail-view').style.display='none'; plRenderGrid(); }

let _plAddTimer=null;
function plAddModalOpen() { document.getElementById('pl-add-modal-overlay').classList.add('on'); const inp=document.getElementById('pl-add-modal-inp'); inp.value=''; document.getElementById('pl-add-modal-results').innerHTML=`<div class="pl-add-modal-hint">검색어를 입력하세요</div>`; setTimeout(()=>inp.focus(),80); }
function plAddModalClose() { document.getElementById('pl-add-modal-overlay').classList.remove('on'); clearTimeout(_plAddTimer); }
async function plAddModalSearch(q,immediate=false) {
  q=q?.trim(); if(!q){document.getElementById('pl-add-modal-results').innerHTML=`<div class="pl-add-modal-hint">검색어를 입력하세요</div>`;return;}
  clearTimeout(_plAddTimer);
  _plAddTimer=setTimeout(async()=>{
    const res=document.getElementById('pl-add-modal-results');
    res.innerHTML=`<div class="pl-add-modal-hint"><div class="spinner" style="width:20px;height:20px;border-width:1.5px;margin:0 auto 8px"></div>검색 중...</div>`;
    try{const data=await callCs({type:'search',query:q+' official audio OR music video OR mv'});const tracks=data.tracks||[];if(!tracks.length){res.innerHTML=`<div class="pl-add-modal-hint">결과가 없어요</div>`;return;}res.innerHTML='';const pl=plById(PL.curId);tracks.forEach(t=>{const alreadyIn=pl?.tracks.some(p=>p.id===t.id);const row=document.createElement('div');row.className='pl-modal-row';row.innerHTML=`<img class="pl-modal-row-art" src="${esc(getThumbMd(t.id))}" onerror="this.src='${esc(t.thumb)}'" alt=""><div class="pl-modal-row-m"><div class="pl-modal-row-t">${esc(t.title)}</div><div class="pl-modal-row-c">${esc(t.channel)}</div></div><span class="pl-modal-row-dur">${fmt(t.dur)}</span><button class="pl-modal-add-btn${alreadyIn?' added':''}">${alreadyIn?`<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="2,6 5,9 9,3"/></svg>`:`<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5.5" y1="1" x2="5.5" y2="10"/><line x1="1" y1="5.5" x2="10" y2="5.5"/></svg>`}</button>`;row.querySelector('.pl-modal-add-btn').addEventListener('click',e=>{e.stopPropagation();const btn=e.currentTarget;if(btn.classList.contains('added'))return;if(plAddTrack(PL.curId,t)){btn.classList.add('added');btn.innerHTML=`<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="2,6 5,9 9,3"/></svg>`;}});res.appendChild(row);});}catch{res.innerHTML=`<div class="pl-add-modal-hint">검색 실패</div>`;}
  }, immediate?0:400);
}

let _plCtxTrack=null;
function plShowCtxById(trackId) {
  const track=S.q.find(t=>t.id===trackId)||S.favs.find(t=>t.id===trackId)||(S.track?.id===trackId?S.track:null);
  if(!track) return;
  _plCtxTrack=track;
  const menu=document.getElementById('pl-ctx-menu'),list=document.getElementById('pl-ctx-list');
  list.innerHTML=PL.lists.length?PL.lists.map(pl=>`<button class="pl-ctx-item" onclick="plCtxAdd('${esc(pl.id)}')"><svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="1" width="4" height="4" rx="0.8"/><rect x="7" y="1" width="4" height="4" rx="0.8"/><rect x="1" y="7" width="4" height="4" rx="0.8"/></svg>${esc(pl.name)}</button>`).join(''):'';
  const mw=220, mh=80+PL.lists.length*46;
  const x=Math.min(innerWidth/2-mw/2, innerWidth-mw-8);
  const y=Math.max(8, innerHeight-mh-80);
  menu.style.left=x+'px'; menu.style.top=y+'px'; menu.classList.add('on');
}
function plCtxAdd(plId) { if(_plCtxTrack)plAddTrack(plId,_plCtxTrack); plCtxClose(); }
async function plCtxNew() { plCtxClose(); if(!_plCtxTrack) return; const track=_plCtxTrack; const id=await plNewPrompt(track.title.slice(0,20)); if(id)plAddTrack(id,track); }
function plCtxClose() { document.getElementById('pl-ctx-menu').classList.remove('on'); _plCtxTrack=null; }
document.addEventListener('click',e=>{ if(!e.target.closest('#pl-ctx-menu'))plCtxClose(); });
document.addEventListener('touchstart',e=>{ if(!e.target.closest('#pl-ctx-menu'))plCtxClose(); },{passive:true});

function togglePip() { document.getElementById('pip').classList.toggle('on'); }

/* ════════════════════════════════════════════
   UTILS
════════════════════════════════════════════ */
function fmt(s) { if(!s||isNaN(s)) return '0:00'; return `${Math.floor(s/60)}:${(Math.floor(s%60)).toString().padStart(2,'0')}`; }
function setT(id,s) { const el=document.getElementById(id); if(el) el.textContent=fmt(s); }
function esc(s) { if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
let _tt;
function toast(msg) { const el=document.getElementById('toast'); el.textContent=msg; el.classList.add('on'); clearTimeout(_tt); _tt=setTimeout(()=>el.classList.remove('on'),2200); }

/* ════════════════════════════════════════════
   OVERLAY MODE (Android: OverlayService)
   오버레이 버튼은 NP에 없으므로 post()만 유지
════════════════════════════════════════════ */
const OV = { active: false, ticker: null, curIdx: -1 };
function toggleOverlay() {
  OV.active = !OV.active;
  if (OV.active) { post('overlayMode', { active: true }); OV.curIdx=-1; OV.ticker=setInterval(_syncOvLyrics,100); toast('오버레이 모드 켜짐'); }
  else           { clearInterval(OV.ticker); OV.ticker=null; post('overlayMode', { active: false }); toast('오버레이 모드 꺼짐'); }
}
function _syncOvLyrics() {
  if(!S.ytPlayer||!S.ytReady||!LY.lines.length) return;
  let cur; try{cur=S.ytPlayer.getCurrentTime()||0;}catch{return;}
  let found=-1;
  for(let i=LY.lines.length-1;i>=0;i--){if(cur>=LY.lines[i].start){if(cur<LY.lines[i].end)found=i;break;}}
  if(found===OV.curIdx) return;
  OV.curIdx=found;
  const get=i=>(i>=0&&i<LY.lines.length)?(LY.lines[i].text||''):'';
  post('overlayLyrics',{prev:get(found-1),active:get(found),next1:get(found+1),next2:''});
}

/* ════════════════════════════════════════════
   LYRICS SYSTEM
════════════════════════════════════════════ */
const LY = { lines:[], curIdx:-1, ticker:null, videoId:null };
function _getArtCenter() {
  const ash=document.getElementById('np-ash'),canvas=document.getElementById('np-particles');
  if(!ash||!canvas) return{cx:canvas?canvas.width/2:innerWidth/2,cy:canvas?canvas.height*.42:innerHeight*.42};
  const ar=ash.getBoundingClientRect(),cr=canvas.getBoundingClientRect();
  return{cx:ar.left+ar.width/2-cr.left,cy:ar.top+ar.height/2-cr.top};
}
async function fetchLyrics(videoId) {
  if(LY.videoId===videoId&&LY.lines.length>0) return;
  LY.videoId=videoId; LY.lines=[]; LY.curIdx=-1; _showLyricsLoading();
  try {
    const title=S.track?.title??'',channel=S.track?.channel??'';
    let duration=S.dur||0;
    if(!duration&&S.ytPlayer&&S.ytReady){try{duration=S.ytPlayer.getDuration()||0;}catch{}}
    if(!duration){for(let i=0;i<6&&!duration;i++){await new Promise(r=>setTimeout(r,500));duration=S.dur||0;if(!duration&&S.ytPlayer&&S.ytReady){try{duration=S.ytPlayer.getDuration()||0;}catch{}}}}
    const res=await callCs({type:'fetchLyrics',videoId,title,channel,duration});
    if(res.success&&res.lines&&res.lines.length>0){LY.lines=res.lines;_renderLyrics();}else{_showLyricsEmpty();}
  } catch{_showLyricsEmpty();}
}
function _renderLyrics() {
  const inner=document.getElementById('np-lyrics-inner'),artArea=document.querySelector('.np-art-area');
  if(!inner||!artArea) return;
  document.getElementById('np-no-lyrics')?.remove();
  inner.innerHTML='';
  LY.lines.forEach((line,i)=>{
    const el=document.createElement('div'); el.className='np-lyric-line'; el.textContent=line.text;
    el.addEventListener('click',()=>{if(S.ytPlayer&&S.ytReady)S.ytPlayer.seekTo(line.start+0.05,true);});
    inner.appendChild(el); LY.lines[i].el=el;
  });
  artArea.classList.add('has-lyrics'); _startLyricsTick();
  if(OV.active){post('overlayLyrics',{prev:'',active:'',next1:'',next2:''});}
}
function _showLyricsLoading() {
  const inner=document.getElementById('np-lyrics-inner'),artArea=document.querySelector('.np-art-area');
  if(!inner) return; document.getElementById('np-no-lyrics')?.remove();
  artArea?.classList.add('has-lyrics');
  inner.innerHTML=`<div class="np-lyrics-loading"><div class="spinner"></div><span>가사 불러오는 중...</span></div>`;
}
function _showLyricsEmpty() {
  const inner=document.getElementById('np-lyrics-inner'),artArea=document.querySelector('.np-art-area');
  if(!inner) return; artArea?.classList.remove('has-lyrics'); inner.innerHTML='';
  document.getElementById('np-no-lyrics')?.remove();
  const el=document.createElement('div'); el.id='np-no-lyrics'; el.className='np-no-lyrics'; el.textContent='가사를 찾을 수 없습니다';
  document.getElementById('np')?.appendChild(el);
}
function _clearLyrics() {
  const inner=document.getElementById('np-lyrics-inner'),artArea=document.querySelector('.np-art-area');
  if(inner) inner.innerHTML=''; artArea?.classList.remove('has-lyrics');
  document.getElementById('np-no-lyrics')?.remove(); _stopLyricsTick(); LY.lines=[]; LY.curIdx=-1; LY.videoId=null;
}
function _startLyricsTick() { _stopLyricsTick(); _clampLyricEnds(); LY.ticker=setInterval(_syncLyrics,100); }
function _stopLyricsTick()  { clearInterval(LY.ticker); LY.ticker=null; }
function _clampLyricEnds() {
  for(let i=0;i<LY.lines.length-1;i++){const ns=LY.lines[i+1].start;if(LY.lines[i].end>ns)LY.lines[i].end=ns;if(LY.lines[i].end<=LY.lines[i].start)LY.lines[i].end=Math.min(LY.lines[i].start+0.5,ns);}
}
function _syncLyrics() {
  if(!S.ytPlayer||!S.ytReady||!LY.lines.length) return;
  let cur; try{cur=S.ytPlayer.getCurrentTime()||0;}catch{return;}
  let found=-1;
  for(let i=LY.lines.length-1;i>=0;i--){if(cur>=LY.lines[i].start){if(cur<LY.lines[i].end)found=i;break;}}
  if(found===LY.curIdx) return; LY.curIdx=found; _highlightLine(found);
}
function _highlightLine(idx) {
  LY.lines.forEach((line,i)=>{
    if(!line.el) return; line.el.classList.remove('active','prev','near');
    if(idx<0) return;
    const d=i-idx;
    if(d===0) line.el.classList.add('active');
    else if(d===-1) line.el.classList.add('prev');
    else if(d>=1&&d<=3) line.el.classList.add('near');
  });
  if(idx>=0&&LY.lines[idx]?.el){
    const el=LY.lines[idx].el,scroll=document.getElementById('np-lyrics-scroll');
    if(!scroll) return;
    const target=el.offsetTop-scroll.clientHeight/2+el.offsetHeight/2;
    scroll.scrollTo({top:target,behavior:'smooth'});
  }
}

/* ════════════════════════════════════════════
   KEYBOARD (for hardware keyboard / desktop)
════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.target.tagName==='INPUT') return;
  if (e.code==='Space')      { e.preventDefault(); togglePlay(); }
  if (e.code==='ArrowRight') nextT();
  if (e.code==='ArrowLeft')  prevT();
  if (e.code==='Escape')     closeNP();
});

/* ════════════════════════════════════════════
   INIT
════════════════════════════════════════════ */
function setGreet() {
  const h=new Date().getHours();
  document.getElementById('greet-h').textContent =
    h<6?'좋은 새벽이에요 🌙':h<12?'좋은 아침이에요 ☀️':h<18?'좋은 오후예요 🎵':h<22?'좋은 저녁이에요 🌆':'좋은 밤이에요 🌙';
}
setGreet();
updateBarVisibility();
setTimeout(() => { loadRec('pop music 2024 official','rec-row'); loadRec('kpop 2024 mv official','hot-row'); }, 700);
setTimeout(() => toast('✦ X-WARE에 오신 걸 환영해요'), 1000);
