const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('Scripts/Source/NirnCommand_PlayerAlias.psc','utf8');
function translate(line) {
  line=line.trim();
  if (/^if /.test(line)) return 'if ('+line.slice(3)+') {';
  if (/^elseif /.test(line)) return '} else if ('+line.slice(7)+') {';
  if (line==='else') return '} else {';
  if (line==='endif' || line==='endwhile') return '}';
  if (/^while /.test(line)) return 'while ('+line.slice(6)+') {';
  line=line.replace(/^(int|string|Actor|Quest|ReferenceAlias)\s+(\w+)\s*=/,'let $2 =');
  line=line.replace(/\bNone\b/g,'null');
  line=line.replace(/\s+as\s+ReferenceAlias\b/g,'');
  return line+';';
}
function compile(name, args) {
  const body=source.match(new RegExp('Function '+name+'\\([^\\n]*\\)\\r?\\n([\\s\\S]*?)\\r?\\nEndFunction'))[1];
  const js=body.split(/\r?\n/).map(translate).join('\n');
  return new Function('ctx','with(ctx) { return function('+args+') {\n'+js+'\n}; }');
}
const make=compile('TrackNPC','token, context, request, session, viewGeneration, operation');
const makeCleanup=compile('CleanupTracking','');
const makeValidity=compile('TrackingStillValid','');
const makeCancellationMatch=compile('TrackingCancellationMatches','targetForm');
function fixture() {
  const actor=id=>({id, dead:false, disabled:false, deleted:false,GetFormID(){return this.id;},IsDead(){return this.dead;},IsDisabled(){return this.disabled;},IsDeleted(){return this.deleted;}});
  const a=actor(100),b=actor(200);
  const alias={actor:null,fail:false,GetActorRef(){return this.actor;},Clear(){this.actor=null;},ForceRefTo(value){this.actor=this.fail?null:value;}};
  const quest={running:false,active:false,shown:false,failStart:false,starts:0,sets:0,GetAlias(){return alias;},IsRunning(){return this.running;},IsActive(){return this.active;},IsObjectiveDisplayed(){return this.shown;},SetObjectiveDisplayed(id,shown){this.shown=shown;this.sets++;},SetActive(value){this.active=value;},Start(){this.starts++; if(this.onStart)this.onStart();this.running=!this.failStart;return this.running;},Stop(){this.running=false;}};
  const ctx={_trackingEpoch:1,_trackingOwner:1,_trackingBusy:true,_catalogSession:'session',_viewGeneration:1,_trackedActor:null,_trackingConfirmed:false,
    Debug:{Trace(){}},SKSE:{GetPluginVersion(){return 1;}},Magelight:{IsUIModeActive(){return false;}},Utility:{WaitMenuMode(){if(ctx.onWait)ctx.onWait();}},
    NirnCommandNative:{NextTrackingRequest(){return 1;},WorldContext(){return 3;},ResolveTrackingActor(){},TrackingResolutionStatus(){return ctx.status??1;},TrackingResolvedActor(){return ctx.candidate;},ClearTrackingResolution(){}},
    ClosePalette(){return true;},TrackingQuest(){return quest;},PublishTracking(){ctx.published=ctx._trackingConfirmed;}};
  ctx.CleanupTracking=makeCleanup(ctx);
  ctx.candidate=a;
  const track=()=>make(ctx)(9,3,'42','session',1,ctx._trackingOwner);
  return {ctx,quest,alias,a,b,track};
}
{
 const f=fixture();f.track();assert.equal(f.ctx._trackedActor,f.a);assert.equal(f.ctx.published,true);assert.equal(f.alias.actor,f.a);assert.equal(f.quest.active,true);assert.equal(f.quest.shown,true);
 const sets=f.quest.sets;f.track();assert.equal(f.quest.sets,sets);assert.equal(f.quest.starts,1);
 f.ctx.candidate=f.b;f.track();assert.equal(f.alias.actor,f.b);assert.equal(f.ctx._trackedActor,f.b);assert.equal(f.quest.active,true);
 f.ctx.CleanupTracking();f.ctx.CleanupTracking();assert.equal(f.alias.actor,null);assert.equal(f.quest.running,false);assert.equal(f.ctx._trackingConfirmed,false);
}
{
 const f=fixture();f.a.dead=true;f.track();assert.equal(f.quest.running,false);assert.equal(f.ctx._trackingConfirmed,false);
}
for (const invalid of ['disabled','deleted']) {
 const f=fixture();f.a[invalid]=true;f.track();assert.equal(f.quest.running,false);assert.equal(f.ctx._trackingConfirmed,false);
}
{
 const f=fixture();f.ctx.status=-1;f.track();assert.equal(f.quest.running,false);assert.equal(f.ctx._trackingConfirmed,false);
}
{
 const f=fixture();f.quest.failStart=true;f.track();assert.equal(f.ctx._trackingConfirmed,false);assert.equal(f.alias.actor,null);assert.equal(f.quest.active,false);
}
{
 const f=fixture();f.alias.fail=true;f.track();assert.equal(f.ctx._trackingConfirmed,false);assert.equal(f.quest.running,false);assert.equal(f.alias.actor,null);
}
{
 const f=fixture();f.quest.SetActive=function(){this.active=false;};f.track();assert.equal(f.ctx._trackingConfirmed,false);assert.equal(f.quest.running,false);assert.equal(f.alias.actor,null);
}
{
 const f=fixture();f.quest.onStart=()=>{f.ctx._trackingEpoch++;};f.track();assert.equal(f.ctx._trackingConfirmed,false);assert.equal(f.quest.running,false);assert.equal(f.alias.actor,null);
}
{
 const f=fixture();f.ctx.onWait=()=>{f.ctx._catalogSession='other-save';};f.track();assert.equal(f.quest.running,false);assert.equal(f.ctx._trackingConfirmed,false);
}
{
 const f=fixture();f.track();f.ctx.candidate=f.b;f.b.disabled=true;f.track();assert.equal(f.ctx._trackedActor,f.a);assert.equal(f.alias.actor,f.a);
}
{
 const f=fixture();f.track();const valid=makeValidity(f.ctx);f.a.dead=true;assert.equal(valid(),true);f.a.disabled=true;assert.equal(valid(),false);f.a.disabled=false;f.a.deleted=true;assert.equal(valid(),false);
}
{
 const f=fixture();f.track();const matches=makeCancellationMatch(f.ctx);assert.equal(matches(100),true);f.ctx.candidate=f.b;f.track();assert.equal(matches(100),false);assert.equal(matches(200),true);f.ctx.CleanupTracking();assert.equal(matches(200),false);
}
console.log('Papyrus tracking control flow passed with mocked engine APIs.');
