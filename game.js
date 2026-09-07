
'use strict';
/* ============================ UTILS & DOM ============================ */
const el = id => document.getElementById(id);
const clamp = (v,a,b)=> v<a?a : v>b?b : v;
const lerp = (a,b,t)=> a+(b-a)*t;
const rnd  = (a,b)=> a + Math.random()*(b-a);
const dist = (x1,y1,x2,y2)=> Math.hypot(x2-x1,y2-y1);
const TAU = Math.PI*2, GRAV = 9.81;

const scene = el('scene'),  sctx = scene.getContext('2d');
const graph = el('graph'),  gctx = graph.getContext('2d');
const bodies= el('bodies'), bctx = bodies.getContext('2d');
/* hi-DPI: render at device resolution, lay everything out in logical pixels */
const DPR = Math.min((typeof window!=='undefined'&&window.devicePixelRatio)||1, 2.5);
const SW=960, SH=540, GW=960, GH=170, BW=272;
scene.width=SW*DPR; scene.height=SH*DPR;
graph.width=GW*DPR; graph.height=GH*DPR;
function setBodiesH(h){
  bodies.width=BW*DPR; bodies.height=h*DPR;
  bodies.style.width=BW+'px'; bodies.style.height=h+'px';
}
const ui = {
  height: el('heightSl'), riders: el('ridersSl'), acc: el('accSl'), rope: el('ropeSl'), belts: el('beltTg'),
  snd: el('sndTg'), sndState: el('sndState'),
  chutes: el('chuteTg'), chuteState: el('chuteState'),
  heightV: el('heightV'), ridersV: el('ridersV'), accV: el('accV'), ropeStrV: el('ropeStrV'), beltState: el('beltState'),
  tensionV: el('tensionV'), tensionBar: el('tensionBarI'), pullV: el('pullV'),
  predGV: el('predGV'), liveGV: el('liveGV'), maxGV: el('maxGV'),
  riskV: el('riskV'), ropeV: el('ropeV'), ropeBar: el('ropeBarI'),
  statusLine: el('statusLine'), resetBtn: el('resetBtn'), controlsBox: el('controlsBox'),
};

/* ============================ CONFIG ============================ */
const cfg = {
  towerX: 1.5,        // towers are a front/back pair seen edge-on (side view)
  podR: 1.6,          // pod radius (m)
  baseMass: 250,      // empty pod kg
  riderMass: 80,      // kg per rider
  k: 3200,            // spring constant per cord (N/m) — violent, like the real thing
  L0frac: 0.92,       // natural cord length fraction of latch distance
  damp: 14,           // linear damping (N·s/m) — near-frictionless: symmetric swings
  qdrag: 0.4,         // quadratic air drag (N·s²/m²)
  brakeAt: 9.0,       // sim-seconds of free bouncing before the ride brake ramps in (~2 full cycles)
  Tmax: 52000,        // rated max tension per cord at 100% rope strength (N) — beefy by default
  riderTerminalSpeed: 55, // approximate spread-body terminal speed in m/s
  spectatorGravityScale: 1.5, // snappier mouse-driven falls; capsule/rider gravity is unchanged
  ejectVmax: 36,      // cap so thrown bodies still land on screen (m/s)
  chuteVmax: 15,      // descent cap with a parachute — only slightly slower, for snappy gameplay
  platformY: 10,      // pod center height when latched — boarding deck is up at 10 m
};
const DECK = cfg.platformY - cfg.podR;   // walking surface of the boarding deck
const NAMES   = ['Bob','Sue','Rex','Pam'];
const SHIRTS  = ['#e05545','#3d7bd9','#3fae5a','#b65fd0'];
const SCREAMS = ['Here we go!','Hold on!','Second thoughts…','I regret everything.','That is quite high.','A little too fast.'];
// static decoration layout (computed once so nothing flickers)
const DECOR={
  clouds:[{s:1,y:52,sp:7,a:.92},{s:.7,y:98,sp:11,a:.7},{s:1.3,y:142,sp:5,a:.5},{s:.55,y:30,sp:15,a:.8}],
  tufts:Array.from({length:46},()=>({f:Math.random(),h:3+Math.random()*5,ph:Math.random()*TAU})),
  flowers:Array.from({length:16},()=>({f:Math.random(),g:Math.random(),c:['#ff6b9d','#ffd23f','#ff8c42','#c77dff'][Math.floor(Math.random()*4)]})),
  balloons:Array.from({length:4},(_,i)=>({f:0.12+0.22*i+Math.random()*0.05,ph:Math.random()*900,c:['#d8403f','#3d7bd9','#ffd23f','#3fae5a'][i],prog:Math.random()*600,popped:false,popUntil:0})),
  spect:Array.from({length:14},(_,i)=>({dx:i*10.5+Math.random()*5,c:SHIRTS[i%4],ph:Math.random()*TAU,sz:0.75+Math.random()*0.5,jumper:Math.random()<0.35})),
};
function fireworks(){
  for(let b=0;b<3;b++){
    const bx=rnd(-0.4,0.4)*Math.max(S.H,55), by=Math.max(S.H,55)*rnd(0.6,0.95);
    const col=['#ffd23f','#ff6b9d','#37d6e8','#9fe87a'][b%4];
    for(let i=0;i<24;i++){ const a=i/24*TAU, sp=rnd(6,14);
      S.particles.push({type:'spark',x:bx,y:by,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:rnd(.5,1.1),rot:0,vr:0,color:col});
    }
  }
}

/* ============================ STATE ============================ */
let S = null, VIEW = {s:5,ox:0,oy:0};

function makeRiders(n, belted, chuted){
  const arr=[];
  for(let i=0;i<n;i++){
    arr.push({
      name:NAMES[i], shirt:SHIRTS[i], seat:i,
      skin:['#bc9171','#d4ad8b','#986e51','#b7896b'][i], trousers:['#364249','#3e4140','#4b4942','#303f4e'][i],
      hairC:['#5a3b1e','#2c2c2c','#c98a2e','#8a4a22'][i],
      tol: 9 + Math.random()*4,          // personal G tolerance (neck)
      belted, hasChute:chuted, chuteOpen:false, chuteTorn:false, chuteLanded:false,
      mode:'boarding',                   // boarding | seated | flying | landed | taken
      boardDelay: i*0.13, pathD:0, walkPh:Math.random()*6,
      x:0,y:0,vx:0,vy:0,rot:0,vr:0,
      face:'happy',                      // happy|scared|pain|dizzy|ko|dead
      dmg:{head:0,neck:0,torso:0,arms:0,legs:0}, // 0 ok,1 hurt,2 broken,3 detached
      status:'Awaiting launch',
      armWave:Math.random()*TAU,
    });
  }
  return arr;
}

function resetGame(){
  heldSpectator=null;pointerSamples=[];
  if(activePointer!==null&&scene.hasPointerCapture(activePointer))scene.releasePointerCapture(activePointer);
  activePointer=null;
  lastPanelPaint=-Infinity;
  dragging=false; scene.style.cursor='grab'; accumulator=0; paused=false; el('pauseBtn').textContent='Pause'; refreshLabels();
  const H = +ui.height.value, n = +ui.riders.value;
  S = {
    phase:'boarding', t:0, tRelease:0, H, nRiders:n,score:0,
    bo:0, bov:0, boardT:0,
    trail:[], bannerT:0, barT:0, barDone:false,
    accBase: +ui.acc.value/100,
    belts: ui.belts.checked,
    pod:{x:0, y:cfg.platformY, vx:0, vy:0},
    prevVy:0,
    mass: cfg.baseMass + cfg.riderMass*n,
    Tmax: cfg.Tmax * (+ui.rope.value/100),
    L0: cfg.L0frac * dist(0,cfg.platformY,cfg.towerX,H),
    tension:[0,0], feltG:1, maxG:1, maxTensionRatio:0, fray:0,
    snapped:[false,false], snapWave:[0,0], secondSnapAt:null, podRot:0, podVr:0,
    plan:null, ejected:false, peakSp:0, peakVx:0, peakVy:0, bounceCount:0, prevVxSign:0, ejectQueue:[],
    series:[], seriesT0:0,
    riders: makeRiders(n, ui.belts.checked, ui.chutes.checked), spectatorBodies:[],
    particles:[], stains:[], texts:[],
    settleTimer:0, banner:'', bannerSub:'',
    confettiDone:false, ambulance:null, ambulances:[], casualties:[], shake:0,
    ferris:0, resultDone:false,
  };
  setBodiesH(n*148 + 6);
  resetSpectators();
  paintScore();
  setControlsEnabled(true);
  updateBanner('boarding');
}

/* -------- spectator crushing: falling bodies & debris flatten the crowd -------- */
const SPECT_X0=205;   // crowd fence position (screen px)
function spectWorldX(sp){ const h=Math.max(S.H,55),scale=Math.min(SW/(2*(.74*h+14)),(SH-26)/(h+68));return (sp.x-SW/2)/scale; }
function resetSpectators(){
  // Keep the original fence crowd and add visitors along both sides of the midway.
  if(DECOR.spect.length===14){
    for(let i=0;i<20;i++) DECOR.spect.push({dx:0,walker:true,homeX:40+i*45,ph:rnd(0,TAU)});
  }
  S.crowdPanic=false;
  DECOR.spect.forEach((sp,i)=>Object.assign(sp,{
    alive:true,x:sp.walker?sp.homeX:SPECT_X0+sp.dx,
    dir:i%2?1:-1,speed:12+(i%5)*2,runSpeed:65+(i%7)*6,
    wait:sp.walker?(i%4===0?1.5:0):Infinity,turnIn:2+(i%5),
    panicAt:Infinity,panicking:false,walkPh:sp.ph,
    behavior:sp.walker?'strolling':'watching',vx:0,pointT:0,lookT:0,
    gestureIn:1+(i%9)*.7,reactionLeft:0,shelterX:0,lookDir:1,
    helpRider:null,helpOffset:0,millTarget:null,millWait:0,body:null,
    skin:['#bc9171','#d4ad8b','#986e51','#b7896b'][i%4],
    trousers:['#364249','#3e4140','#4b4942','#303f4e'][i%4],
    shirt:SHIRTS[i%4],seat:i%4,face:'happy',dmg:{},mode:'landed',
  }));
}
function panicSpectators(){
  if(S.crowdPanic) return;
  S.crowdPanic=true;
  const dangerX=W2SX(S.pod.x);
  DECOR.spect.forEach((sp,i)=>{
    if(!sp.alive) return;
    sp.panicAt=S.t+.05+(i%7)*.07;
    sp.escapeDir=sp.x<dangerX?-1:1;
    sp.shelterX=sp.escapeDir<0?28+(i%7)*8:SW-28-(i%7)*8;
    sp.reactionLeft=.25+(i%5)*.12;
  });
}
function stepSpectators(dt){
  assignSpectatorHelpers();
  for(const sp of DECOR.spect){
    if(!sp.alive) continue;
    sp.pointT=Math.max(0,sp.pointT-dt);sp.lookT=Math.max(0,sp.lookT-dt);
    sp.gestureIn-=dt;
    if(S.t>=sp.panicAt&&!sp.panicking&&!sp.helpRider){
      sp.panicking=true;sp.face='scared';sp.wait=0;sp.behavior='startled';
      sp.lookT=sp.reactionLeft;sp.pointT=sp.seat%2===0?sp.reactionLeft:0;
    }
    if(sp.gestureIn<=0){
      sp.lookT=rnd(.8,1.8);
      // Running people glance back briefly; stationary onlookers sometimes point.
      if(!sp.helpRider&&sp.behavior!=='fleeing'&&Math.random()<.4)sp.pointT=rnd(.6,1.3);
      sp.gestureIn=rnd(3,7);
    }
    let targetSpeed=0;
    if(sp.helpRider){
      const target=clamp(W2SX(sp.helpRider.x)+sp.helpOffset,24,SW-24),dx=target-sp.x;
      sp.pointT=0;
      if(Math.abs(dx)>2){
        sp.behavior='helpingRun';sp.dir=Math.sign(dx);
        targetSpeed=sp.dir*Math.min(sp.runSpeed,Math.sqrt(2*180*Math.abs(dx)));
      }else sp.behavior=sp.helpRider.mode==='landed'?'helping':'helpingWait';
    }else if(sp.panicking){
      if(sp.behavior==='startled'){
        sp.reactionLeft-=dt;
        if(sp.reactionLeft<=0){sp.behavior='fleeing';sp.dir=sp.escapeDir;sp.pointT=0;}
      }
      if(sp.behavior==='fleeing'){
        const remaining=(sp.shelterX-sp.x)*sp.escapeDir;
        if(remaining<=1){sp.behavior='milling';sp.lookT=2;sp.millTarget=null;}
        else targetSpeed=sp.escapeDir*Math.min(sp.runSpeed,Math.sqrt(2*180*remaining));
      }
      if(sp.behavior==='milling'){
        sp.millWait=Math.max(0,sp.millWait-dt);
        if(sp.millTarget===null&&sp.millWait===0){
          const left=sp.x<SW/2,lo=left?28:SW-205,hi=left?205:SW-28;
          sp.millTarget=sp.x<(lo+hi)/2?rnd((lo+hi)/2+20,hi):rnd(lo,(lo+hi)/2-20);
        }
        if(sp.millTarget!==null){
          const dx=sp.millTarget-sp.x;
          if(Math.abs(dx)<2){sp.millTarget=null;sp.millWait=rnd(.4,1.5);}
          else{sp.dir=Math.sign(dx);targetSpeed=sp.dir*Math.min(sp.speed*1.2,Math.sqrt(2*180*Math.abs(dx)));}
        }
      }
    }else if(sp.walker){
      if(sp.wait>0){sp.wait=Math.max(0,sp.wait-dt);sp.behavior='watching';}
      else{
        sp.behavior='strolling';targetSpeed=sp.dir*sp.speed;sp.turnIn-=dt;
        if(sp.turnIn<=0){sp.wait=rnd(1.5,4);sp.lookT=sp.wait;sp.turnIn=rnd(3,7);}
      }
    }
    // Accelerate and brake rather than instantly sliding at full speed.
    const acceleration=sp.panicking||sp.helpRider?180:45;
    sp.vx+=clamp(targetSpeed-sp.vx,-acceleration*dt,acceleration*dt);
    sp.x+=sp.vx*dt;
    if(sp.x<24||sp.x>SW-24){sp.x=clamp(sp.x,24,SW-24);sp.vx=0;if(!sp.panicking)sp.dir*=-1;}
    sp.mode=Math.abs(sp.vx)>1?'boarding':'landed';
    sp.walkPh+=Math.abs(sp.vx)*dt/(sp.panicking?8:5);
    const watching=sp.lookT>0||sp.pointT>0||sp.behavior==='watching';
    sp.lookDir=sp.helpRider?(W2SX(sp.helpRider.x)<sp.x?-1:1):watching?(W2SX(S.pod.x)<sp.x?-1:1):sp.dir;
  }
}
function assignSpectatorHelpers(){
  const reachable=r=>(r.mode==='landed'||(r.mode==='flying'&&r.groundContact))&&W2SX(r.x)>=24&&W2SX(r.x)<=SW-24;
  for(const sp of DECOR.spect){
    if(sp.helpRider&&(!reachable(sp.helpRider)||!scenePeople().includes(sp.helpRider))){
      sp.helpRider=null;sp.behavior='milling';sp.panicking=true;sp.millTarget=null;
    }
  }
  for(const r of scenePeople()){
    if(!reachable(r))continue;
    const assigned=DECOR.spect.filter(sp=>sp.alive&&sp.helpRider===r);
    const available=DECOR.spect.filter(sp=>sp.alive&&!sp.helpRider)
      .sort((a,b)=>Math.abs(a.x-W2SX(r.x))-Math.abs(b.x-W2SX(r.x)));
    for(const offset of [-18,18,32]){
      if(assigned.some(sp=>sp.helpOffset===offset))continue;
      const sp=available.shift();if(!sp)break;
      sp.helpRider=r;sp.helpOffset=offset;sp.behavior='helpingRun';sp.pointT=0;sp.panicking=true;
    }
  }
}
function drawSpectators(c){
  const gy=W2SY(0);
  for(const sp of DECOR.spect){
    if(!sp.alive) continue;
    const sz=RIDER_SCENE_SCALE;
    c.save();c.translate(sp.x,gy);
    c.fillStyle='rgba(24,35,32,.22)';c.beginPath();c.ellipse(0,1,sz*.85,2,0,0,TAU);c.fill();
    drawSpectatorPerson(c,sp,sz);
    c.restore();
  }
}
function drawSpectatorPerson(c,sp,sz){
  // Side-on, jointed figures: planted feet, bending knees and opposing arm swing.
  const moving=Math.abs(sp.vx)>1,running=['fleeing','helpingRun'].includes(sp.behavior)&&moving;
  const kneeling=sp.behavior==='helping'&&!moving;
  const facing=moving?sp.dir:sp.lookDir,phase=sp.walkPh;
  const stride=moving?(running?.95:.42):0;
  const bob=moving?Math.cos(phase*2)*(running?.07:.025):0;
  const lean=running?.25:sp.behavior==='startled'?-.12:0;
  const hip=[0,kneeling?-1.05:-2.18+bob],shoulder=[kneeling?.4:lean,kneeling?-2.25:-3.62+bob];
  c.save();c.scale(sz*facing,sz);c.lineCap='round';
  const limb=(a,b,r1,r2,color)=>taperedLimb(c,a,b,r1,r2,color);
  for(const side of [-1,1]){
    const cycle=((phase+(side===1?Math.PI:0))%TAU)/TAU;
    const swing=cycle<.5?1-4*cycle:-Math.cos((cycle-.5)*TAU);
    const lift=cycle<.5?0:Math.sin((cycle-.5)*TAU);
    const foot=[moving?swing*stride:side*.12,-.07-lift*(running?.55:.16)*(moving?1:0)];
    const dx=foot[0]-hip[0],dy=foot[1]-hip[1],length=Math.hypot(dx,dy);
    const segment=moving?1.18:1.06;
    const bend=Math.sqrt(Math.max(0,segment**2-(length/2)**2));
    const knee=kneeling?[side===1?.7:-.5,side===1?-.7:-.12]:[(hip[0]+foot[0])/2+dy/length*bend,(hip[1]+foot[1])/2-dx/length*bend];
    c.globalAlpha=side===-1?.7:1;
    limb(hip,knee,.17,.12,sp.trousers);limb(knee,foot,.12,.075,sp.trousers);
    limb([foot[0]-.07,foot[1]],[foot[0]+.21,foot[1]],.085,.065,'#24282a');
  }
  c.globalAlpha=1;
  c.fillStyle=surfaceGradient(c,-.3,0,.4,0,[[0,'#263338'],[.3,sp.shirt],[1,sp.shirt]]);
  c.beginPath();c.moveTo(shoulder[0]-.22,shoulder[1]-.08);c.quadraticCurveTo(shoulder[0]+.28,shoulder[1]-.18,shoulder[0]+.3,shoulder[1]+.3);
  c.lineTo(.23,hip[1]+.12);c.lineTo(-.25,hip[1]+.1);c.closePath();c.fill();
  for(const side of [-1,1]){
    const swing=Math.sin(phase+(side===1?Math.PI:0));
    let elbow=[shoulder[0]+(running?.5:.22)*swing,shoulder[1]+.65];
    let hand=[elbow[0]+(running?.45:.12)*swing,elbow[1]+(running?-.35:.62)];
    if(!moving){elbow=[shoulder[0]-.05,shoulder[1]+.65];hand=[shoulder[0]+.06,shoulder[1]+1.22];}
    if(kneeling){elbow=[shoulder[0]+.35,shoulder[1]+.65];hand=[shoulder[0]+.7+side*.08,-.65];}
    if(sp.behavior==='startled'&&side===1){elbow=[shoulder[0]+.3,shoulder[1]+.4];hand=[shoulder[0]+.25,shoulder[1]-.25];}
    if(sp.pointT>0&&side===1){
      const look=sp.lookDir*facing,angle=clamp(Math.atan2(W2SY(S.pod.y)-W2SY(0)+3.8*sz,Math.abs(W2SX(S.pod.x)-sp.x)),-.9,-.12);
      elbow=[shoulder[0]+look*.65*Math.cos(angle),shoulder[1]+.65*Math.sin(angle)];
      hand=[shoulder[0]+look*1.35*Math.cos(angle),shoulder[1]+1.35*Math.sin(angle)];
    }
    c.globalAlpha=side===-1?.65:1;
    const sleeve=[lerp(shoulder[0],elbow[0],.45),lerp(shoulder[1],elbow[1],.45)];
    limb(shoulder,sleeve,.17,.13,sp.shirt);limb(sleeve,elbow,.105,.085,sp.skin);limb(elbow,hand,.085,.06,sp.skin);
    if(sp.pointT>0&&side===1)limb(hand,[hand[0]+sp.lookDir*facing*.16,hand[1]-.04],.035,.02,sp.skin);
  }
  c.globalAlpha=1;
  limb([shoulder[0],shoulder[1]-.02],[shoulder[0],shoulder[1]-.3],.11,.1,sp.skin);
  c.save();c.translate(shoulder[0],shoulder[1]-.53);c.scale(sp.lookDir*facing,1);
  // A visible profile makes head turns read even at the small scene scale.
  if(kneeling)c.rotate(.3);else if(sp.lookT>0||!moving)c.rotate(-.14);
  c.fillStyle=sp.skin;c.beginPath();c.ellipse(0,0,.25,.34,0,0,TAU);c.fill();
  c.beginPath();c.moveTo(.17,-.06);c.lineTo(.32,.04);c.lineTo(.18,.09);c.fill();
  c.fillStyle=['#49332a','#302e2b','#866544','#423329'][sp.seat];c.beginPath();c.ellipse(-.06,-.17,.23,.21,-.3,Math.PI*.7,TAU);c.fill();
  c.fillStyle='#293333';c.beginPath();c.arc(.15,-.07,.026,0,TAU);c.fill();
  c.restore();c.restore();
}
function crushRadius(r){
  // how much of them is left determines the splat footprint:
  // full body ≈2.4 m, missing limbs shrink it, lone torso ≈0.9 m
  const limbs=(r.dmg.legs<3?1:0)+(r.dmg.arms<3?1:0)+(r.dmg.head<3?0.5:0);
  return 0.9+limbs*0.6;
}
function crushSpectators(x,rad){
  let n=0;
  for(const sp of DECOR.spect){
    if(sp.alive===false) continue;
    const wx=spectWorldX(sp);
    if(Math.abs(wx-x)<rad){
      sp.alive=false; n++;
      S.casualties.push({x:wx,y:.5,mode:'landed',face:'dead',dmg:{}});
      spawnBlood(wx,0.6,10);
      S.stains.push({x:wx,y:0.1,r:rnd(0.8,1.3)});
      addText(wx,2.2,pick(['SQUISH!','CRUNCH!','OH NO.','☠️']),'#ff4444',15);
    }
  }
  if(n>0){
    addScore(n*500);
    panicSpectators();
    S.crushed=(S.crushed||0)+n;
    SFX.splat(); S.shake=Math.max(S.shake,5);
    if(n>1) addText(x,5,n+' BYSTANDERS DOWN!!','#ff2222',18);
  }
  return n;
}

/* -------- boarding animation: walk the ramp, hop in, pod bobs -------- */
function boardPos(d){
  const L1=2, L2=Math.hypot(9.5,DECK), L3=1.8;   // queue → ramp → deck
  if(d<L1) return [14-d, 0, false];
  if(d<L1+L2){ const f=(d-L1)/L2; return [12-9.5*f, DECK*f, false]; }
  if(d<L1+L2+L3) return [2.5-(d-L1-L2), DECK, false];
  return [0.7, DECK, true];
}
function stepBoarding(dt){
  // pod bobs on its latch spring (reacts to each boarder's weight)
  S.bov += (-S.bo*30 - S.bov*6)*dt; S.bo += S.bov*dt;
  S.pod.y = cfg.platformY + S.bo;
  if(S.phase!=='boarding') return;
  S.boardT += dt;
  let done=true;
  for(const r of S.riders){
    if(r.mode!=='boarding') continue;
    done=false;
    if(S.boardT < r.boardDelay){ r.x=14+r.seat*1.3; r.y=0; continue; }
    r.pathD += dt*22; r.walkPh += dt*22;
    const p=boardPos(r.pathD);
    r.x=p[0]; r.y=p[1];
    if(p[2]){ r.mode='seated'; S.bov-=1.5; SFX.thud(2.5); addText(S.pod.x,S.pod.y+2.5,'*hup*','#fff',12); }
  }
  if(done){ S.phase='idle'; updateBanner('idle'); }
}

function setControlsEnabled(on){
  ui.controlsBox.classList.toggle('disabledUI', !on);
  for(const input of ui.controlsBox.querySelectorAll('input')) if(input!==ui.snd)input.disabled=!on;
}

/* ============================ CAMERA ============================ */
function computeView(){
  const H=S.H, cw=SW, ch=SH;
  const Heff=Math.max(H,55);   // fixed zoom below 55 m → taller towers really LOOK taller
  // constant 68 m of sky above the tower (not proportional!) so the tower keeps growing on screen
  const wx0=-(0.74*Heff+14), wx1=0.74*Heff+14, top=Heff+68;
  const s = Math.min(cw/(wx1-wx0), (ch-26)/top);
  const ox = cw/2 - s*(wx0+wx1)/2;
  const oy = ch - 22;
  VIEW={s,ox,oy};
}
const W2SX = x => VIEW.ox + x*VIEW.s;
const W2SY = y => VIEW.oy - y*VIEW.s;
const S2WX = X => (X-VIEW.ox)/VIEW.s;
const S2WY = Y => (VIEW.oy-Y)/VIEW.s;
const RIDER_SCENE_SCALE=5;
function podPxR(){ return Math.max(cfg.podR*VIEW.s,22,S.nRiders*7); }

/* ============================ INPUT ============================ */
let dragging=false;
let heldSpectator=null,activePointer=null,pointerSamples=[];
let bestCarnage=0;
try{const saved=Number(localStorage.getItem('slingshot-best-carnage'));if(Number.isFinite(saved))bestCarnage=Math.max(0,saved);}catch{}
function paintScore(){el('scoreValue').textContent=S.score.toLocaleString();el('bestScoreValue').textContent=bestCarnage.toLocaleString();}
function addScore(points){
  S.score+=points;
  if(S.score>bestCarnage){bestCarnage=S.score;try{localStorage.setItem('slingshot-best-carnage',String(bestCarnage));}catch{}}
  paintScore();
}
function scoreInjuries(){
  for(const r of scenePeople()){
    const severity=Object.values(r.dmg).reduce((sum,v)=>sum+v,0)*25+(r.face==='dead'?500:0);
    if(severity>(r.scoredDamage||0)){addScore(severity-(r.scoredDamage||0));r.scoredDamage=severity;}
  }
}
function scenePeople(){return S.riders.concat(S.spectatorBodies);}
function balloonPos(b){return [SW*b.f+Math.sin(S.t+b.ph)*14,SH-b.prog+20];}
function popBalloon(b){
  if(b.popped)return;
  const [x,y]=balloonPos(b),wx=S2WX(x),wy=S2WY(y);
  b.popped=true;b.popUntil=S.t+rnd(2.5,5);SFX.pop();addScore(10);
  addText(wx,wy,'POP! 🎈','#fff',15);
  for(let k=0;k<9;k++)S.particles.push({type:'spark',x:wx,y:wy,vx:rnd(-7,7),vy:rnd(-3,8),life:rnd(.3,.6),rot:0,vr:0,color:b.c});
}
function spectatorAt(X,Y){
  return [...DECOR.spect].reverse().find(sp=>{
    if((!sp.alive&&!sp.body)||sp.body?.mode==='taken')return false;
    const x=sp.body?W2SX(sp.body.x):sp.x,y=sp.body?W2SY(sp.body.y):W2SY(0)-11;
    return Math.abs(X-x)<12&&Math.abs(Y-y)<15;
  });
}
function moveHeldSpectator(e){
  const [X,Y]=canvasPos(e),r=heldSpectator;
  r.x=S2WX(X);r.y=Math.max(.5,S2WY(Y));r.vx=r.vy=0;
  const events=typeof e.getCoalescedEvents==='function'?e.getCoalescedEvents():[];
  for(const event of [...events,e]){
    const [px,py]=canvasPos(event),sample={x:S2WX(px),y:S2WY(py),t:event.timeStamp};
    const last=pointerSamples.at(-1);
    // A duplicate pointerup must not dilute a flick, nor refresh stale movement.
    if(last&&(sample.x===last.x&&sample.y===last.y))continue;
    // Coarse timestamp clocks can give distinct positions the same timestamp.
    if(last&&sample.t<=last.t)sample.t=last.t+1;
    // No movement events arrive during a hold. Do not divide the next flick by
    // that entire idle interval; use a bounded estimate for this sparse segment.
    if(last&&sample.t-last.t>50)pointerSamples.push({...last,t:sample.t-50});
    pointerSamples.push(sample);
    // Preserve an anchor before the recent window, including sparse pointer events.
    while(pointerSamples.length>2&&sample.t-pointerSamples[1].t>100)pointerSamples.shift();
  }
}
function spectatorReleaseVelocity(time){
  const last=pointerSamples.at(-1);
  if(!last||pointerSamples.length<2||time-last.t>=150)return {vx:0,vy:0};
  const cutoff=last.t-40;
  let first=pointerSamples[0];
  for(let i=1;i<pointerSamples.length;i++){
    const next=pointerSamples[i];
    if(next.t>=cutoff){
      if(first.t<cutoff){const f=(cutoff-first.t)/(next.t-first.t);first={x:lerp(first.x,next.x,f),y:lerp(first.y,next.y,f),t:cutoff};}
      break;
    }
    first=next;
  }
  const dt=Math.max(.001,(last.t-first.t)/1000);
  const vx=(last.x-first.x)/dt,vy=(last.y-first.y)/dt;
  // Allow a brief button-release delay, then fade smoothly into an intentional drop.
  const freshness=clamp((150-(time-last.t))/50,0,1);
  const limit=Math.min(1,90/Math.max(1,Math.hypot(vx,vy)))*freshness;
  return {vx:vx*limit,vy:vy*limit};
}
function releaseSpectator(e,cancelled=false){
  const r=heldSpectator;if(!r)return;
  if(!cancelled)moveHeldSpectator(e);
  const velocity=cancelled?{vx:0,vy:0}:spectatorReleaseVelocity(e.timeStamp);
  r.vx=velocity.vx;r.vy=velocity.vy;
  r.mode='flying';r.ejT=S.t;r.groundContact=false;r.vr=-r.vx*.12;r.capsuleBonus=false;
  r.flung=!cancelled&&Math.hypot(r.vx,r.vy)>4;
  heldSpectator=null;pointerSamples=[];scene.style.cursor='grab';
}
function canvasPos(e){
  const r=scene.getBoundingClientRect();
  return [ (e.clientX-r.left)*SW/r.width, (e.clientY-r.top)*SH/r.height ];
}
scene.addEventListener('pointerdown', e=>{
  if(e.button!==0||activePointer!==null)return;
  const [X,Y]=canvasPos(e);
  const balloon=DECOR.balloons.find(b=>{const [x,y]=balloonPos(b);return !b.popped&&((X-x)/11)**2+((Y-y)/14)**2<1;});
  if(balloon){e.preventDefault();popBalloon(balloon);return;}
  const sp=spectatorAt(X,Y);
  if(sp){
    e.preventDefault();
    if(!sp.body){
      sp.body={...makeRiders(1,false,false)[0],seat:sp.seat,shirt:sp.shirt,skin:sp.skin,trousers:sp.trousers,spectator:true};
      S.spectatorBodies.push(sp.body);
    }
    sp.alive=false;sp.helpRider=null;heldSpectator=sp.body;
    heldSpectator.mode='held';heldSpectator.groundContact=false;
    if(heldSpectator.face!=='dead'&&heldSpectator.face!=='ko')heldSpectator.face='scared';
    heldSpectator.rot=0;activePointer=e.pointerId;pointerSamples=[];
    scene.setPointerCapture(e.pointerId);scene.style.cursor='grabbing';moveHeldSpectator(e);panicSpectators();return;
  }
  if(S.phase!=='idle')return;
  const px=W2SX(S.pod.x), py=W2SY(S.pod.y);
  if(Math.hypot(X-px,Y-py) < podPxR()+14){
    dragging=true; S.phase='dragging'; S.maxTensionRatio=0;
    activePointer=e.pointerId;
    SFX.grab();
    scene.setPointerCapture(e.pointerId);
    scene.style.cursor='grabbing';
    setControlsEnabled(false);
    dragTo(e);
  }
});
scene.addEventListener('pointermove', e=>{if(e.pointerId!==activePointer)return;if(heldSpectator)moveHeldSpectator(e);else if(dragging)dragTo(e);});
scene.addEventListener('pointerup', e=>{
  if(e.pointerId!==activePointer)return;
  if(heldSpectator)releaseSpectator(e);else if(dragging){dragging=false;scene.style.cursor='grab';release();}
  activePointer=null;
  if(scene.hasPointerCapture(e.pointerId))scene.releasePointerCapture(e.pointerId);
});
scene.addEventListener('pointercancel', e=>{if(e.pointerId===activePointer)cancelPull();});
scene.addEventListener('lostpointercapture', e=>{if(e.pointerId===activePointer)cancelPull();});
function cancelPull(){
  if(heldSpectator)releaseSpectator(null,true);
  activePointer=null;
  if(dragging){dragging=false;resetGame();scene.style.cursor='grab';}
}
function dragTo(e){
  const [X,Y]=canvasPos(e);
  const maxPull=Math.min(0.95*S.H, 0.74*Math.max(S.H,55)+8); // pull back EITHER way
  S.pod.x = clamp(S2WX(X), -maxPull, maxPull);
  S.pod.y = clamp(S2WY(Y), cfg.podR*0.8, 0.45*S.H);
  S.pod.vx=S.pod.vy=0;
}
ui.resetBtn.addEventListener('click', resetGame);
const RESETTABLE=['idle','boarding','done'];   // phases where slider changes rebuild the ride
for(const id of ['heightSl','ridersSl','accSl','ropeSl']){
  el(id).addEventListener('input', ()=>{ refreshLabels(); if(RESETTABLE.includes(S.phase)) resetGame(); });
}
ui.belts.addEventListener('change', ()=>{ refreshLabels(); if(RESETTABLE.includes(S.phase)) resetGame(); });
function refreshLabels(){
  ui.heightV.textContent = ui.height.value+' m';
  ui.ridersV.textContent = ui.riders.value;
  ui.accV.textContent    = ui.acc.value+'%';
  ui.ropeStrV.textContent= ui.rope.value+'%';
  ui.beltState.textContent = ui.belts.checked ? 'FASTENED' : 'UNFASTENED';
  ui.beltState.style.color = ui.belts.checked ? '#1d7a36' : '#c00';
  ui.sndState.textContent = ui.snd.checked ? 'ON' : 'OFF';
  ui.chuteState.textContent = ui.chutes.checked ? 'ISSUED' : 'NOT ISSUED';
  ui.chuteState.style.color = ui.chutes.checked ? '#1d7a36' : '';
}
ui.snd.addEventListener('change', refreshLabels);
ui.chutes.addEventListener('change', ()=>{ refreshLabels(); if(RESETTABLE.includes(S.phase)) resetGame(); });

/* ============================ SOUND (procedural WebAudio) ============================ */
let AC=null, masterG=null;
function audioCtx(){
  if(!ui.snd.checked) return null;
  try{
    if(!AC){
      const Ctor=(typeof window!=='undefined')&&(window.AudioContext||window.webkitAudioContext);
      if(!Ctor) return null;
      AC=new Ctor(); masterG=AC.createGain(); masterG.gain.value=0.4; masterG.connect(AC.destination);
    }
    if(AC.state==='suspended') AC.resume();
    return AC;
  }catch(e){ return null; }
}
function tone(o){ const ac=audioCtx(); if(!ac) return;
  const t=ac.currentTime+(o.at||0);
  const osc=ac.createOscillator(); osc.type=o.type||'sine';
  osc.frequency.setValueAtTime(o.f0,t);
  if(o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1,20),t+o.dur);
  const g=ac.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(o.vol||0.2,t+(o.attack||0.012));
  g.gain.exponentialRampToValueAtTime(0.0001,t+o.dur);
  osc.connect(g); g.connect(masterG);
  if(o.vib){ const l=ac.createOscillator(); l.frequency.value=o.vib;
    const lg=ac.createGain(); lg.gain.value=o.vibAmt||30; l.connect(lg); lg.connect(osc.frequency);
    l.start(t); l.stop(t+o.dur+0.05); }
  osc.start(t); osc.stop(t+o.dur+0.05);
}
function noiseBurst(o){ const ac=audioCtx(); if(!ac) return;
  const t=ac.currentTime+(o.at||0), len=Math.max(64,Math.floor(ac.sampleRate*o.dur));
  const buf=ac.createBuffer(1,len,ac.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*(1-i/len);
  const src=ac.createBufferSource(); src.buffer=buf;
  const f=ac.createBiquadFilter(); f.type=o.ftype||'bandpass';
  f.frequency.setValueAtTime(o.f0||800,t);
  if(o.f1) f.frequency.exponentialRampToValueAtTime(o.f1,t+o.dur);
  f.Q.value=o.q||1;
  const g=ac.createGain(); g.gain.setValueAtTime(o.vol||0.3,t);
  g.gain.exponentialRampToValueAtTime(0.0001,t+o.dur);
  src.connect(f); f.connect(g); g.connect(masterG);
  src.start(t);
}
const SFX={
  grab(){ tone({type:'square',f0:200,f1:260,dur:0.06,vol:0.1}); },
  creak(r){ noiseBurst({dur:0.1,f0:220+r*500,q:7,vol:0.04+r*0.1}); },
  launch(){ noiseBurst({dur:0.5,f0:300,f1:2200,vol:0.28,ftype:'highpass'}); tone({type:'triangle',f0:150,f1:50,dur:0.4,vol:0.34}); },
  snap(){ noiseBurst({dur:0.12,f0:1600,q:0.7,vol:0.5,ftype:'highpass'}); tone({type:'sawtooth',f0:650,f1:80,dur:0.28,vol:0.3}); },
  scream(){ tone({type:'sawtooth',f0:rnd(750,1050),f1:rnd(240,380),dur:rnd(0.5,0.85),vol:0.11,vib:7,vibAmt:45}); },
  splat(){ noiseBurst({dur:0.2,f0:450,f1:80,vol:0.42,ftype:'lowpass'}); tone({f0:85,f1:32,dur:0.25,vol:0.42}); },
  thud(v){ tone({f0:85,f1:32,dur:0.18,vol:Math.min(0.45,0.08+v*0.025)}); },
  crack(){ noiseBurst({dur:0.06,f0:2600,q:1.2,vol:0.3,ftype:'highpass'}); tone({type:'square',f0:300,f1:120,dur:0.07,vol:0.12}); },
  cheer(){ noiseBurst({dur:1.3,f0:1100,q:0.4,vol:0.14}); [523,659,784,1047].forEach((f,i)=>tone({type:'triangle',f0:f,dur:0.2,vol:0.16,at:0.12+i*0.13})); },
  siren(){ for(let i=0;i<8;i++){ tone({type:'square',f0:690,dur:0.16,vol:0.06,at:i*0.34}); tone({type:'square',f0:940,dur:0.16,vol:0.06,at:0.17+i*0.34}); } },
  pop(){ noiseBurst({dur:0.06,f0:2000,q:1,vol:0.35,ftype:'highpass'}); tone({type:'square',f0:420,f1:140,dur:0.08,vol:0.14}); },
  chute(){ noiseBurst({dur:0.3,f0:700,f1:250,vol:0.2,ftype:'lowpass'}); },
};

/* ============================ PHYSICS ============================ */
function cordForce(px,py,vx=0,vy=0){
  const tops=[[-cfg.towerX,S.H],[cfg.towerX,S.H]];
  let fx=0, fy=0; const T=[0,0];
  for(let i=0;i<2;i++){
    if(S.snapped[i]) continue;
    const dx=tops[i][0]-px, dy=tops[i][1]-py, d=Math.hypot(dx,dy);
    const st=d-S.L0;
    if(st>0){
      // Tension-only Kelvin–Voigt cord, with mild strain hardening.
      const strain=st/Math.max(S.L0,1), extensionRate=-(vx*dx+vy*dy)/d;
      const t=Math.max(0,cfg.k*st*(1+0.18*strain*strain)+90*extensionRate);
      T[i]=t; fx+=t*dx/d; fy+=t*dy/d;
    }
  }
  return {fx,fy,T};
}

function riskEstimate(ratio){
  const base=S.accBase;
  let p = base*0.25*clamp(ratio+0.3,0.3,1);   // slider matters even on safe pulls
  if(ratio>1) p += (0.15+0.6*base)*(1-Math.exp(-4*(ratio-1)));
  return clamp(p,0,0.92);
}

function release(){
  const force=cordForce(S.pod.x,S.pod.y); S.tension=force.T;
  S.maxTensionRatio=Math.max(S.maxTensionRatio,Math.max(...force.T)/S.Tmax);
  const ratio=S.maxTensionRatio;
  const pSnap = riskEstimate(ratio);
  const pBelt = S.belts ? S.accBase*0.30 : 0;
  S.plan = {
    snap: Math.random()<pSnap,
    snapSide: Math.max(S.tension[0],0) > Math.max(S.tension[1],0) ? 0 : 1,
    snapT: 0.05 + Math.random()*0.35,
    beltFail: Math.random()<pBelt,
    victim: Math.floor(Math.random()*S.nRiders),
    beltDone:false, apexCount:0,
  };
  S.phase='flying'; S.tRelease=S.t; S.prevVy=1; S.settleTimer=0;
  S.trail.length=0;
  spawnRing(S.pod.x,S.pod.y,7);   // launch shockwave
  SFX.launch();
  for(const r of S.riders) if(r.mode==='seated') r.face='scared';
  addText(S.pod.x,S.pod.y+3, SCREAMS[Math.floor(Math.random()*SCREAMS.length)], '#fff', 18);
  updateBanner('flying');
}

function doSnap(i){
  if(S.snapped[i]) return;
  S.snapped[i]=true; S.snapWave[i]=1.4;
  panicSpectators();
  SFX.snap();
  S.shake=Math.max(S.shake,10);
  S.flash=Math.max(S.flash||0,0.5);
  addText((i? cfg.towerX:-cfg.towerX)*0.5, S.H*0.7, '💥 SNAP!!', '#ff2222', 26);
  for(let j=0;j<10;j++) S.particles.push({type:'spark',x:S.pod.x,y:S.pod.y,vx:rnd(-8,8),vy:rnd(2,12),life:rnd(.3,.8),rot:0,vr:0,color:'#ffd23f'});
  const other=1-i;
  if(!S.snapped[other]){
    updateBanner('snap');
    // shock load: decent odds the surviving rope lets go moments later
    if(Math.random() < 0.80) S.secondSnapAt = S.t + rnd(0.15,0.7);   // shock load: 80% cascade
  } else {
    // BOTH gone — the whole seat is now a projectile
    S.secondSnapAt=null;
    S.podVr=rnd(3,7)*(Math.random()<0.5?-1:1);
    S.shake=Math.max(S.shake,16);
    S.flash=Math.max(S.flash||0,0.8);
    addText(S.pod.x,S.pod.y+5,'TOTAL SEPARATION!!','#ff2222',24);
    for(const r of S.riders) if(r.mode==='seated') r.face='scared';
    updateBanner('doubleSnap');
  }
}

function allRidersGrounded(){
  return S.riders.length>0 && S.riders.every(r=>r.mode==='landed'||r.mode==='taken');
}

function physStep(dt){
  const p=S.pod;
  const {fx,fy,T}=cordForce(p.x,p.y,p.vx,p.vy);
  S.tension=T;
  const sp=Math.hypot(p.vx,p.vy);
  const tf=S.t-S.tRelease;
  // operator brakes after the free-bounce phase — and HARD once the first few bounces are done
  let brake = tf>cfg.brakeAt ? Math.min(14, 1+(tf-cfg.brakeAt)*2.6) : 1;
  if(S.bounceCount>=4) brake=Math.max(brake, 1+(S.bounceCount-3)*4);
  const recovery=allRidersGrounded();
  // Keep normal forces: heavy damping made the empty capsule drift instead of finish.
  const cd=cfg.damp*brake+cfg.qdrag*sp;
  const fdx=-cd*p.vx, fdy=-cd*p.vy;
  const ax=(fx+fdx)/S.mass, ay=(fy+fdy)/S.mass - GRAV;
  p.vx+=ax*dt; p.vy+=ay*dt;
  p.x+=p.vx*dt; p.y+=p.vy*dt;
  S.feltG = Math.hypot(fx+fdx, fy+fdy)/S.mass/GRAV;

  // ground collision for pod
  // free-flying seat tumbles
  if(S.snapped[0]&&S.snapped[1]){ S.podRot+=S.podVr*dt; }
  if(p.y<cfg.podR && p.vy<0){
    const impact=-p.vy;
    p.y=cfg.podR; p.vy=recovery?0:(impact>1.2 ? impact*0.28 : 0); p.vx=Math.sign(p.vx)*Math.max(0,Math.abs(p.vx)-0.48*impact);  // keep horizontal speed through a ground scrape
    S.podVr*=0.6;
    if(impact>4){
      panicSpectators();
      const spikeG=impact*0.9;
      S.feltG=Math.max(S.feltG,spikeG);
      S.shake=Math.max(S.shake,impact);
      SFX.thud(impact);
      if(impact>6) S.flash=Math.max(S.flash||0,0.35);
      groundDust(p.x); spawnChunks(p.x,Math.min(10,Math.round(impact))); spawnRing(p.x,1,Math.min(6,impact*0.5));
      crushSpectators(p.x, cfg.podR);   // a falling POD flattens a wide swath
      applyGDamage(spikeG);
      if(impact>6) addText(p.x,p.y+3,'💥 OOF!','#fff',20);
    }
  }
  // overload fray & cascade snap
  const ratio=Math.max(T[0],T[1])/S.Tmax;
  S.maxTensionRatio=Math.max(S.maxTensionRatio,ratio);
  if(ratio>1) S.fray=Math.min(1,S.fray+(ratio-1)*dt*2.5);
  if(S.fray>=1 || ratio>1.45) doSnap(T[0]>T[1]?0:1);
  S.maxG=Math.max(S.maxG,S.feltG);
  applyGDamage(S.feltG);   // per-substep so brief spikes still hurt
}

function tick(dt){
  const podX0=S.pod.x, podY0=S.pod.y;   // pod path start (for collision interpolation)
  computeView();
  S.t+=dt; S.ferris+=dt*0.25; S.bannerT+=dt;
  S.shake=Math.max(0,S.shake-dt*22);
  S.flash=Math.max(0,(S.flash||0)-dt*2.6);
  for(let i=0;i<2;i++) if(S.snapWave[i]>0) S.snapWave[i]=Math.max(0,S.snapWave[i]-dt*0.5);

  if(S.phase==='dragging'){
    const {fx,fy,T}=cordForce(S.pod.x,S.pod.y);
    S.tension=T;
    const ratio=Math.max(T[0],T[1])/S.Tmax;
    S.maxTensionRatio=Math.max(S.maxTensionRatio,ratio);
    if(ratio>1){
      S.fray=Math.min(1,S.fray+(ratio-1)*dt*1.6);
      if(Math.random()<dt*2) addText(S.pod.x+rnd(-3,3),S.pod.y+rnd(2,5),'crrrk...','#a52a2a',13);
      if(Math.random()<dt*5) SFX.creak(ratio);
      if(S.fray>=1 || ratio>1.7){ doSnap(T[0]>T[1]?0:1); dragging=false; release(); }
    }
    S.feltG=1;
    if(ratio>0.3 && ratio<=1 && Math.random()<dt*3) SFX.creak(ratio*0.7);
    const launchG=Math.hypot(fx,fy)/S.mass/GRAV;
    pushSeries(launchG, Math.max(T[0],T[1])/1000);
    for(const r of S.riders) r.face = ratio>0.5 ? 'scared' : 'happy';
    updateBanner('dragging');
  }
  else if(S.phase==='flying'){
    const capsuleDt=dt*(allRidersGrounded()&&S.snapped.every(Boolean)?4:1);
    const sub=Math.max(1,Math.ceil(capsuleDt/(1/240)));
    for(let i=0;i<sub;i++) physStep(capsuleDt/sub);
    pushSeries(S.feltG, Math.max(S.tension[0],S.tension[1])/1000);
    handleAccidents(dt);
    checkSettle(dt);
    S.prevVy=S.pod.vy;
  }
  else if(S.phase==='awaitBodies'){
    S.feltG=1;
    if(!S.riders.some(r=>r.mode==='flying')) finishRide();
  }
  else if(S.phase==='winch'){
    const p=S.pod, tx=0, ty=cfg.platformY;
    if(S.emptyRecovery){
      const recovery=S.emptyRecovery;
      recovery.elapsed=Math.min(recovery.duration,recovery.elapsed+dt);
      const u=recovery.elapsed/recovery.duration,ease=u*u*(3-2*u);
      const tangent=u*(1-u)*(1-u)*recovery.duration;
      p.x=lerp(recovery.x,tx,ease)+tangent*(recovery.vx||0);p.y=lerp(recovery.y,ty,ease)+tangent*(recovery.vy||0);
      const rate=6*u*(1-u)/recovery.duration;
      const tangentRate=(1-u)*(1-3*u);
      p.vx=(tx-recovery.x)*rate+tangentRate*(recovery.vx||0);p.vy=(ty-recovery.y)*rate+tangentRate*(recovery.vy||0);
      S.tension=cordForce(p.x,p.y).T;S.feltG=1;
      if(u>=1){p.vx=p.vy=0;finishRide();}
    }else{
    const d=dist(p.x,p.y,tx,ty), v=14*dt;
    if(d<v||d<0.1){ p.x=tx;p.y=ty;
      if(S.riders.some(r=>r.mode==='flying')) S.phase='awaitBodies';
      else finishRide();
    }
    else { p.x+=(tx-p.x)/d*14*dt; p.y+=(ty-p.y)/d*14*dt; }
    S.feltG=1; pushSeries(1, Math.max(S.tension[0],S.tension[1])/1000);
    }
  }
  else if(S.phase==='idle'||S.phase==='boarding'){
    S.feltG=1;
    stepBoarding(dt);
    if(S.phase==='idle'){     // harness bar clunks down once everyone is in
      S.barT=Math.min(1,S.barT+dt*3.2);
      if(S.barT>=1 && !S.barDone){ S.barDone=true; SFX.thud(2); addText(S.pod.x,S.pod.y+2.5,'*clunk*','#fff',12); }
    }
  }
  // pod motion trail
  if(S.phase==='flying'){
    const spd=Math.hypot(S.pod.vx,S.pod.vy);
    if(spd>8){ S.trail.push({x:S.pod.x,y:S.pod.y}); if(S.trail.length>16) S.trail.shift(); }
    else if(S.trail.length) S.trail.shift();
  } else if(S.trail.length) S.trail.shift();

  // riders sub-step at ~125 Hz so fast bodies can't tunnel through the pod between frames;
  // the pod's position is interpolated along its path through the frame
  {
    const n=Math.max(1,Math.ceil(dt/0.008));
    for(let i=0;i<n;i++){
      const f=(i+1)/n;
      stepRiders(dt/n, lerp(podX0,S.pod.x,f), lerp(podY0,S.pod.y,f),lerp(podX0,S.pod.x,i/n),lerp(podY0,S.pod.y,i/n));
    }
  }
  stepSpectators(dt);
  stepBalloons(dt);
  stepParticles(dt);
  stepAmbulance(dt);
  scoreInjuries();
}

/* -------- balloons drift up; flying bodies pop them -------- */
function stepBalloons(dt){
  for(const b of DECOR.balloons){
    if(b.popped){ if(S.t>b.popUntil){ b.popped=false; b.prog=-rnd(20,200); } continue; }
    b.prog+=dt*16;
    if(b.prog>SH+150) b.prog=-20;
    const bx=SW*b.f+Math.sin(S.t+b.ph)*14;
    const by=SH-b.prog+20;
    const wx=S2WX(bx), wy=S2WY(by);
    if(wy<1) continue;
    // popped by the pod, a flying body, or a stray limb
    let hit = Math.hypot(S.pod.x-wx,S.pod.y-wy) < podPxR()/VIEW.s+1.2;
    if(!hit) for(const r of scenePeople()){
      if(r.mode==='flying' && Math.hypot(r.x-wx,r.y-wy) < 16/VIEW.s+1.2){ hit=true; break; }
    }
    if(!hit) for(const p of S.particles){
      if(p.type==='limb' && !p.rest && Math.hypot(p.x-wx,p.y-wy)<2){ hit=true; break; }
    }
    if(hit)popBalloon(b);
  }
}

function pushSeries(g,kN){
  if(S.series.length && S.t-S.series[S.series.length-1].t<1/60)return;
  S.series.push({t:S.t,g,kN});
  while(S.series.length && S.series[0].t < S.t-12) S.series.shift();
}

/* -------- accidents -------- */
function handleAccidents(dt){
  const tf=S.t-S.tRelease, plan=S.plan;
  // planned rope snap (under launch load)
  if(plan.snap && tf>plan.snapT && !S.snapped[plan.snapSide]) doSnap(plan.snapSide);
  // shock-load cascade: the second rope gives up
  if(S.secondSnapAt && S.t>=S.secondSnapAt) doSnap(S.snapped[0]?1:0);
  // track velocity peak & direction reversals (bounces)
  const sp=Math.hypot(S.pod.vx,S.pod.vy);
  if(sp>S.peakSp){ S.peakSp=sp; S.peakVx=S.pod.vx; S.peakVy=S.pod.vy; }
  const vxs=Math.abs(S.pod.vx)>2 ? Math.sign(S.pod.vx) : 0;
  if(vxs!==0 && S.prevVxSign!==0 && vxs!==S.prevVxSign) S.bounceCount++;
  if(vxs!==0) S.prevVxSign=vxs;
  // NO SEATBELTS: bodies stay pressed into the seat while accelerating —
  // they fly off the moment the seat starts moving BACKWARDS, carrying their peak speed
  const reversing = (S.pod.vx*S.peakVx + S.pod.vy*S.peakVy) < 0 || S.bounceCount>=1;
  if(!S.belts && !S.ejected && tf>0.1 && S.peakSp>4 && reversing){
    S.ejected=true;
    const loose=S.riders.filter(r=>r.mode==='seated');
    loose.forEach((r,i)=> S.ejectQueue.push({rider:r, at:S.t+i*0.09}));
    updateBanner('ejected');
  }
  // staggered ejections so each rider visibly flies off
  for(let i=S.ejectQueue.length-1;i>=0;i--){
    if(S.t>=S.ejectQueue[i].at){
      const r=S.ejectQueue[i].rider;
      if(r.mode==='seated') ejectRiders([r]);
      S.ejectQueue.splice(i,1);
    }
  }
  // belt failure accident: one belt pops on the 2nd bounce
  if(S.belts && plan.beltFail && !plan.beltDone && S.bounceCount>=2){
    plan.beltDone=true;
    const v=S.riders[plan.victim];
    if(v && v.mode==='seated'){
      addText(S.pod.x,S.pod.y+3,'*click* 😨','#fff',18);
      ejectRiders([v]);
      updateBanner('beltfail');
    }
  }
}

function ejectRiders(list){
  if(list.length) panicSpectators();
  const n=S.riders.length;
  for(const r of list){
    r.mode='flying';
    r.x=S.pod.x+(r.seat-(n-1)/2)*1.2;
    r.y=S.pod.y+1.2;
    // they keep the speed they had when the seat stopped pushing them (peak), not the pod's current speed
    const bvx = S.pod.vx;
    const bvy = S.pod.vy;
    r.vx=bvx+rnd(-1,1);
    r.vy=bvy+rnd(.5,1.5);   // launched up & onward off the reversing pod
    r.rot=0; r.vr=-Math.sign(r.vx||1)*rnd(4,10);      // tumbling front-flips
    r.face='scared';
    r.ejT=S.t;
    r.scream=pick(SCREAMS);   // one label that follows them through the air
    r.status='Ejected from capsule';
  }
  S.mass=cfg.baseMass+cfg.riderMass*S.riders.filter(r=>r.mode==='seated').length;
}

function riderHealthy(r){
  return Math.max(r.dmg.head,r.dmg.neck,r.dmg.torso,r.dmg.arms,r.dmg.legs)<2
    && r.face!=='ko' && r.face!=='dead';
}

/* -------- G damage to seated riders -------- */
function shedLimb(r,kind){
  panicSpectators();
  // a limb tears loose and is flung out of the pod at speed
  S.particles.push({type:'limb',kind,shirt:r.shirt,skin:r.skin,hairC:r.hairC,trousers:r.trousers,x:S.pod.x+rnd(-1,1),y:S.pod.y+1,
    vx:S.pod.vx*1.1+rnd(-4,4), vy:S.pod.vy*1.1+rnd(2,8), rot:rnd(0,TAU), vr:rnd(-14,14), life:99, rest:false});
  spawnBlood(S.pod.x,S.pod.y+1.5,4);
}
function applyGDamage(g){
  if(S.phase!=='flying') return;
  for(const r of S.riders){
    if(r.mode!=='seated') continue;
    if(g>r.tol*3 && r.face!=='dead'){
      r.dmg.neck=3; r.dmg.torso=3; r.dmg.arms=3; r.dmg.legs=3;
      shedLimb(r,'arm'); shedLimb(r,'arm'); shedLimb(r,'leg'); shedLimb(r,'leg');
      addText(S.pod.x,S.pod.y+6,'LIMBS EVERYWHERE!!','#ff2222',18);
      r.face='dead';
      r.status='Fatal injuries at '+g.toFixed(0)+' g.';
      spawnBlood(S.pod.x,S.pod.y+2,14);
      SFX.splat();
      addText(S.pod.x,S.pod.y+4,'SQUISH.','#ff2222',20);
    } else if(g>r.tol*1.35 && r.dmg.torso<2){
      r.dmg.neck=2; r.dmg.torso=2; r.dmg.arms=Math.max(r.dmg.arms,1);
      if(Math.random()<0.5 && r.dmg.arms<3){   // sometimes an arm just leaves
        r.dmg.arms=3; shedLimb(r,'arm');
        addText(S.pod.x,S.pod.y+6,'AN ARM FLEW OFF!!','#ff4444',16);
      }
      r.face='ko';
      r.status='Unconscious. Severe spinal injuries.';
      spawnBlood(S.pod.x,S.pod.y+2,6);
      addText(S.pod.x,S.pod.y+4,'CRUNCH.','#ff4444',18);
    } else if(g>r.tol && r.dmg.neck<2){
      r.dmg.neck=2; r.face='pain';
      if(Math.random()<0.2 && r.dmg.arms<3){
        r.dmg.arms=3; shedLimb(r,'arm');
        addText(S.pod.x,S.pod.y+6,'THERE GOES AN ARM!','#ff4444',15);
      }
      r.status='Neck injury at '+g.toFixed(0)+' g.';
      spawnBlood(S.pod.x,S.pod.y+2,3);
      SFX.crack();
      addText(S.pod.x,S.pod.y+4,'*CRACK*','#ff4444',16);
    } else if(g>r.tol*0.78 && r.dmg.neck<1){
      r.dmg.neck=1; r.face='pain';
      r.status='Whiplash. Neck strain reported.';
      addText(S.pod.x,S.pod.y+4,'MY NECK!','#ffdddd',14);
    }
  }
}

/* -------- flying / landed riders -------- */
function stepRiders(dt,podX,podY,podStartX,podStartY){
  if(podX===undefined){ podX=S.pod.x; podY=S.pod.y; }
  for(const r of scenePeople()){
    r.armWave+=dt*(r.mode==='flying'?16:6);   // panic flailing is FAST
    if(r.mode!=='flying') continue;
    r.stepX=r.x;r.stepY=r.y;
    const gravity=GRAV*(r.spectator?cfg.spectatorGravityScale:1);
    r.vy-=gravity*dt;
    // Quadratic aerodynamic drag: small at low speed, increasing toward terminal speed.
    const airDrag=gravity/(cfg.riderTerminalSpeed**2)*Math.hypot(r.vx,r.vy);
    const airFactor=1/(1+airDrag*dt);
    r.vx*=airFactor; r.vy*=airFactor;
    // parachute: healthy riders pull the cord once they're falling
    if(r.chuteOpen){
      r.chuteInflation=Math.min(1,(r.chuteInflation||0)+dt/0.85);
      // Quadratic drag converges to a 5.5 m/s terminal descent as the canopy inflates.
      const cd=GRAV/(5.5*5.5)*r.chuteInflation;
      r.vy/=1+cd*Math.abs(r.vy)*dt;
      r.vx-=r.vx*Math.min(1,1.5*dt);
      r.rot+=(0-r.rot)*Math.min(1,5*dt); r.vr=0;
    } else if(r.hasChute && !r.chuteTorn && r.vy<-3 && r.y>8 && r.face!=='dead'){
      // auto-deploys even for the unconscious/injured — they just can't enjoy it
      r.chuteOpen=true;
      if(riderHealthy(r)){ r.face='happy'; r.scream=null; }
      else { r.scream=null; }   // injured riders dangle limply, no triumphant cheer
      addText(r.x,r.y+3,riderHealthy(r)?'🪂 WHOOSH!':'🪂 auto-deploy','#fff',14);
      SFX.chute();
    }
    // injured bodies bleed a trail through the air
    {
      const worst=Math.max(r.dmg.head,r.dmg.neck,r.dmg.torso,r.dmg.arms,r.dmg.legs);
      if(worst>=2 && Math.random()<dt*10)
        S.particles.push({type:'blood',x:r.x,y:r.y-0.5,vx:r.vx*0.15+rnd(-1,1),vy:rnd(-2,0),life:3,rot:0,vr:0,r:rnd(.04,.12)});
    }
    r.x+=r.vx*dt; r.y+=r.vy*dt; r.rot+=r.vr*dt;
    if(Math.hypot(r.vx,r.vy)>8 && Math.random()<dt*30)
      S.particles.push({type:'dust',x:r.x,y:r.y,vx:0,vy:0,life:0.35,rot:0,vr:0});
    // ground contact
    if(r.y<=0.5){
      r.groundContact=true;
      r.y=0.5;
      if(r.chuteOpen){        // gentle touchdown
        r.vy=0; r.vx=0; r.rot=0; r.vr=0;
        r.mode='landed'; r.chuteOpen=false; r.chuteLanded=true;
        if(riderHealthy(r)){
          r.face='happy'; r.status='Landed safely by parachute.';
          addText(r.x,2,'STUCK THE LANDING!','#fff',14);
        } else {
          r.status='Parachute landing. Injuries remain.';
          addText(r.x,2,'rough but breathing','#ffdddd',13);
        }
        groundDust(r.x);
      } else if(r.vy<-4){     // hard impact: damage + bounce, spin bleeds off
        const v=Math.hypot(r.vx,r.vy);
        crushSpectators(r.x,crushRadius(r));   // anyone underneath has a bad day
        landingDamage(r,v);
        r.vy=-r.vy*0.25; r.vx*=0.6; r.vr*=0.45;
        S.shake=Math.max(S.shake,Math.min(v*0.5,8));
      } else {                // skidding along the ground in a dust cloud
        r.vy=0;
        r.vx-=r.vx*Math.min(1,3.5*dt);
        const lay=Math.PI/2*(Math.sin(r.rot)>=0?1:-1);
        r.rot+=(lay-r.rot)*Math.min(1,dt*7); r.vr=0;
        if(Math.abs(r.vx)>3 && Math.random()<dt*22)
          S.particles.push({type:'dust',x:r.x,y:0.4,vx:0,vy:rnd(0.5,2),life:0.4,rot:0,vr:0});
        if(Math.abs(r.vx)<0.4){
          r.mode='landed'; r.vx=0; r.rot=lay;
          if(!r.landLvl) landingDamage(r,3);
        }
      }
    }
  }
  collideRiders(podX,podY,dt,podStartX??podX,podStartY??podY);
}

/* -------- mid-air collisions: rider↔rider and rider↔pod -------- */
function collideRiders(podX,podY,dt=0,podStartX=podX,podStartY=podY){
  if(podX===undefined){ podX=S.pod.x; podY=S.pod.y; }
  const fly=scenePeople().filter(r=>r.mode==='flying');
  // collision sizes match what's DRAWN (pod renders at a minimum pixel size when zoomed out)
  const drawnPodR=podPxR()/VIEW.s;
  const minD=drawnPodR+RIDER_SCENE_SCALE/VIEW.s;
  const rTh=1.3;
  // rider vs rider
  for(let i=0;i<fly.length;i++) for(let j=i+1;j<fly.length;j++){
    const a=fly[i], b=fly[j];
    const dx=b.x-a.x, dy=b.y-a.y, d=Math.hypot(dx,dy)||0.001;
    if(d<rTh){
      const nx=dx===0&&dy===0?1:dx/d, ny=dy/d;
      const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
      if(rel<0){
        const k=(1+0.75)/2*(-rel);   // equal masses, restitution 0.75
        a.vx-=nx*k; a.vy-=ny*k;
        b.vx+=nx*k; b.vy+=ny*k;
        a.vr=rnd(-10,10); b.vr=rnd(-10,10);
        const push=(rTh-d)/2;
        a.x-=nx*push; a.y=Math.max(0.5,a.y-ny*push);
        b.x+=nx*push; b.y=Math.max(0.5,b.y+ny*push);
        if(-rel>4){ addText((a.x+b.x)/2,(a.y+b.y)/2+1.2,'BONK!','#fff',16); SFX.thud(-rel*0.5); }
      }
    }
  }
  // rider vs the ride itself
  for(const r of fly){
    if(!r.spectator&&S.t-(r.ejT||0) < 0.35) continue; // capsule ejections only, never mouse throws
    let dx=r.x-podX,dy=r.y-podY,d=Math.hypot(dx,dy)||0.001;
    let contact=d<minD;
    if(dt>0&&Number.isFinite(r.stepX)){
      const sx=r.stepX-podStartX,sy=r.stepY-podStartY,mx=dx-sx,my=dy-sy;
      const a=mx*mx+my*my,b=2*(sx*mx+sy*my),c=sx*sx+sy*sy-minD*minD;
      const disc=b*b-4*a*c;
      if(c>=0&&a>1e-12&&disc>=0){
        const t=(-b-Math.sqrt(disc))/(2*a);
        if(t>=0&&t<=1){dx=sx+mx*t;dy=sy+my*t;d=Math.hypot(dx,dy)||.001;contact=true;}
      }
    }
    if(contact){
      const nx=dx===0&&dy===0?1:dx/d, ny=dy/d;
      const rel=(r.vx-S.pod.vx)*nx+(r.vy-S.pod.vy)*ny;
      if(rel<0){
        S.hits=(S.hits||0)+1;
        if(r.spectator&&r.flung&&!r.capsuleBonus&&-rel>4&&Math.hypot(S.pod.vx,S.pod.vy)>4){
          r.capsuleBonus=true;addScore(500);addText(r.x,r.y+4,'MOVING TARGET +500','#ffd23f',18);
        }
        if(r.chuteOpen||(r.hasChute&&!r.chuteTorn)){   // hit the pod? chute's gone. All bets off.
          r.chuteOpen=false; r.chuteTorn=true;
          addText(r.x,r.y+2.5,'CHUTE SHREDDED!!','#ff4444',16);
          r.face='scared'; r.scream=pick(SCREAMS);
        }
        const k=(1+0.45)*(-rel)/(1+cfg.riderMass/S.mass);      // pod is far heavier — rider takes the bounce
        r.vx+=nx*k; r.vy+=ny*k;
        r.vr=rnd(-12,12);
        r.x=podX+nx*minD; r.y=Math.max(0.5,podY+ny*minD);
        S.pod.vx-=nx*k*cfg.riderMass/S.mass; S.pod.vy-=ny*k*cfg.riderMass/S.mass;   // pod shudders from the hit
        // The grounded cage is also a resting surface. Do not keep a supported
        // body in endless tiny bounces waiting for contact with the terrain.
        if(podY<=cfg.podR+.1&&-rel<2&&Math.hypot(S.pod.vx,S.pod.vy)<1){
          r.mode='landed';r.vx=r.vy=r.vr=0;r.rot=Math.PI/2;landingDamage(r,1);
        }
        const hitV=-rel;
        if(hitV>10){
          landingDamage(r,hitV*0.8);
          addText(r.x,r.y+1.5,'CLANG!!','#ffd23f',18);
          S.shake=Math.max(S.shake,6);
        } else if(hitV>4) addText(r.x,r.y+1.5,'BONK!','#fff',15);
        SFX.thud(hitV*0.6);
      }
    }
  }
}

const pick=a=>a[Math.floor(Math.random()*a.length)];
function landingDamage(r,v){
  groundDust(r.x);
  const lvl = v>19?5 : v>13?4 : v>9?3 : v>5?2 : 1;
  if(lvl <= (r.landLvl||0)) return;   // later soft bounces can't downgrade injuries
  r.landLvl=lvl;
  if(lvl>=4) S.flash=Math.max(S.flash||0,0.5);
  if(lvl===5){
    r.dmg.head=3; r.dmg.neck=3; r.dmg.legs=3; r.dmg.arms=3; r.dmg.torso=2;
    r.face='dead';
    r.status='Fatal impact at '+v.toFixed(0)+' m/s.';
    spawnBlood(r.x,r.y,30); detachLimbs(r);
    SFX.splat();
    addText(r.x,r.y+2,'KER-SPLAT.','#ff2222',24);
  } else if(lvl===4){
    r.dmg.legs=3; r.dmg.arms=3; r.dmg.neck=2; r.dmg.torso=2;
    r.face='dead';
    r.status='Fatal impact. Multiple severe injuries.';
    spawnBlood(r.x,r.y,18); detachLimbs(r);
    SFX.splat();
    addText(r.x,r.y+2,'SPLAT.','#ff2222',22);
  } else if(lvl===3){
    spawnChunks(r.x,5); spawnRing(r.x,0.8,3.5);
    r.dmg.legs=2; r.dmg.arms=2; r.dmg.neck=2; r.dmg.torso=1;
    r.face='ko';
    r.status='Unconscious. Multiple fractures.';
    spawnBlood(r.x,r.y,8); detachLimbs(r);
    SFX.crack(); SFX.thud(v);
    addText(r.x,r.y+2,'CRRRUNCH!','#ff4444',19);
  } else if(lvl===2){
    r.dmg.legs=2; r.dmg.arms=1; r.dmg.neck=1;
    r.face='pain';
    r.status='Leg fractures and whiplash.';
    spawnBlood(r.x,r.y,4);
    SFX.thud(v);
    addText(r.x,r.y+2,'OOF!!','#fff',16);
  } else {
    r.dmg.legs=Math.max(r.dmg.legs,1);
    r.face='dizzy';
    r.status='Bruised, but conscious.';
    addText(r.x,r.y+2,'oof.','#fff',13);
  }
}

function detachLimbs(r){
  const kinds=[];
  if(r.dmg.legs===3) kinds.push('leg','leg');
  if(r.dmg.arms===3) kinds.push('arm','arm');
  if(r.dmg.head===3) kinds.push('head');
  for(const kind of kinds){
    S.particles.push({type:'limb',kind,shirt:r.shirt,skin:r.skin,hairC:r.hairC,trousers:r.trousers,x:r.x+rnd(-1,1),y:r.y+1,
      vx:rnd(-7,7),vy:rnd(4,11),rot:rnd(0,TAU),vr:rnd(-12,12),life:99,rest:false});
  }
}

/* -------- settle & finish -------- */
function checkSettle(dt){
  if(S.belts&&S.snapped.every(v=>!v)&&S.riders.every(r=>r.mode==='seated')&&S.t-S.tRelease>=8){
    S.emptyRecovery={x:S.pod.x,y:S.pod.y,vx:S.pod.vx,vy:S.pod.vy,elapsed:0,duration:2};
    S.phase='winch';updateBanner('winch');return;
  }
  if(allRidersGrounded() && (!S.snapped[0]||!S.snapped[1])){
    S.emptyRecovery={x:S.pod.x,y:S.pod.y,elapsed:0,duration:1.4};
    S.phase='winch';updateBanner('winch');return;
  }
  const sp=Math.hypot(S.pod.vx,S.pod.vy);
  const calm = sp<1.6 && S.feltG>0.5 && S.feltG<1.5;
  const grounded = S.pod.y<=cfg.podR+0.05 && sp<1.6;
  if(calm||grounded) S.settleTimer+=dt; else S.settleTimer=0;
  const airborne=S.riders.some(r=>r.mode==='flying');
  if(S.settleTimer>(allRidersGrounded()?0.25:0.9) && !airborne){
    if(S.snapped[0]||S.snapped[1]||grounded) finishRide();
    else { S.phase='winch'; updateBanner('winch'); }
  }
}

function finishRide(){
  S.phase='done';
  if(S.resultDone) return;
  S.resultDone=true;
  let injured=0, dead=0;
  for(const r of S.riders){
    const worst=Math.max(r.dmg.head,r.dmg.neck,r.dmg.torso,r.dmg.arms,r.dmg.legs);
    if(r.face==='dead'||r.dmg.head===3) dead++;
    else if(worst>=1) injured++;
    else if(r.chuteLanded){ if(riderHealthy(r)){ r.face='happy'; } else { injured++; } }   // chute landers: glory if whole, ER if not
    else if(S.snapped[0]||S.snapped[1]){ r.face='dizzy'; r.status='Survived the cord failure. Recovering.'; injured++; }
    else { r.face='happy'; r.status='Uninjured. Already asking to go again.'; }
  }
  if(S.crushed) injured+=S.crushed;   // bystanders count too
  if(dead||injured){
    updateBanner(dead?'carnage':'injured');
  } else {
    spawnConfetti(); fireworks();
    SFX.cheer();
    updateBanner('happy');
  }
  if(S.crushed) S.bannerSub=S.crushed+' bystander'+(S.crushed>1?'s':'')+' struck. Emergency response is underway.';
  setControlsEnabled(true);
}

/* ============================ PARTICLES & TEXT ============================ */
function addText(x,y,str,color,size){
  const wording={
    '*hup*':'Boarded','*clunk*':'Restraints secured','*click* 😨':'Restraint released',
    '💥 SNAP!!':'Cord snapped','TOTAL SEPARATION!!':'Capsule released','💥 OOF!':'Ground impact',
    'crrrk...':'Cord strain','POP! 🎈':'Balloon popped','LIMBS EVERYWHERE!!':'Critical injuries',
    'SQUISH.':'Severe impact','AN ARM FLEW OFF!!':'Arm injury','THERE GOES AN ARM!':'Arm injury',
    'CRUNCH.':'Severe strain','*CRACK*':'Injury reported','MY NECK!':'Neck strain',
    '🪂 WHOOSH!':'Parachute deployed','🪂 auto-deploy':'Automatic deployment',
    'STUCK THE LANDING!':'Safe landing','rough but breathing':'Landed · needs assistance',
    'BONK!':'Collision','CLANG!!':'Capsule collision','CHUTE SHREDDED!!':'Parachute damaged',
    'KER-SPLAT.':'Fatal impact','SPLAT.':'Severe impact','CRRRUNCH!':'Hard landing',
    'OOF!!':'Hard landing','oof.':'Touchdown','WEE-OO WEE-OO 🚨':'Rescue crew arrived','🚑 off to the ER!':'Transporting injured riders',
    'SQUISH!':'Bystander struck','CRUNCH!':'Bystander struck','OH NO.':'Bystander struck','☠️':'Bystander struck',
  };
  str=wording[str]||str.replace(/ BYSTANDERS DOWN!!/,' bystanders struck');
  if(S.texts.some(t=>t.str===str&&t.life>1))return;
  S.texts.push({x,y,str,color,size:12,life:1.8});
  if(S.texts.length>5)S.texts.shift();
}
function spawnRing(x,y,maxR){ S.particles.push({type:'ring',x,y,r:0.4,maxR,life:0.45,t0:0.45,vx:0,vy:0,rot:0,vr:0}); }
function spawnChunks(x,n){
  for(let i=0;i<n;i++) S.particles.push({type:'chunk',x:x+rnd(-1,1),y:0.4,vx:rnd(-7,7),vy:rnd(3,10),rot:rnd(0,TAU),vr:rnd(-12,12),life:rnd(.5,1)});
}
function spawnBlood(x,y,n){
  for(let i=0;i<n;i++) S.particles.push({type:'blood',x,y:y+rnd(0,1),vx:rnd(-7,7),vy:rnd(1,10),life:3,rot:0,vr:0,r:rnd(.045,.18)});
}
function groundDust(x){
  for(let i=0;i<8;i++) S.particles.push({type:'dust',x:x+rnd(-2,2),y:0.3,vx:rnd(-4,4),vy:rnd(1,4),life:rnd(.4,.9),rot:0,vr:0});
}
function spawnConfetti(){
  for(let i=0;i<130;i++) S.particles.push({type:'confetti',x:rnd(-0.6,0.6)*S.H,y:S.H*rnd(1.2,2),
    vx:rnd(-2,2),vy:rnd(-3,-1),life:rnd(3,6),rot:rnd(0,TAU),vr:rnd(-6,6),
    color:['#ffd23f','#d8403f','#3d7bd9','#3fae5a','#b65fd0'][i%5]});
}
function stepParticles(dt){
  for(let i=S.particles.length-1;i>=0;i--){
    const p=S.particles[i];
    if(p.type==='ring'){ p.r+=(p.maxR/p.t0)*dt; p.life-=dt; }
    else if(p.type==='chunk'){ p.vy-=GRAV*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.rot+=p.vr*dt; p.life-=dt; if(p.y<0.1)p.life=0; }
    else if(p.type==='confetti'){ p.vy=Math.max(p.vy-GRAV*dt*0.1,-2.5); p.x+=p.vx*dt+Math.sin(S.t*4+i)*dt*2; p.y+=p.vy*dt; p.rot+=p.vr*dt; p.life-=dt; }
    else if(p.type==='limb'){
      if(!p.rest){ p.vy-=GRAV*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.rot+=p.vr*dt;
        if(p.y<0.3&&p.vy<0){
          crushSpectators(p.x, p.kind==='head'?0.8:0.6);   // even a stray limb can take someone out
          if(Math.abs(p.vy)>3){p.vy=-p.vy*0.3;p.vx*=0.5;spawnBlood(p.x,0.4,2);} else {p.rest=true;p.y=0.3;S.stains.push({x:p.x,y:0.15,r:rnd(0.5,1)});} } }
    }
    else { p.vy-=(p.type==='dust'?2:GRAV)*dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt;
      if(p.type==='blood' && p.y<=0.12){ if(S.stains.length<140) S.stains.push({x:p.x,y:0.1,r:p.r*rnd(2,4),born:S.t,seed:p.x*17+p.vx}); S.particles.splice(i,1); continue; } }
    if(p.life<=0 && p.type!=='limb') S.particles.splice(i,1);
  }
  for(let i=S.texts.length-1;i>=0;i--){ const t=S.texts[i]; t.y+=dt*3; t.life-=dt; if(t.life<=0) S.texts.splice(i,1); }
}

function stepAmbulance(dt){
  const patients=scenePeople().concat(S.casualties);
  for(const r of patients){
    const hurt=r.face==='dead'||Object.values(r.dmg).some(v=>v>0);
    if(r.rescueAssigned||!hurt||!(r.mode==='landed'||(r.mode==='seated'&&S.phase==='done')))continue;
    r.rescueAssigned=true;
    const targetX=clamp(r.mode==='seated'?S.pod.x:r.x,S2WX(40),S2WX(SW-40));
    S.ambulances.push({x:S2WX(SW+100)+S.ambulances.length*40,phase:'in',timer:0,targetX,patient:r});
    SFX.siren();
  }
  for(const a of S.ambulances){
  if(a.phase==='in'){ a.x=Math.max(a.targetX+7,a.x-102*dt); if(a.x<=a.targetX+7){a.phase='wait';a.timer=0; addText(a.x,4,'WEE-OO WEE-OO 🚨','#fff',15);} }
  else if(a.phase==='wait'){
    if(a.patient.mode==='held'||a.patient.mode==='flying'){a.timer=0;continue;}
    const targetX=clamp(a.patient.mode==='seated'?S.pod.x:a.patient.x,S2WX(40),S2WX(SW-40));
    if(Math.abs(targetX-a.targetX)>2){a.targetX=targetX;a.phase='relocate';continue;}
    a.timer+=dt;
    if(a.timer>1.6){
      a.phase='out';
      a.patient.mode='taken';
      addText(a.x,5,'🚑 off to the ER!','#fff',14);
    }
  }
  else if(a.phase==='relocate'){
    const dx=a.targetX+7-a.x;a.direction=Math.sign(dx);
    a.x+=clamp(dx,-102*dt,102*dt);if(Math.abs(dx)<.1){a.phase='wait';a.timer=0;}
  }
  else if(a.phase==='out')a.x+=120*dt;
  }
  S.ambulances=S.ambulances.filter(a=>!(a.phase==='out'&&W2SX(a.x)>SW+120));
  S.ambulance=S.ambulances[0]||null;
}

/* ============================ BANNER & STATS ============================ */
function updateBanner(kind){
  const B={
    boarding:['Riders boarding','Setting the stage for a questionable decision.'],
    idle:['Ready when you are','Drag the capsule to aim. Release to launch.'],
    dragging:['Set your launch','Pull either way. Keep an eye on cord tension.'],
    flying:['Ride in progress','Watch your speed, altitude, and G-force.'],
    snap:['Cord failure','One cord has failed. The ride continues on the other.'],
    doubleSnap:['Both cords have failed','The capsule is in free flight.'],
    ejected:['Riders ejected','Unsecured riders have left the capsule.'],
    beltfail:['Restraint failure','A seatbelt has released during the ride.'],
    winch:['Returning to the platform','The winch is bringing the capsule home.'],
    happy:['Everyone made it back','Management calls that a successful test. Reset to ride again.'],
    injured:['Ride complete · injuries reported','The rescue crew is on its way.'],
    carnage:['Ride complete · fatal injuries','Emergency response is underway.'],
  }[kind]||['',''];
  S.bannerKind=kind;

  if(S.banner!==B[0])S.bannerT=0; S.banner=B[0]; S.bannerSub=B[1];
}

function updateStats(){
  const Tw=Math.max(S.tension[0],S.tension[1]);
  ui.tensionV.textContent=(Tw/1000).toFixed(1)+' kN';
  ui.tensionV.style.color = Tw>S.Tmax ? '#c00' : '';
  ui.tensionBar.style.width=clamp(Tw/(S.Tmax*1.5)*100,0,100)+'%';
  const pull=S.phase==='dragging'?dist(S.pod.x,S.pod.y,0,cfg.platformY):0;
  ui.pullV.textContent=pull.toFixed(1)+' m';
  if(S.phase==='dragging'){
    const {fx,fy}=cordForce(S.pod.x,S.pod.y);
    ui.predGV.textContent=(Math.hypot(fx,fy)/S.mass/GRAV).toFixed(1)+' g';
    ui.riskV.textContent=Math.round(riskEstimate(S.maxTensionRatio)*100)+'%';
  } else if(S.phase==='idle'){ ui.predGV.textContent='—'; ui.riskV.textContent=Math.round(riskEstimate(0)*100)+'%'; }
  ui.liveGV.textContent=S.feltG.toFixed(1)+' g';
  ui.maxGV.textContent=S.maxG.toFixed(1)+' g';
  ui.maxGV.style.color=S.maxG>9?'#c00':'';
  ui.ropeV.textContent=Math.round((1-S.fray)*100)+'%';
  ui.ropeBar.style.width=((1-S.fray)*100)+'%';
  const status=S.banner+(S.bannerSub?' — '+S.bannerSub:'');
  if(ui.statusLine.textContent!==status)ui.statusLine.textContent=status;
}

/* ============================ SCENE DRAWING ============================ */
function drawScene(){
  const c=sctx, cw=SW, ch=SH;
  const sky=c.createLinearGradient(0,0,0,ch);
  sky.addColorStop(0,'#2f86dd'); sky.addColorStop(0.45,'#5fb3ef');
  sky.addColorStop(0.8,'#b8d0d2'); sky.addColorStop(1,'#f2e4c9');
  c.fillStyle=sky; c.fillRect(0,0,cw,ch);
  c.save();
  if(S.shake>0.2) c.translate(Math.sin(S.t*137)*Math.min(S.shake,14)*0.5, Math.cos(S.t*113)*Math.min(S.shake,14)*0.5);
  drawBackground(c);
  drawGround(c);
  drawTowersAndCords(c);
  drawTrail(c);
  drawBoarders(c);
  drawPod(c);
  drawFlyingRiders(c);
  drawParticles(c);
  drawTexts(c);
  for(const a of S.ambulances)drawAmbulance(c,a);
  if(S.phase==='idle') drawHint(c);
  c.restore();
  drawVignette(c);
  drawSceneDetails(c);
  if(S.phase==='dragging' && previewOn) drawPrediction(c);
  drawBanner(c,cw);
  
}

function drawVignette(c){
  const cw=SW, ch=SH;
  const g=c.createRadialGradient(cw/2,ch*0.45,ch*0.45,cw/2,ch*0.5,ch*0.98);
  g.addColorStop(0,'rgba(0,0,0,0)'); g.addColorStop(1,'rgba(18,28,58,.26)');
  c.fillStyle=g; c.fillRect(0,0,cw,ch);
  // warm sunlight grade washing in from the top-right
  const w=c.createLinearGradient(cw,0,cw*0.3,ch);
  w.addColorStop(0,'rgba(255,214,120,.12)'); w.addColorStop(0.55,'rgba(255,214,120,0)');
  c.fillStyle=w; c.fillRect(0,0,cw,ch);
  // impact flash
  if(S.flash>0.01){
    c.fillStyle='rgba(255,255,255,'+(Math.min(S.flash,1)*0.55).toFixed(3)+')';
    c.fillRect(0,0,cw,ch);
  }
}



/* compact telemetry overlay for mobile (replaces the side panel) */
const MQ_MOBILE = (typeof matchMedia!=='undefined') ? matchMedia('(max-width:1100px)') : null;
function drawTelemetryOverlay(c){
  const Tw=Math.max(S.tension[0],S.tension[1]);
  const risk=riskEstimate(S.phase==='dragging'?S.maxTensionRatio:0);
  const rows=[
    ['TENSION',(Tw/1000).toFixed(1)+'kN '+Math.round(Tw/S.Tmax*100)+'%', Tw>S.Tmax?'#ff5050':'#fff'],
    ['LIVE G', S.feltG.toFixed(1)+'g', '#ffb02e'],
    ['MAX G',  S.maxG.toFixed(1)+'g', S.maxG>9?'#ff5050':'#fff'],
    ['RISK',   Math.round(risk*100)+'%', risk>0.3?'#ff5050':'#fff'],
    ['ROPE',   Math.round((1-S.fray)*100)+'%', S.fray>0.4?'#ff5050':'#9fe87a'],
  ];
  const pw=255, lh=34, ph=rows.length*lh+22, x0=10, y0=SH-ph-10;
  c.fillStyle='rgba(21,32,58,.78)';
  c.beginPath(); c.roundRect(x0,y0,pw,ph,12); c.fill();
  c.strokeStyle='rgba(255,255,255,.3)'; c.lineWidth=2; c.stroke();
  c.font='bold 23px sans-serif';
  rows.forEach((r,i)=>{
    const y=y0+34+i*lh;
    c.textAlign='left';  c.fillStyle='#8ea4cc'; c.fillText(r[0],x0+14,y);
    c.textAlign='right'; c.fillStyle=r[2];      c.fillText(r[1],x0+pw-14,y);
  });
  c.textAlign='left';
}

/* -------- static backdrop (mountains, coaster, hills, trees, tent, fence) cached once -------- */
const BG=document.createElement('canvas');
let BGdone=false;
function buildBackdrop(){
  BGdone=true;
  BG.width=SW*DPR; BG.height=SH*DPR;
  const c=BG.getContext('2d'); c.setTransform(DPR,0,0,DPR,0,0);
  const gy=SH-22;   // ground line is fixed in screen space
  // warm haze hugging the horizon
  const hz=c.createLinearGradient(0,gy-160,0,gy);
  hz.addColorStop(0,'rgba(255,244,214,0)'); hz.addColorStop(1,'rgba(255,238,205,.6)');
  c.fillStyle=hz; c.fillRect(0,gy-160,SW,160);
  // far mountain ridge — cool & hazy, with snow caps
  c.fillStyle='rgba(148,186,224,.55)';
  const ridge=[[0,-46],[80,-92],[180,-58],[300,-108],[430,-64],[560,-122],[700,-70],[820,-104],[960,-56]];
  c.beginPath(); c.moveTo(0,gy);
  for(const pt of ridge) c.lineTo(pt[0],gy+pt[1]);
  c.lineTo(SW,gy); c.closePath(); c.fill();
  c.fillStyle='rgba(255,255,255,.5)';
  for(const pt of ridge){ if(pt[1]<-90){
    c.beginPath(); c.moveTo(pt[0]-15,gy+pt[1]+17); c.lineTo(pt[0],gy+pt[1]); c.lineTo(pt[0]+15,gy+pt[1]+17);
    c.quadraticCurveTo(pt[0],gy+pt[1]+10,pt[0]-15,gy+pt[1]+17); c.fill();
  }}
  // distant roller-coaster silhouette
  const cx0=600, cy0=gy-2;
  const hump=x=>{ const b=(cx,h,w)=>h*Math.exp(-((x-cx)*(x-cx))/(2*w*w));
    return Math.max(b(cx0-110,118,26),b(cx0-28,82,24),b(cx0+52,56,22)); };
  c.strokeStyle='rgba(108,138,178,.85)'; c.lineWidth=2.5; c.beginPath();
  for(let x=cx0-170;x<=cx0+110;x+=4){ const y=cy0-hump(x); x===cx0-170?c.moveTo(x,y):c.lineTo(x,y); }
  c.stroke();
  c.lineWidth=1.2; c.strokeStyle='rgba(108,138,178,.6)';
  for(let x=cx0-160;x<=cx0+104;x+=13){
    const h=hump(x); if(h>10){
      c.beginPath(); c.moveTo(x,cy0-h); c.lineTo(x,cy0); c.stroke();
      c.beginPath(); c.moveTo(x,cy0-h*0.55); c.lineTo(x+13,cy0); c.stroke();
    }
  }
  // rolling hills with sunlit gradients
  let g=c.createLinearGradient(0,gy-70,0,gy+10);
  g.addColorStop(0,'#a7da80'); g.addColorStop(1,'#7fbf57');
  c.fillStyle=g; c.beginPath(); c.ellipse(SW*0.22,gy+28,SW*0.38,68,0,Math.PI,TAU); c.fill();
  g=c.createLinearGradient(0,gy-90,0,gy+10);
  g.addColorStop(0,'#92cf68'); g.addColorStop(1,'#6cb33f');
  c.fillStyle=g; c.beginPath(); c.ellipse(SW*0.80,gy+40,SW*0.45,88,0,Math.PI,TAU); c.fill();
  // scattered trees
  const trees=[[60,-30],[112,-44],[330,-36],[395,-22],[745,-52],[700,-30],[905,-40],[855,-22]];
  for(const t of trees){
    const x=t[0], y=gy+t[1], s=0.8+((x*7)%5)/6;
    c.strokeStyle='#6e4a22'; c.lineWidth=2.5*s; c.lineCap='round';
    c.beginPath(); c.moveTo(x,y+9*s); c.lineTo(x,y); c.stroke();
    const tg=c.createRadialGradient(x-3*s,y-9*s,1,x,y-6*s,10*s);
    tg.addColorStop(0,'#7ecb55'); tg.addColorStop(1,'#3e8a28');
    c.fillStyle=tg;
    c.beginPath(); c.arc(x,y-7*s,8*s,0,TAU); c.arc(x-6*s,y-3*s,5.5*s,0,TAU); c.arc(x+6*s,y-3*s,5.5*s,0,TAU); c.fill();
  }
  // === big top tent ===
  const tx=130, tw=90, ty=gy, peakY=ty-95;
  c.fillStyle='rgba(30,70,25,.28)'; c.beginPath(); c.ellipse(tx,ty,tw+6,9,0,0,TAU); c.fill();
  for(let i=0;i<8;i++){
    const x0=tx-tw+i*(tw/4), x1=x0+tw/4;
    c.fillStyle = i%2 ? '#f7f1e4' : '#c93434';
    c.beginPath(); c.moveTo(x0,ty);
    c.quadraticCurveTo((x0+tx)/2,(ty+peakY)/2-10,tx,peakY);
    c.quadraticCurveTo((x1+tx)/2,(ty+peakY)/2-10,x1,ty); c.closePath(); c.fill();
  }
  let ts=c.createLinearGradient(tx-tw,0,tx+tw,0);
  ts.addColorStop(0,'rgba(60,20,20,.35)'); ts.addColorStop(0.35,'rgba(255,255,255,.10)');
  ts.addColorStop(0.6,'rgba(0,0,0,0)'); ts.addColorStop(1,'rgba(60,20,20,.4)');
  c.fillStyle=ts; c.beginPath(); c.moveTo(tx-tw,ty);
  c.quadraticCurveTo(tx-tw*0.45,(ty+peakY)/2-12,tx,peakY);
  c.quadraticCurveTo(tx+tw*0.45,(ty+peakY)/2-12,tx+tw,ty); c.closePath(); c.fill();
  c.fillStyle='#8e1f1e';
  for(let i=0;i<8;i++){ const x0=tx-tw+i*(tw/4);
    c.beginPath(); c.arc(x0+tw/8,ty-2,tw/8,0,Math.PI); c.fill(); }
  c.fillStyle='#5e1413'; c.beginPath(); c.moveTo(tx-14,ty); c.quadraticCurveTo(tx,ty-36,tx+14,ty); c.fill();
  c.fillStyle='#8e1f1e'; c.beginPath(); c.ellipse(tx,peakY+2,26,8,0,Math.PI,TAU); c.fill();
  c.strokeStyle='#1d2a44'; c.lineWidth=2; c.beginPath(); c.moveTo(tx,peakY); c.lineTo(tx,peakY-16); c.stroke();
  // === crowd fence ===
  const fx0=SPECT_X0;
  c.lineCap='butt';
  c.strokeStyle='#6e4218'; c.lineWidth=3.5;
  c.beginPath(); c.moveTo(fx0-12,gy-14); c.lineTo(fx0+148,gy-14); c.stroke();
  c.strokeStyle='#8d5a2b'; c.lineWidth=2.5;
  c.beginPath(); c.moveTo(fx0-12,gy-7); c.lineTo(fx0+148,gy-7); c.stroke();
  for(let i=0;i<6;i++){
    const px=fx0+i*30;
    c.strokeStyle='#7a4a21'; c.lineWidth=3.5;
    c.beginPath(); c.moveTo(px,gy-16); c.lineTo(px,gy); c.stroke();
    c.fillStyle='#9c6a35'; c.beginPath(); c.arc(px,gy-16,2.2,0,TAU); c.fill();
  }
}









function drawRiderTop(c,x,y,s,r){
  // s = head radius px
  const flying=S.phase==='flying';
  // arms
  c.strokeStyle='#f5c89a'; c.lineWidth=Math.max(s*0.36,2.5); c.lineCap='round';
  const wave=Math.sin(r.armWave)*0.4;
  const limp = r.face==='ko' || r.face==='dead' || r.dmg.neck>=2;   // unconscious/injured: no flailing
  for(const sgn of [-1,1]){
    if(r.dmg.arms>=3){
      // torn off — bloody stump
      c.save(); c.strokeStyle='#a01010'; c.lineWidth=Math.max(s*0.4,3);
      c.beginPath(); c.moveTo(x+sgn*s*0.85,y+s*0.8); c.lineTo(x+sgn*s*1.05,y+s*1.15); c.stroke();
      c.fillStyle='#c01515'; c.beginPath(); c.arc(x+sgn*s*1.05,y+s*1.15,s*0.18,0,TAU); c.fill();
      c.restore();
    } else if(r.mode==='flying' && r.dmg.arms<3 && limp){
      // hang limply, swaying with the descent
      c.beginPath(); c.moveTo(x+sgn*s*0.9,y+s*0.8);
      c.lineTo(x+sgn*s*0.7+Math.sin(S.t*2.5+sgn)*s*0.25, y+s*2.1); c.stroke();
    } else if(r.mode==='flying' && r.dmg.arms<3){
      // windmilling in blind panic
      const a=r.armWave*0.9+sgn*2.4;
      c.beginPath(); c.moveTo(x+sgn*s*0.9,y+s*0.8);
      c.lineTo(x+sgn*s*0.9+Math.cos(a)*s*1.7, y+s*0.8+Math.sin(a)*s*1.7); c.stroke();
    } else {
      const cheer = S.phase==='done' && r.face==='happy' && r.mode==='seated';
      const happyArms = ((((r.face==='happy'||r.face==='scared') && flying) || cheer) && r.dmg.arms<2 && r.mode==='seated');
      const ay = happyArms ? -s*1.6 : s*0.9;
      c.beginPath(); c.moveTo(x+sgn*s*0.9,y+s*0.8);
      c.lineTo(x+sgn*s*(happyArms?1.5:1.25), y+ay+(happyArms?wave*s:0)); c.stroke();
    }
  }
  // torso (shirt)
  c.fillStyle=r.shirt;
  c.beginPath(); c.roundRect(x-s*0.95,y+s*0.55,s*1.9,s*1.45,s*0.4); c.fill();
  // belt strap
  if(r.belted){ c.strokeStyle='#222'; c.lineWidth=Math.max(s*0.25,2);
    c.beginPath(); c.moveTo(x-s*0.9,y+s*0.7); c.lineTo(x+s*0.9,y+s*1.8); c.stroke(); }
  // head — or a bloody stump if decapitated
  if(r.dmg.head>=3){
    c.fillStyle='#c01515';
    c.beginPath(); c.ellipse(x,y-s*0.1,s*0.55,s*0.32,0,0,TAU); c.fill();
    c.fillStyle='#8a0f0f';
    c.beginPath(); c.arc(x,y-s*0.15,s*0.22,0,TAU); c.fill();
  } else {
    c.save(); c.translate(x,y);
    if(r.dmg.neck>=2) c.rotate(0.7);   // head lolls when neck is broken
    c.fillStyle = r.face==='dead'?'#cfd8c4':'#f5c89a';
    c.beginPath(); c.arc(0,0,s,0,TAU); c.fill();
    c.fillStyle=r.hairC||'#5a3b1e'; c.beginPath(); c.arc(0,-s*0.25,s,Math.PI,TAU); c.fill();
    if(r.mode==='flying' && !(r.face==='ko'||r.face==='dead')){ // hair whipped up by the wind
      c.strokeStyle=r.hairC||'#5a3b1e'; c.lineWidth=Math.max(s*0.2,1.5);
      for(let k=-1;k<=1;k++){ c.beginPath(); c.moveTo(k*s*0.4,-s*0.85); c.lineTo(k*s*0.55+Math.sin(r.armWave*2+k)*s*0.3,-s*1.45); c.stroke(); }
    }
    drawFace(c,0,s*0.1,s*0.8,r.face);
    c.restore();
  }
}





function drawParticles(c){
  for(const p of S.particles){
    const X=W2SX(p.x), Y=W2SY(p.y);
    if(p.type==='ring'){
      const a=clamp(p.life/p.t0,0,1), rr=Math.max(p.r*VIEW.s,2);
      c.save(); c.globalCompositeOperation='lighter';
      c.strokeStyle='rgba(255,235,180,'+(a*0.8).toFixed(3)+')';
      c.lineWidth=1.5+3*a;
      c.beginPath(); c.arc(X,Y,rr,0,TAU); c.stroke();
      c.strokeStyle='rgba(255,255,255,'+(a*0.5).toFixed(3)+')';
      c.lineWidth=1;
      c.beginPath(); c.arc(X,Y,rr*0.8,0,TAU); c.stroke();
      c.restore();
    }
    else if(p.type==='chunk'){
      c.save(); c.translate(X,Y); c.rotate(p.rot);
      c.fillStyle='#6e4a22'; c.fillRect(-2.5,-2.5,5,5);
      c.fillStyle='rgba(255,255,255,.25)'; c.fillRect(-2.5,-2.5,5,1.6);
      c.restore();
    }
    else if(p.type==='blood'){ drawBloodDrop(c,p,X,Y); }
    else if(p.type==='dust'){
      const a=clamp(p.life,0,0.8), rr=5+(0.9-clamp(p.life,0,0.9))*7;
      const dgr=c.createRadialGradient(X,Y,0.5,X,Y,rr);
      dgr.addColorStop(0,'rgba(190,170,135,'+(a*0.8).toFixed(3)+')');
      dgr.addColorStop(1,'rgba(160,140,110,0)');
      c.fillStyle=dgr; c.beginPath(); c.arc(X,Y,rr,0,TAU); c.fill();
    }
    else if(p.type==='spark'){
      // glowing streak along its velocity
      const tx2=W2SX(p.x-p.vx*0.045), ty2=W2SY(p.y-p.vy*0.045);
      const a=clamp(p.life,0,1);
      c.save(); c.globalCompositeOperation='lighter';
      c.globalAlpha=a;
      c.strokeStyle=p.color; c.lineWidth=2.6; c.lineCap='round';
      c.beginPath(); c.moveTo(tx2,ty2); c.lineTo(X,Y); c.stroke();
      c.strokeStyle='rgba(255,255,255,.85)'; c.lineWidth=1.1;
      c.beginPath(); c.moveTo((tx2+X)/2,(ty2+Y)/2); c.lineTo(X,Y); c.stroke();
      c.globalAlpha=1;
      c.restore();
    }
    else if(p.type==='confetti'){
      c.save(); c.translate(X,Y); c.rotate(p.rot);
      const sq=0.4+0.6*Math.abs(Math.sin(p.rot*2+p.life*5));   // fluttering twist
      c.fillStyle=p.color; c.fillRect(-4,-2*sq,8,4*sq);
      c.fillStyle='rgba(255,255,255,.35)'; c.fillRect(-4,-2*sq,8,1.3*sq);
      c.restore();
    }
    else if(p.type==='limb'){ drawDetachedPart(c,p,X,Y); }
  }
}

function drawTexts(c){
  c.save();c.textAlign='center';c.font='500 12px system-ui';
  for(const t of S.texts){
    const width=Math.min(SW-32,c.measureText(t.str).width+20);
    const x=clamp(W2SX(t.x),width/2+8,SW-width/2-8),y=clamp(W2SY(t.y),96,SH-22);
    c.globalAlpha=clamp(t.life/.5,0,1);c.fillStyle='rgba(20,37,44,.87)';
    c.beginPath();c.roundRect(x-width/2,y-16,width,24,5);c.fill();
    c.fillStyle='#f0e8d7';c.fillText(t.str,x,y,width-12);
  }
  c.restore();
}
function drawBunting(c,cw){
  // sagging string
  c.strokeStyle='rgba(110,66,24,.85)'; c.lineWidth=2;
  c.beginPath(); c.moveTo(0,2); c.quadraticCurveTo(cw/2,16,cw,2); c.stroke();
  const cols=['#d8403f','#ffd23f','#3d7bd9','#3fae5a'];
  let i=0;
  for(let x=10;x<cw-34;x+=42,i++){
    const mid=x+17;
    const yb=2+13*Math.sin(Math.PI*mid/cw);   // hang from the sag
    const sway=Math.sin(S.t*2+i*1.3)*2.5;
    c.fillStyle=cols[i%4];
    c.beginPath(); c.moveTo(x,yb); c.lineTo(x+34,yb); c.lineTo(mid+sway,yb+18); c.closePath(); c.fill();
    c.fillStyle='rgba(255,255,255,.22)';
    c.beginPath(); c.moveTo(x,yb); c.lineTo(mid,yb); c.lineTo(mid+sway*0.5,yb+9); c.closePath(); c.fill();
    c.strokeStyle='rgba(29,42,68,.35)'; c.lineWidth=1;
    c.beginPath(); c.moveTo(x,yb); c.lineTo(x+34,yb); c.lineTo(mid+sway,yb+18); c.closePath(); c.stroke();
  }
}



/* ============================ FACE ============================ */
function drawFace(c,x,y,r,face){
  const ex=r*0.42, ey=-r*0.15;
  c.lineWidth=Math.max(r*0.14,1.2); c.strokeStyle='#1d2a44'; c.fillStyle='#1d2a44';
  // occasional blink for the living & calm
  if(face==='happy' && ((S.t*0.6 + x*0.21 + y*0.13)%2.8) < 0.09){
    c.beginPath();
    c.moveTo(x-ex-r*0.14,y+ey); c.lineTo(x-ex+r*0.14,y+ey);
    c.moveTo(x+ex-r*0.14,y+ey); c.lineTo(x+ex+r*0.14,y+ey); c.stroke();
    c.beginPath(); c.arc(x,y+r*0.18,r*0.45,0.15*Math.PI,0.85*Math.PI); c.stroke();
    return;
  }
  if(face==='happy'){
    c.beginPath(); c.arc(x-ex,y+ey,r*0.12,0,TAU); c.arc(x+ex,y+ey,r*0.12,0,TAU); c.fill();
    c.beginPath(); c.arc(x,y+r*0.18,r*0.45,0.15*Math.PI,0.85*Math.PI); c.stroke();
  } else if(face==='scared'){
    c.fillStyle='#fff'; c.beginPath(); c.arc(x-ex,y+ey,r*0.26,0,TAU); c.arc(x+ex,y+ey,r*0.26,0,TAU); c.fill();
    c.fillStyle='#1d2a44'; c.beginPath(); c.arc(x-ex,y+ey,r*0.11,0,TAU); c.arc(x+ex,y+ey,r*0.11,0,TAU); c.fill();
    c.beginPath(); c.ellipse(x,y+r*0.42,r*0.22,r*0.32,0,0,TAU); c.fill();
  } else if(face==='pain'){
    for(const sgn of [-1,1]){
      c.beginPath(); c.moveTo(x+sgn*ex-r*0.16,y+ey-r*0.14); c.lineTo(x+sgn*ex+r*0.16,y+ey+r*0.14); c.stroke();
      c.beginPath(); c.moveTo(x+sgn*ex-r*0.16,y+ey+r*0.14); c.lineTo(x+sgn*ex+r*0.16,y+ey-r*0.14); c.stroke();
    }
    c.beginPath(); c.moveTo(x-r*0.35,y+r*0.45); c.quadraticCurveTo(x,y+r*0.2,x+r*0.35,y+r*0.5); c.stroke();
    c.fillStyle='#4aa3ff'; c.beginPath(); c.arc(x-ex-r*0.3,y+r*0.25,r*0.12,0,TAU); c.fill();
  } else if(face==='dizzy'){
    c.font='bold '+r*0.7+'px sans-serif'; c.textAlign='center';
    c.fillText('@',x-ex,y+ey+r*0.25); c.fillText('@',x+ex,y+ey+r*0.25);
    c.beginPath(); c.ellipse(x,y+r*0.45,r*0.2,r*0.14,0,0,TAU); c.stroke();
  } else if(face==='ko'){
    for(const sgn of [-1,1]){ c.beginPath(); c.moveTo(x+sgn*ex-r*0.18,y+ey); c.lineTo(x+sgn*ex+r*0.18,y+ey); c.stroke(); }
    c.beginPath(); c.arc(x,y+r*0.42,r*0.14,0,TAU); c.stroke();
  } else { // dead
    for(const sgn of [-1,1]){
      c.beginPath(); c.moveTo(x+sgn*ex-r*0.16,y+ey-r*0.16); c.lineTo(x+sgn*ex+r*0.16,y+ey+r*0.16); c.stroke();
      c.beginPath(); c.moveTo(x+sgn*ex-r*0.16,y+ey+r*0.16); c.lineTo(x+sgn*ex+r*0.16,y+ey-r*0.16); c.stroke();
    }
    c.fillStyle='#ff7d9c'; c.fillRect(x-r*0.1,y+r*0.3,r*0.22,r*0.3);
  }
}

/* ============================ GRAPH ============================ */
function drawGraph(){
  const c=gctx, w=GW, h=GH;
  c.clearRect(0,0,w,h);
  // subtle depth: vertical sheen over the dark panel
  const pg=c.createLinearGradient(0,0,0,h);
  pg.addColorStop(0,'rgba(70,100,160,.12)'); pg.addColorStop(0.25,'rgba(0,0,0,0)'); pg.addColorStop(1,'rgba(0,0,0,.25)');
  c.fillStyle=pg; c.fillRect(0,0,w,h);
  const L=46, Rm=70, T=14, B=22, pw=w-L-Rm, ph=h-T-B;
  const t1=Math.max(S.t,12), t0=t1-12;
  const gMax=Math.max(14, S.maxG*1.15);
  const kMax=S.Tmax*1.6/1000;
  const X=t=> L+(t-t0)/12*pw;
  const Yg=g=> T+ph-(clamp(g,0,gMax)/gMax)*ph;
  const Yk=k=> T+ph-(clamp(k,0,kMax)/kMax)*ph;
  // grid
  c.strokeStyle='rgba(255,255,255,.08)'; c.lineWidth=1;
  for(let g=0;g<=gMax;g+=5){ c.beginPath(); c.moveTo(L,Yg(g)); c.lineTo(L+pw,Yg(g)); c.stroke(); }
  c.fillStyle='#8ea4cc'; c.font='11px sans-serif'; c.textAlign='right';
  for(let g=0;g<=gMax;g+=5) c.fillText(g+'g',L-5,Yg(g)+4);
  // danger G line
  c.strokeStyle='#ff5050'; c.setLineDash([6,5]); c.lineWidth=1.5;
  c.beginPath(); c.moveTo(L,Yg(9)); c.lineTo(L+pw,Yg(9)); c.stroke();
  c.fillStyle='#ff5050'; c.textAlign='left'; c.fillText('HIGH G',L+4,Yg(9)-4);
  // rope limit line
  c.strokeStyle='#37d6e8';
  c.beginPath(); c.moveTo(L,Yk(S.Tmax/1000)); c.lineTo(L+pw,Yk(S.Tmax/1000)); c.stroke();
  c.fillText('CORD LIMIT',L+90,Yk(S.Tmax/1000)-4);
  c.setLineDash([]);
  // series
  if(S.series.length>1){
    // glowing area under the G curve
    const ag2=c.createLinearGradient(0,T,0,T+ph);
    ag2.addColorStop(0,'rgba(255,176,46,.30)'); ag2.addColorStop(1,'rgba(255,176,46,.02)');
    c.fillStyle=ag2; c.beginPath();
    c.moveTo(X(S.series[0].t),T+ph);
    S.series.forEach(p=> c.lineTo(X(p.t),Yg(p.g)));
    c.lineTo(X(S.series[S.series.length-1].t),T+ph); c.closePath(); c.fill();
    c.save();
    c.shadowColor='#37d6e8'; c.shadowBlur=6;
    c.strokeStyle='#37d6e8'; c.lineWidth=1.6; c.lineJoin='round'; c.beginPath();
    S.series.forEach((p,i)=> i?c.lineTo(X(p.t),Yk(p.kN)):c.moveTo(X(p.t),Yk(p.kN))); c.stroke();
    c.shadowColor='#ffb02e'; c.shadowBlur=8;
    c.strokeStyle='#ffb02e'; c.lineWidth=2.4; c.beginPath();
    S.series.forEach((p,i)=> i?c.lineTo(X(p.t),Yg(p.g)):c.moveTo(X(p.t),Yg(p.g))); c.stroke();
    c.restore();
    // live dot on the newest sample
    const lp=S.series[S.series.length-1];
    c.fillStyle='#fff'; c.beginPath(); c.arc(X(lp.t),Yg(lp.g),2.6,0,TAU); c.fill();
  }
  // legend + max G readout
  c.font='bold 12px sans-serif'; c.textAlign='left';
  c.fillStyle='#ffb02e'; c.fillText('— G-force',L+pw+8,T+14);
  c.fillStyle='#37d6e8'; c.fillText('— cord kN',L+pw+8,T+30);
  c.fillStyle=S.maxG>9?'#ff5050':'#fff';
  c.font='bold 17px system-ui';
  c.fillText('MAX',L+pw+8,T+58);
  c.fillText(S.maxG.toFixed(1)+'g',L+pw+8,T+78);
  c.fillStyle='#8ea4cc'; c.font='11px sans-serif'; c.textAlign='center';
  c.fillText('12-second history',L+pw/2,h-7);
}

/* ============================ RIDER CONDITION PANEL ============================ */
function drawBodies(){
  const c=bctx, w=BW;
  c.clearRect(0,0,w,bodies.height);   // device height ≥ logical height, safe over-clear
  S.riders.forEach((r,i)=>{
    const y0=i*148+3;
    // card
    c.fillStyle='#fff'; c.strokeStyle='#1d2a44'; c.lineWidth=2.5;
    c.beginPath(); c.roundRect(3,y0,w-6,142,10); c.fill(); c.stroke();
    drawBodyFigure(c,52,y0+71,r);
    // dead? skull & crossbones overlay
    // info (text column starts right of the figure zone)
    const tx=110;
    c.textAlign='left';
    c.fillStyle='#1d2a44'; c.font='bold 16px system-ui';
    c.fillText(r.name,tx,y0+24);
    c.font='11px sans-serif'; c.fillStyle='#777';
    c.fillText('G tolerance: '+r.tol.toFixed(1)+'g',tx,y0+40);
    c.fillText((r.belted?'Belt fastened':'No seatbelt')+(r.hasChute?(r.chuteTorn?' · Chute lost':' · Chute'):''),tx,y0+54);
    const worst=Math.max(r.dmg.head,r.dmg.neck,r.dmg.torso,r.dmg.arms,r.dmg.legs);
    c.font='bold 11px system-ui';
    c.fillStyle = r.face==='dead'?'#7a0d0d': worst>=2?'#d8403f': worst===1?'#e8632c':'#1d7a36';
    wrapText(c,r.status,tx,y0+72,w-tx-32,13,3);
    // damage pips
    const parts=['head','neck','torso','arms','legs'];
    c.font='9px sans-serif';
    parts.forEach((pt,j)=>{
      const px=tx+j*31;
      c.fillStyle=['#3fae5a','#e8a33d','#d8403f','#7a0d0d'][r.dmg[pt]];
      c.beginPath(); c.arc(px+8,y0+118,5,0,TAU); c.fill();
      c.fillStyle='#777'; c.textAlign='center'; c.fillText(pt,px+8,y0+132);
    });
    c.textAlign='left';
  });
}

function wrapText(c,txt,x,y,maxW,lh,maxLines){
  maxLines=maxLines||99;
  const words=txt.split(' '); let line=''; let n=0;
  for(const wd of words){
    if(c.measureText(line+wd).width>maxW && line){
      n++;
      if(n>=maxLines){ // out of room: ellipsize and stop
        while(line && c.measureText(line+'…').width>maxW) line=line.slice(0,-1);
        c.fillText(line+'…',x,y); return;
      }
      c.fillText(line,x,y); line=wd+' '; y+=lh;
    }
    else line+=wd+' ';
  }
  c.fillText(line,x,y);
}

function dmgCol(level,base){ return [base,'#e8a33d','#d8403f','#7a0d0d'][level]; }

function drawBodyFigure(c,x,y,r){
  drawPerson(c,x,y-3,14,r,0);
  const points={head:[0,-25],neck:[0,-14],torso:[0,0],arms:[-17,7],legs:[7,27]};
  for(const [part,[dx,dy]] of Object.entries(points))if(r.dmg[part]>0){c.fillStyle=['','#d6a55a','#ce7054','#843d36'][r.dmg[part]];c.beginPath();c.arc(x+dx,y+dy,4,0,TAU);c.fill();}
}

/* Procedural materials and scenery: no downloads or GPU dependencies. */
function metal(c,x,y,w,h){
  const g=c.createLinearGradient(x,0,x+w,0);
  [[0,'#253741'],[.22,'#8a9da0'],[.38,'#cfdbd6'],[.55,'#6d8085'],[1,'#273d47']].forEach(([p,v])=>g.addColorStop(p,v));
  c.fillStyle=g;c.fillRect(x,y,w,h);
}
const parkPlate=new Image();parkPlate.src="assets/park-animated.png";
function drawBackground(c){
  if(parkPlate.complete && parkPlate.naturalWidth){c.drawImage(parkPlate,0,0,SW,SH);drawEnvironmentMotion(c);return;}
  const gy=W2SY(0);
  const sky=c.createLinearGradient(0,0,0,SH);
  sky.addColorStop(0,'#537f98');sky.addColorStop(.6,'#adc6cc');sky.addColorStop(1,'#e9dac0');c.fillStyle=sky;c.fillRect(0,0,SW,SH);
  const sun=c.createRadialGradient(780,116,3,780,116,220);
  sun.addColorStop(0,'#fff7d6');sun.addColorStop(.09,'rgba(255,242,206,.9)');sun.addColorStop(.25,'rgba(255,230,181,.18)');sun.addColorStop(1,'rgba(255,230,181,0)');c.fillStyle=sun;c.fillRect(500,0,460,390);
  // Broad, translucent cloud banks with fine feathered edges.
  for(let j=0;j<3;j++)for(let i=0;i<18;i++){
    const x=((i*79+j*193+S.t*(1+j*.4))%1160)-100,y=100+j*80+Math.sin(i*2.7+j)*17;
    const g=c.createRadialGradient(x,y,2,x,y,65);g.addColorStop(0,'rgba(245,242,228,.12)');g.addColorStop(1,'rgba(245,242,228,0)');c.fillStyle=g;c.beginPath();c.ellipse(x,y,90,24,0,0,TAU);c.fill();
  }
  for(let layer=0;layer<4;layer++){
    c.fillStyle=['#9aacb0','#879b9b','#708780','#526b60'][layer];c.beginPath();c.moveTo(0,gy);
    for(let x=0;x<=SW;x+=8){const y=gy-110+layer*23-Math.sin(x*.006+layer*1.7)*28-Math.sin(x*.019+layer)*12;c.lineTo(x,y);}
    c.lineTo(SW,gy);c.closePath();c.fill();
  }
  // Distant roller coaster: track, ties, supports, moving train.
  const track=x=>gy-24-72*Math.exp(-(((x-650)/55)**2))-44*Math.exp(-(((x-780)/44)**2));
  c.strokeStyle='#556c6c';c.lineWidth=1;
  for(let x=540;x<865;x+=14){c.beginPath();c.moveTo(x,track(x));c.lineTo(x,gy);c.lineTo(x+14,track(x+14));c.stroke();}
  for(let off of [0,4]){c.beginPath();for(let x=530;x<880;x+=3)c.lineTo(x,track(x)+off);c.stroke();}
  for(let i=0;i<5;i++){const x=540+((S.t*15+i*7)%320);c.fillStyle='#b77954';c.fillRect(x,track(x)-5,6,4);}
  // Ferris wheel has a structural silhouette instead of a toy face.
  const fx=154,fy=gy-74,rr=60;c.strokeStyle='#667b78';c.lineWidth=1.4;
  c.beginPath();c.arc(fx,fy,rr,0,TAU);c.stroke();c.beginPath();c.moveTo(fx-29,gy);c.lineTo(fx,fy-4);c.lineTo(fx+29,gy);c.stroke();
  for(let i=0;i<16;i++){const a=i/16*TAU+S.t*.07,x=fx+Math.cos(a)*rr,y=fy+Math.sin(a)*rr;c.beginPath();c.moveTo(fx,fy);c.lineTo(x,y);c.stroke();c.fillStyle='#7b5949';c.fillRect(x-4,y,8,6);}
  // Treeline, pavilion roofs and park lamps.
  for(let i=0;i<65;i++){const x=i*16,y=gy-9-Math.sin(i*4.1)*5,h=12+(Math.sin(i*7)+1)*8;c.fillStyle=i%2?'#3e594d':'#486253';c.beginPath();c.moveTo(x,y-h);c.lineTo(x-7,y);c.lineTo(x+9,y);c.fill();}
  for(const x of [65,310,870]){c.fillStyle='#98978a';c.fillRect(x-27,gy-18,54,18);c.fillStyle='#6b5144';c.beginPath();c.moveTo(x-33,gy-18);c.lineTo(x,gy-35);c.lineTo(x+33,gy-18);c.fill();}
}
function drawGround(c){
  const gy=W2SY(0);const g=c.createLinearGradient(0,gy-2,0,SH);g.addColorStop(0,'#8f9274');g.addColorStop(1,'#515d50');if(!parkPlate.complete || !parkPlate.naturalWidth){c.fillStyle=g;c.fillRect(0,gy,SW,SH-gy);}
  c.fillStyle='rgba(165,161,143,.3)';c.fillRect(0,gy+4,SW,9);c.strokeStyle='#73796d';c.lineWidth=.6;
  for(let x=0;x<SW;x+=30){c.beginPath();c.moveTo(x,gy+4);c.lineTo(x+10,gy+13);c.stroke();}
  // Concrete plinth and boarding ramp remain aligned with boarding physics.
  const x=W2SX(0),deck=W2SY(DECK),rw=W2SX(12);
  c.fillStyle='#747e7b';c.fillRect(x-12,deck,26,gy-deck);c.fillStyle='#adb2a5';c.fillRect(x-18,deck,38,4);
  c.strokeStyle='#758280';c.lineWidth=3;c.beginPath();c.moveTo(W2SX(2.5),deck);c.lineTo(rw,gy);c.stroke();
  c.lineWidth=1.1;for(let i=0;i<=9;i++){let f=i/9,rx=lerp(W2SX(2.5),rw,f),ry=lerp(deck,gy,f);c.beginPath();c.moveTo(rx,ry);c.lineTo(rx,ry-9);c.stroke();}
  c.beginPath();c.moveTo(W2SX(2.5),deck-9);c.lineTo(rw,gy-9);c.stroke();
  drawSpectators(c);
  c.strokeStyle='#59696b';c.lineWidth=1;for(let x=202;x<355;x+=12){c.beginPath();c.moveTo(x,gy);c.lineTo(x,gy-13);c.stroke();}c.beginPath();c.moveTo(202,gy-12);c.lineTo(355,gy-12);c.stroke();
  for(const st of S.stains)drawBloodStain(c,st);
}
function drawTowersAndCords(c){
  const gy=W2SY(0),top=W2SY(S.H),tw=Math.max(12,VIEW.s*1.8);
  for(const side of [-1,1]){
    const x=W2SX(side*cfg.towerX)+(side<0?-tw*.25:0);
    c.fillStyle='#77827d';c.fillRect(x-tw,gy-4,tw*2,5);
    metal(c,x-tw/2,top,3,gy-top);metal(c,x+tw/2-3,top,3,gy-top);
    c.strokeStyle=side<0?'#4b6064':'#90a1a1';c.lineWidth=1.6;
    for(let y=top;y<gy-10;y+=16){const y1=Math.min(gy,y+16);c.beginPath();c.moveTo(x-tw/2,y);c.lineTo(x+tw/2,y1);c.lineTo(x-tw/2,y1);c.lineTo(x+tw/2,y);c.stroke();}
    metal(c,x-tw*.75,top-4,tw*1.5,8);c.fillStyle='#273f47';c.beginPath();c.arc(x,top,4,0,TAU);c.fill();c.strokeStyle='#c4ccbf';c.lineWidth=1;c.stroke();
    c.fillStyle='#d98259';c.fillRect(x-2,top-9,4,3);
    for(let y=top+12;y<gy;y+=50){c.fillStyle='#dec797';c.fillRect(x-2,y,4,3);}
  }
  const p=S.pod,R=podPxR();
  for(let i=0;i<2;i++){
    const x=W2SX(i?cfg.towerX:-cfg.towerX),y=top,bx=W2SX(p.x)+(i?1:-1)*R*.75,by=W2SY(p.y)-R*.15;
    c.lineCap='round';
    if(S.snapped[i]){c.strokeStyle='#55564a';c.lineWidth=2;c.beginPath();c.moveTo(x,y);for(let k=1;k<=24;k++)c.lineTo(x+Math.sin(k*.4+S.t*7)*S.snapWave[i]*10,y+k*Math.min((gy-top)*.4,130)/24);c.stroke();continue;}
    const d=dist(p.x,p.y,i?cfg.towerX:-cfg.towerX,S.H),sag=clamp((S.L0-d)*VIEW.s*.6,0,120),ratio=S.tension[i]/S.Tmax;
    const path=()=>{c.beginPath();c.moveTo(x,y);c.quadraticCurveTo((x+bx)/2,(y+by)/2+sag,bx,by);};
    c.strokeStyle='#303b37';c.lineWidth=4;path();c.stroke();c.strokeStyle=ratio>1?'#d08555':'#b0a586';c.lineWidth=2.2;path();c.stroke();
    c.save();c.setLineDash([2,4]);c.strokeStyle='#e0d9bd';c.lineWidth=.8;path();c.stroke();c.restore();
  }
}


function drawBoarders(c){for(const r of S.riders)if(r.mode==='boarding')drawPerson(c,W2SX(r.x),W2SY(r.y)-2.71*RIDER_SCENE_SCALE,RIDER_SCENE_SCALE,r,0);}
function drawFlyingRiders(c){for(const r of scenePeople()){if(!['held','flying','landed'].includes(r.mode))continue;const X=W2SX(r.x),Y=W2SY(r.y),sz=RIDER_SCENE_SCALE;
  if(r.chuteOpen||r.chuteLanded)drawParachute(c,X,Y,r);
  c.save();c.translate(X,Y);c.rotate(r.mode==='held'?Math.sin(r.armWave)*.12:-r.rot);drawPerson(c,0,-3,sz,r,['flying','held'].includes(r.mode)?1:0);c.restore();
}}
function drawTrail(c){if(S.trail.length<2)return;c.strokeStyle='rgba(233,235,214,.2)';c.lineWidth=1;c.beginPath();S.trail.forEach((p,i)=>i?c.lineTo(W2SX(p.x),W2SY(p.y)):c.moveTo(W2SX(p.x),W2SY(p.y)));c.stroke();}
function drawHint(c){const x=W2SX(S.pod.x),y=W2SY(S.pod.y)-podPxR()-20;c.fillStyle='rgba(18,38,47,.85)';c.beginPath();c.roundRect(x-115,y-18,230,30,6);c.fill();c.fillStyle='#f5e5c5';c.font='11px system-ui';c.textAlign='center';c.fillText('Drag to aim · Release to launch',x,y);}
function drawBanner(c,cw){
  if(!S.banner)return;
  const danger=['snap','doubleSnap','ejected','beltfail','carnage'].includes(S.bannerKind);
  const accent=danger?'#e99a7c':S.bannerKind==='happy'?'#99c8ad':'#d3c29a';
  c.save();const width=540,x=(cw-width)/2;
  c.fillStyle='rgba(20,38,47,.88)';c.beginPath();c.roundRect(x,19,width,62,8);c.fill();
  c.fillStyle=accent;c.fillRect(x+16,33,2,31);
  c.textAlign='left';c.fillStyle='#f3eee2';c.font='600 18px system-ui';c.fillText(S.banner,x+30,43,width-48);
  c.fillStyle='#bbcdca';c.font='12px system-ui';c.fillText(S.bannerSub,x+30,65,width-48);
  c.restore();
}
function drawSceneDetails(c){
  for(const b of DECOR.balloons)drawRealisticBalloon(c,b);

  c.textAlign='left';c.font='9px system-ui';c.fillStyle='rgba(24,48,59,.65)';c.fillText('MEGA / FIELD VIEW 01',20,99);
  c.strokeStyle='rgba(34,65,73,.2)';c.lineWidth=1;
  const step=S.H>100?25:10;for(let h=0;h<S.H+50;h+=step){const y=W2SY(h);if(y<100)continue;c.beginPath();c.moveTo(SW-28,y);c.lineTo(SW-18,y);c.stroke();c.textAlign='right';c.fillText(h+' m',SW-34,y+3);}
}
function drawPrediction(c){
  let p={...S.pod};c.save();c.strokeStyle='rgba(250,238,189,.9)';c.lineWidth=1.5;c.setLineDash([3,6]);c.beginPath();c.moveTo(W2SX(p.x),W2SY(p.y));
  for(let i=0;i<480;i++){const f=cordForce(p.x,p.y,p.vx,p.vy),sp=Math.hypot(p.vx,p.vy),cd=cfg.damp+cfg.qdrag*sp,dt=1/240;p.vx+=(f.fx-cd*p.vx)/S.mass*dt;p.vy+=((f.fy-cd*p.vy)/S.mass-GRAV)*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.y<cfg.podR)break;if(i%8===0)c.lineTo(W2SX(p.x),W2SY(p.y));}c.stroke();c.restore();
  c.fillStyle='#f1e3ba';c.font='10px system-ui';c.textAlign='left';c.fillText('Next 2 seconds · assumes intact cords',20,117);
}

/* Material helpers use object coordinates, so details also hold up in the rider panel. */
function surfaceGradient(c,x0,y0,x1,y1,stops){
  const g=c.createLinearGradient(x0,y0,x1,y1);
  stops.forEach(([at,color])=>g.addColorStop(at,color));
  return g;
}
function taperedLimb(c,a,b,w0,w1,color){
  const dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy)||1;
  const nx=-dy/len,ny=dx/len;
  c.fillStyle=surfaceGradient(c,a[0]+nx*w0,a[1]+ny*w0,a[0]-nx*w0,a[1]-ny*w0,
    [[0,'#24292b'],[.22,color],[.55,color],[1,'#e0c5a280']]);
  c.beginPath();c.moveTo(a[0]+nx*w0,a[1]+ny*w0);
  c.quadraticCurveTo((a[0]+b[0])/2+nx*w0,(a[1]+b[1])/2+ny*w0,b[0]+nx*w1,b[1]+ny*w1);
  c.quadraticCurveTo(b[0]+dx*.05,b[1]+dy*.05,b[0]-nx*w1,b[1]-ny*w1);
  c.lineTo(a[0]-nx*w0,a[1]-ny*w0);c.closePath();c.fill();
}
function drawWound(c,x,y,r,seed=0){
  // Irregular dark contact patch, kept small relative to the body.
  c.save();c.translate(x,y);c.fillStyle='#44201d';c.beginPath();
  for(let j=0;j<12;j++){const a=j/12*TAU,rr=r*(.75+.22*Math.sin(j*5.7+seed));c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr*.55);}
  c.closePath();c.fill();c.fillStyle='#7d302b';c.beginPath();c.ellipse(-r*.1,-r*.08,r*.48,r*.2,-.3,0,TAU);c.fill();c.restore();
}
function drawHumanHead(c,x,y,rider,scale=1){
  c.save();c.translate(x,y);c.scale(scale,scale);
  const skin=rider.skin||'#bc9171',dead=rider.face==='dead';
  c.fillStyle=surfaceGradient(c,-.35,-.3,.3,.2,[[0,dead?'#a2937d':'#e0bea0'],[.42,skin],[1,'#674f43']]);
  // Ears, jaw, cheekbones, and neck are separate from the hair silhouette.
  for(const side of [-1,1]){c.beginPath();c.ellipse(side*.28,.02,.055,.1,side*.2,0,TAU);c.fill();}
  c.beginPath();c.moveTo(-.27,-.23);c.bezierCurveTo(-.3,-.47,.27,-.49,.29,-.22);
  c.lineTo(.245,.18);c.quadraticCurveTo(.13,.36,0,.35);c.quadraticCurveTo(-.18,.3,-.25,.15);c.closePath();c.fill();
  c.fillStyle=rider.hairC||'#48372d';c.beginPath();c.moveTo(-.28,.025);c.lineTo(-.3,-.23);
  c.bezierCurveTo(-.25,-.51,.18,-.48,.3,-.24);c.lineTo(.28,-.02);c.lineTo(.21,-.19);
  c.quadraticCurveTo(.02,-.12,-.2,-.23);c.closePath();c.fill();
  c.strokeStyle='#362f2a';c.lineWidth=.022;
  for(const side of [-1,1]){c.beginPath();c.moveTo(side*.16-.055,-.035);c.lineTo(side*.16+.03,-.04);c.stroke();}
  c.strokeStyle='#775749';c.beginPath();c.moveTo(.015,-.015);c.lineTo(.04,.12);c.lineTo(-.015,.13);c.stroke();
  c.strokeStyle='#704f43';c.beginPath();c.moveTo(-.085,.21);c.quadraticCurveTo(0,.23,.09,.2);c.stroke();
  if(rider.dmg.head>0)drawWound(c,-.16,-.08,.13,2);
  c.restore();
}
function drawPerson(c,x,y,s,r,pose=0){
  if(imageReady("riders")){drawTexturedPerson(c,x,y,s,r,pose);return;}
  c.save();c.translate(x,y);c.scale(s,s);c.lineCap='round';
  const skin=r.skin||'#bc9171',limp=r.face==='dead'||r.face==='ko'||r.dmg.neck>=2;
  const walking=r.mode==='boarding',airborne=['flying','held'].includes(r.mode);
  const wave=r.mode==='held'&&!limp?Math.sin(r.armWave*2)*2:walking?Math.sin(r.walkPh||0):airborne&&!limp?Math.sin((r.armWave||0)*.6):0;
  const seated=r.mode==='seated',trousers=r.trousers||'#364249';
  // Natural proportions: approximately seven head lengths, articulated hips and knees.
  for(const side of [-1,1]){
    const hip=[side*.24,.5],knee=[side*(seated?.43:.26)+wave*side*.14,seated?1.14:1.55];
    const ankle=[side*.3-wave*side*.25,seated?1.75:2.48];
    if(r.dmg.legs!==3){
      taperedLimb(c,hip,knee,.205,.145,trousers);taperedLimb(c,knee,ankle,.15,.095,trousers);
      c.fillStyle='#24282a';c.beginPath();c.moveTo(ankle[0]-.1,ankle[1]-.03);c.lineTo(ankle[0]+.09,ankle[1]-.03);c.lineTo(ankle[0]+.2,ankle[1]+.14);c.quadraticCurveTo(ankle[0],ankle[1]+.2,ankle[0]-.13,ankle[1]+.1);c.fill();
      c.strokeStyle='#8b8c83';c.lineWidth=.025;c.beginPath();c.moveTo(ankle[0]-.1,ankle[1]+.13);c.lineTo(ankle[0]+.17,ankle[1]+.14);c.stroke();
      if(r.dmg.legs>=2)drawWound(c,knee[0],knee[1],.16,side);
    }else{taperedLimb(c,hip,[side*.26,.8],.2,.15,trousers);drawWound(c,side*.26,.82,.19,side);}
  }
  // Fitted fabric: shoulder taper, waist, hem, seams and restrained folds.
  c.fillStyle=surfaceGradient(c,-.58,0,.58,0,[[0,'#202b30'],[.23,r.shirt],[.62,r.shirt],[1,'#e7c4a54d']]);
  c.beginPath();c.moveTo(-.14,-1.22);c.lineTo(-.45,-1.12);c.quadraticCurveTo(-.58,-.98,-.49,-.65);
  c.lineTo(-.37,.37);c.quadraticCurveTo(0,.52,.38,.36);c.lineTo(.49,-.71);c.quadraticCurveTo(.55,-1.02,.43,-1.12);c.lineTo(.14,-1.22);c.closePath();c.fill();
  c.strokeStyle='#1b292b66';c.lineWidth=.033;
  for(let j=0;j<4;j++){c.beginPath();c.moveTo(-.28+j*.11,-.6+j*.16);c.quadraticCurveTo(-.08,-.38+j*.18,.27,-.41+j*.2);c.stroke();}
  c.beginPath();c.moveTo(-.34,.34);c.lineTo(.33,.35);c.stroke();
  for(const side of [-1,1]){
    const shoulder=[side*.46,-1.03];
    let elbow=[side*(limp?.52:.66),-.2-wave*side*.22],hand=[side*.54,.64+wave*side*.15];
    if(seated){elbow=[side*.65,-.2];hand=[side*.38,-.18];}
    if(pose&&!limp){elbow=[side*.88,-1.3+wave*side*.2];hand=[side*(1.0+wave*.1),-2.0+wave*side*.3];}
    if(limp&&airborne){elbow=[side*.63,.05];hand=[side*.71,.89];}
    const sleeve=[lerp(shoulder[0],elbow[0],.5),lerp(shoulder[1],elbow[1],.5)];
    taperedLimb(c,shoulder,sleeve,.19,.155,r.shirt);
    if(r.dmg.arms!==3){taperedLimb(c,sleeve,elbow,.13,.105,skin);taperedLimb(c,elbow,hand,.11,.07,skin);
      c.fillStyle=skin;c.beginPath();c.ellipse(hand[0],hand[1]+.06,.085,.14,-side*.2,0,TAU);c.fill();
      if(r.dmg.arms>=2)drawWound(c,elbow[0],elbow[1],.11,side+3);
    }else drawWound(c,sleeve[0],sleeve[1],.16,side+5);
  }
  if(r.dmg.torso>0){drawWound(c,.19,-.15,r.dmg.torso>=2?.24:.12,3);c.strokeStyle='#48292399';c.lineWidth=.05;c.beginPath();c.moveTo(.17,-.1);c.lineTo(.14,.28);c.stroke();}
  taperedLimb(c,[0,-1.22],[0,-1.46],.125,.115,skin);
  if(r.dmg.head!==3){c.save();c.translate(0,-1.69);if(limp)c.rotate(.28);drawHumanHead(c,0,0,r);c.restore();}
  else drawWound(c,0,-1.44,.15,6);
  c.restore();
}
function drawPod(c){
  const R=podPxR(),X=W2SX(S.pod.x),Y=W2SY(S.pod.y),gy=W2SY(0);
  c.save();c.fillStyle='rgba(19,27,24,.22)';c.beginPath();c.ellipse(X,gy+1,R*1.25,3,0,0,TAU);c.fill();
  c.translate(X,Y);c.rotate(-S.podRot+clamp(-S.pod.vx*.004,-.2,.2));c.scale(R,R);
  const steel=surfaceGradient(c,-1,-.8,1,.9,[[0,'#f0e8ce'],[.12,'#a4b5b6'],[.29,'#354b55'],[.48,'#c2ccca'],[.57,'#586d74'],[.85,'#1e323c'],[1,'#819491']]);
  if(!imageReady('capsule')){
  // A real open steel roll cage surrounds padded seats; there is no opaque bubble.
  c.strokeStyle='#223841';c.lineWidth=.13;c.beginPath();c.ellipse(0,-.06,.96,.99,0,0,TAU);c.stroke();
  c.strokeStyle=steel;c.lineWidth=.07;c.stroke();
  c.strokeStyle='#354d56';c.lineWidth=.06;c.beginPath();c.ellipse(0,-.05,.64,.97,0,0,TAU);c.stroke();
  c.strokeStyle='#c0c9c1';c.lineWidth=.018;c.beginPath();c.ellipse(0,-.06,.975,1,0,Math.PI,TAU);c.stroke();
  // Pivot blocks attach at the same cord anchors used by the main renderer.
  for(const side of [-1,1]){c.fillStyle=steel;c.beginPath();c.roundRect(side*.75-.1,-.26,.2,.22,.035);c.fill();c.fillStyle='#1c2d36';c.beginPath();c.arc(side*.75,-.15,.056,0,TAU);c.fill();c.strokeStyle='#c9c9b7';c.lineWidth=.017;c.stroke();}
  }
  const seated=S.riders.filter(r=>r.mode==='seated'),n=S.nRiders;
  const spacing=Math.min(.6,1.48/n),personScale=RIDER_SCENE_SCALE/R;
  for(let i=0;i<n;i++){
    const x=(i-(n-1)/2)*spacing;
    c.fillStyle=surfaceGradient(c,x-.2,0,x+.2,0,[[0,'#111b21'],[.5,'#4a5351'],[1,'#1b282d']]);
    c.beginPath();c.roundRect(x-spacing*.43,-.6,spacing*.86,1.03,.085);c.fill();
    c.strokeStyle='#6a716966';c.lineWidth=.013;c.stroke();c.fillStyle='#202e33';c.beginPath();c.roundRect(x-spacing*.26,-.7,spacing*.52,.27,.045);c.fill();
    const r=seated.find(r=>r.seat===i);if(r)drawPerson(c,x,-.05,personScale,r,0);
    if(r&&r.belted&&S.barT>0){
      c.strokeStyle='#101b21';c.lineWidth=.075;c.beginPath();c.moveTo(x-spacing*.25,-.43);c.bezierCurveTo(x-spacing*.43,-.13,x-spacing*.34,.22,x,.26);c.bezierCurveTo(x+spacing*.34,.22,x+spacing*.43,-.13,x+spacing*.25,-.43);c.stroke();
      c.strokeStyle='#697775';c.lineWidth=.02;c.stroke();c.fillStyle='#a5a89b';c.fillRect(x-.055,.2,.11,.065);
    }
  }
  if(imageReady('capsule')){c.drawImage(objectImages.capsule,-1.04,-1.08,2.08,2.08);c.restore();return;}
  // Formed aluminum footwell, tread plate, rails and fasteners.
  c.fillStyle=surfaceGradient(c,0,.32,0,.92,[[0,'#b9c2b9'],[.15,'#60747a'],[.6,'#273e48'],[1,'#142932']]);
  c.beginPath();c.moveTo(-.84,.35);c.lineTo(.84,.35);c.lineTo(.72,.77);c.quadraticCurveTo(0,.95,-.72,.77);c.closePath();c.fill();
  c.strokeStyle='#a8b8b6';c.lineWidth=.025;c.stroke();
  c.strokeStyle='#cb9b69';c.lineWidth=.026;c.beginPath();c.moveTo(-.79,.42);c.lineTo(.79,.42);c.stroke();
  c.strokeStyle='#89958d66';c.lineWidth=.013;for(let x=-.65;x<.7;x+=.12){c.beginPath();c.moveTo(x,.55);c.lineTo(x+.035,.59);c.stroke();}
  for(const x of [-.7,-.44,.44,.7]){c.fillStyle='#c3c7b6';c.beginPath();c.arc(x,.48,.017,0,TAU);c.fill();}
  c.fillStyle='#d6d7c4';c.font='.11px system-ui';c.textAlign='center';c.fillText('MEGA  /  01',0,.74);
  c.restore();
}
function drawAmbulance(c,a=S.ambulance){
  if(!a)return;
  if(imageReady("ambulance")){drawPhotoAmbulance(c,a);return;}
  const X=W2SX(a.x),gy=W2SY(0),moving=a.phase!=='wait';
  c.save();c.translate(X,gy);c.scale(.82,.82);
  // A long-wheelbase van profile. Direction follows travel, wheels remain planted.
  if(a.phase==='out'||a.direction>0)c.scale(-1,1);
  c.fillStyle='rgba(16,24,24,.25)';c.beginPath();c.ellipse(0,0,61,3.3,0,0,TAU);c.fill();
  const bounce=moving?Math.sin(S.t*22)*.23:0;
  c.save();c.translate(0,bounce);
  const paint=surfaceGradient(c,0,-48,0,-9,[[0,'#f4eee0'],[.22,'#e5e5dd'],[.58,'#b9c4c1'],[.67,'#e1e0d4'],[1,'#718689']]);
  c.fillStyle=paint;c.beginPath();c.moveTo(-58,-12);c.lineTo(-58,-23);c.quadraticCurveTo(-58,-27,-49,-30);
  c.lineTo(-35,-47);c.quadraticCurveTo(-31,-51,-22,-51);c.lineTo(49,-51);c.quadraticCurveTo(58,-50,59,-43);
  c.lineTo(59,-12);c.closePath();c.fill();c.strokeStyle='#526a70';c.lineWidth=.6;c.stroke();
  c.fillStyle='#303e42';c.fillRect(-57,-13,115,5);
  // Cabin glass, windshield rake, A pillar and side mirror.
  const glass=surfaceGradient(c,-45,-45,-20,-27,[[0,'#b2c7c8'],[.28,'#567682'],[.8,'#233e4b'],[1,'#152d38']]);
  c.fillStyle=glass;c.beginPath();c.moveTo(-35,-45);c.lineTo(-47,-30);c.lineTo(-36,-30);c.lineTo(-25,-45);c.closePath();c.fill();
  c.beginPath();c.moveTo(-22,-45);c.lineTo(-9,-45);c.lineTo(-9,-29);c.lineTo(-33,-29);c.closePath();c.fill();
  c.strokeStyle='#d4d9cb';c.lineWidth=.7;c.beginPath();c.moveTo(-34,-44);c.lineTo(-43,-33);c.stroke();
  // Driver silhouette is visible behind the tinted glass.
  c.fillStyle='#b39578';c.beginPath();c.ellipse(-17,-38,2.6,3.4,0,0,TAU);c.fill();c.fillStyle='#384b52';c.beginPath();c.moveTo(-21,-29);c.lineTo(-19,-35);c.lineTo(-14,-35);c.lineTo(-12,-29);c.fill();
  c.strokeStyle='#253841';c.lineWidth=1.2;c.beginPath();c.moveTo(-37,-29);c.lineTo(-43,-28);c.stroke();c.fillStyle='#384d55';c.beginPath();c.roundRect(-47,-31,6,4,1);c.fill();
  // Door shutlines, rear windows, handle recesses and lower protective trim.
  c.strokeStyle='#657c7d';c.lineWidth=.5;c.strokeRect(-6,-46,32,33);c.beginPath();c.moveTo(-7,-47);c.lineTo(-7,-13);c.moveTo(-34,-27);c.lineTo(-34,-14);c.stroke();
  c.fillStyle=glass;c.beginPath();c.roundRect(1,-44,19,10,1.5);c.fill();c.beginPath();c.roundRect(34,-44,17,10,1.5);c.fill();
  c.fillStyle='#5a6c6d';c.fillRect(-16,-25,6,1.4);c.fillRect(19,-29,5,1.2);c.fillRect(48,-28,5,1.2);
  c.fillStyle='#9c463b';c.fillRect(-34,-21,90,4);
  for(let i=0;i<10;i++){c.fillStyle=i%2?'#babc92':'#698a78';c.fillRect(-3+i*5.8,-16,5.5,3);}
  c.fillStyle='#365365';c.font='bold 5px system-ui';c.textAlign='center';c.save();c.translate(26,-24);if(a.phase==='out')c.scale(-1,1);c.fillText('AMBULANCE',0,0);c.restore();
  c.fillStyle='#375c73';c.save();c.translate(8,-28);for(let i=0;i<3;i++){c.rotate(Math.PI/3);c.fillRect(-3,-.8,6,1.6);}c.restore();
  // Headlights, bumper inserts, grille, amber markers and rear lamps.
  c.fillStyle='#ede8bc';c.beginPath();c.roundRect(-58,-25,7,4,1);c.fill();c.fillStyle='#273b43';c.fillRect(-59,-18,6,3);c.fillStyle='#d6dad0';c.fillRect(-60,-11,9,2);
  c.fillStyle='#944638';c.fillRect(55,-28,3,10);c.fillStyle='#d9b26f';c.fillRect(-44,-26,3,1.2);c.fillRect(50,-47,3,1.2);
  // Roof LED bar: compact emitters and bounded optical bloom.
  c.fillStyle='#526a72';c.beginPath();c.roundRect(-31,-54,23,3,1);c.fill();
  for(const [x,col,phase] of [[-29,'#628cdb',0],[-16,'#d86356',Math.PI]]){
    const lit=Math.sin(S.t*17+phase)>.35;c.fillStyle=lit?col:'#526b76';c.fillRect(x,-54,7,2);
    if(lit){const g=c.createRadialGradient(x+3,-53,0,x+3,-53,13);g.addColorStop(0,col+'99');g.addColorStop(1,col+'00');c.fillStyle=g;c.fillRect(x-10,-66,26,26);}
  }
  c.restore();
  for(const wx of [-37,37]){
    c.fillStyle='#1c282e';c.beginPath();c.arc(wx,-8,10,Math.PI,TAU);c.fill();
    const tire=c.createRadialGradient(wx-2,-10,1,wx,-8,8);tire.addColorStop(0,'#535b5b');tire.addColorStop(.62,'#242c30');tire.addColorStop(1,'#111d24');c.fillStyle=tire;c.beginPath();c.arc(wx,-8,8,0,TAU);c.fill();
    c.fillStyle='#97a7a4';c.beginPath();c.arc(wx,-8,4.4,0,TAU);c.fill();c.strokeStyle='#40575e';c.lineWidth=.75;
    const turn=moving?-a.x*.3:0;for(let i=0;i<6;i++){const angle=turn+i/6*TAU;c.beginPath();c.moveTo(wx+Math.cos(angle)*1.4,-8+Math.sin(angle)*1.4);c.lineTo(wx+Math.cos(angle)*3.7,-8+Math.sin(angle)*3.7);c.stroke();}
    c.fillStyle='#d3d5c7';c.beginPath();c.arc(wx,-8,1.25,0,TAU);c.fill();
  }
  if(moving){for(let i=0;i<3;i++){const x=64+i*12,g=c.createRadialGradient(x,-2,0,x,-2,10+i*2);g.addColorStop(0,'rgba(179,164,138,.1)');g.addColorStop(1,'rgba(179,164,138,0)');c.fillStyle=g;c.fillRect(x-16,-18,32,32);}}
  c.restore();
}
function drawBloodDrop(c,p,X,Y){
  const radius=clamp(p.r*VIEW.s,.35,1.8),speed=Math.hypot(p.vx,p.vy);
  c.save();c.translate(X,Y);c.rotate(Math.atan2(-p.vy,p.vx));
  c.fillStyle='#55221f';c.beginPath();c.ellipse(0,0,radius*(1+Math.min(speed/18,1.4)),radius*.7,0,0,TAU);c.fill();
  c.fillStyle='rgba(155,77,61,.65)';c.beginPath();c.ellipse(-radius*.25,-radius*.17,radius*.55,radius*.18,0,0,TAU);c.fill();c.restore();
}
function drawDetachedPart(c,p,X,Y){
  c.save();c.translate(X,Y);c.rotate(p.rot);c.scale(5,5);
  const skin=p.skin||'#bc9171';
  if(p.kind==='head'){
    drawHumanHead(c,0,0,{skin,hairC:p.hairC||'#48372d',face:'dead',dmg:{head:1}},1.15);
    drawWound(c,0,.39,.13,4);
  }else{
    const leg=p.kind==='leg',cloth=leg?(p.trousers||'#364249'):p.shirt;
    const a=[-.7,0],joint=[0,.14],b=[.65,-.02];
    taperedLimb(c,a,joint,leg?.2:.16,leg?.16:.12,cloth);
    taperedLimb(c,joint,b,leg?.15:.11,leg?.1:.065,leg?cloth:skin);
    c.fillStyle=leg?'#242b2e':skin;c.beginPath();c.ellipse(.73,leg?.06:0,leg?.22:.14,.1,0,0,TAU);c.fill();
    drawWound(c,-.7,0,leg?.2:.15,3);
  }
  c.restore();
}
function drawBloodStain(c,st){
  const X=W2SX(st.x),Y=W2SY(0),radius=Math.max(st.r*VIEW.s,1);
  const seed=st.seed===undefined?st.x*17:st.seed,age=S.t-(st.born||0);
  c.save();c.translate(X,Y);c.scale(1,.24);c.fillStyle=age>8?'rgba(61,32,26,.73)':'rgba(89,34,28,.82)';c.beginPath();
  for(let i=0;i<18;i++){const a=i/18*TAU,r=radius*(.78+.21*Math.sin(i*7.2+seed));c.lineTo(Math.cos(a)*r,Math.sin(a)*r);}
  c.closePath();c.fill();
  for(let i=0;i<5;i++){const a=seed+i*2.3,rr=radius*(1.1+i*.13);c.beginPath();c.ellipse(Math.cos(a)*rr,Math.sin(a)*rr,Math.max(.3,radius*.07),Math.max(.25,radius*.05),0,0,TAU);c.fill();}
  if(age<8){c.strokeStyle='rgba(185,120,89,.23)';c.lineWidth=.45;c.beginPath();c.ellipse(-radius*.12,-radius*.15,radius*.35,radius*.18,-.3,Math.PI,TAU);c.stroke();}c.restore();
}

/* Animate the photograph in isolated layers; the ground and ride structures stay fixed. */
const environmentMotion = {
  sky:null, foliage:[], ready:false,
  reduced:typeof matchMedia==='function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
};
function buildEnvironmentLayers(){
  if(!parkPlate.complete || !parkPlate.naturalWidth || environmentMotion.ready)return;
  const sky=document.createElement('canvas');sky.width=SW;sky.height=SH;
  const c=sky.getContext('2d');c.drawImage(parkPlate,0,0,SW,SH);
  // Only the cloud field moves: feather it away before the Ferris wheel and treeline.
  c.globalCompositeOperation='destination-in';
  const fade=c.createLinearGradient(0,330,0,390);fade.addColorStop(0,'#fff');fade.addColorStop(1,'#fff0');
  c.fillStyle=fade;c.fillRect(0,0,SW,SH);environmentMotion.sky=sky;
  // Canopies selected from the plate, with soft borders and zero displacement at roots.
  const patches=[[270,430,81,74],[351,450,50,50],[524,437,65,75],[592,455,61,54],[866,446,67,72]];
  environmentMotion.foliage=patches.map(([x,y,w,h],i)=>{
    const layer=document.createElement('canvas');layer.width=w;layer.height=h;
    const ctx=layer.getContext('2d');ctx.drawImage(parkPlate,x/SW*parkPlate.naturalWidth,y/SH*parkPlate.naturalHeight,w/SW*parkPlate.naturalWidth,h/SH*parkPlate.naturalHeight,0,0,w,h);
    ctx.globalCompositeOperation='destination-in';
    const mask=ctx.createRadialGradient(w*.5,h*.57,Math.min(w,h)*.22,w*.5,h*.57,Math.max(w,h)*.57);
    mask.addColorStop(0,'#fff');mask.addColorStop(.73,'#fffffff0');mask.addColorStop(1,'#fff0');ctx.fillStyle=mask;ctx.fillRect(0,0,w,h);
    return {layer,x,y,w,h,phase:i*1.7};
  });
  const foreground=document.createElement('canvas');foreground.width=108;foreground.height=30;
  const fg=foreground.getContext('2d');fg.drawImage(parkPlate,96/SW*parkPlate.naturalWidth,475/SH*parkPlate.naturalHeight,108/SW*parkPlate.naturalWidth,30/SH*parkPlate.naturalHeight,0,0,108,30);
  fg.globalCompositeOperation='destination-in';const fadeFG=fg.createLinearGradient(0,0,0,18);fadeFG.addColorStop(0,'#fff0');fadeFG.addColorStop(1,'#fff');fg.fillStyle=fadeFG;fg.fillRect(0,0,108,30);
  environmentMotion.wheelForeground=foreground;
  environmentMotion.ready=true;
}
function drawEnvironmentMotion(c){
  buildEnvironmentLayers();if(!environmentMotion.ready)return;
  if(environmentMotion.reduced){drawFerrisWheel(c,0);drawCoasterTrain(c,0);return;}
  // Overscan avoids seams at the image edges; a very long cycle keeps drift continuous.
  const drift=Math.sin(S.t*.012)*23;
  c.drawImage(environmentMotion.sky,-29+drift,-3,SW+58,SH+6);
  drawFerrisWheel(c,S.t);drawCoasterTrain(c,S.t);
  const gust=.5+.5*Math.sin(S.t*.37);
  for(const tree of environmentMotion.foliage){
    for(let row=0;row<tree.h;row+=2){
      const height=Math.min(2,tree.h-row),flex=(1-row/tree.h)**1.6;
      const sway=(Math.sin(S.t*1.12+tree.phase)*1.15+Math.sin(S.t*2.3+tree.phase)*.28)*(1+gust*.5)*flex;
      c.drawImage(tree.layer,0,row,tree.w,height,tree.x+sway,tree.y+row,tree.w,height);
    }
  }
}

const objectImages={};
for(const name of ['ambulance','capsule','riders']){const img=new Image();img.src='assets/'+name+'.png';objectImages[name]=img;}
const riderTextureCache=[];
const riderSources=[[48,8,390,912],[470,53,337,870],[850,12,376,910],[1265,55,352,868]];
function imageReady(name){const image=objectImages[name];return image.complete&&image.naturalWidth>0;}
function drawTexturedPerson(c,x,y,s,r,pose){
  const index=(r.seat||0)%4;
  if(!riderTextureCache[index]){
    const texture=document.createElement('canvas');texture.width=128;texture.height=304;
    texture.getContext('2d').drawImage(objectImages.riders,...riderSources[index],0,0,128,304);
    riderTextureCache[index]=texture;
  }
  const image=riderTextureCache[index];
  c.save();c.translate(x,y);c.scale(s,s);
  const stamp=()=>c.drawImage(image,-1.02,-2.12,2.04,4.83);
  const piece=(points,pivot=[0,0],angle=0,shorten=1)=>{
    c.save();c.translate(...pivot);c.rotate(angle);c.scale(1,shorten);c.translate(-pivot[0],-pivot[1]);
    c.beginPath();points.forEach(([px,py],i)=>i?c.lineTo(px,py):c.moveTo(px,py));c.closePath();c.clip();stamp();c.restore();
  };
  const limp=r.face==='dead'||r.face==='ko'||r.dmg.neck>=2;
  const step=r.mode==='held'&&!limp?Math.sin(r.armWave*2)*.45:r.mode==='boarding'?Math.sin(r.walkPh||0)*(r.panicking?.42:.12):0;
  const flutter=['flying','held'].includes(r.mode)&&!limp?Math.sin((r.armWave||0)*.55)*.35:0;
  for(const side of [-1,1]){
    const leg=[[-.51,.29],[.01,.29],[.01,2.74],[-.84,2.74]].map(([px,py])=>[side===1?-px:px,py]);
    if(r.dmg.legs!==3)piece(leg,[side*.25,.38],step*side,r.mode==='seated'?.68:1);
    else drawWound(c,side*.25,.48,.2,side);
    const arm=[[.5,-1.32],[.76,-1.04],[1.09,.86],[.72,.86],[.48,-.28],[.43,-1.1]].map(([px,py])=>[px*side,py]);
    if(r.dmg.arms!==3)piece(arm,[side*.5,-1.05],side*(pose&&!limp?-.95:0)+flutter*side-step*side);
    else drawWound(c,side*.51,-.81,.16,side+2);
  }
  piece([[-.16,-1.38],[-.53,-1.23],[-.48,-.56],[-.51,.37],[.51,.37],[.48,-.56],[.53,-1.23],[.16,-1.38]]);
  if(r.dmg.head!==3)piece([[-.43,-2.2],[.43,-2.2],[.38,-1.39],[.16,-1.2],[-.16,-1.2],[-.38,-1.39]],[0,-1.32],limp?.28:0);
  else drawWound(c,0,-1.36,.15,5);
  if(r.dmg.torso>0)drawWound(c,.16,-.14,r.dmg.torso>1?.23:.1,3);
  if(r.dmg.head>0&&r.dmg.head<3)drawWound(c,-.19,-1.75,.1,7);
  if(r.dmg.arms===2)drawWound(c,-.69,-.16,.11,4);
  if(r.dmg.legs===2)drawWound(c,.32,1.37,.14,2);
  c.restore();
}
function drawPhotoAmbulance(c,a=S.ambulance){
  const X=W2SX(a.x),gy=W2SY(0),out=a.phase==='out'||a.direction>0;
  const moving=a.phase!=='wait';
  c.save();c.translate(X,gy);c.scale(.82,.82);
  c.fillStyle='rgba(20,25,22,.25)';c.beginPath();c.ellipse(0,0,59,3,0,0,TAU);c.fill();
  if(out)c.scale(-1,1);
  // Crop to the vehicle bounds; keep image alpha and the tires on the ground.
  c.drawImage(objectImages.ambulance,8,80,1652,752,-60,-54.6,120,54.6);
  // Unmirror just the lettering on the far side, preserving the photographed panel.
  if(out){c.save();const dx=-60+(982-8)*120/1652,dy=-54.6+(293-80)*54.6/752,dw=514*120/1652,dh=95*54.6/752;c.translate(dx+dw/2,dy+dh/2);c.scale(-1,1);c.drawImage(objectImages.ambulance,982,293,514,95,-dw/2,-dh/2,dw,dh);c.restore();}
  for(const [x,y,rad] of [[-43.4,-7.2,4],[34.8,-7,4]]){
    if(!moving)continue;c.save();c.translate(x,y);c.rotate(-a.x*.35);c.strokeStyle='rgba(205,211,202,.5)';c.lineWidth=.5;
    for(let i=0;i<5;i++){c.rotate(TAU/5);c.beginPath();c.moveTo(1.3,0);c.lineTo(rad,0);c.stroke();}c.restore();
  }
  for(const [x,y,phase] of [[-16,-52.7,0],[49,-52,2]]){
    if(Math.sin(S.t*17+phase)<.3)continue;
    const light=c.createRadialGradient(x,y,0,x,y,10);light.addColorStop(0,'rgba(145,205,255,.9)');light.addColorStop(.3,'rgba(48,113,242,.35)');light.addColorStop(1,'rgba(48,113,242,0)');c.fillStyle=light;c.fillRect(x-10,y-10,20,20);
  }
  c.restore();
}

/* Background rides share the simulation clock, so pausing freezes the entire park. */
function drawFerrisWheel(c,time){
  const x=149,y=442,rx=43,ry=49,angle=time*TAU/110;
  c.save();
  // Distant atmosphere softens steel against the landscape.
  c.globalAlpha=.82;c.lineCap='round';
  // Rear support legs stay fixed while the rim and spokes rotate.
  c.strokeStyle='#586052';c.lineWidth=2.1;c.beginPath();c.moveTo(x-25,490);c.lineTo(x,y);c.lineTo(x+24,490);c.stroke();
  c.strokeStyle='#b3aa89';c.lineWidth=.65;c.beginPath();c.moveTo(x-25,490);c.lineTo(x-1,y);c.lineTo(x+23,490);c.stroke();
  // Two parallel rim planes give the wheel depth without rotating its support frame.
  for(const offset of [-2.2,0]){
    c.strokeStyle=offset?'#777b68':'#c2b695';c.lineWidth=offset?.9:1.1;
    c.beginPath();c.ellipse(x+offset,y,rx,ry,0,0,TAU);c.stroke();
    c.strokeStyle=offset?'rgba(79,83,66,.45)':'rgba(126,118,89,.7)';c.lineWidth=.42;
    for(let i=0;i<24;i++){
      const a=angle+i/24*TAU,px=x+offset+Math.cos(a)*rx,py=y+Math.sin(a)*ry;
      c.beginPath();c.moveTo(x+offset,y);c.lineTo(px,py);c.stroke();
      // Tangential cross-ties make spoke motion visible instead of a static radial star.
      c.beginPath();c.moveTo(x+offset+Math.cos(a+.15)*rx*.23,y+Math.sin(a+.15)*ry*.23);c.lineTo(px,py);c.stroke();
    }
  }
  for(let i=0;i<24;i++){
    const a=angle+i/24*TAU,px=x+Math.cos(a)*rx,py=y+Math.sin(a)*ry;
    c.strokeStyle='#696f5d';c.lineWidth=.6;c.beginPath();c.moveTo(px,py);c.lineTo(px,py+2);c.stroke();
    // Gondolas remain upright under gravity, independent of the wheel angle.
    c.fillStyle=surfaceGradient(c,px-2.1,0,px+2.1,0,[[0,'#6b6553'],[.35,'#aaa080'],[1,'#625e4f']]);
    c.beginPath();c.roundRect(px-2.2,py+1,4.4,3.3,.65);c.fill();
    c.fillStyle='#4e5d57';c.fillRect(px-1.6,py+1.4,3.2,1.15);
    c.strokeStyle='#c3b590';c.lineWidth=.35;c.beginPath();c.moveTo(px-2,py+1);c.lineTo(px+2,py+1);c.stroke();
  }
  c.fillStyle='#a59a7b';c.beginPath();c.arc(x,y,2,0,TAU);c.fill();
  c.fillStyle='#586151';c.beginPath();c.arc(x,y,.85,0,TAU);c.fill();
  c.restore();
  // The lower portion of the support structure disappears naturally into foreground trees.
  if(environmentMotion.wheelForeground)c.drawImage(environmentMotion.wheelForeground,96,475);
}
const coasterRoute=(()=>{
  // Surveyed screen-space centerline of the photographed upper rail, left to right.
  const nodes=[[696,466],[717,447],[737,430],[758,413],[780,406],[806,408],[830,416],[845,418],[858,408],[878,397],[901,400],[928,405],[960,410],[994,419]];
  const samples=[];let distance=0,elapsed=0;
  for(let segment=0;segment<nodes.length-1;segment++){
    const a=nodes[Math.max(0,segment-1)],b=nodes[segment],d=nodes[segment+1],e=nodes[Math.min(nodes.length-1,segment+2)];
    for(let j=0;j<24;j++){
      const t=j/24,t2=t*t,t3=t2*t;
      const interp=k=>.5*((2*b[k])+(-a[k]+d[k])*t+(2*a[k]-5*b[k]+4*d[k]-e[k])*t2+(-a[k]+3*b[k]-3*d[k]+e[k])*t3);
      const point={x:interp(0),y:interp(1)};
      if(samples.length){const prev=samples[samples.length-1],ds=Math.hypot(point.x-prev.x,point.y-prev.y);distance+=ds;
        // Slow chain lift on the first climb, then gravity-shaped speed over the hills.
        const speed=point.x<778?8:Math.sqrt(12*12+2*7*Math.max(0,point.y-395));elapsed+=ds/speed;
      }
      samples.push({...point,distance,time:elapsed});
    }
  }
  return {samples,duration:elapsed,length:distance};
})();
function coasterPointAtDistance(distance){
  const samples=coasterRoute.samples;
  let lo=0,hi=samples.length-1;
  while(lo<hi){const m=(lo+hi)>>1;if(samples[m].distance<distance)lo=m+1;else hi=m;}
  const b=samples[lo],a=samples[Math.max(0,lo-1)],f=clamp((distance-a.distance)/(b.distance-a.distance||1),0,1);
  return {x:lerp(a.x,b.x,f),y:lerp(a.y,b.y,f),angle:Math.atan2(b.y-a.y,b.x-a.x)};
}
function drawCoasterTrain(c,time){
  const route=coasterRoute,t=(time+12)%(route.duration+5);
  if(t>route.duration)return; // Train completes its hidden return behind the trees.
  let lo=0,hi=route.samples.length-1;
  while(lo<hi){const m=(lo+hi)>>1;if(route.samples[m].time<t)lo=m+1;else hi=m;}
  const b=route.samples[lo],a=route.samples[Math.max(0,lo-1)],f=clamp((t-a.time)/(b.time-a.time||1),0,1);
  const lead=lerp(a.distance,b.distance,f);
  for(let i=4;i>=0;i--){
    const distance=lead-i*5.2;if(distance<0)continue;
    const p=coasterPointAtDistance(distance);
    c.save();c.globalAlpha=clamp((p.x-710)/23,0,.9);c.translate(p.x,p.y-.8);c.rotate(p.angle);
    // Tiny individual cars track the rail tangent, with passengers above the restraint bar.
    c.fillStyle='#3e4640';c.fillRect(-2,-1.2,4.8,1.2);
    c.fillStyle=surfaceGradient(c,0,-4,0,0,[[0,'#c7aa72'],[.3,'#aa704c'],[1,'#5a493a']]);
    c.beginPath();c.roundRect(-2.1,-3.5,4.6,2.7,.6);c.fill();
    for(const x of [-1.1,1.1]){c.fillStyle='#645849';c.beginPath();c.arc(x,-4.2,.65,0,TAU);c.fill();c.fillStyle='#495650';c.fillRect(x-.6,-3.7,1.2,1.1);}
    c.strokeStyle='#d0bd8c';c.lineWidth=.35;c.beginPath();c.moveTo(-2,-2.3);c.lineTo(2,-2.3);c.stroke();
    c.fillStyle='#343d37';for(const x of [-1.2,1.4]){c.beginPath();c.arc(x,-.25,.55,0,TAU);c.fill();}
    c.restore();
  }
}
function drawRealisticBalloon(c,b,time=S.t){
  if(b.popped)return;
  // Center is deliberately identical to stepBalloons' collision position.
  const x=SW*b.f+Math.sin(time+b.ph)*14,y=SH-b.prog+20;
  const lean=Math.sin(time*.9+b.ph)*.075;
  c.save();c.translate(x,y);c.rotate(lean);
  const outline=()=>{c.beginPath();c.moveTo(0,9.7);c.bezierCurveTo(-1.4,8.3,-7.1,3.4,-6.8,-2.2);c.bezierCurveTo(-6.6,-11,6.6,-11,6.8,-2.2);c.bezierCurveTo(7.1,3.4,1.4,8.3,0,9.7);c.closePath();};
  // A loose cotton string bows in the wind; its knot stays attached to the neck.
  c.strokeStyle='rgba(221,209,175,.78)';c.lineWidth=.55;c.beginPath();c.moveTo(0,11);
  const wind=Math.sin(time*1.25+b.ph)*3;
  c.bezierCurveTo(wind-3,20,wind+5,28,wind+1,40);c.stroke();
  const latex=c.createRadialGradient(-2.7,-4,1,-.7,-1,10);
  latex.addColorStop(0,'#e4c6aa');latex.addColorStop(.22,b.c);latex.addColorStop(.62,b.c);latex.addColorStop(1,'#393c36');
  c.fillStyle=latex;outline();c.fill();
  c.save();outline();c.clip();
  // Broad sky reflection and a narrow warm rim imitate stretched translucent latex.
  const reflection=c.createRadialGradient(-2.8,-4.7,.2,-2.8,-4.7,4);
  reflection.addColorStop(0,'rgba(255,247,222,.56)');reflection.addColorStop(1,'rgba(255,247,222,0)');c.fillStyle=reflection;c.fillRect(-7,-10,14,20);
  c.strokeStyle='rgba(255,228,176,.24)';c.lineWidth=.65;c.beginPath();c.ellipse(-.1,-.6,6.1,7.7,-.07,Math.PI*.92,Math.PI*1.68);c.stroke();
  c.fillStyle='rgba(247,249,232,.6)';c.beginPath();c.ellipse(-2.8,-5,.65,1.45,.5,0,TAU);c.fill();c.restore();
  c.fillStyle=b.c;c.beginPath();c.moveTo(0,9);c.lineTo(-1.2,11);c.quadraticCurveTo(0,11.5,1.2,11);c.closePath();c.fill();
  c.strokeStyle='rgba(73,55,40,.55)';c.lineWidth=.5;c.beginPath();c.moveTo(-.6,9.8);c.lineTo(.6,9.8);c.stroke();c.restore();
}

function drawParachute(c,X,Y,r){
  const phase=(r.seat||0)*1.7,time=S.t;
  const wind=Math.sin(time*1.2+phase)*.8+Math.sin(time*2.9+phase)*.22;
  const inflation=r.chuteLanded?0:clamp(r.chuteInflation||.05,.05,1);
  c.save();
  if(r.chuteLanded){
    // Slack nylon pools beside the rider. Small ripples move, but it no longer floats.
    const gy=W2SY(.1);c.translate(X+12,gy);
    for(let i=0;i<9;i++){
      const x=-17+i*4,y=-1.5-Math.sin(i*1.9+phase)*1.4;
      c.fillStyle=surfaceGradient(c,0,y-3,0,2,[[0,i===2||i===6?'#b4774f':'#d4c9ac'],[1,'#777664']]);
      c.beginPath();c.moveTo(x,1);c.quadraticCurveTo(x+1,y-2+wind*.3,x+3,y);c.lineTo(x+6,1.3);c.closePath();c.fill();
    }
    c.strokeStyle='rgba(187,181,151,.5)';c.lineWidth=.4;
    for(let i=0;i<4;i++){c.beginPath();c.moveTo(-12+i*4,0);c.quadraticCurveTo(-19,-1+i,-24+i*2,0);c.stroke();}
    c.restore();return;
  }
  // A pressurized nine-cell wing banks gently while the load remains below it.
  const width=23*(.18+.82*inflation),height=11*(.3+.7*inflation);
  const tilt=clamp((r.vx||0)*.012,-.18,.18)+wind*.035;
  const centerX=X+wind*1.1,centerY=Y-19-15*inflation;
  const top=x=>-height*Math.sqrt(Math.max(0,1-(x/width)**2));
  const edge=x=>2.3+2.1*(x/width)**2+Math.sin(time*6+x*.45+phase)*(.25+.25*(1-inflation));
  const world=(x,y)=>[centerX+x*Math.cos(tilt)-y*Math.sin(tilt),centerY+x*Math.sin(tilt)+y*Math.cos(tilt)];
  c.lineWidth=.45;c.strokeStyle='rgba(230,222,192,.75)';
  for(let i=0;i<=8;i++){
    const x=lerp(-width,width,i/8),[ax,ay]=world(x,edge(x));
    c.beginPath();c.moveTo(ax,ay);c.lineTo(X+(i<4?-2.5:2.5),Y-3);c.stroke();
  }
  c.translate(centerX,centerY);c.rotate(tilt);
  for(let i=0;i<9;i++){
    const x0=lerp(-width,width,i/9),x1=lerp(-width,width,(i+1)/9),mid=(x0+x1)/2;
    const panel=surfaceGradient(c,x0,0,x1,0,[[0,'#9b927b'],[.25,i===2||i===6?'#d5a06c':'#f0e4c6'],[.65,i===2||i===6?'#b97e50':'#d7cbb0'],[1,'#a39c85']]);
    c.fillStyle=panel;c.beginPath();c.moveTo(x0,edge(x0));c.lineTo(x0,top(x0));
    c.quadraticCurveTo(mid,top(mid)-.7,x1,top(x1));c.lineTo(x1,edge(x1));
    c.quadraticCurveTo(mid,edge(mid)+.45,x0,edge(x0));c.closePath();c.fill();
    // Dark lower air cells and reinforced vertical seams give the canopy volume.
    c.fillStyle='rgba(74,72,58,.38)';c.beginPath();c.ellipse(mid,edge(mid)-.15,Math.max(.15,(x1-x0)*.34),.9*inflation,0,0,TAU);c.fill();
    c.strokeStyle='rgba(91,88,70,.42)';c.lineWidth=.4;c.beginPath();c.moveTo(x0,top(x0));c.lineTo(x0,edge(x0));c.stroke();
    c.strokeStyle='rgba(255,244,212,.55)';c.lineWidth=.45;c.beginPath();c.moveTo(x0,top(x0));c.quadraticCurveTo(mid,top(mid)-.7,x1,top(x1));c.stroke();
  }
  c.strokeStyle='#beb396';c.lineWidth=.65;c.beginPath();
  for(let i=0;i<=30;i++){const x=lerp(-width,width,i/30);i?c.lineTo(x,edge(x)):c.moveTo(x,edge(x));}c.stroke();
  c.restore();
}

/* ============================ MAIN LOOP ============================ */
let paused=false, previewOn=true, accumulator=0;
const FIXED_DT=1/240;
el('pauseBtn').onclick=()=>{paused=!paused;el('pauseBtn').textContent=paused?'Resume':'Pause';};
el('previewBtn').onclick=()=>{previewOn=!previewOn;el('previewBtn').textContent='Flight path: '+(previewOn?'on':'off');el('previewBtn').setAttribute('aria-pressed',String(previewOn));};
document.addEventListener('keydown',e=>{
  if(/INPUT|SELECT|BUTTON/.test(e.target.tagName)) return;
  if(e.code==='Space'){e.preventDefault();el('pauseBtn').click();}
  if(e.code==='KeyR') resetGame();
  if(e.target===scene && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code) && ['idle','dragging'].includes(S.phase)){
    e.preventDefault();S.phase='dragging';setControlsEnabled(false);
    const maxPull=Math.min(0.95*S.H,0.74*Math.max(S.H,55)+8);
    S.pod.x=clamp(S.pod.x+(e.code==='ArrowRight'?2:e.code==='ArrowLeft'?-2:0),-maxPull,maxPull);
    S.pod.y=clamp(S.pod.y+(e.code==='ArrowUp'?1:e.code==='ArrowDown'?-1:0),cfg.podR*.8,.45*S.H);
  }
  if(e.target===scene && e.code==='Enter' && S.phase==='dragging'){dragging=false;release();}
});
document.addEventListener('visibilitychange',()=>{lastT=performance.now();accumulator=0;});
let lastT=performance.now(),lastPanelPaint=-Infinity;
function frame(now){
  const dt=Math.max(0,(now-lastT)/1000);lastT=now;
  sctx.setTransform(DPR,0,0,DPR,0,0);gctx.setTransform(DPR,0,0,DPR,0,0);bctx.setTransform(DPR,0,0,DPR,0,0);
  computeView();
  if(!paused && !document.hidden){
    accumulator+=dt*Number(el('speedSl').value);
    // Preserve elapsed time on slow frames; retain any backlog rather than slowing the ride.
    let steps=0;
    while(accumulator>=FIXED_DT && steps<480){tick(FIXED_DT);accumulator-=FIXED_DT;steps++;}
  }
  S.peakAltitude=Math.max(S.peakAltitude||cfg.platformY,S.pod.y);
  drawScene();
  if(now-lastPanelPaint>=100){drawGraph();drawBodies();updateStats();lastPanelPaint=now;}
  el('phaseRead').textContent=paused?'Paused':({boarding:'Boarding',idle:'Ready',dragging:'Aiming',flying:'In flight',winch:'Returning',awaitBodies:'Recovery',done:'Complete'}[S.phase]||'Ready');
  el('speedRead').textContent=(Math.hypot(S.pod.vx,S.pod.vy)*3.6).toFixed(0)+' km/h';
  el('altRead').textContent=S.pod.y.toFixed(1)+' m';
  el('peakRead').textContent=S.peakAltitude.toFixed(1)+' m';
  requestAnimationFrame(frame);
}
refreshLabels();resetGame();requestAnimationFrame(frame);
