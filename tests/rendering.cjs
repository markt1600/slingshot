const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(root,'index.html')).href);
    await page.evaluate(async()=>{await Promise.all([parkPlate.decode(),...Object.values(objectImages).map(img=>img.decode())]);paused=true;ui.snd.checked=false;});
    fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
    await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.id='renderQA';canvas.width=1100;canvas.height=620;
      canvas.style.cssText='position:fixed;inset:0;z-index:99;width:1100px;height:620px;background:#849796';document.body.append(canvas);
      const c=canvas.getContext('2d');c.fillStyle='#849796';c.fillRect(0,0,1100,620);
      c.fillStyle='#1e343e';c.font='18px system-ui';c.fillText('MATERIAL / CHARACTER INSPECTION',30,35);
      S.riders=makeRiders(4,true,false);
      S.riders.forEach((r,i)=>{r.mode='seated';drawPerson(c,90+i*115,145,30,r,0);});
      S.pod={x:0,y:10,vx:0,vy:0};S.nRiders=4;S.barT=1;S.podRot=0;VIEW={s:1,ox:0,oy:0};
      c.save();c.translate(760,190);c.scale(3.5,3.5);drawPod(c);c.restore();
      S.ambulance={x:0,phase:'in'};c.save();c.translate(340,470);c.scale(3.5,3.5);drawAmbulance(c);c.restore();
      S.ambulance.phase='out';c.save();c.translate(820,470);c.scale(3.5,3.5);drawAmbulance(c);c.restore();
    });
    await page.locator('#renderQA').screenshot({path:path.join(root,'test-results/materials.png')});
    // Exercise every damage level and particle material, including rescue and all rider counts.
    await page.evaluate(()=>{
      const c=document.querySelector('#renderQA').getContext('2d');
      for(let level=0;level<=3;level++){
        for(const r of S.riders){for(const part of Object.keys(r.dmg))r.dmg[part]=level;r.mode='flying';r.x=r.seat*3;r.y=10;r.face=level===3?'dead':'pain';}
        drawFlyingRiders(c);drawBodies();
        S.particles=[...['head','arm','leg'].map(kind=>({type:'limb',kind,x:0,y:10,rot:.7,shirt:'#725f54',skin:'#bd9672'})),{type:'blood',x:1,y:12,r:.1,vx:4,vy:-5}];
        drawParticles(c);drawBloodStain(c,{x:1,r:2,born:S.t});
      }
    });
    // Test actual photographed layers at fixed timestamps. The base scene is not used,
    // so rider motion or banners cannot make the environment checks pass accidentally.
    const renderLayer=async(kind,time,reduced=false)=>{
      await page.evaluate(({kind,time,reduced})=>{
        S.t=time;environmentMotion.reduced=reduced;const c=document.querySelector('#renderQA').getContext('2d');
        c.clearRect(0,0,1100,620);c.fillStyle='#849796';c.fillRect(0,0,1100,620);drawEnvironmentMotion(c);
      },{kind,time,reduced});
      return page.screenshot({clip:kind==='sky'?{x:10,y:10,width:900,height:300}:{x:270,y:435,width:400,height:80}});
    };
    const sky0=await renderLayer('sky',0),sky8=await renderLayer('sky',8);
    assert(!sky0.equals(sky8),'cloud pixels must move');
    const trees0=await renderLayer('trees',0),trees2=await renderLayer('trees',2);
    assert(!trees0.equals(trees2),'foliage pixels must move');
    const still0=await renderLayer('sky',0,true),still8=await renderLayer('sky',8,true);
    assert(still0.equals(still8),'reduced motion must leave the environment still');
    // Isolate each new animated subject: no clouds, foliage or game UI in these crops.
    const renderSubject=async(subject,time)=>{
      await page.evaluate(({subject,time})=>{
        const c=document.querySelector('#renderQA').getContext('2d');c.clearRect(0,0,1100,620);
        c.fillStyle='#849796';c.fillRect(0,0,1100,620);
        if(subject==='wheel')drawFerrisWheel(c,time);
        if(subject==='coaster')drawCoasterTrain(c,time);
        if(subject==='balloon')drawRealisticBalloon(c,{f:.15,ph:0,prog:300,c:'#ae584a',popped:false},time);
      },{subject,time});
      return page.locator('#renderQA').screenshot();
    };
    assert(!(await renderSubject('wheel',0)).equals(await renderSubject('wheel',7)),'Ferris wheel must turn');
    assert(!(await renderSubject('coaster',0)).equals(await renderSubject('coaster',3)),'coaster must move');
    assert(!(await renderSubject('balloon',0)).equals(await renderSubject('balloon',1)),'balloon and string must drift');
    // Photograph + new rides: save an enlarged inspection view to catch track misalignment.
    await page.evaluate(()=>{
      const c=document.querySelector('#renderQA').getContext('2d');c.clearRect(0,0,1100,620);
      c.fillStyle='#849796';c.fillRect(0,0,1100,620);
      const drawArea=(sx,sy,sw,sh,dx,dy,dw,dh)=>c.drawImage(parkPlate,sx/SW*parkPlate.naturalWidth,sy/SH*parkPlate.naturalHeight,sw/SW*parkPlate.naturalWidth,sh/SH*parkPlate.naturalHeight,dx,dy,dw,dh);
      drawArea(95,382,112,125,20,30,336,375);c.save();c.translate(20-95*3,30-382*3);c.scale(3,3);drawFerrisWheel(c,7);c.restore();
      drawArea(710,380,250,110,390,30,700,308);c.save();c.translate(390-710*2.8,30-380*2.8);c.scale(2.8,2.8);drawCoasterTrain(c,8);c.restore();
      for(let i=0;i<4;i++){c.save();c.translate(100+i*240-144*3,420-240*3);c.scale(3,3);drawRealisticBalloon(c,{f:.15,ph:0,prog:320,c:['#bd5950','#4f74ad','#c9ab55','#6c9460'][i],popped:false},0);c.restore();}
    });
    await page.locator('#renderQA').screenshot({path:path.join(root,'test-results/park-animation.png')});
    assert.deepEqual(errors,[]);
    console.log('PASS: character/vehicle materials, all injury levels, detached parts, blood, cloud drift, foliage sway, reduced motion, Ferris wheel, coaster train and balloons.');
  }finally{await browser.close();}
})();
