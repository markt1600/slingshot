const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
    await page.evaluate(()=>{
      paused=true;ui.snd.checked=false;
      const check=(samples,time,vx,vy)=>{
        pointerSamples=samples;const actual=spectatorReleaseVelocity(time);
        if(Math.abs(actual.vx-vx)>.01||Math.abs(actual.vy-vy)>.01)throw Error('Release velocity: '+JSON.stringify(actual));
      };
      check([{x:0,y:0,t:0},{x:.2,y:.1,t:4}],5,50,25); // very fast flick
      check([{x:0,y:0,t:0},{x:2,y:0,t:200}],202,10,0); // sparse events retain anchor
      check([{x:0,y:0,t:0},{x:1,y:0,t:60},{x:-1,y:1,t:100}],105,-50,25); // last-second reversal
      check([{x:0,y:0,t:0},{x:2,y:0,t:40}],140,50,0); // brief release delay retains flick
      check([{x:0,y:0,t:0},{x:2,y:0,t:40}],290,50,0); // stop briefly, then release naturally
      check([{x:0,y:0,t:0},{x:2,y:0,t:40}],365,25,0); // smooth decay
      check([{x:0,y:0,t:0},{x:2,y:0,t:40}],440,0,0); // holding still drops
      pointerSamples=[];
      resetGame();paused=true;S.pod.x=1000;
      const rider=S.riders[0];Object.assign(rider,{mode:'flying',x:0,y:100,vx:0,vy:0,hasChute:false});
      const spectator={...rider,dmg:{...rider.dmg},spectator:true,x:30};S.spectatorBodies.push(spectator);
      for(let i=0;i<240;i++)stepRiders(1/240);
      if(!(spectator.y<rider.y-2&&spectator.vy<rider.vy*1.4))throw Error('Spectator falls are not faster');
      if(rider.vy>-9.3||rider.vy<-9.81)throw Error('Ride gravity changed');
      // Exercise the full coordinate sampler + release, not just the estimator.
      const event=(x,y,t)=>{const b=scene.getBoundingClientRect();return {clientX:b.x+x*b.width/SW,clientY:b.y+y*b.height/SH,timeStamp:t};};
      for(const [start,end,release] of [[0,2000,2095],[0,0,1],[0,20,130],[0,20,270]]){
        heldSpectator=spectator;pointerSamples=[];spectator.mode='held';
        moveHeldSpectator(event(700,200,start));moveHeldSpectator(event(730,190,end));
        releaseSpectator(event(730,190,release));
        if(spectator.vx<10||spectator.vy<=0)throw Error('Sparse/delayed flick became a drop');
        const x=spectator.x;stepRiders(.05);
        if(spectator.x<=x+.4)throw Error('Release momentum did not move the spectator');
      }
    });
    const point=async(x,y)=>page.evaluate(({x,y})=>{const b=scene.getBoundingClientRect();return {x:b.x+x*b.width/SW,y:b.y+y*b.height/SH};},{x,y});
    for(const phase of ['boarding','idle','flying','done']){
      await page.evaluate(phase=>{
        resetGame();ui.snd.checked=false;S.riders.forEach(r=>r.mode='seated');S.phase='dragging';release();S.phase=phase;paused=true;computeView();
        Object.assign(DECOR.balloons[0],{f:.8,ph:0,prog:300,popped:false});
        DECOR.spect.at(-1).x=800;
      },phase);
      const bp=await page.evaluate(()=>balloonPos(DECOR.balloons[0])),b=await point(...bp);
      await page.mouse.click(b.x,b.y);
      assert.equal(await page.evaluate(()=>DECOR.balloons[0].popped),true);
      assert.equal(await page.evaluate(()=>S.score),10);
      await page.mouse.click(b.x,b.y);assert.equal(await page.evaluate(()=>S.score),10);
      const gy=await page.evaluate(()=>W2SY(0)-11),sp=await point(800,gy),air=await point(800,200);
      await page.mouse.move(sp.x,sp.y);await page.mouse.down();await page.mouse.move(air.x,air.y,{steps:8});
      assert.equal(await page.evaluate(()=>heldSpectator.mode),'held');
      assert.equal(await page.evaluate(()=>S.phase),phase);
      if(phase==='flying'){
        const before=await page.locator('#scene').screenshot();
        await page.evaluate(()=>{heldSpectator.armWave+=1;drawScene();});
        assert(!before.equals(await page.locator('#scene').screenshot()),'held struggle does not animate');
        await page.screenshot({path:path.resolve(__dirname,'../test-results/interactive-carnage.png')});
      }
      const y=await page.evaluate(()=>heldSpectator.y);
      await page.evaluate(()=>stepRiders(.1));assert.equal(await page.evaluate(()=>heldSpectator.y),y,'held body falls');
      await page.waitForTimeout(450);await page.mouse.up();
      assert.equal(await page.evaluate(()=>heldSpectator),null);
      assert.equal(await page.evaluate(()=>S.spectatorBodies[0].vx),0,'stale mouse speed throws a stationary hold');
      await page.evaluate(()=>{
        S.pod.x=1000;
        for(let i=0;i<240*20&&S.spectatorBodies[0].mode!=='landed';i++){S.t+=1/240;stepRiders(1/240);}
        scoreInjuries();
      });
      assert.equal(await page.evaluate(()=>S.spectatorBodies[0].mode),'landed');
      assert(await page.evaluate(()=>S.spectatorBodies[0].landLvl>=3),'height drop did not use injury rules');
      const score=await page.evaluate(()=>S.score);assert(score>10);
      await page.evaluate(()=>scoreInjuries());assert.equal(await page.evaluate(()=>S.score),score);
    }
    // A fresh moving release transfers mouse velocity; cancel drops without a throw.
    await page.evaluate(()=>{resetGame();paused=true;ui.snd.checked=false;computeView();DECOR.spect.at(-1).x=800;});
    const start=await point(800,await page.evaluate(()=>W2SY(0)-11)),air=await point(740,250);
    await page.mouse.move(start.x,start.y);await page.mouse.down();
    await page.mouse.move(air.x,air.y,{steps:10});await page.mouse.up();
    assert(await page.evaluate(()=>Math.hypot(S.spectatorBodies[0].vx,S.spectatorBodies[0].vy)>4),'fling has no momentum');
    const center=await page.evaluate(()=>[W2SX(S.spectatorBodies[0].x),W2SY(S.spectatorBodies[0].y)]),again=await point(...center);
    await page.mouse.move(again.x,again.y);await page.mouse.down();
    assert(await page.evaluate(()=>!!heldSpectator),'airborne spectator cannot be caught');
    await page.evaluate(()=>scene.dispatchEvent(new PointerEvent('pointercancel',{pointerId:activePointer})));
    await page.mouse.up();assert.equal(await page.evaluate(()=>heldSpectator),null);
    assert.equal(await page.evaluate(()=>S.spectatorBodies[0].vx),0);
    // Bonus is restricted to a thrown spectator hitting a moving capsule, once per throw.
    await page.evaluate(()=>{
      const r=S.spectatorBodies[0];S.t=2;Object.assign(S.pod,{x:0,y:30,vx:10,vy:0});
      Object.assign(r,{x:-1,y:30,vx:30,vy:0,mode:'flying',flung:true,capsuleBonus:false,ejT:0});
      collideRiders(0,30);
    });
    assert.equal(await page.evaluate(()=>S.score),500);
    assert.equal(await page.evaluate(()=>S.spectatorBodies[0].capsuleBonus),true);
    await page.evaluate(()=>{const r=S.spectatorBodies[0];Object.assign(r,{x:-1,y:30,vx:30,vy:0});S.pod.vx=10;collideRiders(0,30);});
    assert.equal(await page.evaluate(()=>S.score),500);
    const best=await page.evaluate(()=>bestCarnage);await page.evaluate(()=>resetGame());
    assert.equal(await page.evaluate(()=>S.score),0);assert.equal(await page.evaluate(()=>bestCarnage),best);
    assert.equal(await page.evaluate(()=>S.spectatorBodies.length),0);
    await page.reload();assert.equal(await page.evaluate(()=>bestCarnage),best,'best score was not persisted');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: balloon clicks and spectator grabs across ride phases, held physics, drops, flings, catch/cancel, injuries, scoring, bonus and mobile layout.');
  }finally{await browser.close();}
})();
