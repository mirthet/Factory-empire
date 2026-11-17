'use strict';

// Factory Empire — standalone browser idle game, without a server.
const STORAGE_KEY = 'factory-empire-save-v1';
const OFFLINE_CAP_SECONDS = 8 * 60 * 60;
const PATENT_EUROS = 1_000_000; // one patent for every million earned this run
const MACHINE_TYPES = [
  { name:'Werkbank', icon:'🔨', revenue:2, duration:2, cost:10, managerCost:90, managerName:'Sam de Smid' },
  { name:'Boormachine', icon:'🛠️', revenue:16, duration:4, cost:120, managerCost:750, managerName:'Bo de Bouwer' },
  { name:'CNC-machine', icon:'⚙️', revenue:115, duration:6, cost:1100, managerCost:6000, managerName:'Cees de CNC-expert' },
  { name:'Lasstraat', icon:'🔥', revenue:900, duration:9, cost:9000, managerCost:48000, managerName:'Lara de Lasser' },
  { name:'Assemblagelijn', icon:'🏗️', revenue:6600, duration:13, cost:72000, managerCost:370000, managerName:'Alex de Assembleur' },
  { name:'Robotarm', icon:'🦾', revenue:52000, duration:18, cost:570000, managerCost:3000000, managerName:'Robin de Robotexpert' },
  { name:'Smart Factory', icon:'🧠', revenue:410000, duration:25, cost:4600000, managerCost:24000000, managerName:'Kim de Data-engineer' },
  { name:'Mega-industrie', icon:'🏭', revenue:3400000, duration:35, cost:39000000, managerCost:195000000, managerName:'Max de Fabrieksbaas' },
  { name:'Nanofabriek', icon:'🔬', revenue:29000000, duration:48, cost:320000000, managerCost:1600000000, managerName:'Nina de Nano-specialist' },
  { name:'Ruimtefabriek', icon:'🚀', revenue:240000000, duration:65, cost:2700000000, managerCost:14000000000, managerName:'Nova de Ruimtebouwer' }
];
const MILESTONES = [25, 50, 100, 200, 400, 800];
// Separate permanent upgrades for each machine, available after buying at least one.
// Twenty-upgrade repeating rotation: 60% ×2, 25% ×3, 10% ×4, 5% ×10.
// Bigger boosts are spaced out rather than appearing every four upgrades.
const PROFIT_STEPS = [2,2,3,2,4,2,3,2,2,10,2,3,2,4,2,3,2,2,3,2];
const SPEED_STEPS = [.8, .75, .6, .5]; // 20%, 25%, 40%, 50% shorter per upgrade
// Global upgrades affect ALL machines, including managed/offline production.
const GLOBAL_PROFIT_STEPS = PROFIT_STEPS;
const GLOBAL_SPEED_STEPS = [.8, .75, .6, .5];
const MAX_GLOBAL_UPGRADES = 16;
function globalFactor(type){
  const steps=type==='profit'?GLOBAL_PROFIT_STEPS:GLOBAL_SPEED_STEPS;
  const count=game.globalUpgrades[type];
  let factor=1;
  for(let i=0;i<count;i++)factor*=steps[i%steps.length];
  return factor;
}
function globalUpgradeCost(type){
  const count=game.globalUpgrades[type];
  const start=type==='profit'?2500:4000;
  return Math.ceil(start*Math.pow(type==='profit'?6:7,count));
}
function profitFactor(i) {
  let f=1;
  for(let n=0;n<game.machines[i].profitUpgrades;n++) f*=PROFIT_STEPS[n%PROFIT_STEPS.length];
  return f;
}
function duration(i) {
  const m=game.machines[i];
  let factor=1;
  for(let n=0;n<m.speedUpgrades;n++) factor*=SPEED_STEPS[n%SPEED_STEPS.length];
  return Math.max(.25,MACHINE_TYPES[i].duration*factor*globalFactor('speed'));
}
function upgradeCost(i,type){
  const m=game.machines[i],n=type==='profit'?m.profitUpgrades:m.speedUpgrades;
  const start=MACHINE_TYPES[i].cost * (type==='profit'?12:20);
  return Math.ceil(start*Math.pow(type==='profit'?5:6,n));
}

const now = () => Date.now();
const $ = id => document.getElementById(id);
const money = n => `€ ${compact(n)}`;
function compact(n) {
  if (!Number.isFinite(n)) return '∞';
  if (Math.abs(n) < 1000) return Math.floor(n).toLocaleString('nl-NL');
  const marks = [['Qa',1e15],['T',1e12],['B',1e9],['M',1e6],['K',1e3]];
  const mark = marks.find(([,factor]) => n >= factor);
  if (!mark) return n.toFixed(0);
  return (n / mark[1]).toLocaleString('nl-NL',{maximumFractionDigits:2}) + ' ' + mark[0];
}
function defaultSave() {
  return {
    balance: 25,
    earned: 0,
    spent: 0,
    cycles: 0,
    runEarned: 0,
    patentsTotal: 0,
    patentsAvailable: 0,
    patentValueUpgrades: 0,
    prestigeCount: 0,
    globalUpgrades:{profit:0,speed:0},
    machines: MACHINE_TYPES.map((_, i) => ({ level:i===0?1:0, manager:false, running:false, progress:0, profitUpgrades:0, speedUpgrades:0 })),
    updatedAt: now()
  };
}
function readSave() {
  try {
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || !Array.isArray(saved.machines) || saved.machines.length!==MACHINE_TYPES.length) return defaultSave();
    const clean=defaultSave();
    for(const field of ['balance','earned','spent','cycles','runEarned','patentsTotal','patentsAvailable','patentValueUpgrades','prestigeCount']) {
      if(Number.isFinite(saved[field]) && saved[field]>=0) clean[field]=saved[field];
    }
    // Saves from older versions had no prestige data, so use total earned as first-run earnings.
    if(!Object.hasOwn(saved,'runEarned'))clean.runEarned=clean.earned;
    clean.patentsTotal=Math.floor(clean.patentsTotal);
    clean.patentsAvailable=Math.min(clean.patentsTotal,Math.floor(clean.patentsAvailable));
    clean.patentValueUpgrades=Math.min(100,Math.floor(clean.patentValueUpgrades));
    clean.prestigeCount=Math.floor(clean.prestigeCount);
    for(const type of ['profit','speed']){
      const value=saved.globalUpgrades?.[type];
      if(Number.isSafeInteger(value)&&value>=0)clean.globalUpgrades[type]=Math.min(MAX_GLOBAL_UPGRADES,value);
    }
    clean.machines=saved.machines.map((machine,i)=>({
      level:Number.isSafeInteger(machine.level)&&machine.level>=0?machine.level:(i===0?1:0),
      manager:Boolean(machine.manager)&&Number(machine.level)>0,
      running:Boolean(machine.running)&&Number(machine.level)>0,
      progress:Number.isFinite(machine.progress)?Math.max(0,Math.min(.999999,machine.progress)):0,
      profitUpgrades:Number.isSafeInteger(machine.profitUpgrades)&&machine.profitUpgrades>=0?Math.min(100,machine.profitUpgrades):0,
      speedUpgrades:Number.isSafeInteger(machine.speedUpgrades)&&machine.speedUpgrades>=0?Math.min(100,machine.speedUpgrades):0
    }));
    clean.updatedAt=Number.isFinite(saved.updatedAt) ? Math.min(saved.updatedAt,now()):now();
    return clean;
  } catch {return defaultSave();}
}
let game=readSave();
let buyMode='1';
let activeTab='machines';
let lastTick=now();
let toastTimer;
let lastRender=0;
let lastSave=0;
let hiddenSince=null;

// Every batch milestone doubles the output of that machine.
function multiplier(level) { return 2**MILESTONES.filter(n=>level>=n).length; }
function patentPercentage(){return 2+game.patentValueUpgrades;}
function patentMultiplier(){return 1+game.patentsTotal*patentPercentage()/100;}
function pendingPatents(){return Math.floor(game.runEarned/PATENT_EUROS);}
function patentUpgradeCost(){return Math.ceil(10*Math.pow(2.5,game.patentValueUpgrades));}
function payout(i){const m=game.machines[i],d=MACHINE_TYPES[i];return m.level*d.revenue*multiplier(m.level)*profitFactor(i)*globalFactor('profit')*patentMultiplier();}
function unitCost(i, level){return Math.ceil(MACHINE_TYPES[i].cost * Math.pow(1.16,level));}
function purchaseQuote(i,requested){
  const current=game.machines[i].level;
  const nextMilestone=MILESTONES.find(n=>n>current);
  const maxCount=requested==='next'?(nextMilestone?nextMilestone-current:0):requested==='max'?10000:Number(requested);
  let count=0,total=0;
  for(let j=0;j<maxCount;j++){
    const price=unitCost(i,current+j);
    if(!Number.isFinite(price)||total+price>game.balance) break;
    total+=price;count++;
  }
  if(requested==='next'){
    let fullPrice=0;
    for(let j=0;j<maxCount;j++) fullPrice+=unitCost(i,current+j);
    // NEXT always buys the full batch for the next doubling milestone.
    return {count:count===maxCount?count:0,total:fullPrice,nextCost:unitCost(i,current),target:nextMilestone};
  }
  return {count,total,nextCost:unitCost(i,current),target:nextMilestone};
}
function incomeRate(){return game.machines.reduce((sum,m,i)=>sum+(m.manager?payout(i)/duration(i):0),0);}
function addMoney(amount,cycles){
  if(!amount||!Number.isFinite(amount))return;
  game.balance+=amount;game.earned+=amount;game.runEarned+=amount;game.cycles+=cycles;
}
function updateProduction(elapsedSeconds,offlineOnly=false){
  if(elapsedSeconds<=0)return 0;
  let totalEarned=0;
  for(let i=0;i<MACHINE_TYPES.length;i++){
    const m=game.machines[i], d=MACHINE_TYPES[i];
    if(!m.manager && offlineOnly)continue;
    if(!m.running && !m.manager)continue;
    if(m.level===0)continue;
    const cyclesElapsed=elapsedSeconds/duration(i);
    if(m.manager){
      const progress=m.progress+cyclesElapsed;
      const completed=Math.floor(progress+1e-9);
      m.progress=progress-completed;
      m.running=true;
      if(completed>0){const amount=completed*payout(i);addMoney(amount,completed);totalEarned+=amount;}
    }else{
      m.progress+=cyclesElapsed;
      if(m.progress>=1){const amount=payout(i);addMoney(amount,1);totalEarned+=amount;m.running=false;m.progress=0;}
    }
  }
  return totalEarned;
}
function save(){
  try{game.updatedAt=now();localStorage.setItem(STORAGE_KEY,JSON.stringify(game));$('saveIndicator').textContent='● Opgeslagen';lastSave=now();}
  catch{$('saveIndicator').textContent='● Opslaan niet mogelijk';}
}
function notify(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2200);}
function showOffline(amount,seconds){
  if(seconds<5||amount<=0)return;
  $('offlineAmount').textContent=`+ ${money(amount)}`;
  const h=Math.floor(seconds/3600),min=Math.floor(seconds%3600/60);
  $('offlineDuration').textContent=`${h?h+' uur en ':''}${min} minuten afwezig`;
  $('offlineLimitNote').textContent=seconds>=OFFLINE_CAP_SECONDS?'Maximaal 8 uur offline opbrengst berekend':'100% opbrengst · maximaal 8 uur';
  $('offlineModal').hidden=false;
  $('collectButton').focus();
}
function offlineCatchup(){
  const elapsed=Math.max(0,(now()-game.updatedAt)/1000);
  const allowed=Math.min(elapsed,OFFLINE_CAP_SECONDS);
  const earned=updateProduction(allowed,true);
  game.updatedAt=now();lastTick=now();
  save();
  showOffline(earned,elapsed);
}
function tick(){
  if(document.hidden)return;
  const current=now();
  let delta=Math.max(0,(current-lastTick)/1000);
  lastTick=current;
  // Browsers may throttle timers. A time jump counts as offline time for managed machines.
  if(delta>8){const earned=updateProduction(Math.min(delta,OFFLINE_CAP_SECONDS),true);if(earned>0)showOffline(earned,delta);}
  else updateProduction(delta,false);
  if(current-lastRender>120){renderDynamic();lastRender=current;}
  if(current-lastSave>2000)save();
}
function buy(i){
  const quote=purchaseQuote(i,buyMode);
  if(!quote.count){notify(buyMode==='next'?'Niet genoeg geld om de volgende verdubbeling te bereiken.':'Niet genoeg geld voor deze upgrade.');return;}
  game.balance-=quote.total;game.spent+=quote.total;game.machines[i].level+=quote.count;
  save();renderAll();notify(`${MACHINE_TYPES[i].name}: +${quote.count} gekocht!`);
}
function start(i){
  const m=game.machines[i];
  if(!m.level||m.running||m.manager)return;
  m.running=true;m.progress=0;save();renderAll();
}
function hire(i){
  const m=game.machines[i],d=MACHINE_TYPES[i];
  if(!m.level||m.manager||game.balance<d.managerCost){notify('Deze manager kun je nog niet aannemen.');return;}
  game.balance-=d.managerCost;game.spent+=d.managerCost;m.manager=true;m.running=true;
  save();renderAll();notify(`${d.managerName} is aangenomen!`);
}
function buySpecialUpgrade(i,type){
  if(!['profit','speed'].includes(type)||!Number.isInteger(i)||i<0||i>=MACHINE_TYPES.length)return;
  const m=game.machines[i];
  const count=type==='profit'?m.profitUpgrades:m.speedUpgrades;
  if(!m.level||count>=100||(type==='speed'&&duration(i)<=.2500001))return;
  const cost=upgradeCost(i,type);
  if(!Number.isFinite(cost)||game.balance<cost){notify('Niet genoeg geld voor deze upgrade.');return;}
  game.balance-=cost;game.spent+=cost;
  if(type==='profit')m.profitUpgrades++;
  else m.speedUpgrades++;
  save();renderAll();
  notify(`${MACHINE_TYPES[i].name}: ${type==='profit'?'winst verhoogd':'productietijd verkort'}!`);
}
function buyGlobalUpgrade(type){
  if(!['profit','speed'].includes(type))return;
  const count=game.globalUpgrades[type];
  if(count>=MAX_GLOBAL_UPGRADES||(type==='speed'&&MACHINE_TYPES.every((_,i)=>duration(i)<=.2500001))){notify('Deze globale upgrade is maximaal.');return;}
  const cost=globalUpgradeCost(type);
  if(!Number.isFinite(cost)||game.balance<cost){notify('Niet genoeg geld voor de globale upgrade.');return;}
  game.balance-=cost;game.spent+=cost;game.globalUpgrades[type]++;
  save();renderAll();
  notify(type==='profit'?'Alle machines verdienen nu meer!':'Alle machines produceren nu sneller!');
}
function prestige(){
  const reward=pendingPatents();
  if(reward<1){notify('Verdien eerst minstens € 1 miljoen in deze speelronde.');return;}
  const message=`Opnieuw beginnen voor ${compact(reward)} patent${reward===1?'':'en'}?\n\nJe verliest al je geld, machines, managers en normale upgrades. Je patenten en patentupgrades blijven bewaard.`;
  if(!confirm(message))return;
  const previous=game;
  game=defaultSave();
  game.patentsTotal=previous.patentsTotal+reward;
  game.patentsAvailable=previous.patentsAvailable+reward;
  game.patentValueUpgrades=previous.patentValueUpgrades;
  game.prestigeCount=previous.prestigeCount+1;
  lastTick=now();
  save();renderAll();
  notify(`+${compact(reward)} patenten! Je nieuwe winstbonus is ×${patentMultiplier().toLocaleString('nl-NL',{maximumFractionDigits:2})}.`);
}
function upgradePatents(){
  const price=patentUpgradeCost();
  if(game.patentValueUpgrades>=100 || game.patentsAvailable<price){notify('Niet genoeg patenten voor deze upgrade.');return;}
  game.patentsAvailable-=price;
  game.patentValueUpgrades++;
  save();renderAll();
  notify(`Elk patent geeft nu +${patentPercentage()}% winst!`);
}
function setupEvents(){
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{
    activeTab=b.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(el=>{
      const selected=el.dataset.tab===activeTab;
      el.classList.toggle('active',selected);el.setAttribute('aria-selected',String(selected));
    });
    for(const tab of ['Machines','Managers','Upgrades','Patents','Stats']) $('panel'+tab).hidden=tab.toLowerCase()!==activeTab;
    renderAll();
  }));
  document.querySelectorAll('[data-buy]').forEach(b=>b.addEventListener('click',()=>{
    buyMode=b.dataset.buy;
    document.querySelectorAll('[data-buy]').forEach(el=>el.classList.toggle('selected',el.dataset.buy===buyMode));
    renderMachines();
  }));
  $('machines').addEventListener('click',event=>{
    const b=event.target.closest('button[data-action]');if(!b)return;
    const i=Number(b.dataset.index);
    if(b.dataset.action==='buy')buy(i);
    else if(b.dataset.action==='start')start(i);
  });
  $('managers').addEventListener('click',event=>{
    const b=event.target.closest('button[data-hire]');if(b)hire(Number(b.dataset.hire));
  });
  $('upgrades').addEventListener('click',event=>{
    const button=event.target.closest('button[data-upgrade]');
    if(button)buySpecialUpgrade(Number(button.dataset.index),button.dataset.upgrade);
    const globalButton=event.target.closest('button[data-global-upgrade]');
    if(globalButton)buyGlobalUpgrade(globalButton.dataset.globalUpgrade);
  });
  $('prestigeButton').addEventListener('click',prestige);
  $('patentUpgradeButton').addEventListener('click',upgradePatents);
  $('collectButton').addEventListener('click',()=>{$('offlineModal').hidden=true;});
  $('resetButton').addEventListener('click',()=>{
    if(!confirm('ALLES verwijderen, ook je patenten en prestige-upgrades? Dit is definitief.'))return;
    game=defaultSave();lastTick=now();save();renderAll();notify('Nieuw spel gestart.');
  });
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden){save();hiddenSince=now();}
    else{const elapsed=Math.max(0,(now()-game.updatedAt)/1000);const earned=updateProduction(Math.min(elapsed,OFFLINE_CAP_SECONDS),true);lastTick=now();save();renderAll();showOffline(earned,elapsed);hiddenSince=null;}
  });
  window.addEventListener('pagehide',save);
}
function renderMachines(){
  $('machines').innerHTML=MACHINE_TYPES.map((d,i)=>{
    const m=game.machines[i],q=purchaseQuote(i,buyMode);
    const next=MILESTONES.find(v=>v>m.level);
    const buttonText=buyMode==='max' ? `KOOP MAX ${q.count?`(x${q.count})`:''}` : buyMode==='next' ? (next?`KOOP NEXT (x${next-m.level} → lvl ${next})`:'ALLE MIJLPALEN BEHAALD') : `KOOP x${buyMode}`;
    const price=buyMode==='next' && !next ? '—' : money(buyMode==='next'?q.total:(q.count?q.total:q.nextCost));
    return `<article class="machine-card ${m.level===0?'locked':''}">
      <div class="machine-top"><div class="machine-icon" aria-hidden="true">${d.icon}</div>
      <div class="machine-info"><h3>${d.name}</h3><div class="machine-sub">Level ${compact(m.level)} · ${duration(i).toLocaleString('nl-NL',{maximumFractionDigits:2})} sec/cyclus</div></div>
      <div class="machine-value"><strong>${money(payout(i))}</strong><small>per cyclus</small></div></div>
      <div class="progress-track" role="progressbar" aria-label="Voortgang ${d.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(m.progress*100)}"><div id="progress${i}" class="progress-fill" style="width:${m.progress*100}%"></div></div>
      <div class="machine-actions"><button data-action="start" data-index="${i}" type="button" class="start-btn ${m.manager?'auto':''}" ${!m.level||m.running||m.manager?'disabled':''}>${m.manager?'✓ AUTOMATISCH':m.running?'⏳ BEZIG...':'▶ START PRODUCTIE'}</button>
      <button data-action="buy" data-index="${i}" type="button" class="upgrade-btn" ${!q.count?'disabled':''}>${buttonText} · ${price}</button></div>
      ${m.level===0?'<div class="unlock-note">🔒 Koop je eerste machine om te beginnen.</div>':''}
      <div class="milestones">${m.manager?'🟢 Manager actief':'👔 Nog geen manager'} ${next?` · Volgende verdubbeling bij level <b>${next}</b>`:' · Alle mijlpalen behaald'}</div>
    </article>`;
  }).join('');
}
function renderGlobalUpgrades(){
  const profitCount=game.globalUpgrades.profit;
  const speedCount=game.globalUpgrades.speed;
  const profitMax=profitCount>=MAX_GLOBAL_UPGRADES;
  const speedMax=speedCount>=MAX_GLOBAL_UPGRADES||MACHINE_TYPES.every((_,i)=>duration(i)<=.2500001);
  const nextProfit=GLOBAL_PROFIT_STEPS[profitCount%GLOBAL_PROFIT_STEPS.length];
  const nextSpeed=GLOBAL_SPEED_STEPS[speedCount%GLOBAL_SPEED_STEPS.length];
  const profitCost=globalUpgradeCost('profit'),speedCost=globalUpgradeCost('speed');
  const bonus=globalFactor('profit');
  const speedPercent=Math.round((1-globalFactor('speed'))*100);
  return `<section class="global-section" aria-label="Globale upgrades">
    <div class="global-heading"><span class="global-mark" aria-hidden="true">🌍</span><div><h3>Globale upgrades</h3><p>Deze bonussen gelden voor <strong>alle 10 machines</strong>, ook met managers en offline.</p></div></div>
    <div class="special-options">
      <div class="special-option"><div><span class="special-label">💰 Wereldwijde winst · niveau ${profitCount}</span><strong>${profitMax?'MAX bereikt':`×${nextProfit} op alle inkomsten`}</strong><small>Huidige totale globale winstbonus: ×${compact(bonus)}. De volgende bonus stapelt hier bovenop.</small></div><button type="button" data-global-upgrade="profit" ${profitMax||game.balance<profitCost?'disabled':''}>${profitMax?'MAX':money(profitCost)}</button></div>
      <div class="special-option"><div><span class="special-label">⚡ Wereldwijde snelheid · niveau ${speedCount}</span><strong>${speedMax?'MAX bereikt':`${Math.round((1-nextSpeed)*100)}% kortere tijd`}</strong><small>Huidige globale tijdsverkorting: ${speedPercent}%. Geldt voor iedere machine (minimaal 0,25 sec per cyclus).</small></div><button type="button" data-global-upgrade="speed" ${speedMax||game.balance<speedCost?'disabled':''}>${speedMax?'MAX':money(speedCost)}</button></div>
    </div>
  </section><div class="local-upgrade-heading"><h3>Upgrades per machine</h3><p>Deze gelden alleen voor de gekozen machine.</p></div>`;
}
function renderUpgrades(){
  $('upgrades').innerHTML=renderGlobalUpgrades()+MACHINE_TYPES.map((d,i)=>{
    const m=game.machines[i];
    const profitStep=PROFIT_STEPS[m.profitUpgrades%PROFIT_STEPS.length];
    const speedStep=SPEED_STEPS[m.speedUpgrades%SPEED_STEPS.length];
    const profitPrice=upgradeCost(i,'profit');
    const speedPrice=upgradeCost(i,'speed');
    const speedSeconds=duration(i);
    const profitMax=m.profitUpgrades>=100,speedMax=m.speedUpgrades>=100||speedSeconds<=.2500001;
    return `<article class="special-card">
      <div class="special-heading"><span class="special-icon">${d.icon}</span><div><h3>${d.name}</h3><small>Level ${compact(m.level)} · ${money(payout(i))} per cyclus · ${speedSeconds.toLocaleString('nl-NL',{maximumFractionDigits:2})} sec</small></div></div>
      <div class="special-options">
        <div class="special-option"><div><span class="special-label">💰 Winstupgrade ${m.profitUpgrades+1}</span><strong>${profitMax?'Maximum bereikt':`×${profitStep} winst`}</strong><small>Huidige winstbonus: ×${compact(profitFactor(i))}</small></div><button type="button" data-upgrade="profit" data-index="${i}" ${!m.level||game.balance<profitPrice||profitMax?'disabled':''}>${profitMax?'MAX':money(profitPrice)}</button></div>
        <div class="special-option"><div><span class="special-label">⚡ Snelheidsupgrade ${m.speedUpgrades+1}</span><strong>${speedMax?'Maximum bereikt':`${Math.round((1-speedStep)*100)}% sneller`}</strong><small>Productietijd: ${speedSeconds.toLocaleString('nl-NL',{maximumFractionDigits:2})} sec → ${Math.max(.25,speedSeconds*speedStep).toLocaleString('nl-NL',{maximumFractionDigits:2})} sec</small></div><button type="button" data-upgrade="speed" data-index="${i}" ${!m.level||game.balance<speedPrice||speedMax?'disabled':''}>${speedMax?'MAX':money(speedPrice)}</button></div>
      </div>
      ${!m.level?'<p class="special-locked">🔒 Koop eerst minstens één machine van dit type.</p>':''}
    </article>`;
  }).join('');
}
function renderManagers(){
  $('managers').innerHTML=MACHINE_TYPES.map((d,i)=>{
    const m=game.machines[i];
    return `<article class="manager-card"><div class="manager-avatar" aria-hidden="true">👷</div><div class="manager-info"><h3>${d.managerName}</h3><p>Automatiseert de ${d.name.toLowerCase()}. ${m.manager?'Verdient ook offline geld.':'Start iedere cyclus automatisch opnieuw.'}</p></div><button data-hire="${i}" type="button" class="manager-buy ${m.manager?'hired':''}" ${m.manager||m.level===0||game.balance<d.managerCost?'disabled':''}>${m.manager?'✓ AANGENOMEN':money(d.managerCost)}</button></article>`;
  }).join('');
}
function renderDynamic(){
  $('cash').textContent=money(game.balance);
  $('income').textContent=`${money(incomeRate())} / seconde automatisch`;
  $('ownedCount').textContent=compact(game.machines.reduce((a,m)=>a+m.level,0));
  $('managerCount').textContent=`${game.machines.filter(m=>m.manager).length} / ${MACHINE_TYPES.length}`;
  $('statEarned').textContent=money(game.earned);
  $('patentCount').textContent=compact(game.patentsTotal);
  $('patentAvailable').textContent=compact(game.patentsAvailable);
  $('patentBonus').textContent='+'+((patentMultiplier()-1)*100).toLocaleString('nl-NL',{maximumFractionDigits:2})+'%';
  $('patentPer').textContent='+'+patentPercentage()+'%';
  $('patentPending').textContent=compact(pendingPatents());
  $('patentRunEarned').textContent=money(game.runEarned);
  $('patentPrestiges').textContent=compact(game.prestigeCount);
  $('patentNextCost').textContent=compact(patentUpgradeCost())+' patenten';
  $('patentUpgradeButton').disabled=game.patentValueUpgrades>=100||game.patentsAvailable<patentUpgradeCost();
  $('prestigeButton').disabled=pendingPatents()<1;
  $('patentNextPercent').textContent='+'+(patentPercentage()+1)+'% per patent';
  $('patentProgress').style.width=Math.min(100,(game.runEarned%PATENT_EUROS)/PATENT_EUROS*100)+'%';
  $('statSpent').textContent=money(game.spent);
  $('statCycles').textContent=compact(game.cycles);
  $('statRate').textContent=money(incomeRate())+' / sec';
  if(activeTab==='machines'){
    for(let i=0;i<MACHINE_TYPES.length;i++){
      const progress=$('progress'+i);
      if(progress){progress.style.width=(game.machines[i].progress*100)+'%';progress.parentElement.setAttribute('aria-valuenow',String(Math.round(game.machines[i].progress*100)));}
    }
    // Costs / affordance are refreshed at a lower cadence, avoiding DOM churn each frame.
    if(now()-lastMachineRender>600){renderMachines();lastMachineRender=now();}
  }
  if(activeTab==='upgrades' && now()-lastUpgradeRender>900){renderUpgrades();lastUpgradeRender=now();}
  if(activeTab==='managers' && now()-lastManagerRender>900){renderManagers();lastManagerRender=now();}
}
let lastMachineRender=0,lastManagerRender=0,lastUpgradeRender=0;
function renderAll(){renderMachines();renderManagers();renderUpgrades();renderDynamic();lastMachineRender=now();lastManagerRender=now();lastUpgradeRender=now();}
setupEvents();
offlineCatchup();
renderAll();
setInterval(tick,100);
