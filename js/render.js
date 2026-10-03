// render.js — 所有 Canvas 繪圖：鏡頭投影、球場、人物骨架、球、擊球框、力道計、小地圖
// 依賴：engine.js（G、PITCH_DEFS、ZX/ZT/ZB/BR、clamp…）與 ui.js 的 UI 狀態（執行時才讀取）
'use strict';
const $=s=>document.querySelector(s);
const cv=$('#cv');
let ctx=cv.getContext('2d'); // 畫大頭照時會暫時切到小畫布，所以用 let
const mini=$('#mini'), mctx=mini.getContext('2d');
const W=900,H=700, CAMD=20, CAMY=4.2, CX=W/2;
function fitCanvas(){
  const dpr=Math.min(window.devicePixelRatio||1,2);
  cv.width=W*dpr; cv.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
  mini.width=280*dpr; mini.height=210*dpr; mctx.setTransform(dpr,0,0,dpr,0,0);
  if(G)drawMini();
}
/* ---------- 鏡頭 ----------
   catcher：本壘後方往投手看（原本的打擊視角）；pitcher：投手丘後上方往本壘看（仿 MVP 的投球視角）。
   座標：x=往一壘為正，y=高度，z=往中外野為正（英尺），本壘在原點。 */
const CAMS={
  catcher:{C:[0,CAMY,-CAMD], T:[0,CAMY,10],  F:1900, CY:258},
  pitcher:{C:[-3.4,9.6,112], T:[0,2.6,0],    F:3400, CY:330},
};
let CAM=null;
function setCam(view){
  if(CAM&&CAM.view===view) return;
  const c=CAMS[view], nrm=v=>{const l=Math.hypot(...v); return v.map(x=>x/l);};
  const f=nrm(c.T.map((t,i)=>t-c.C[i])), r=nrm([f[2],0,-f[0]]);          // r = 上方向 × f
  const u=[f[1]*r[2]-f[2]*r[1], f[2]*r[0]-f[0]*r[2], f[0]*r[1]-f[1]*r[0]]; // u = f × r
  CAM={view, ...c, f, r, u};
}
setCam('catcher');
const pitcherView=()=>CAM.view==='pitcher';
// 世界座標 → 畫面座標；s = 該深度每英尺幾個像素（在鏡頭後方時 s<=0）
const proj=(x,y,z)=>{const d=[x-CAM.C[0],y-CAM.C[1],z-CAM.C[2]], {f,r,u}=CAM;
  const zc=d[0]*f[0]+d[1]*f[1]+d[2]*f[2], s=CAM.F/Math.max(zc,0.01);
  return {X:CX+(d[0]*r[0]+d[1]*r[1]+d[2]*r[2])*s, Y:CAM.CY-(d[0]*u[0]+d[1]*u[1]+d[2]*u[2])*s, s, zc};};
// 畫面座標 → 本壘板平面（z=0）上的位置（瞄準、擊球框用）
function unproj(X,Y){
  const a=(X-CX)/CAM.F, b=-(Y-CAM.CY)/CAM.F, {f,r,u,C}=CAM;
  const dir=[0,1,2].map(i=>f[i]+a*r[i]+b*u[i]), t=-C[2]/dir[2];
  return {x:C[0]+dir[0]*t, y:C[1]+dir[1]*t};
}
// 繪製順序用的深度（離鏡頭越遠越先畫）
const depthOf=z=>(z-CAM.C[2])*CAM.f[2];

/* ---------- 場景 ---------- */
const dark=()=>{const t=document.documentElement.dataset.theme; return t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;};
function poly(pts){ctx.beginPath(); pts.forEach((p,i)=>i?ctx.lineTo(p.X,p.Y):ctx.moveTo(p.X,p.Y)); ctx.closePath();}
function circlePts(cx,cz,r,n,a0,a1){const o=[]; for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n; o.push(proj(cx+Math.sin(a)*r,0,cz+Math.cos(a)*r));} return o;}
let crowd=null;
function drawField(now){
  const night=dark();
  const wallTop=proj(0,12,380).Y, wallBot=proj(0,0,380).Y;
  // 天空
  const sky=ctx.createLinearGradient(0,0,0,wallTop);
  sky.addColorStop(0,night?'#050a14':'#7fb2dc'); sky.addColorStop(1,night?'#1a2436':'#c8dcea');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,wallTop);
  // 看台
  const standTop=36;
  ctx.fillStyle=night?'#1a2230':'#58626e'; ctx.fillRect(0,standTop,W,wallTop-standTop);
  if(!crowd){crowd=[];const m=mulberry32(7);for(let i=0;i<1400;i++)crowd.push([m()*W, standTop+6+m()*(wallTop-standTop-20), m()]);}
  const cols=['#d6d9dd','#e0c29a','#2c3e63','#b3413a','#f2f2ee','#8a9aad','#4f6b8f','#c9a36a'];
  crowd.forEach(([x,y,r])=>{ctx.fillStyle=cols[Math.floor(r*8)]; ctx.globalAlpha=night?.55:.8; ctx.fillRect(x,y,3.2,4.2);}); ctx.globalAlpha=1;
  ctx.fillStyle=night?'#0f1520':'#39424d'; for(let i=0;i<6;i++){ctx.fillRect(0,standTop+28+i*27,W,2);}
  // 看台上方結構與燈柱
  ctx.fillStyle=night?'#0b1018':'#2d353f'; ctx.fillRect(0,0,W,standTop);
  for(let i=0;i<5;i++){const x=90+i*180; ctx.fillStyle=night?'#1d2635':'#3d4753'; ctx.fillRect(x,0,90,24); ctx.fillStyle=night?'#fff7d6':'#e9eef2'; for(let j=0;j<6;j++)ctx.fillRect(x+6+j*14,5,9,6);}
  // 全壘打牆
  ctx.fillStyle=night?'#163826':'#1f5236'; ctx.fillRect(0,wallTop,W,wallBot-wallTop+1);
  ctx.fillStyle=night?'#1c4630':'#2a6545'; for(let x=0;x<W;x+=60)ctx.fillRect(x,wallTop,2,wallBot-wallTop);
  ctx.fillStyle='#f0e6c8'; ctx.fillRect(0,wallTop,W,2);
  ctx.fillStyle='rgba(255,255,255,.85)'; ctx.font='600 15px Oswald,sans-serif'; ctx.textAlign='center';
  ctx.fillText('400',CX,wallTop+(wallBot-wallTop)*0.62); ctx.fillText('375',CX-360,wallTop+(wallBot-wallTop)*0.62); ctx.fillText('375',CX+360,wallTop+(wallBot-wallTop)*0.62); ctx.textAlign='left';
  // 草地條紋
  const zs=[380,300,240,195,160,132,110,92,77,64,53,43,34,26,19,12,6,1,-4];
  for(let i=0;i<zs.length-1;i++){const a=proj(0,0,zs[i]).Y,b=proj(0,0,zs[i+1]).Y; ctx.fillStyle=i%2?(night?'#2b5a36':'#3f8744'):(night?'#316540':'#4a954f'); ctx.fillRect(0,a,W,b-a+1);}
  const dirt=night?'#8e6343':'#b98256', dirt2=night?'#7d573a':'#a8734b';
  // 警戒區
  const wt=proj(0,0,368).Y; ctx.fillStyle=dirt2; ctx.fillRect(0,wt,W,wallBot-wt+1);
  // 內野紅土（以投手丘為圓心半徑 95ft）
  ctx.fillStyle=dirt; poly(circlePts(0,60.5,95,60,-Math.PI*0.62,Math.PI*0.62).concat([proj(300,0,-10),proj(-300,0,-10)])); ctx.fill();
  // 內野草皮
  ctx.fillStyle=night?'#2f6039':'#468f4b';
  poly([proj(0,0,3),proj(60,0,63.6),proj(0,0,123),proj(-60,0,63.6)]); ctx.fill();
  // 投手丘
  ctx.fillStyle=dirt; poly(circlePts(0,60.5,9,30,0,Math.PI*2)); ctx.fill();
  const rb=proj(0,0.5,60.5); ctx.fillStyle='#f4f4f0'; ctx.fillRect(rb.X-1*rb.s,rb.Y-2,2*rb.s,3);
  // 二壘
  const b2=proj(0,0,127.3); ctx.fillStyle='#fff'; ctx.save(); ctx.translate(b2.X,b2.Y); ctx.scale(1,0.22); ctx.rotate(Math.PI/4); ctx.fillRect(-1.1*b2.s,-1.1*b2.s,2.2*b2.s,2.2*b2.s); ctx.restore();
  // 本壘附近紅土
  ctx.fillStyle=dirt; poly(circlePts(0,0,13,40,-Math.PI,Math.PI)); ctx.fill();
  // 界外線
  ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=2.5;
  [-1,1].forEach(sg=>{const p0=proj(sg*1.5,0,1.5), p1=proj(sg*330,0,330); ctx.beginPath(); ctx.moveTo(p0.X,p0.Y); ctx.lineTo(p1.X,p1.Y); ctx.stroke();});
  // 打擊區
  ctx.lineWidth=3; ctx.strokeStyle='rgba(255,255,255,.75)';
  [-1,1].forEach(sg=>{poly([proj(sg*1.2,0,3),proj(sg*5.2,0,3),proj(sg*5.2,0,-3),proj(sg*1.2,0,-3)]); ctx.stroke();});
  // 本壘板
  ctx.fillStyle='#f6f6f2'; poly([proj(-0.71,0,0.71),proj(0.71,0,0.71),proj(0.71,0,0),proj(0,0,-0.71),proj(-0.71,0,0)]); ctx.fill();
}
/* ---------- 人物骨架（3D 關節 → 投影） ---------- */
const V=(a,y,b)=>[a,y,b];
const KB=[ // 打者：local = [朝本壘板方向 f, 高度 y, 朝投手方向 p]；A=後側（捕手側），B=前側
 {t:0, j:{hd:V(0,5.55,0.05),sA:V(-0.5,4.85,-0.4),sB:V(0.35,4.9,0.45),eA:V(-0.95,4.5,-0.6),eB:V(0.15,4.3,0.1),hA:V(-0.3,5.05,-0.35),hB:V(-0.3,4.9,-0.25),
   pA:V(-0.35,3.15,-0.25),pB:V(0.2,3.15,0.3),kA:V(-0.25,1.65,-0.8),kB:V(0.45,1.65,0.7),fA:V(-0.55,0.12,-0.95),fB:V(0.45,0.12,0.9)}},
 {t:0.22, j:{hd:V(-0.02,5.5,0),sA:V(-0.55,4.8,-0.35),sB:V(0.3,4.85,0.45),eA:V(-1.0,4.6,-0.65),eB:V(0.1,4.3,0),hA:V(-0.4,5.1,-0.5),hB:V(-0.4,4.95,-0.4),
   pA:V(-0.4,3.1,-0.2),pB:V(0.15,3.12,0.35),kA:V(-0.25,1.6,-0.8),kB:V(0.35,2.0,0.6),fA:V(-0.55,0.12,-0.95),fB:V(0.35,0.45,0.7)}},
 {t:0.55, j:{hd:V(0.1,5.4,0.1),sA:V(-0.3,4.65,-0.45),sB:V(0.5,4.75,0.3),eA:V(0.2,3.7,-0.2),eB:V(0.75,3.85,0.35),hA:V(0.95,3.35,0.4),hB:V(0.9,3.4,0.5),
   pA:V(-0.3,3.05,-0.3),pB:V(0.35,3.05,0.25),kA:V(0.05,1.5,-0.6),kB:V(0.6,1.6,1.1),fA:V(-0.45,0.25,-0.95),fB:V(0.6,0.12,1.35)}},
 {t:1, j:{hd:V(0.15,5.45,0.2),sA:V(0.1,4.75,-0.5),sB:V(0.3,4.8,0.5),eA:V(0.55,4.8,0.1),eB:V(-0.2,4.85,0.35),hA:V(-0.2,5.3,0.45),hB:V(-0.15,5.25,0.4),
   pA:V(-0.1,3.1,-0.35),pB:V(0.3,3.1,0.3),kA:V(0.25,1.4,-0.45),kB:V(0.6,1.6,1.1),fA:V(-0.3,0.35,-0.85),fB:V(0.6,0.12,1.35)}},
];
const KP=[ // 投手：local = [投球手側 u, 高度 y, 朝本壘 f]；A=投球手側，B=手套側
 {t:0, j:{hd:V(0,5.6,0),sA:V(0.62,4.95,0),sB:V(-0.62,4.95,0),eA:V(0.6,4.0,0.3),eB:V(-0.6,4.0,0.3),hA:V(0.08,4.35,0.55),hB:V(-0.08,4.35,0.55),
   pA:V(0.33,3.15,0),pB:V(-0.33,3.15,0),kA:V(0.38,1.65,0.1),kB:V(-0.38,1.65,0.12),fA:V(0.35,0.12,0),fB:V(-0.4,0.12,0.2)}},
 {t:0.4, j:{hd:V(0.1,5.65,0),sA:V(0.35,5.0,-0.5),sB:V(-0.25,5.0,0.45),eA:V(0.45,4.3,-0.2),eB:V(-0.4,4.3,0.4),hA:V(0.05,4.6,0.3),hB:V(-0.05,4.55,0.35),
   pA:V(0.25,3.2,-0.25),pB:V(-0.2,3.2,0.25),kA:V(0.3,1.7,-0.1),kB:V(-0.15,3.3,0.8),fA:V(0.35,0.12,0),fB:V(-0.1,2.0,0.4)}},
 {t:0.75, j:{hd:V(-0.2,5.2,1.4),sA:V(0.55,4.75,0.4),sB:V(-0.45,4.6,1.6),eA:V(1.25,5.0,-0.2),eB:V(-0.8,4.6,2.4),hA:V(1.5,5.7,-0.6),hB:V(-0.9,4.4,2.9),
   pA:V(0.3,2.8,0.6),pB:V(-0.3,2.75,1.2),kA:V(0.4,1.3,0.2),kB:V(-0.45,1.6,3.8),fA:V(0.35,0.12,0),fB:V(-0.5,0.12,4.5)}},
 {t:1.0, j:{hd:V(-0.15,5.1,2.6),sA:V(0.5,4.7,2.2),sB:V(-0.55,4.55,2.0),eA:V(1.1,5.1,3.0),eB:V(-0.9,3.9,2.4),hA:V(1.35,5.7,4.4),hB:V(-0.6,3.8,1.9),
   pA:V(0.3,2.8,1.4),pB:V(-0.3,2.75,1.8),kA:V(0.35,1.4,0.9),kB:V(-0.45,1.7,4.0),fA:V(0.4,0.35,0.3),fB:V(-0.5,0.12,4.5)}},
 {t:1.5, j:{hd:V(-0.4,4.6,3.2),sA:V(0.2,4.2,3.0),sB:V(-0.7,4.3,2.3),eA:V(-0.2,3.5,3.6),eB:V(-1.0,3.7,2.5),hA:V(-0.8,2.7,3.6),hB:V(-0.8,3.6,2.0),
   pA:V(0.2,2.7,2.2),pB:V(-0.3,2.7,2.4),kA:V(0.3,2.4,1.2),kB:V(-0.45,1.7,4.0),fA:V(0.4,2.6,0.4),fB:V(-0.5,0.12,4.5)}},
];
const KF=[ // 野手：站立 → 預備蹲低
 {t:0, j:{hd:V(0,5.6,0),sA:V(0.62,4.95,0),sB:V(-0.62,4.95,0),eA:V(0.7,3.95,0.1),eB:V(-0.7,3.95,0.1),hA:V(0.55,3.2,0.35),hB:V(-0.55,3.2,0.35),
   pA:V(0.33,3.15,0),pB:V(-0.33,3.15,0),kA:V(0.4,1.65,0.1),kB:V(-0.4,1.65,0.1),fA:V(0.45,0.12,0),fB:V(-0.45,0.12,0)}},
 {t:1, j:{hd:V(0,4.9,0.5),sA:V(0.65,4.3,0.4),sB:V(-0.65,4.3,0.4),eA:V(0.75,3.4,0.8),eB:V(-0.75,3.4,0.8),hA:V(0.45,2.4,1.1),hB:V(-0.45,2.4,1.1),
   pA:V(0.36,2.7,-0.2),pB:V(-0.36,2.7,-0.2),kA:V(0.6,1.45,0.5),kB:V(-0.6,1.45,0.5),fA:V(0.8,0.12,0),fB:V(-0.8,0.12,0)}},
];
function poseAt(keys,t){
  let i=0; while(i<keys.length-2&&t>keys[i+1].t)i++;
  const A=keys[i],B=keys[i+1]; let u=clamp((t-A.t)/(B.t-A.t),0,1); u=u*u*(3-2*u);
  const o={}; for(const n in A.j){const a=A.j[n],b=B.j[n]; o[n]=[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,a[2]+(b[2]-a[2])*u];} return o;
}
const SKIN=['#efc7a3','#dcae86','#c8936a','#a9744f','#86593a'];
const skinOf=id=>SKIN[[...id].reduce((a,c)=>a+c.charCodeAt(0),0)%SKIN.length];
const shade=(col,f)=>{
  let r,g,b;
  if(col[0]==='#'){const n=parseInt(col.slice(1),16); r=n>>16; g=n>>8&255; b=n&255;}
  else [r,g,b]=col.match(/\d+/g).slice(0,3).map(Number);
  const m=v=>Math.round(clamp(f<0?v*(1+f):v+(255-v)*f,0,255));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
};
const mid=(a,b,t=0.5)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
// 保留原本的動作軌跡，將身高壓縮成大頭、短腿的 Q 版比例。
function chibiRig(J){
  const ground=Math.min(J.fA[1],J.fB[1]), out={};
  for(const n in J){
    const [x,y,z]=J[n], h=y-ground;
    let short=h<=3.1?h*.26:.806+(h-3.1)*.58;
    if(n==='hd')short=2.75+(h-5.43)*.5;
    if(n[0]==='h'&&n!=='hd')short=1.72+(h-3.3)*.52;
    out[n]=[x,ground+short,z];
  }
  return out;
}
function batterRig(J,k,dir,sw){
  const C=chibiRig(J), load=clamp(1-k/.55,0,1);
  for(const n of ['hA','hB']){
    C[n][0]-=dir*.8*load;
    C[n][1]-=.5*load;
  }
  // 保留擊球高度，並將準備動作的雙手移到臉旁。
  const contact=Math.max(0,1-Math.abs(k-.55)/.25);
  const targetY=sw&&sw.type!=='none'?clamp(sw.y,1,4.2):2.55;
  const lift=(targetY-mid(C.hA,C.hB)[1])*contact;
  C.hA[1]+=lift; C.hB[1]+=lift;
  return C;
}
// 圓潤玩偶部件：統一由左上打光，輪廓不再依賴粗黑線。
function toyOval(x,y,rx,ry,col,angle=0){
  ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
  const g=ctx.createRadialGradient(-rx*.32,-ry*.4,rx*.08,0,0,Math.max(rx,ry)*1.12);
  g.addColorStop(0,shade(col,.2)); g.addColorStop(.65,col); g.addColorStop(1,shade(col,-.24));
  ctx.fillStyle=g; ctx.beginPath(); ctx.ellipse(0,0,rx,ry,0,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle=shade(col,-.3); ctx.lineWidth=Math.max(.7,rx*.025); ctx.stroke(); ctx.restore();
}
function toyHead(p,look){
  const s=p.s*1.27, X=p.X, Y=p.Y, yaw=look.faceDir||0;
  // 寬扁的臉和圓耳朵；帽簷遮住額頭，沒有外露脖子。
  for(const side of [-1,1])toyOval(X+side*.87*s,Y+.08*s,.22*s,.27*s,look.skin);
  toyOval(X,Y,.94*s,.73*s,look.skin);
  if(look.noFace) toyOval(X,Y+.04*s,.9*s,.68*s,'#2d2622'); // 從背後看：後腦勺的頭髮
  if(s>7&&!look.noFace){
    const shift=yaw*.17*s;
    for(const side of [-1,1]){
      const ex=X+side*.265*s+shift, ey=Y+.13*s;
      const ew=(yaw&&side===-Math.sign(yaw)?.155:.19)*s;
      toyOval(ex,ey,ew,.29*s,'#fffdf6');
      ctx.fillStyle='#292b39'; ctx.beginPath();
      ctx.ellipse(ex+yaw*.045*s,ey+.005*s,.057*s,.18*s,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#ffffff'; ctx.beginPath();
      ctx.ellipse(ex+yaw*.045*s-.014*s,ey-.09*s,.018*s,.055*s,0,0,Math.PI*2); ctx.fill();
    }
  }
  const cap=look.cap;
  const g=ctx.createRadialGradient(X-.35*s,Y-.62*s,.04*s,X,Y-.2*s,1.12*s);
  g.addColorStop(0,shade(cap,.27)); g.addColorStop(.66,cap); g.addColorStop(1,shade(cap,-.32));
  ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(X-.98*s,Y-.12*s);
  ctx.bezierCurveTo(X-1.03*s,Y-1.08*s,X+.94*s,Y-1.17*s,X+.98*s,Y-.12*s);
  ctx.quadraticCurveTo(X,Y-.27*s,X-.98*s,Y-.12*s); ctx.fill();
  ctx.strokeStyle=shade(cap,-.28); ctx.lineWidth=Math.max(.7,s*.022); ctx.stroke();
  // 帽簷是一片有厚度的橢圓面，依打者方向偏轉。
  const billX=X+yaw*.36*s, billY=Y-.12*s;
  if(!look.noFace) toyOval(billX,billY,.91*s,.15*s,shade(cap,-.18),yaw*.06);
  if(look.helmet){
    const side=-Math.sign(yaw||1);
    toyOval(X+side*.83*s,Y+.1*s,.18*s,.31*s,cap);
    ctx.fillStyle=shade(cap,-.48); ctx.beginPath();
    ctx.ellipse(X+side*.85*s,Y+.13*s,.055*s,.083*s,0,0,Math.PI*2); ctx.fill();
  }
  if(look.mark&&s>12){
    ctx.fillStyle=look.capMark; ctx.font='900 '+(.24*s)+'px Arial,sans-serif';
    ctx.textAlign='center'; ctx.fillText(look.mark,X+yaw*.08*s,Y-.43*s); ctx.textAlign='left';
  }
}
function toyGlove(p){
  const s=p.s;
  ctx.save(); ctx.translate(p.X,p.Y); ctx.rotate(-.32);
  toyOval(0,0,.4*s,.46*s,'#b97a3b');
  toyOval(-.3*s,.13*s,.19*s,.28*s,'#a76832',-.45);
  ctx.strokeStyle='#6e421f'; ctx.lineWidth=Math.max(.8,s*.025);
  for(let i=-1;i<=1;i++){
    ctx.beginPath(); ctx.moveTo(i*.15*s,-.32*s);
    ctx.quadraticCurveTo((i*.15+.04)*s,-.05*s,i*.11*s,.22*s); ctx.stroke();
  }
  ctx.restore();
}
// 頭、身體、雙手和雙腳分開成塊，形成梅花狀的 Q 版輪廓。
function drawRig(J,look){
  const P={}; for(const n in J)P[n]=proj(...J[n]);
  const items=[], add=(z,fn)=>items.push({z,fn});
  const zz=(...names)=>names.reduce((v,n)=>v+J[n][2],0)/names.length;
  const hip=proj(...mid(J.pA,J.pB)), shoulder=proj(...mid(J.sA,J.sB));
  const t=(hip.s+shoulder.s)*.5;
  for(const side of ['A','B']){
    const f='f'+side;
    add(J[f][2]-.03,()=>{
      const p=P[f], s=p.s, dir=look.toe||0;
      toyOval(p.X+dir*.12*s,p.Y+.035*s,.49*s,.23*s,'#d6dce4',dir*-.14);
      toyOval(p.X+dir*.13*s,p.Y-.055*s,.48*s,.25*s,look.cleat,dir*-.14);
      ctx.strokeStyle='#eef2f7'; ctx.lineWidth=Math.max(.8,s*.045);
      ctx.beginPath(); ctx.moveTo(p.X-.18*s,p.Y-.13*s); ctx.lineTo(p.X+.13*s,p.Y-.17*s); ctx.stroke();
    });
    const hand='h'+side;
    add(J[hand][2]-.06,()=>{
      if(look.glove===side)toyGlove(P[hand]);
      else toyOval(P[hand].X,P[hand].Y,.28*P[hand].s,.29*P[hand].s,look.hand||look.skin);
    });
  }
  add(zz('pA','pB','sA','sB'),()=>{
    const x=(hip.X+shoulder.X)*.5,y=(hip.Y+shoulder.Y)*.5;
    const height=.61*t;
    const angle=Math.atan2(shoulder.X-hip.X,hip.Y-shoulder.Y);
    ctx.save(); ctx.translate(x,y); ctx.rotate(angle);
    toyOval(0,0,.62*t,height,look.jersey);
    ctx.strokeStyle=look.trim; ctx.lineWidth=Math.max(.8,t*.032);
    ctx.beginPath(); ctx.moveTo(0,-height*.7); ctx.lineTo(0,height*.62); ctx.stroke();
    ctx.fillStyle=look.ink; ctx.textAlign='center';
    ctx.font='900 '+(.35*t)+'px Arial,sans-serif';
    ctx.fillText(look.back>.45?look.num:look.mark,0,.1*t); ctx.textAlign='left';
    ctx.restore();
  });
  add(J.hd[2]-.035,()=>toyHead(P.hd,look));
  if(look.extra)look.extra.forEach(e=>add(e.z,e.fn));
  items.sort((a,b)=>depthOf(b.z)-depthOf(a.z)).forEach(item=>item.fn());
}
function shadowAt(x,z,r){const p=proj(x,0,z); ctx.fillStyle='rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(p.X,p.Y,r*p.s,r*0.25*p.s,0,0,7); ctx.fill();}
function lookFor(team,player,isHome){
  return {jersey:isHome?'#f5f5eb':'#e0e4ed', cap:team.color, pants:isHome?'#eeeeea':'#d8deea',
    sock:team.color, trim:team.color, ink:team.color, capMark:'#fff9e8', cleat:'#252d48',
    skin:skinOf(player.id), mark:team.id[0].toUpperCase(), face:true, num:String(player.num??'')};
}
// 球員大頭照（用遊戲裡的 Q 版頭像畫在小畫布上），回傳 dataURL
const AVATARS={};
function avatar(pl, team, size=96){
  const key=pl.id+'@'+team.id+'@'+size; if(AVATARS[key])return AVATARS[key];
  const c=document.createElement('canvas'); c.width=c.height=size;
  const main=ctx; ctx=c.getContext('2d'); ctx.scale(size/96,size/96);
  const bg=ctx.createLinearGradient(0,0,0,96); bg.addColorStop(0,shade(team.color,.35)); bg.addColorStop(1,shade(team.color,-.35));
  ctx.fillStyle=bg; ctx.fillRect(0,0,96,96);
  const look={...lookFor(team,pl,true), faceDir:0};
  toyOval(48,104,42,30,look.jersey);
  ctx.fillStyle=team.color; ctx.font='900 18px Arial,sans-serif'; ctx.textAlign='center'; ctx.fillText(look.num,48,96); ctx.textAlign='left';
  toyHead({X:48,Y:52,s:29},look);
  ctx=main;
  return AVATARS[key]=c.toDataURL();
}
function drawFielders(now){
  if(!G)return; const t=fldTeam(), home=G.half===0;
  let c=0; if(UI.phase==='flight'&&now>UI.windAt+300) c=clamp((now-UI.windAt-300)/250,0,1); else if(UI.phase==='result') c=1;
  [[0,305,'CF'],[-30,138,'SS'],[30,138,'2B']].forEach(([x,z,pos])=>{
    const pl=fielder(pos)||t.lineup[0], L=poseAt(KF,c), J={};
    for(const n in L){const [u,y,f]=L[n]; J[n]=[x+u,y,z-f];}
    shadowAt(x,z,1.1); drawRig(chibiRig(J),{...lookFor(t,pl,home),glove:'B'});
  });
}
/* ---------- 投手視角（從投手丘後上方往本壘看） ---------- */
const camSpace=(x,y,z)=>{const d=[x-CAM.C[0],y-CAM.C[1],z-CAM.C[2]], {f,r,u}=CAM;
  return [d[0]*r[0]+d[1]*r[1]+d[2]*r[2], d[0]*u[0]+d[1]*u[1]+d[2]*u[2], d[0]*f[0]+d[1]*f[1]+d[2]*f[2]];};
// 填一個 3D 多邊形；跨到鏡頭後方的部分先在近平面裁掉
function polyClip(pts,fill){
  const NEAR=2, cs=pts.map(p=>camSpace(...p)), out=[];
  for(let i=0;i<cs.length;i++){const a=cs[i], b=cs[(i+1)%cs.length], ain=a[2]>=NEAR, bin=b[2]>=NEAR;
    if(ain) out.push(a);
    if(ain!==bin){const t=(NEAR-a[2])/(b[2]-a[2]); out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, NEAR]);}}
  if(out.length<3) return;
  ctx.beginPath(); out.forEach((c,i)=>{const s=CAM.F/c[2], X=CX+c[0]*s, Y=CAM.CY-c[1]*s; i?ctx.lineTo(X,Y):ctx.moveTo(X,Y);});
  ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
}
const groundRing=(cx,cz,r,n=36)=>Array.from({length:n},(_,i)=>{const a=i/n*Math.PI*2; return [cx+Math.sin(a)*r,0,cz+Math.cos(a)*r];});
let crowdPat=null;
function crowdPattern(){
  if(crowdPat)return crowdPat;
  const pc=document.createElement('canvas'); pc.width=pc.height=36; const px=pc.getContext('2d'), m=mulberry32(5);
  px.fillStyle='#39414c'; px.fillRect(0,0,36,36); const cols=['#d6d9dd','#e0c29a','#2c3e63','#b3413a','#f2f2ee','#8a9aad','#4f6b8f','#c9a36a'];
  for(let i=0;i<120;i++){px.fillStyle=cols[Math.floor(m()*8)]; px.fillRect(Math.floor(m()*18)*2,Math.floor(m()*18)*2,2,2);}
  return crowdPat=ctx.createPattern(pc,'repeat');
}
function drawFieldPV(now){
  const night=dark(), grass=night?'#2b5a36':'#3f8744', grass2=night?'#316540':'#4a954f', dirt=night?'#8e6343':'#b98256', dirt2=night?'#7d573a':'#a8734b';
  // 本壘後方看台（往後往上斜）＋上層與燈光
  ctx.fillStyle=night?'#0b1018':'#2d353f'; ctx.fillRect(0,0,W,H);
  polyClip([[-260,5,-60],[260,5,-60],[260,95,-170],[-260,95,-170]],crowdPattern());
  polyClip([[-260,5,-60],[260,5,-60],[260,95,-170],[-260,95,-170]],`rgba(0,0,0,${night?.4:.1})`);
  for(let i=1;i<6;i++){const z=-60-i*18, y=5+i*15; polyClip([[-260,y,z],[260,y,z],[260,y+0.9,z-0.5],[-260,y+0.9,z-0.5]],night?'#0f1520':'#39424d');}
  // 本壘後方擋球網牆
  polyClip([[-260,0,-58],[260,0,-58],[260,5,-60],[-260,5,-60]],night?'#163826':'#1f5236');
  ctx.fillStyle='rgba(255,255,255,.85)'; ctx.textAlign='center'; ctx.font='700 13px Oswald,sans-serif';
  [-40,0,40].forEach(x=>{const p=proj(x,2.2,-59); if(p.s>0){ctx.globalAlpha=.55; ctx.fillText('GROUND AI',p.X,p.Y);}}); ctx.globalAlpha=1; ctx.textAlign='left';
  // 地面：草皮、條紋、跑壘道、本壘與投手丘紅土
  polyClip([[-300,0,-58],[300,0,-58],[300,0,86],[-300,0,86]],grass);
  for(let z=-58;z<86;z+=14) polyClip([[-300,0,z],[300,0,z],[300,0,z+7],[-300,0,z+7]],grass2);
  [1,-1].forEach(sx=>{const n=3.2/Math.SQRT2; polyClip([[sx*n,0,-n],[sx*(63.6+n),0,63.6-n],[sx*(63.6-n),0,63.6+n],[-sx*n,0,n]],dirt2);}); // 一、三壘跑壘道
  polyClip(groundRing(0,0,13),dirt);
  polyClip(groundRing(0,60.5,9),dirt);
  ctx.fillStyle='#f4f4f0'; const rb=proj(0,0.6,60.5); ctx.fillRect(rb.X-1*rb.s,rb.Y-2,2*rb.s,3);
  // 界外線
  [-1,1].forEach(sg=>polyClip([[sg*1.4,0,1.2],[sg*120,0,120],[sg*120.5,0,119.5],[sg*1.6,0,1]],'rgba(255,255,255,.9)'));
  // 打擊區與本壘板
  ctx.lineWidth=2; ctx.strokeStyle='rgba(255,255,255,.75)';
  [-1,1].forEach(sg=>{poly([proj(sg*1.2,0,3),proj(sg*5.2,0,3),proj(sg*5.2,0,-3),proj(sg*1.2,0,-3)]); ctx.stroke();});
  ctx.fillStyle='#f6f6f2'; poly([proj(-0.71,0,0.71),proj(0.71,0,0.71),proj(0.71,0,0),proj(0,0,-0.71),proj(-0.71,0,0)]); ctx.fill();
}
// 投手視角才看得到的捕手與主審（面向投手）
function drawBackstopCrew(now){
  if(!G)return; const t=fldTeam(), home=G.half===0;
  const ump={jersey:'#1d2433',cap:'#1d2433',pants:'#59606c',sock:'#1d2433',trim:'#59606c',ink:'#59606c',capMark:'#59606c',cleat:'#151922',skin:'#d8a97f',mark:'',num:''};
  const crew=[[0.6,-5.6,0.45,ump,null],[0,-2.9,1,{...lookFor(t,fielder('C')||t.lineup[0],home),helmet:true,glove:'B'},1]];
  crew.forEach(([x,z,c,look])=>{
    const L=poseAt(KF,c), J={};
    for(const n in L){const [u,y,f]=L[n]; J[n]=[x-u,y,z+f];}   // 面向 +z（投手）
    shadowAt(x,z,1.1); drawRig(chibiRig(J),{faceDir:0,...look});
  });
}

/* ---------- 擊球後守備鏡頭 ---------- */
const DEF_POS={P:[0,60], '1B':[90,88], '2B':[38,128], SS:[-38,128], '3B':[-90,88],
  LF:[-175,245], CF:[0,300], RF:[175,245]};
const defensePt=(x,z)=>({X:CX+x*1.19,Y:620-z*1.09});
function defenseSprite(x,y,s,look,glove=false){
  ctx.fillStyle='rgba(7,24,15,.27)'; ctx.beginPath(); ctx.ellipse(x,y+3,s*.8,s*.19,0,0,7); ctx.fill();
  toyOval(x-s*.25,y-s*.15,s*.28,s*.16,look.cleat);
  toyOval(x+s*.25,y-s*.15,s*.28,s*.16,look.cleat);
  toyOval(x,y-s*1.15,s*.48,s*.52,look.jersey);
  toyOval(x-s*.62,y-s*1.17,s*.23,s*.24,look.skin);
  if(glove)toyGlove({X:x+s*.64,Y:y-s*1.34,s:s*.65});
  else toyOval(x+s*.62,y-s*1.17,s*.23,s*.24,look.skin);
  toyHead({X:x,Y:y-s*2.04,s:s*.8},look);
}
function drawDefense(now){
  const d=UI.defense, bb=d.bb, u=clamp((now-d.start)/d.duration,0,1);
  const night=dark(), field=night?'#285e3d':'#4b9856', dirt=night?'#946c49':'#bd8b60';
  const angle=bb.spray*Math.PI/180, maxDist=bb.hit==='HR'?430:390;
  const distance=Math.min(bb.dist,maxDist), landing=[Math.sin(angle)*distance,Math.cos(angle)*distance];
  const target=defensePt(...landing), home=defensePt(0,0);
  // 看台、外野弧線、草皮條紋。
  const sky=ctx.createLinearGradient(0,0,0,370);
  sky.addColorStop(0,night?'#101e32':'#8fc1e0'); sky.addColorStop(1,night?'#344858':'#cce2dd');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
  ctx.fillStyle=night?'#223344':'#536879'; ctx.fillRect(0,72,W,200);
  if(crowd)crowd.forEach(([x,y,r])=>{if(y<70||y>250)return;ctx.fillStyle=['#d8e1e3','#b9c7d1','#d5aa7d','#8bafc4'][Math.floor(r*4)];ctx.globalAlpha=.65;ctx.fillRect(x,y,3,3);});
  ctx.globalAlpha=1;
  ctx.save(); ctx.beginPath(); ctx.moveTo(home.X,home.Y);
  for(let a=-45;a<=45;a+=2){const p=defensePt(Math.sin(a*Math.PI/180)*400,Math.cos(a*Math.PI/180)*400);ctx.lineTo(p.X,p.Y);}
  ctx.closePath(); ctx.fillStyle=field; ctx.fill(); ctx.clip();
  for(let z=25,i=0;z<410;z+=48,i++){
    if(i%2){ctx.fillStyle=night?'rgba(255,255,255,.035)':'rgba(255,255,255,.09)';
      const y=defensePt(0,z).Y, h=defensePt(0,z-48).Y-y;ctx.fillRect(0,y,W,h);}
  }
  const mound=defensePt(0,70), left=defensePt(-114,75), right=defensePt(114,75), back=defensePt(0,158);
  ctx.fillStyle=dirt; ctx.beginPath();ctx.moveTo(home.X,home.Y+16);ctx.lineTo(left.X,left.Y);
  ctx.quadraticCurveTo(CX,back.Y-15,right.X,right.Y);ctx.closePath();ctx.fill();
  ctx.fillStyle=field;ctx.beginPath();
  [home,defensePt(90,90),defensePt(0,127),defensePt(-90,90)].forEach((p,i)=>i?ctx.lineTo(p.X,p.Y):ctx.moveTo(p.X,p.Y));
  ctx.closePath();ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.8)';ctx.lineWidth=2.5;
  for(const sg of [-1,1]){const f=defensePt(sg*283,283);ctx.beginPath();ctx.moveTo(home.X,home.Y);ctx.lineTo(f.X,f.Y);ctx.stroke();}
  ctx.strokeStyle='rgba(255,255,255,.47)';ctx.lineWidth=1.7;
  ctx.beginPath();ctx.moveTo(home.X,home.Y);for(const b of [defensePt(90,90),defensePt(0,127),defensePt(-90,90),home])ctx.lineTo(b.X,b.Y);ctx.stroke();
  ctx.fillStyle='#fcfcf4';for(const b of [home,defensePt(90,90),defensePt(0,127),defensePt(-90,90)]){
    ctx.save();ctx.translate(b.X,b.Y);ctx.rotate(Math.PI/4);ctx.fillRect(-5,-5,10,10);ctx.restore();
  }
  ctx.fillStyle=dirt;ctx.beginPath();ctx.ellipse(mound.X,mound.Y,20,7,0,0,7);ctx.fill();
  ctx.restore();
  ctx.strokeStyle=night?'#c6dfcf':'#e0eee0';ctx.lineWidth=7;ctx.beginPath();
  for(let a=-45;a<=45;a+=2){const p=defensePt(Math.sin(a*Math.PI/180)*400,Math.cos(a*Math.PI/180)*400);a===-45?ctx.moveTo(p.X,p.Y):ctx.lineTo(p.X,p.Y);}ctx.stroke();
  ctx.strokeStyle=night?'#164331':'#26724d';ctx.lineWidth=12;ctx.stroke();
  if(bb.type==='GB'&&bb.pos&&!AREA[bb.pos]){drawInfieldPlay(now,u,d,bb,target,home); return defenseFooter(bb);}
  // 擊球路徑與落點提示。
  const arc=bb.hit==='HR'?145:bb.type==='PU'?110:bb.type==='FB'?125:bb.type==='LD'?58:11;
  const travel=clamp(u/.68,0,1), ease=travel*travel*(3-2*travel);
  ctx.save();ctx.setLineDash([5,7]);ctx.strokeStyle='rgba(255,255,255,.52)';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(home.X,home.Y);ctx.lineTo(target.X,target.Y);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle=bb.out?'#f6cc63':bb.error?'#ed8075':'#88d7f6';ctx.lineWidth=2.5;
  ctx.beginPath();ctx.arc(target.X,target.Y,15+Math.sin(now/170)*2,0,7);ctx.stroke();ctx.restore();
  const ft=fldTeam(), positions=Object.entries(DEF_POS);
  positions.sort((a,b)=>b[1][1]-a[1][1]);
  for(const [pos,[sx,sz]] of positions){
    const active=pos===bb.pos, move=active?clamp((u-.08)/.61,0,1):0;
    const run=move*move*(3-2*move)*(bb.hit&&!bb.error?.78:1);
    const fx=sx+(landing[0]-sx)*run, fz=sz+(landing[1]-sz)*run;
    const p=defensePt(fx,fz), pl=fielder(pos)||ft.lineup[0];
    const size=12+(300-fz)/300*4;
    defenseSprite(p.X,p.Y,size,lookFor(ft,pl,G.half===0),active&&u>.42);
    if(active){ctx.fillStyle='rgba(10,32,35,.72)';ctx.fillRect(p.X-15,p.Y+7,30,15);
      ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='700 10px Oswald,sans-serif';ctx.fillText(pos,p.X,p.Y+18);ctx.textAlign='left';}
  }
  // 跑者沿壘線前進；安打依壘打數走到對應的壘包。
  const bases=[home,defensePt(90,90),defensePt(0,127),defensePt(-90,90),home];
  const count=bb.hit==='HR'?4:bb.hit==='3B'?3:bb.hit==='2B'?2:bb.hit||bb.error?1:1;
  const step=clamp((u-.12)/.87,0,1)*count, idx=Math.min(Math.floor(step),3), frac=step-idx;
  const rp={X:bases[idx].X+(bases[idx+1].X-bases[idx].X)*frac,Y:bases[idx].Y+(bases[idx+1].Y-bases[idx].Y)*frac};
  if(u<.85||bb.hit||bb.error){const bt=batTeam();defenseSprite(rp.X,rp.Y,12,lookFor(bt,d.batter,G.half===1));}
  // 空中的球、接球瞬間與落地後的滾動。
  const bx=home.X+(target.X-home.X)*ease, groundY=home.Y+(target.Y-home.Y)*ease;
  let by=groundY-arc*Math.sin(Math.PI*travel), ballX=bx;
  if(u>.68){
    if(bb.out){by=target.Y-28;ballX=target.X+12;}
    else if(bb.hit==='HR'){by=target.Y-(u-.68)*115;}
    else {ballX=target.X+(u-.68)*36*Math.sin(angle);by=target.Y+(u-.68)*25-8*Math.abs(Math.sin((u-.68)*17));}
  }
  ctx.fillStyle='rgba(0,0,0,.23)';ctx.beginPath();ctx.ellipse(bx,groundY,9,3,0,0,7);ctx.fill();
  if(!bb.out||u<.82){ctx.fillStyle='#fffdf3';ctx.beginPath();ctx.arc(ballX,by,7,0,7);ctx.fill();
    ctx.strokeStyle='#d9604b';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(ballX,by,4,-.9,.9);ctx.stroke();}
  const title=bb.hit==='HR'?'全壘打！':bb.error?'守備失誤':bb.dp?'雙殺出局':bb.out?bb.type==='GB'?'傳一壘出局':'接殺出局':
    bb.hit==='3B'?'三壘安打':bb.hit==='2B'?'二壘安打':'一壘安打';
  if(u>.68){
    const color=bb.out?'#f6cf71':bb.error?'#ff9a8c':'#8cdef9';
    ctx.fillStyle='rgba(10,25,36,.83)';ctx.beginPath();ctx.roundRect(CX-150,116,300,55,13);ctx.fill();
    ctx.fillStyle=color;ctx.font='900 29px "Noto Sans TC",sans-serif';ctx.textAlign='center';ctx.fillText(title,CX,152);ctx.textAlign='left';
    if(bb.out){ctx.strokeStyle=color;ctx.lineWidth=3;for(let a=0;a<8;a++){
      const th=a*Math.PI/4, r1=22,r2=35+(u-.68)*35;
      ctx.beginPath();ctx.moveTo(target.X+Math.cos(th)*r1,target.Y-24+Math.sin(th)*r1);
      ctx.lineTo(target.X+Math.cos(th)*r2,target.Y-24+Math.sin(th)*r2);ctx.stroke();}}
  }
  defenseFooter(bb);
}
function defenseFooter(bb){
  ctx.fillStyle='rgba(9,25,31,.82)';ctx.fillRect(0,656,W,44);
  ctx.fillStyle='#fff';ctx.font='700 16px "Noto Sans TC",sans-serif';
  ctx.fillText(`${bb.pos||'中外野'}方向　${Math.round(bb.ev)} mph　仰角 ${Math.round(bb.la)}°　飛行 ${Math.round(bb.dist)} ft`,26,684);
}
// 內野滾地球：野手跑去接球 → 傳一壘（雙殺先傳二壘再轉傳一壘），一壘手補位踩壘，打者跑一壘。
// 內野安打時打者先到；失誤時球傳過頭。由一壘手接到的球則自己跑去踩壘。
const INF_T={field:.40, release:.50, catch2:.64};
function infieldTimes(bb){
  return {...INF_T, catch1:bb.dp?.80:bb.hit?.90:.78, runner:bb.hit?.80:bb.error?.84:.93};
}
function drawInfieldPlay(now,u,d,bb,target,home){
  const ft=fldTeam(), bt=batTeam(), T=infieldTimes(bb), self1B=bb.pos==='1B';
  const B1=defensePt(90,90), B2=defensePt(0,127);
  const ease=v=>v*v*(3-2*v), seg=(a,b)=>clamp((u-a)/(b-a),0,1);
  const lerpP=(A,B,k)=>({X:A.X+(B.X-A.X)*k, Y:A.Y+(B.Y-A.Y)*k});
  const cover=bb.dp?(['SS','3B'].includes(bb.pos)?'2B':'SS'):null;   // 雙殺時誰去補二壘
  const spot=pos=>{const [sx,sz]=DEF_POS[pos]; let p=defensePt(sx,sz);
    if(pos===bb.pos){p=lerpP(p,target,ease(seg(.04,T.field))); if(self1B)p=lerpP(p,{X:B1.X-3,Y:B1.Y-2},ease(seg(T.field+.04,T.catch1)));}
    else if(pos==='1B') p=lerpP(p,{X:B1.X-4,Y:B1.Y-2},ease(seg(.12,.42)));
    else if(pos===cover) p=lerpP(p,{X:B2.X+4,Y:B2.Y+2},ease(seg(.08,.48)));
    return p;};
  // 傳球路徑
  const thrower=spot(bb.pos), glove=p=>({X:p.X+9,Y:p.Y-17});
  const legs=[]; // [起點, 終點, 開始, 結束]
  if(!self1B){
    if(bb.dp){legs.push([glove(spot(bb.pos)),glove({X:B2.X+4,Y:B2.Y+2}),T.release,T.catch2]); legs.push([glove({X:B2.X+4,Y:B2.Y+2}),glove({X:B1.X-4,Y:B1.Y-2}),T.catch2+.03,T.catch1]);}
    else {const end=glove({X:B1.X-4,Y:B1.Y-2}); const wild={X:end.X+(end.X-thrower.X)*.35+10, Y:end.Y+(end.Y-thrower.Y)*.35+26};
      legs.push([glove(thrower), bb.error?wild:end, T.release, T.catch1]);}
  }
  // 野手
  const ps=Object.keys(DEF_POS).map(pos=>({pos,p:spot(pos)})).sort((a,b)=>a.p.Y-b.p.Y);
  for(const {pos,p} of ps){
    const pl=fielder(pos)||ft.lineup[0], size=12+(p.Y-300)/300*4;
    const hasGlove=(pos===bb.pos&&u>T.field-.05)||(pos==='1B'&&u>.3)||pos===cover;
    defenseSprite(p.X,p.Y,size,lookFor(ft,pl,G.half===0),hasGlove);
    if(pos===bb.pos||pos==='1B'||pos===cover){ctx.fillStyle='rgba(10,32,35,.72)';ctx.fillRect(p.X-15,p.Y+7,30,15);
      ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font='700 10px Oswald,sans-serif';ctx.fillText(pos,p.X,p.Y+18);ctx.textAlign='left';}
  }
  // 跑者：打者跑一壘；雙殺時一壘跑者跑二壘
  const runnerLook=lookFor(bt,d.batter,G.half===1);
  const r1=lerpP(home,B1,ease(seg(.08,T.runner))); defenseSprite(r1.X,r1.Y,12,runnerLook);
  if(bb.dp){const r2=lerpP(B1,B2,ease(seg(.05,.72))); if(u<.86) defenseSprite(r2.X+6,r2.Y,12,runnerLook);}
  // 球
  let ball, ground=true;
  if(u<T.field){const k=ease(seg(0,T.field)); ball=lerpP(home,target,k); ball.Y-=6*Math.abs(Math.sin(k*Math.PI*3))*(1-k);}
  else if(self1B||u<T.release) ball=glove(spot(bb.pos));
  else {
    const leg=legs.find(l=>u<l[3])||legs[legs.length-1], [A,B,t0,t1]=leg, k=seg(t0,t1);
    if(u<t0) ball=A; else {ball=lerpP(A,B,k); ball.Y-=24*Math.sin(Math.PI*k); ground=false;}
    if(bb.error&&u>t1){const over=(u-t1)*60; ball={X:B.X+over*.8,Y:B.Y+over*.5};}
  }
  ctx.fillStyle='rgba(0,0,0,.23)';ctx.beginPath();ctx.ellipse(ball.X,ball.Y+(ground?4:24),7,2.5,0,0,7);ctx.fill();
  ctx.fillStyle='#fffdf3';ctx.beginPath();ctx.arc(ball.X,ball.Y,6,0,7);ctx.fill();
  ctx.strokeStyle='#d9604b';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(ball.X,ball.Y,3.5,-.9,.9);ctx.stroke();
  // 壘上判決
  const call=(P,txt,col,t)=>{if(u<t)return; const a=clamp((u-t)/.05,0,1);
    ctx.save();ctx.globalAlpha=a;ctx.fillStyle='rgba(10,25,36,.85)';ctx.beginPath();ctx.roundRect(P.X-34,P.Y-58,68,26,6);ctx.fill();
    ctx.fillStyle=col;ctx.font='700 18px Oswald,sans-serif';ctx.textAlign='center';ctx.fillText(txt,P.X,P.Y-39);ctx.restore();};
  if(bb.dp) call(B2,'OUT','#f6cf71',T.catch2);
  if(bb.hit) call(B1,'SAFE','#8cdef9',T.runner);
  else if(bb.error) call(B1,'SAFE','#ff9a8c',T.runner);
  else call(B1,'OUT','#f6cf71',T.catch1);
  // 標題
  const done=Math.max(T.catch1,T.runner);
  if(u>done-.02){
    const title=bb.dp?'雙殺！':bb.hit?'內野安打':bb.error?'傳球失誤':self1B?'一壘手自己踩壘出局':'傳一壘出局';
    const color=bb.hit?'#8cdef9':bb.error?'#ff9a8c':'#f6cf71';
    ctx.fillStyle='rgba(10,25,36,.83)';ctx.beginPath();ctx.roundRect(CX-160,116,320,55,13);ctx.fill();
    ctx.fillStyle=color;ctx.font='900 29px "Noto Sans TC",sans-serif';ctx.textAlign='center';ctx.fillText(title,CX,152);ctx.textAlign='left';
  }
}
function drawPitcher(now){
  if(!G)return; const t=fldTeam(), p=curPitcher(), arm=p.throws==='R'?-1:1, home=G.half===0;
  let ph=0;
  if(UI.pitch&&UI.windAt&&now>=UI.windAt) ph=now<UI.release?(now-UI.windAt)/(UI.release-UI.windAt):1+Math.min(0.5,(now-UI.release)/560);
  const L=poseAt(KP,ph), J={};
  for(const n in L){const [u,y,f]=L[n]; J[n]=[arm*u,y+0.8,60.5-f];}
  shadowAt(0,60.5-(ph>0.7?1.8:0.2),1.5);
  drawRig(chibiRig(J),{...lookFor(t,p,home),glove:'B',toe:0,...(pitcherView()?{noFace:true,back:1}:{})});
}
// 球的位置（t=0 出手、t=1 通過本壘板，依時間）。軌跡是 engine.js 的 pitchFlight 用物理算好的 P.path：
// 每點 [飛行距離比例 u, 相對「出手點到進壘點直線」的偏移 dx, dy]。球會因空氣阻力變慢，所以後段 u 走得比較慢
function ballPos(P,t){
  const releaseY=3.83; // 與 Q 版投手出手的球形手掌對齊
  const pa=flightPath(P), n=pa.length-1, f=clamp(t,0,1)*n, i=Math.min(n-1,Math.floor(f)), w=f-i, a=pa[i], b=pa[i+1];
  const u=a[0]+(b[0]-a[0])*w, dx=a[1]+(b[1]-a[1])*w, dy=a[2]+(b[2]-a[2])*w;
  return {x:P.relX+(P.x-P.relX)*u+dx, y:releaseY+(P.y-releaseY)*u+dy, z:56*(1-u)};
}
const pw=(ks,vs,k)=>{let i=0;while(i<ks.length-2&&k>ks[i+1])i++;const u=clamp((k-ks[i])/(ks[i+1]-ks[i]),0,1);return vs[i]+(vs[i+1]-vs[i])*u;};
function drawBatter(now){
  if(!G)return; const b=curBatter(), t=batTeam(), home=G.half===1;
  const dir=b.bats==='R'?1:-1, bx=-dir*3.0, bz=0.2;
  let k=0;
  if(UI.batAt&&now>=UI.batAt-60) k=0.22+clamp((now-UI.batAt+60)/300,0,1)*0.78;
  else if(UI.phase==='flight'&&UI.windAt&&now>=UI.windAt){const end=UI.release+(UI.pitch?UI.pitch.travel*0.5:300); k=clamp((now-UI.windAt)/(end-UI.windAt),0,1)*0.22;}
  const L=poseAt(KB,k), J={};
  for(const n in L){const [f,y,p]=L[n]; J[n]=[bx+f*dir,y,bz+p];}
  const sw=UI.swing||UI.aiSw; if(sw&&sw.type&&sw.type!=='none'){const ty=clamp(sw.y,1,4.2)-2.55, w=Math.max(0,1-Math.abs(k-0.55)/0.3); ['hA','hB','eA','eB'].forEach(n=>J[n][1]+=ty*w*(n[0]==='h'?1:0.6));}
  const C=batterRig(J,k,dir,sw);
  // 球棒
  let phi=pw([0,0.22,0.55,1],[210,225,15,-80],k), el=pw([0,0.22,0.45,0.55,1],[78,82,5,-3,35],k);
  if(k===0) phi+=Math.sin(now/260)*5;
  phi*=Math.PI/180; el*=Math.PI/180;
  const hw=mid(C.hA,C.hB), Lb=2.25;
  const head=[hw[0]+Lb*Math.cos(el)*Math.cos(phi)*dir, hw[1]+Lb*Math.sin(el), hw[2]+Lb*Math.cos(el)*Math.sin(phi)];
  const bat={z:(hw[2]+head[2])/2-0.01, fn:()=>{
    const a=proj(...hw), c=proj(...head), dx=c.X-a.X, dy=c.Y-a.Y, len=Math.hypot(dx,dy)||1, nx=-dy/len, ny=dx/len, w0=0.05*a.s, w1=0.12*c.s;
    const knob=proj(...mid(hw,head,-0.08));
    const wood=ctx.createLinearGradient(a.X+nx*w1,a.Y+ny*w1,a.X-nx*w1,a.Y-ny*w1);
    wood.addColorStop(0,'#76502c'); wood.addColorStop(.45,'#d4a86a'); wood.addColorStop(1,'#684423');
    ctx.fillStyle=wood; ctx.beginPath(); ctx.moveTo(knob.X+nx*w0,knob.Y+ny*w0); ctx.lineTo(c.X+nx*w1,c.Y+ny*w1); ctx.lineTo(c.X-nx*w1,c.Y-ny*w1); ctx.lineTo(knob.X-nx*w0,knob.Y-ny*w0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(c.X,c.Y,w1,0,7); ctx.fill();
    ctx.strokeStyle='rgba(255,246,208,.3)'; ctx.lineWidth=w1*0.3; ctx.beginPath(); ctx.moveTo(a.X+nx*w0*.3,a.Y+ny*w0*.3); ctx.lineTo(c.X+nx*w1*.4,c.Y+ny*w1*.4); ctx.stroke();
    ctx.strokeStyle='#252321'; ctx.lineWidth=Math.max(2,a.s*.07); ctx.beginPath(); ctx.moveTo(knob.X,knob.Y); ctx.lineTo(a.X+dx*.19,a.Y+dy*.19); ctx.stroke();
  }};
  const back=clamp(1-k*2.2,0,1)*0.95;
  shadowAt(bx,bz,1.6);
  const pv=pitcherView();
  drawRig(C,{...lookFor(t,b,home),helmet:true,flap:dir,faceDir:pv?-dir*0.6:dir,hand:'#f3f4f6',back:pv?0:back,extra:[bat],toe:pv?-dir:dir});
}
function drawZone(){
  const a=proj(-ZX,ZT,0), b=proj(ZX,ZB,0), w=b.X-a.X, h=b.Y-a.Y;
  if(humanPit()&&G){ // 冷熱區
    const hz=curBatter().hz;
    for(let r=0;r<3;r++)for(let c=0;c<3;c++){const v=hz[r*3+c]; if(!v)continue;
      ctx.fillStyle=v>0?`rgba(235,70,40,${0.22+v*0.16})`:`rgba(60,120,235,${0.22-v*0.14})`; ctx.fillRect(a.X+w*c/3+1,a.Y+h*r/3+1,w/3-2,h/3-2);}
  }
  ctx.strokeStyle='rgba(255,255,255,.55)'; ctx.lineWidth=1.5; ctx.strokeRect(a.X,a.Y,w,h);
  ctx.strokeStyle='rgba(255,255,255,.2)'; ctx.lineWidth=1;
  for(let i=1;i<3;i++){ctx.beginPath();ctx.moveTo(a.X+w*i/3,a.Y);ctx.lineTo(a.X+w*i/3,b.Y);ctx.moveTo(a.X,a.Y+h*i/3);ctx.lineTo(b.X,a.Y+h*i/3);ctx.stroke();}
  UI.marks.forEach((m,i)=>{const p=proj(m.x,m.y,0); const c={ball:'#5fcf6a',bb:'#5fcf6a',hbp:'#5fcf6a',strike:'#f2b632',k:'#f2b632',foul:'#f2b632',inplay:'#58a6ff'}[m.k]||'#fff';
    ctx.fillStyle=c; ctx.globalAlpha=.9; ctx.beginPath(); ctx.arc(p.X,p.Y,7.5,0,7); ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle='#0d1a10'; ctx.font='700 10px Oswald,sans-serif'; ctx.textAlign='center'; ctx.fillText(i+1,p.X,p.Y+3.5); ctx.textAlign='left';});
}
// 投球結果標記（仿 MVP）：通過本壘的位置畫空心圓，上方寫球速與球種，約 1.8 秒後淡出
function drawResultMark(now){
  const m=UI.lastMark; if(!m)return;
  const age=now-m.at, life=1800; if(age>life)return;
  const a=age<life-400?1:(life-age)/400, p=proj(m.x,m.y,0);
  ctx.save(); ctx.globalAlpha=a; ctx.shadowColor='rgba(0,0,0,.75)'; ctx.shadowBlur=5;
  ctx.strokeStyle='#ffffff'; ctx.lineWidth=3; ctx.beginPath(); ctx.ellipse(p.X,p.Y,13,10,0,0,7); ctx.stroke();
  ctx.fillStyle='#fff'; ctx.textAlign='center';
  ctx.font='700 21px Oswald,sans-serif'; ctx.fillText(`${Math.round(m.mph)} MPH`,p.X,p.Y-38);
  ctx.font='900 16px "Noto Sans TC",sans-serif'; ctx.fillText(m.name,p.X,p.Y-18);
  if(m.vaa!==undefined){ctx.font='600 13px "Noto Sans TC",sans-serif'; ctx.fillText(`進壘角 ${m.vaa.toFixed(1)}°`,p.X,p.Y+28);}
  ctx.restore();
}
function drawBall(now){
  const P=UI.pitch; if(!P)return;
  let t;
  if(UI.phase==='flight'){ if(now<UI.release)return; t=clamp((now-UI.release)/P.travel,0,1.15); }
  else if(UI.phase==='result'&&UI.nextAt-now>0) t=1; else return;
  const b=ballPos(P,Math.min(t,1)); const z=t>1?-(t-1)*40:b.z;
  const p=proj(b.x,b.y,z), r=Math.max(2.2,BR*p.s);
  const sh=proj(b.x,0,z); ctx.fillStyle='rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(sh.X,sh.Y,r,r*0.3,0,0,7); ctx.fill();
  ctx.fillStyle='#fbfbf6'; ctx.beginPath(); ctx.arc(p.X,p.Y,r,0,7); ctx.fill();
  if(r>5){ctx.strokeStyle='#d33b2c'; ctx.lineWidth=Math.max(1,r*0.14); ctx.beginPath(); ctx.arc(p.X-r*0.9,p.Y,r*0.7,-0.9,0.9); ctx.stroke(); ctx.beginPath(); ctx.arc(p.X+r*0.9,p.Y,r*0.7,Math.PI-0.9,Math.PI+0.9); ctx.stroke();}
}
function drawPCI(now){
  if(!humanBat())return;
  const b=curBatter(), p=curPitcher(), plat=b.bats!==p.throws?1:-1, con=clamp(b.con-hitShift(b,p)+plat*4,1,ABIL_MAX);   // 和 contactCalc 一樣
  const rn=(0.28+con/99*0.30), rp=rn*0.62, c=proj(UI.pci.x,UI.pci.y,0), R=rn*c.s, SW=7;
  ctx.save();
  // 外框（一般打擊範圍）與淡色用力打擊範圍
  ctx.strokeStyle='rgba(255,255,255,.9)'; ctx.lineWidth=2; ctx.beginPath(); ctx.arc(c.X,c.Y,R,0,7); ctx.stroke();
  ctx.setLineDash([3,5]); ctx.strokeStyle='rgba(255,120,90,.55)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.arc(c.X,c.Y,rp*c.s,0,7); ctx.stroke(); ctx.setLineDash([]);
  // 甜蜜點
  ctx.fillStyle='rgba(95,207,106,.35)'; ctx.strokeStyle='rgba(95,207,106,.9)'; ctx.lineWidth=1.5;
  ctx.beginPath(); ctx.arc(c.X,c.Y,SW,0,7); ctx.fill(); ctx.stroke();
  // 時機圈：投手出手時與外框一樣大，球到本壘的完美時機剛好縮到甜蜜點
  const P=UI.pitch;
  if(P&&UI.release&&(UI.phase==='flight'||UI.phase==='result')){
    const at=UI.swing?UI.batAt:now;
    if(at>=UI.release){
      const t=(at-UI.release)/P.travel, dt=at-(UI.release+P.travel);
      const r=t<=1?SW+(R-SW)*(1-t):Math.max(0,SW*(1-(t-1)*6));
      const ad=Math.abs(dt), col=ad<=26?'#5fcf6a':ad<=115?'#f3c230':'#ffffff';
      if(r>0.5&&(UI.phase==='flight'||UI.swing)){
        ctx.strokeStyle=col; ctx.lineWidth=UI.swing?4:3; ctx.shadowColor='rgba(0,0,0,.5)'; ctx.shadowBlur=4;
        ctx.beginPath(); ctx.arc(c.X,c.Y,r,0,7); ctx.stroke(); ctx.shadowBlur=0;
      }
      if(UI.swing){
        const te=UI.swing.te, pw=UI.swing.type==='power', pf=pw?18:26, mx=pw?85:115, a=Math.abs(te);
        const txt=a<=pf?'完美時機':a<=mx?(te<0?'稍早':'稍晚'):(te<0?'太早':'太晚');
        const lc=a<=pf?'#5fcf6a':a<=mx?'#f3c230':'#ff7466';
        const label=`${txt} ${te>0?'+':''}${Math.round(te)}ms`;
        ctx.font='900 16px "Noto Sans TC",sans-serif'; const w=ctx.measureText(label).width+16;
        const lx=c.X-w/2, ly=c.Y+R+8;
        ctx.fillStyle='rgba(10,18,32,.85)'; ctx.fillRect(lx,ly,w,26); ctx.fillStyle=lc; ctx.fillText(label,lx+8,ly+19);
      }
    }
  }
  ctx.strokeStyle='rgba(255,255,255,.7)'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(c.X-4,c.Y);ctx.lineTo(c.X+4,c.Y);ctx.moveTo(c.X,c.Y-4);ctx.lineTo(c.X,c.Y+4);ctx.stroke();
  ctx.restore();
}
function drawAim(){
  if(!humanPit()||!['choose','aim','ready','power','acc'].includes(UI.phase))return;
  const c=proj(UI.aim.x,UI.aim.y,0), fixed=UI.phase!=='aim'&&UI.phase!=='choose';
  ctx.save(); ctx.strokeStyle=fixed?'#f3c230':'rgba(255,255,255,.95)'; ctx.lineWidth=2.2;
  ctx.beginPath(); ctx.arc(c.X,c.Y,10,0,7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(c.X-17,c.Y);ctx.lineTo(c.X-6,c.Y);ctx.moveTo(c.X+6,c.Y);ctx.lineTo(c.X+17,c.Y);ctx.moveTo(c.X,c.Y-17);ctx.lineTo(c.X,c.Y-6);ctx.moveTo(c.X,c.Y+6);ctx.lineTo(c.X,c.Y+17);ctx.stroke();
  // 預估軌跡：同一套物理、能力不打折的力道 0.85、沒有控球偏差
  const p=curPitcher(), pp=p.pitches[UI.chosen], d=PITCH_DEFS[pp.n], arm=p.throws==='R'?-1:1, sc=(0.55+0.45*pp.r/99)*1.105, relX=arm*1.35;
  const fake={x:UI.aim.x,y:UI.aim.y,relX,path:pitchFlight(veloMph(p.velo)*d.v,spinOf(d,sc),d.eff,d.axis,arm,relX,UI.aim.x,UI.aim.y,true).path};
  ctx.setLineDash([3,5]); ctx.strokeStyle='rgba(255,255,255,.5)'; ctx.lineWidth=1.8; ctx.beginPath();
  for(let i=0;i<=24;i++){const q=ballPos(fake,i/24), pr=proj(q.x,q.y,q.z); i?ctx.lineTo(pr.X,pr.Y):ctx.moveTo(pr.X,pr.Y);} ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}
function drawMeter(now){
  if(!humanPit()||!['ready','power','acc'].includes(UI.phase))return;
  const p=curPitcher(), h=accHalf(p);
  if(UI.phase==='power'){UI.m.pos=Math.min(100,-22+(now-UI.m.t0)/850*122); if(UI.m.pos>=100){UI.m.power=100;UI.m.t1=now;UI.phase='acc';}}
  else if(UI.phase==='acc'){UI.m.pos=UI.m.power-(now-UI.m.t1)*0.16; if(UI.m.pos<=-22){UI.m.pos=-22; throwPitch(); return;}}
  // 仿 MVP Baseball 2005 的弧形計量條：左下尖端=最大力道(100)，往上繞過頂端、右側彎鉤末端=-22。
  // 力道：藍色從彎鉤端往尖端填；準度：白色指針從力道點走回來，停在綠色區（0 附近）最準。
  const bdir=curBatter().bats==='R'?1:-1, onRight=pitcherView()||proj(-bdir*3,3,0).X<CX;
  const cx=onRight?W-150:150, cy=250, R=66, TW=20;
  const pt=u=>{const s=clamp((100-u)/122,0,1), a=Math.PI*(0.8+1.38*s), r=R*(1+0.34*(1-s)*(1-s)); return [cx+Math.cos(a)*r, cy+Math.sin(a)*r, a];};
  const seg=(u0,u1,col,w)=>{ctx.strokeStyle=col; ctx.lineWidth=w; ctx.beginPath(); const n=Math.max(2,Math.ceil(Math.abs(u1-u0)/2));
    for(let i=0;i<=n;i++){const q=pt(u0+(u1-u0)*i/n); i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]);} ctx.stroke();};
  ctx.save(); ctx.lineCap='butt';
  seg(-22,100,'#f4f6fa',TW+6); seg(-22,100,'#0b1222',TW);              // 白邊、黑底
  seg(92,100,'#b3201d',TW);                                            // 尖端紅區
  const pos=UI.phase==='ready'?-22:UI.m.pos;
  const fill=UI.phase==='power'?pos:UI.phase==='acc'?UI.m.power:-22;
  if(fill>-22){seg(-22,fill,'#1d3fa8',TW); seg(Math.max(-22,fill-8),fill,'#8fb0ff',TW);}
  const zone=(a,col)=>seg(-a,a,col,TW-4);
  const hot=UI.phase==='acc'||fill>h*1.6;                               // 填過準度區後才亮起
  ctx.globalAlpha=hot?1:.55; zone(h*1.6,'#e8812e'); zone(h,'#f3c230'); zone(h*0.35,'#46d36a'); ctx.globalAlpha=1;
  if(UI.phase==='acc'){ // 力道刻度與準度指針
    const tick=(u,col,len,w)=>{const [x,y,a]=pt(u), nx=Math.cos(a), ny=Math.sin(a); ctx.strokeStyle=col; ctx.lineWidth=w;
      ctx.beginPath(); ctx.moveTo(x-nx*len,y-ny*len); ctx.lineTo(x+nx*len,y+ny*len); ctx.stroke();};
    tick(UI.m.power,'rgba(255,255,255,.6)',TW*0.6,2); tick(pos,'#ffffff',TW*0.75,4);
  }
  const lab=UI.phase==='acc'?'準度':UI.phase==='power'?'力道':'按下開始';
  ctx.font='900 15px "Noto Sans TC",sans-serif'; ctx.textAlign='center'; ctx.fillStyle='#fff'; ctx.shadowColor='rgba(0,0,0,.7)'; ctx.shadowBlur=4;
  ctx.fillText(lab,cx+8,cy+12); ctx.shadowBlur=0; ctx.textAlign='left';
  ctx.restore();
}
function drawHud(now){
  if(!G)return;
  let txt=null, bg=null, fg='#fff';
  if(UI.phase==='flight'&&UI.hint&&humanBat()&&now>=UI.release){txt=`打者之眼：${UI.hint}`; bg='rgba(243,194,48,.94)'; fg='#1b1300';}
  if(UI.phase==='flight'&&humanPit()&&UI.pitch&&UI.pitch.meter&&now>=UI.release-400){txt=UI.pitch.meter; bg=UI.pitch.meterBad?'rgba(228,80,80,.94)':'rgba(47,111,209,.94)';}
  if(txt){ctx.font='900 17px "Noto Sans TC",sans-serif'; const w=ctx.measureText(txt).width+24; const x=CX-w/2, y=170; ctx.fillStyle=bg; ctx.fillRect(x,y,w,30); ctx.fillStyle=fg; ctx.fillText(txt,x+12,y+21);}
}
function draw(now){
  ctx.clearRect(0,0,W,H);
  if(UI.phase==='defense'&&UI.defense){drawDefense(now);return;}
  if(UI.phase==='intro'&&UI.intro){const st=UI.intro.steps[UI.intro.i]; setCam('catcher');
    if(st.view!=='field'){drawAerial(now,st,(now-UI.intro.at)/st.dur);return;}
    drawField(now); drawFielders(now); drawPitcher(now); return;}
  setCam(viewFor());
  if(pitcherView()){ drawFieldPV(now); drawBackstopCrew(now); drawBatter(now); drawZone(); drawAim(); drawBall(now); drawPitcher(now); }
  else { drawField(now); drawFielders(now); drawPitcher(now); drawZone(); drawAim(); drawBall(now); drawBatter(now); }
  drawResultMark(now); drawPCI(now); drawMeter(now); drawHud(now);
}
// 視角：自動＝自己投球時用投手視角、打擊時用捕手視角
function viewFor(){ const m=UI.camMode||'auto'; return m==='auto'?(G&&humanPit()?'pitcher':'catcher'):m; }

/* ---------- 開場空拍（環繞球場的 3D 鏡頭） ---------- */
// 座標：x=往一壘/右外野為正，z=往中外野為正，y=高度（英尺），本壘在原點
let aerialPat=null, aerialCity=null;
function drawAerial(now, st, u){
  const night=dark(); u=clamp(u,0,1); const e=u*u*(3-2*u);
  // 鏡頭：flyover 從左外野上空繞到本壘後方高處；lineup 固定在本壘後方高處往下看
  const fly=st.view==='aerial';
  const ang=fly?-1.05+0.95*e:0, hgt=fly?420-90*e:560, rad=fly?660-150*e:430, T=[0,0,175];
  const C=[T[0]+Math.sin(ang)*rad, hgt, T[2]-Math.cos(ang)*rad];
  const nrm=v=>{const l=Math.hypot(...v);return v.map(x=>x/l);};
  const f=nrm([T[0]-C[0],T[1]-C[1],T[2]-C[2]]), r=nrm([f[2],0,-f[0]]);
  const up=[f[1]*r[2]-f[2]*r[1], f[2]*r[0]-f[0]*r[2], f[0]*r[1]-f[1]*r[0]];
  const FOC=760, HC=H*0.5;
  const P3=(x,y,z)=>{const d=[x-C[0],y-C[1],z-C[2]], zc=d[0]*f[0]+d[1]*f[1]+d[2]*f[2];
    if(zc<5)return null; const s=FOC/zc; return {X:CX+(d[0]*r[0]+d[1]*r[1]+d[2]*r[2])*s, Y:HC-(d[0]*up[0]+d[1]*up[1]+d[2]*up[2])*s, z:zc};};
  const polyF=(pts,col)=>{const q=pts.map(p=>P3(p[0],p[1]||0,p[2]));if(q.some(v=>!v))return false; ctx.beginPath(); q.forEach((v,i)=>i?ctx.lineTo(v.X,v.Y):ctx.moveTo(v.X,v.Y)); ctx.closePath(); ctx.fillStyle=col; ctx.fill(); return true;};
  const g2=(x,z,y=0)=>[x,y,z];
  // 天空與遠方地面
  const hz=P3(C[0]+f[0]*5000,0,C[2]+f[2]*5000), hy=hz?clamp(hz.Y,-50,H):-50;
  const sky=ctx.createLinearGradient(0,0,0,Math.max(hy,1)); sky.addColorStop(0,night?'#060b16':'#6fa6d6'); sky.addColorStop(1,night?'#1c2638':'#cfe0ea');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
  ctx.fillStyle=night?'#151b24':'#59626b'; ctx.fillRect(0,hy,W,H-hy);
  // 周圍的城市方塊
  if(!aerialCity){const m=mulberry32(11); aerialCity=[]; for(let i=0;i<34;i++){const a=m()*Math.PI*2, d=620+m()*420; aerialCity.push({x:Math.sin(a)*d, z:180+Math.cos(a)*d, w:50+m()*70, h:40+m()*170, c:m()});}}
  const objs=[];
  aerialCity.forEach(b=>{const q=P3(b.x,b.h/2,b.z); if(q)objs.push({z:q.z, fn:()=>{
    const {x,z,w,h}=b, base=night?['#1d2533','#232c3c','#283246']:['#9aa3ad','#b4bcc4','#c9cfd5'], col=base[Math.floor(b.c*3)];
    polyF([g2(x-w/2,z-w/2),g2(x+w/2,z-w/2),g2(x+w/2,z-w/2,h),g2(x-w/2,z-w/2,h)],shade(col,-.15));
    polyF([g2(x-w/2,z-w/2),g2(x-w/2,z+w/2),g2(x-w/2,z+w/2,h),g2(x-w/2,z-w/2,h)],shade(col,-.3));
    polyF([g2(x+w/2,z-w/2),g2(x+w/2,z+w/2),g2(x+w/2,z+w/2,h),g2(x+w/2,z-w/2,h)],shade(col,-.3));
    polyF([g2(x-w/2,z-w/2,h),g2(x+w/2,z-w/2,h),g2(x+w/2,z+w/2,h),g2(x-w/2,z+w/2,h)],col);}});});
  objs.sort((a,b)=>b.z-a.z).forEach(o=>o.fn());
  // 球場地面：看台內圈 = 外野牆弧線 + 沿兩條界外線往外 60 英尺
  const fence=a=>330+70*(1-Math.abs(a)/45), loop=[];
  for(let a=45;a>=-45;a-=3){const t=a*Math.PI/180, d=fence(a); loop.push([Math.sin(t)*d,Math.cos(t)*d]);}
  const lerp=(p,q,n)=>{for(let i=1;i<=n;i++)loop.push([p[0]+(q[0]-p[0])*i/n,p[1]+(q[1]-p[1])*i/n]);};
  lerp([-233,233],[-275,191],2); lerp([-275,191],[-42,-42],8); lerp([-42,-42],[0,-62],2); lerp([0,-62],[42,-42],2); lerp([42,-42],[275,191],8); lerp([275,191],[233,233],2);
  const grass=night?'#2a5c37':'#468f4b', grass2=night?'#316742':'#52a057', dirt=night?'#8e6343':'#b98256';
  polyF(loop.map(p=>g2(p[0],p[1])),grass);
  // 草皮條紋（剪在球場地面內）
  ctx.save(); ctx.beginPath(); let okc=true; loop.forEach((p,i)=>{const q=P3(p[0],0,p[1]); if(!q){okc=false;return;} i?ctx.lineTo(q.X,q.Y):ctx.moveTo(q.X,q.Y);}); ctx.closePath();
  if(okc){ctx.clip(); for(let z=-60;z<420;z+=36)polyF([g2(-420,z),g2(420,z),g2(420,z+18),g2(-420,z+18)],grass2);}
  ctx.restore();
  // 警戒區、內野紅土、內野草皮、投手丘、本壘
  const track=[]; for(let a=45;a>=-45;a-=3){const t=a*Math.PI/180; track.push(g2(Math.sin(t)*fence(a),Math.cos(t)*fence(a)));}
  for(let a=-45;a<=45;a+=3){const t=a*Math.PI/180; track.push(g2(Math.sin(t)*(fence(a)-14),Math.cos(t)*(fence(a)-14)));}
  polyF(track,dirt);
  const arcPts=[]; for(let i=0;i<=30;i++){const a=-0.62*Math.PI+1.24*Math.PI*i/30; arcPts.push(g2(Math.sin(a)*95,60.5+Math.cos(a)*95));}
  polyF([...arcPts,g2(20,-8),g2(-20,-8)],dirt);
  polyF([g2(0,3),g2(60,63.6),g2(0,123),g2(-60,63.6)],night?'#2f6039':'#4c9a52');
  const circ=(cx,cz,rr,col)=>{const q=[];for(let i=0;i<24;i++){const a=i/24*Math.PI*2;q.push(g2(cx+Math.sin(a)*rr,cz+Math.cos(a)*rr));}polyF(q,col);};
  circ(0,60.5,9,dirt); circ(0,0,13,dirt);
  ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.lineWidth=1.6;
  [[-233,233],[233,233]].forEach(([x,z])=>{const a=P3(0,0,0), b=P3(x,0,z); if(a&&b){ctx.beginPath();ctx.moveTo(a.X,a.Y);ctx.lineTo(b.X,b.Y);ctx.stroke();}});
  [[63.6,63.6],[0,127.3],[-63.6,63.6],[0,0]].forEach(([x,z])=>polyF([g2(x-1.6,z),g2(x,z+1.6),g2(x+1.6,z),g2(x,z-1.6)],'#fff'));
  // 看台：內圈從牆頂(8ft)斜上到外圈(80ft)，由遠畫到近
  if(!aerialPat){const pc=document.createElement('canvas'); pc.width=pc.height=36; const px=pc.getContext('2d'), m=mulberry32(5);
    px.fillStyle='#39414c'; px.fillRect(0,0,36,36); const cols=['#d6d9dd','#e0c29a','#2c3e63','#b3413a','#f2f2ee','#8a9aad','#4f6b8f','#c9a36a'];
    for(let i=0;i<120;i++){px.fillStyle=cols[Math.floor(m()*8)]; px.fillRect(Math.floor(m()*18)*2,Math.floor(m()*18)*2,2,2);} aerialPat=ctx.createPattern(pc,'repeat');}
  const out=loop.map(([x,z])=>{const dx=x, dz=z-150, l=Math.hypot(dx,dz)||1; return [x+dx/l*115, z+dz/l*115];});
  const segs=[];
  for(let i=0;i<loop.length;i++){const j=(i+1)%loop.length, a=loop[i], b=loop[j], A=out[i], B=out[j];
    const q=P3((a[0]+B[0])/2,40,(a[1]+B[1])/2); if(!q)continue;
    segs.push({z:q.z, fn:()=>{
      polyF([g2(a[0],a[1]),g2(b[0],b[1]),g2(b[0],b[1],8),g2(a[0],a[1],8)],night?'#173d29':'#1f5236');
      if(polyF([g2(a[0],a[1],8),g2(b[0],b[1],8),g2(B[0],B[1],80),g2(A[0],A[1],80)],aerialPat)){
        ctx.fillStyle=`rgba(0,0,0,${night?.45:.12})`; ctx.fill();}
      polyF([g2(A[0],A[1],80),g2(B[0],B[1],80),g2(B[0],B[1],92),g2(A[0],A[1],92)],night?'#20293a':'#c9cfd6');}});}
  segs.sort((a,b)=>b.z-a.z).forEach(s=>s.fn());
  if(st.view==='lineup'){ctx.fillStyle='rgba(4,8,16,.42)'; ctx.fillRect(0,0,W,H);}
}

/* ---------- 小地圖 ---------- */
function drawMini(){
  const w=280,h=210, hx=w/2, hy=h-14, k=h*0.9/420;
  mctx.clearRect(0,0,w,h); const night=dark();
  mctx.fillStyle=night?'#244a31':'#4a9750'; mctx.beginPath(); mctx.moveTo(hx,hy);
  for(let a=-45;a<=45;a+=3){const r=(330+70*(1-Math.abs(a)/45))*k, t=a*Math.PI/180; mctx.lineTo(hx+Math.sin(t)*r,hy-Math.cos(t)*r);} mctx.closePath(); mctx.fill();
  mctx.strokeStyle='#173d2a'; mctx.lineWidth=3; mctx.stroke();
  const pt=(d,a)=>[hx+Math.sin(a*Math.PI/180)*d*k, hy-Math.cos(a*Math.PI/180)*d*k];
  mctx.fillStyle=night?'#8e6343':'#b98256'; mctx.beginPath(); mctx.moveTo(hx,hy+4); mctx.arc(hx,hy,150*k,-Math.PI*0.75-0.05,-Math.PI*0.25+0.05); mctx.closePath(); mctx.fill();
  mctx.fillStyle=night?'#244a31':'#4a9750'; mctx.beginPath(); [pt(0,0),pt(90,45),pt(127,0),pt(90,-45)].forEach((q,i)=>i?mctx.lineTo(...q):mctx.moveTo(...q)); mctx.closePath(); mctx.fill();
  if(G)[pt(90,45),pt(127,0),pt(90,-45)].forEach((q,i)=>{mctx.fillStyle=G.bases[i]?'#f3c230':'#fff'; mctx.save(); mctx.translate(...q); mctx.rotate(Math.PI/4); mctx.fillRect(-4,-4,8,8); mctx.restore();});
  const bb=UI.bb;
  if(bb){const d=bb.type==='GB'?Math.min(bb.dist,bb.hit&&!bb.infield?200:120):bb.dist, q=pt(d,bb.spray);
    mctx.strokeStyle='rgba(255,255,255,.9)'; mctx.setLineDash([4,3]); mctx.lineWidth=1.5; mctx.beginPath(); mctx.moveTo(hx,hy); mctx.lineTo(...q); mctx.stroke(); mctx.setLineDash([]);
    mctx.fillStyle=bb.hit==='HR'?'#f3c230':bb.hit||bb.error?'#58a6ff':'#e45050'; mctx.beginPath(); mctx.arc(...q,5,0,7); mctx.fill();
    mctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--muted'); mctx.font='600 11px Oswald,sans-serif'; mctx.fillText(`${Math.round(bb.ev)} mph · ${Math.round(bb.la)}° · ${Math.round(bb.dist)} ft`,6,h-3);}
}
