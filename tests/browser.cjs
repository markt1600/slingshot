const {chromium}=require('playwright');const path=require('node:path');const {pathToFileURL}=require('node:url');const fs=require('node:fs');
const root=path.resolve(__dirname,'..');fs.mkdirSync(path.join(root,'test-results'),{recursive:true});const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});const page=await browser.newPage({viewport:{width:1500,height:1000}});let errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.join(root,'index.html')).href);await page.evaluate(()=>{paused=true;ui.snd.checked=false;});
console.log(await page.evaluate(()=>{const results=[];for(const h of [20,45,100,200])for(const n of [1,4])for(const pull of [5,25]){ui.height.value=h;ui.riders.value=n;ui.acc.value=0;ui.rope.value=300;resetGame();computeView();for(let i=0;i<800;i++)tick(1/240);S.pod.x=Math.min(pull,.95*h);S.phase='dragging';tick(1/240);release();let i=0;for(;i<240*90&&S.phase!=='done';i++){tick(1/240);if(!Number.isFinite(S.pod.x+S.pod.y+S.feltG))throw Error('non-finite');}if(S.phase!=='done')throw Error('Ride did not settle');results.push({h,n,pull,phase:S.phase,seconds:i/240,maxG:S.maxG.toFixed(1)});}return results;}));
console.log('camera',await page.evaluate(()=>{
  resetGame();computeView();const scale=VIEW.s,ox=VIEW.ox,oy=VIEW.oy;
  S.riders.forEach(r=>r.mode='seated');S.phase='dragging';release();
  S.pod.x=300;S.pod.y=500;
  for(let i=0;i<120;i++)tick(1/240);computeView();
  if(VIEW.s!==scale||VIEW.ox!==ox||VIEW.oy!==oy)throw Error('Camera changed after release');
  return 'Fixed scene scale after release passed';
}));
console.log('real-time motion',await page.evaluate(()=>{
  const originalRAF=window.requestAnimationFrame;window.requestAnimationFrame=()=>0;
  const result=[];
  try{
    for(const hz of [60,10,5]){
      ui.height.value=20;ui.riders.value=4;ui.acc.value=0;ui.rope.value=300;resetGame();ui.snd.checked=false;
      S.riders.forEach(r=>r.mode='seated');S.phase='dragging';S.pod.x=5;release();
      lastT=0;for(let i=1;i<=hz*2;i++)frame(i*1000/hz);
      if(Math.abs(S.t-2)>.005)throw Error('Dropped simulation time at '+hz+' FPS');
      result.push({hz,time:S.t,x:S.pod.x,y:S.pod.y});
    }
    for(const r of result)if(Math.hypot(r.x-result[0].x,r.y-result[0].y)>.03)throw Error('Motion depends on frame rate');
  }finally{window.requestAnimationFrame=originalRAF;lastT=performance.now();}
  resetGame();S.pod.x=1000;const rider=S.riders[0];rider.mode='flying';rider.y=1000;rider.vy=0;rider.vx=0;rider.hasChute=false;
  for(let i=0;i<240;i++)stepRiders(1/240);
  if(rider.vy>-9.3||rider.vy<-9.81)throw Error('Unrealistic initial free fall');
  return {frames:result,fallSpeedAfterOneSecond:rider.vy};
}));
console.log('empty capsule recovery',await page.evaluate(()=>{
  const results=[];
  for(const snapped of [false,true])for(const y of [8,150]){
    ui.height.value=200;ui.riders.value=2;ui.acc.value=0;ui.rope.value=300;resetGame();ui.snd.checked=false;
    S.riders.forEach(r=>{r.mode='landed';r.x=10;r.y=.5;});S.phase='dragging';release();
    S.plan.snap=false;S.snapped=[snapped,snapped];S.pod={x:20,y,vx:12,vy:20};
    let elapsed=0;while(S.phase!=='done'&&elapsed<10){tick(1/240);elapsed+=1/240;}
    if(S.phase!=='done')throw Error('Empty capsule cleanup did not complete');
    if(!snapped&&elapsed>1.5)throw Error('Attached recovery exceeded time bound');
    results.push({snapped,y,elapsed});
  }
  resetGame();S.riders.forEach(r=>r.mode='landed');S.riders[0].mode='flying';if(allRidersGrounded())throw Error('Early recovery');
  S.riders[0].mode='seated';if(allRidersGrounded())throw Error('Occupied recovery');
  return results;
}));
console.log('spectator behavior',await page.evaluate(()=>{
  ui.height.value=45;resetGame();computeView();
  if(DECOR.spect.length!==34)throw Error('Missing additional spectators');
  const fence=DECOR.spect[0],walker=DECOR.spect[15],start=walker.x,fenceStart=fence.x;
  for(let i=0;i<240;i++)tick(1/240);
  if(walker.x===start||fence.x!==fenceStart||S.crowdPanic)throw Error('Calm crowd behavior');
  walker.turnIn=0;stepSpectators(1/240);for(let i=0;i<240;i++)stepSpectators(1/240);const watchingX=walker.x;stepSpectators(.1);
  if(walker.x!==watchingX||walker.mode!=='landed')throw Error('Walker did not stop to watch');
  for(const trigger of [()=>doSnap(0),()=>ejectRiders([S.riders[0]]),()=>shedLimb(S.riders[0],'arm'),()=>{
    S.phase='flying';S.pod.y=1;S.pod.vy=-10;physStep(1/240);
  }]){
    resetGame();computeView();trigger();
    if(!S.crowdPanic)throw Error('Accident did not alert crowd');
    const deadlines=DECOR.spect.map(sp=>sp.panicAt);panicSpectators();
    if(DECOR.spect.some((sp,i)=>sp.panicAt!==deadlines[i]))throw Error('Repeated alarm delays reaction');
    S.t+=.6;stepSpectators(1/240);
    if(DECOR.spect.some(sp=>!sp.panicking))throw Error('Not all spectators panicked');
    if(DECOR.spect.some(sp=>sp.behavior!=='startled'))throw Error('Missing initial startled reaction');
    if(!DECOR.spect.some(sp=>sp.pointT>0))throw Error('Nobody points at the incident');
    for(let i=0;i<240;i++)stepSpectators(1/240);
    const sp=DECOR.spect[15],x=sp.x;stepSpectators(.1);
    if(Math.abs(sp.x-x)<sp.speed*.1*2)throw Error('Panic speed too slow');
    const escapeDir=sp.dir;
    for(let i=0;i<240*15;i++){
      stepSpectators(1/240);
      if(sp.behavior==='fleeing'&&sp.dir!==escapeDir)throw Error('Fleeing spectator randomly reversed direction');
    }
    if(DECOR.spect.some(sp=>!Number.isFinite(sp.x)||sp.x<24||sp.x>SW-24))throw Error('Crowd escaped midway');
    if(DECOR.spect.some(sp=>sp.behavior!=='milling'))throw Error('Crowd did not start milling');
    const positions=DECOR.spect.map(sp=>sp.x);
    for(let i=0;i<240*2;i++)stepSpectators(1/240);
    if(DECOR.spect.every((sp,i)=>Math.abs(sp.x-positions[i])<1))throw Error('Crowd remained stationary at edges');
    sp.gestureIn=0;stepSpectators(1/240);
    if(sp.lookDir!==Math.sign(W2SX(S.pod.x)-sp.x)||sp.lookT<=0)throw Error('Spectator did not look back at ride');
  }
  resetGame();computeView();const victim=DECOR.spect[15];victim.x=800;
  crushSpectators(spectWorldX(victim),.01);
  if(victim.alive)throw Error('Collision missed moving spectator');
  const hitX=victim.x;stepSpectators(1);
  if(victim.x!==hitX)throw Error('Crushed spectator moved');
  resetGame();
  if(S.crowdPanic||DECOR.spect.some(sp=>!sp.alive||sp.panicking||sp.panicAt!==Infinity))throw Error('Crowd reset failed');
  return 'walking, watching, accident reactions, speed, bounds, moving collisions and reset passed';
}));
console.log('spectator assistance',await page.evaluate(()=>{
  resetGame();computeView();S.pod.x=100;S.pod.y=100;
  const r=S.riders[0];Object.assign(r,{mode:'flying',x:0,y:.51,vx:0,vy:-2,hasChute:false});
  stepSpectators(1/240);
  if(DECOR.spect.some(sp=>sp.helpRider))throw Error('Helpers approached before touchdown');
  stepRiders(.02);stepSpectators(1/240);
  const helpers=DECOR.spect.filter(sp=>sp.helpRider===r);
  if(!r.groundContact||helpers.length!==3)throw Error('Touchdown did not recruit three helpers');
  const initial=helpers.map(sp=>Math.abs(sp.x-W2SX(r.x)));
  for(let i=0;i<240;i++)stepSpectators(1/240);
  if(!helpers.some((sp,i)=>Math.abs(sp.x-W2SX(r.x))<initial[i]-5))throw Error('Helpers did not rush toward rider');
  r.mode='landed';
  for(let i=0;i<240*12;i++)stepSpectators(1/240);
  if(helpers.some(sp=>sp.behavior!=='helping'))throw Error('Helpers did not attend fallen rider');
  if(new Set(helpers.map(sp=>sp.helpOffset)).size!==3)throw Error('Helpers piled onto one spot');
  r.mode='taken';stepSpectators(1/240);
  if(helpers.some(sp=>sp.helpRider||sp.behavior!=='milling'))throw Error('Helpers did not resume milling after rescue');
  resetGame();computeView();
  S.riders.forEach((r,i)=>Object.assign(r,{mode:'landed',x:i*8,y:.5}));
  stepSpectators(1/240);
  if(S.riders.some(r=>DECOR.spect.filter(sp=>sp.helpRider===r).length!==3))throw Error('Multiple riders did not get helpers');
  const dead=DECOR.spect.find(sp=>sp.helpRider);dead.alive=false;stepSpectators(1/240);
  if(DECOR.spect.filter(sp=>sp.alive&&sp.helpRider===dead.helpRider).length!==3)throw Error('Lost helper not replaced');
  resetGame();if(DECOR.spect.some(sp=>sp.helpRider))throw Error('Reset retained helper assignments');
  return 'touchdown, approach, attendance, multiple riders, replacement and rescue cleanup passed';
}));
console.log('capsule contact and rescue',await page.evaluate(()=>{
  for(const height of [20,45,200]){
    ui.height.value=height;resetGame();computeView();S.riders.forEach(r=>r.mode='seated');
    const radius=(podPxR()+RIDER_SCENE_SCALE)/VIEW.s;
    const r={...makeRiders(1,false,false)[0],spectator:true,mode:'flying',x:-radius+.1,y:30,vx:30,vy:0,ejT:S.t};
    S.spectatorBodies.push(r);Object.assign(S.pod,{x:0,y:30,vx:0,vy:0});
    collideRiders(0,30);if(!S.hits)throw Error('Visible cage edge missed immediate spectator throw');
    const hits=S.hits;
    Object.assign(r,{x:radius+3,y:30,stepX:-radius-3,stepY:30,vx:90,vy:0});S.pod.vx=0;
    collideRiders(0,30,.1,0,30);
    if(S.hits!==hits+1||r.x>=0)throw Error('Fast crossing tunneled through capsule');
  }
  resetGame();computeView();ui.belts.checked=true;S.belts=true;S.riders.forEach(r=>r.mode='seated');
  S.phase='dragging';release();S.plan.snap=false;S.plan.beltFail=false;S.Tmax=1e12;
  for(let i=0;i<240*11&&S.phase!=='done';i++)tick(1/240);
  if(S.phase!=='done'||S.t-S.tRelease>10.1||Math.hypot(S.pod.vx,S.pod.vy)>1e-6)throw Error('Belted ride return exceeded bound');
  ui.riders.value=4;resetGame();computeView();
  S.riders.forEach((r,i)=>{r.mode='landed';r.x=(i-2)*10;r.y=.5;r.face=i<3?'pain':'happy';if(i<3)r.dmg.legs=2;});
  stepAmbulance(.01);
  if(S.ambulances.length!==3||new Set(S.ambulances.map(a=>a.patient)).size!==3)throw Error('Missing independent ambulances');
  stepAmbulance(.01);if(S.ambulances.length!==3)throw Error('Duplicate dispatch');
  const first=S.ambulances[0];first.x=first.targetX+7;first.phase='wait';first.timer=1.6;stepAmbulance(.1);
  if(first.patient.mode!=='taken'||S.riders.filter(r=>r.mode==='taken').length!==1)throw Error('Ambulance collected another vehicle’s patients');
  const x=first.x;stepAmbulance(.1);if(first.x<=x)throw Error('Departing ambulance drives backward');
  for(let i=0;i<240*15;i++)stepAmbulance(1/240);
  if(S.ambulances.length||S.riders.slice(0,3).some(r=>r.mode!=='taken')||S.riders[3].mode!=='landed')throw Error('Rescue did not finish or removed healthy survivor');
  resetGame();if(S.ambulances.length)throw Error('Reset retained rescue vehicles');
  return 'visible-size contacts, immediate throws, swept crossings, bounded belted return, multiple rescues and forward departure passed';
}));
console.log('cord tests',await page.evaluate(()=>{ui.height.value=45;resetGame();const slack=cordForce(0,S.H),stretch=cordForce(20,10),out=cordForce(20,10,10,0),inward=cordForce(20,10,-10,0);if(slack.T.some(t=>t!==0)||out.T[0]<=stretch.T[0]||inward.T[0]>=stretch.T[0])throw Error('cord force');return 'passed';}));
console.log('failure scenarios',await page.evaluate(()=>{
  const results=[];for(const h of [45,200])for(const chute of [false,true]){
    ui.height.value=h;ui.riders.value=4;ui.acc.value=100;ui.rope.value=50;ui.belts.checked=false;ui.chutes.checked=chute;resetGame();ui.snd.checked=false;S.riders.forEach(r=>r.mode='seated');S.pod.x=20;S.phase='dragging';tick(1/240);release();doSnap(0);doSnap(1);
    let i=0;for(;i<240*120&&S.phase!=='done';i++)tick(1/240);
    if(S.phase!=='done'||!Number.isFinite(S.pod.x+S.pod.y))throw Error('failed ride stuck');results.push({h,chute,phase:S.phase});
  }ui.belts.checked=true;ui.chutes.checked=false;return results;
}));
console.log('special cases',await page.evaluate(()=>{
  ui.acc.value=0;ui.height.value=45;ui.riders.value=2;ui.rope.value=300;resetGame();ui.snd.checked=false;paused=true;computeView();
  S.phase='flying';S.t=10;S.pod.x=0;S.pod.y=50;S.pod.vx=0;S.pod.vy=0;
  const r=S.riders[0];r.mode='flying';r.x=-2;r.y=50;r.vx=10;r.vy=0;r.ejT=0;
  const before=cfg.riderMass*r.vx+S.mass*S.pod.vx;collideRiders(0,50);
  const after=cfg.riderMass*r.vx+S.mass*S.pod.vx;if(Math.abs(before-after)>1e-8)throw Error('momentum not conserved');
  resetGame();S.phase='flying';S.pod.x=100;S.pod.y=100;const chute=S.riders[0];chute.mode='flying';chute.x=0;chute.y=80;chute.vy=-12;chute.hasChute=true;
  for(let i=0;i<240*30&&chute.mode==='flying';i++){S.t+=1/240;stepRiders(1/240);}
  if(!chute.chuteLanded||chute.mode!=='landed')throw Error('chute landing failed');
  resetGame();S.phase='flying';S.pod.vx=13;S.pod.vy=7;S.riders.forEach(r=>r.mode='seated');ejectRiders([S.riders[0]]);
  if(S.mass!==cfg.baseMass+cfg.riderMass||Math.abs(S.riders[0].vx-13)>1.01)throw Error('ejection mass or velocity failed');
  resetGame();S.phase='dragging';dragging=true;cancelPull();if(dragging||S.phase!=='boarding')throw Error('cancel failed');
  return 'momentum, parachute touchdown, ejection inertia/mass, pointer cancellation passed';
}));
// Real pointer capture and launch, pause, reset, and keyboard aiming.
await page.evaluate(()=>{ui.height.value=45;ui.acc.value=0;ui.rope.value=300;resetGame();ui.snd.checked=false;for(let i=0;i<800;i++)tick(1/240);paused=true;});
let point=await page.evaluate(()=>{const b=scene.getBoundingClientRect();return{x:b.x+W2SX(S.pod.x)*b.width/SW,y:b.y+W2SY(S.pod.y)*b.height/SH};});
await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x-90,point.y-15);await page.mouse.up();assert.equal(await page.evaluate(()=>S.phase),'flying');
await page.click('#resetBtn');await page.evaluate(()=>{for(let i=0;i<800;i++)tick(1/240);paused=true;});await page.focus('#scene');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>S.phase),'flying');
console.log('Pointer and keyboard launch passed.');
await page.evaluate(()=>{ui.height.value=65;ui.riders.value=2;ui.acc.value=15;ui.rope.value=100;resetGame();for(let i=0;i<800;i++)tick(1/240);computeView();paused=false;});await page.waitForTimeout(500);await page.screenshot({path:path.join(root,'test-results/desktop.png')});
await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'test-results/mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'mobile overflow');assert.deepEqual(errors,[]);console.log('No browser errors; mobile layout fits.');await browser.close();})();
