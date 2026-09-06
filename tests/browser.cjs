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
