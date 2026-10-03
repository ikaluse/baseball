// audio.js — 背景音樂與短音效：全部用 Web Audio API 即時合成，不需要音樂檔
//   title：主選單／選隊（熱血搖滾，A 小調 Am–F–C–G，150 BPM）
//   game ：比賽中（球場風琴應援，C 大調，120 BPM，音量較小）
//   jingle：win / lose / hr（勝利、落敗、全壘打）
// 瀏覽器規定要使用者點過畫面才能出聲，所以第一次點擊時才真正開始播放；切到別的分頁會自動暫停。
'use strict';
const AUDIO_KEY='baseball-audio';
const AUD={ctx:null, out:null, music:null, sfx:null, song:null, step:0, nextT:0, on:true, vol:60};
try{const a=JSON.parse(localStorage.getItem(AUDIO_KEY)||'{}'); if(typeof a.on==='boolean')AUD.on=a.on; if(Number.isFinite(a.vol))AUD.vol=a.vol;}catch(e){}
const saveAudio=()=>{try{localStorage.setItem(AUDIO_KEY,JSON.stringify({on:AUD.on, vol:AUD.vol}));}catch(e){}};

/* ---------- 音符與曲子 ---------- */
const NOTE_IDX={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
const midi=n=>{const m=/^([A-G][#b]?)(-?\d)$/.exec(n); return 12*(+m[2]+1)+NOTE_IDX[m[1]];};
const hz=m=>440*Math.pow(2,(m-69)/12);
// "A4:2 C5:2 ." → 依 16 分音符排好的事件；「.」或「r」是休止
function seq(bars){
  const ev=[]; let pos=0;
  bars.forEach(bar=>bar.trim().split(/\s+/).forEach(tok=>{
    const [n,d]=tok.split(':'), dur=+(d||1);
    if(n!=='.'&&n!=='r') (ev[pos]??=[]).push({m:midi(n), d:dur});
    pos+=dur;
  }));
  return ev;
}
const CH={Am:['A3','C4','E4'], F:['F3','A3','C4'], C:['C4','E4','G4'], G:['G3','B3','D4'], E:['E3','G#3','B3'], Dm:['D4','F4','A4']};
const SONGS={
  title:{bpm:150, bars:8, chords:['Am','F','C','G','Am','F','G','E'],
    lead:{wave:'square', vol:.07, cut:2600, ev:seq([
      'A4:2 C5:2 E5:3 D5:1 C5:2 B4:2 A4:4', 'F4:2 A4:2 C5:3 B4:1 A4:2 G4:2 F4:4',
      'E4:2 G4:2 C5:3 D5:1 E5:4 G5:4',      'D5:3 B4:1 G4:4 A4:2 B4:2 D5:4',
      'E5:2 E5:2 D5:2 C5:2 D5:3 E5:1 A4:4', 'F5:2 E5:2 D5:2 C5:2 C5:3 D5:1 A4:4',
      'B4:2 C5:2 D5:2 G5:2 F5:3 E5:1 D5:4', 'E5:4 G#4:4 B4:4 E5:4'])},
    bass:{wave:'sawtooth', vol:.11, cut:700, ev:seq(['A2:2 A2:2 A3:2 A2:2 A2:2 A2:2 A3:2 A2:2','F2:2 F2:2 F3:2 F2:2 F2:2 F2:2 F3:2 F2:2',
      'C3:2 C3:2 C4:2 C3:2 C3:2 C3:2 C4:2 C3:2','G2:2 G2:2 G3:2 G2:2 G2:2 G2:2 G3:2 G2:2',
      'A2:2 A2:2 A3:2 A2:2 A2:2 A2:2 A3:2 A2:2','F2:2 F2:2 F3:2 F2:2 F2:2 F2:2 F3:2 F2:2',
      'G2:2 G2:2 G3:2 G2:2 G2:2 G2:2 G3:2 G2:2','E2:2 E2:2 E3:2 E2:2 E2:2 E2:2 E3:2 E2:2'])},
    arp:{wave:'square', vol:.022, every:1, oct:12},
    drums:{k:'x.....x.x.......', s:'....x.......x...', h:'x.x.x.x.x.x.x.x.', vol:1}},
  game:{bpm:120, bars:8, chords:['C','Am','F','G','C','Am','F','G'],
    lead:{wave:'triangle', vol:.08, cut:5000, organ:true, ev:seq([
      'G4:2 C5:2 E5:2 G5:2 E5:2 C5:2 E5:4', 'A4:2 C5:2 E5:2 A5:2 G5:2 E5:2 C5:4',
      'F4:2 A4:2 C5:2 F5:2 E5:2 D5:2 C5:4', 'G4:2 B4:2 D5:2 G5:2 F5:2 D5:2 B4:4',
      'E5:3 D5:1 C5:2 E5:2 G5:4 E5:4',      'A5:3 G5:1 E5:2 C5:2 E5:4 A4:4',
      'F5:2 E5:2 D5:2 C5:2 D5:2 E5:2 F5:4', 'G5:4 D5:4 B4:4 G4:4'])},
    bass:{wave:'triangle', vol:.1, cut:900, ev:seq(['C3:4 G2:4 C3:4 G2:4','A2:4 E2:4 A2:4 E2:4','F2:4 C3:4 F2:4 C3:4','G2:4 D3:4 G2:4 D3:4',
      'C3:4 G2:4 C3:4 G2:4','A2:4 E2:4 A2:4 E2:4','F2:4 C3:4 F2:4 C3:4','G2:4 D3:4 G2:4 B2:4'])},
    pad:{wave:'sine', vol:.02},
    drums:{k:'x.......x.......', s:'....x.......x...', h:'..x...x...x...x.', vol:.55}},
};
const JINGLES={
  win:{wave:'square', vol:.11, notes:[['C5',.11],['E5',.11],['G5',.11],['C6',.42],['r',.06],['G5',.1],['A5',.1],['B5',.1],['C6',.8]], chord:['C4','E4','G4','C5']},
  lose:{wave:'triangle', vol:.16, notes:[['E5',.28],['C5',.28],['A4',.28],['F4',.28],['E4',.9]], chord:['A3','C4','E4']},
  hr:{wave:'square', vol:.09, notes:[['C5',.06],['D5',.06],['E5',.06],['F5',.06],['G5',.06],['A5',.06],['B5',.06],['C6',.5]], chord:['C4','G4','C5','E5']},
};

/* ---------- 音源 ---------- */
let noiseBuf=null;
function initAudio(){
  if(AUD.ctx) return AUD.ctx;
  const C=window.AudioContext||window.webkitAudioContext; if(!C) return null;
  const ctx=AUD.ctx=new C();
  const comp=ctx.createDynamicsCompressor(); comp.threshold.value=-14; comp.ratio.value=4; comp.connect(ctx.destination);
  AUD.out=ctx.createGain(); AUD.out.connect(comp);
  AUD.music=ctx.createGain(); AUD.music.connect(AUD.out);
  AUD.sfx=ctx.createGain(); AUD.sfx.connect(AUD.out);
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*0.5,ctx.sampleRate); const d=noiseBuf.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  applyVolume();
  return ctx;
}
function applyVolume(){ if(!AUD.ctx)return; AUD.out.gain.value=AUD.on?AUD.vol/100:0; }
// 一個音：振盪器 → 低通 → 包絡 → 輸出
function tone(dest,wave,freq,t,dur,vol,cut=8000,organ=false){
  const ctx=AUD.ctx, g=ctx.createGain(), f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=cut;
  g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(vol,t+0.012);
  g.gain.setValueAtTime(vol,t+Math.max(0.02,dur-0.04)); g.gain.linearRampToValueAtTime(0,t+dur);
  f.connect(g); g.connect(dest);
  const oscs=[[wave,freq,1]]; if(organ) oscs.push(['sine',freq*2,.45],['sine',freq*0.5,.3]);  // 風琴：加八度泛音
  oscs.forEach(([w,fr,k])=>{const o=ctx.createOscillator(); o.type=w; o.frequency.value=fr;
    const gg=ctx.createGain(); gg.gain.value=k; o.connect(gg); gg.connect(f); o.start(t); o.stop(t+dur+0.02);});
}
function kick(t,v){const ctx=AUD.ctx, o=ctx.createOscillator(), g=ctx.createGain(); o.frequency.setValueAtTime(140,t); o.frequency.exponentialRampToValueAtTime(42,t+0.12);
  g.gain.setValueAtTime(0.5*v,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.18); o.connect(g); g.connect(AUD.music); o.start(t); o.stop(t+0.2);}
function noise(t,dur,v,type,freq){const ctx=AUD.ctx, s=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain(); s.buffer=noiseBuf;
  f.type=type; f.frequency.value=freq; g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.001,t+dur);
  s.connect(f); f.connect(g); g.connect(AUD.music); s.start(t); s.stop(t+dur+0.02);}
const snare=(t,v)=>{noise(t,0.16,0.22*v,'bandpass',1800); tone(AUD.music,'triangle',190,t,0.08,0.08*v);};
const hat=(t,v)=>noise(t,0.04,0.07*v,'highpass',7000);

/* ---------- 排程（提前 0.3 秒排好音符） ---------- */
function playStep(song,step,t,sp){
  const bar=Math.floor(step/16), pos=step%16, chord=CH[song.chords[bar]];
  (song.lead.ev[step]||[]).forEach(n=>tone(AUD.music,song.lead.wave,hz(n.m),t,n.d*sp*0.92,song.lead.vol,song.lead.cut,song.lead.organ));
  (song.bass.ev[step]||[]).forEach(n=>tone(AUD.music,song.bass.wave,hz(n.m),t,n.d*sp*0.85,song.bass.vol,song.bass.cut));
  if(song.arp&&pos%song.arp.every===0){const m=midi(chord[pos%3])+song.arp.oct; tone(AUD.music,song.arp.wave,hz(m),t,sp*0.7,song.arp.vol,3200);}
  if(song.pad&&pos===0) chord.forEach(n=>tone(AUD.music,song.pad.wave,hz(midi(n)+12),t,16*sp*0.98,song.pad.vol,2000));
  const dv=song.drums.vol;
  if(song.drums.k[pos]==='x') kick(t,dv); if(song.drums.s[pos]==='x') snare(t,dv); if(song.drums.h[pos]==='x') hat(t,dv);
}
function tick(){
  const ctx=AUD.ctx; if(!ctx||!AUD.song||ctx.state!=='running') return;
  const song=SONGS[AUD.song], sp=60/song.bpm/4, total=song.bars*16;
  if(AUD.nextT<ctx.currentTime) AUD.nextT=ctx.currentTime+0.05;     // 分頁回來時不要一次補一大堆音
  while(AUD.nextT<ctx.currentTime+0.3){ playStep(song,AUD.step,AUD.nextT,sp); AUD.step=(AUD.step+1)%total; AUD.nextT+=sp; }
}
setInterval(tick,40);

/* ---------- 對外介面 ---------- */
// 換曲：同一首就不重來；null 停止
function playMusic(key){
  if(AUD.song===key) return;
  AUD.song=key; AUD.step=0;
  if(AUD.ctx){ AUD.nextT=AUD.ctx.currentTime+0.08; fadeMusicIn(); }
}
function fadeMusicIn(){ if(!AUD.ctx)return; const g=AUD.music.gain, t=AUD.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(0.0001,t); g.linearRampToValueAtTime(1,t+0.6); }
const stopMusic=()=>{ AUD.song=null; };
function playJingle(key,then){
  const j=JINGLES[key]; if(!AUD.ctx||!j||!AUD.on){ if(then)then(); return; }
  const ctx=AUD.ctx, t0=ctx.currentTime+0.05; let t=t0;
  // 播短曲時把背景音樂壓小
  const g=AUD.music.gain; g.cancelScheduledValues(t0); g.setValueAtTime(g.value,t0); g.linearRampToValueAtTime(0.2,t0+0.1);
  j.notes.forEach(([n,d])=>{ if(n!=='r') tone(AUD.sfx,j.wave,hz(midi(n)),t,d*0.95,j.vol,4000); t+=d; });
  const last=j.notes[j.notes.length-1][1]; j.chord.forEach(n=>tone(AUD.sfx,'triangle',hz(midi(n)),t-last,last+0.3,0.05,3000));
  g.linearRampToValueAtTime(1,t+0.6);
  if(then) setTimeout(then,(t-t0)*1000+400);
}
function setMusicOn(on){ AUD.on=on; saveAudio(); if(on)unlockAudio(); applyVolume(); updateSoundButtons(); }
function setMusicVolume(v){ AUD.vol=clamp(Math.round(v),0,100); saveAudio(); applyVolume(); }
function updateSoundButtons(){ document.querySelectorAll('[data-snd]').forEach(b=>{b.textContent=AUD.on?'♪ 音樂：開':'♪ 音樂：關'; b.classList.toggle('off',!AUD.on);}); }
// 第一次點擊／按鍵時建立音訊（瀏覽器的自動播放限制）
function unlockAudio(){ const ctx=initAudio(); if(!ctx)return; if(ctx.state==='suspended') ctx.resume(); if(AUD.song){AUD.nextT=ctx.currentTime+0.08; fadeMusicIn();} }
['pointerdown','keydown','touchstart'].forEach(ev=>addEventListener(ev,()=>{ if(!AUD.ctx||AUD.ctx.state==='suspended') unlockAudio(); },{passive:true}));
document.addEventListener('visibilitychange',()=>{ if(!AUD.ctx)return; if(document.hidden) AUD.ctx.suspend(); else AUD.ctx.resume(); });
document.addEventListener('click',e=>{const b=e.target.closest('[data-snd]'); if(b){ e.stopPropagation(); setMusicOn(!AUD.on); }});
updateSoundButtons();
