const assert=require("node:assert/strict");
const Plugin=require("../VoiceNormalizer.plugin.js");
let value=100;
const action={setLocalVolume(id,v){if(id!=="friend")throw Error("wrong user");value=v;}};
const conn={
  context:"default",
  remoteAudioSSRCs:new Map([["friend",123]]),
  getUserIdBySsrc(){return undefined;},
  getStats(){return Promise.resolve({rtp:{inbound:{track:[{ssrc:123,audioLevel:0.4,audioDetected:1}]}}});}
};
const stores={
  MediaEngineStore:{getLocalVolume(id){return id==="friend"?value:null;}},
  VoiceStateStore:{getCurrentClientVoiceChannelId(){return "voice"},getVoiceStatesForChannel(){return {x:{userId:"friend"},y:{userId:"me"}};}},
  UserStore:{getCurrentUser(){return {id:"me"}},getUser(id){return {username:id};}},
  SelectedChannelStore:{getChannelId(){return "voice";}}
};
global.BdApi={
  Webpack:{getModule(pred){return [action,{getMediaEngine(){return {eachConnection(f){f(conn)}}}}].find(pred)},getStore(n){return stores[n]}},
  ContextMenu:{patch(){return ()=>{};},buildItem(o){return o}},
  UI:{showToast(){}}
};
(async()=>{
  const p=new Plugin();p.start();
  assert.equal(p.resolveId(conn,123),"friend","SSRC mapping");
  assert.equal(p.read("friend"),100);
  assert(p.write("friend",50),"50 is allowed");
  assert.equal(value,50);
  value=100;
  p.select("friend",true);
  await p.tick(p.generation);
  assert(value<100,"voice attenuation at raw baseline 100");
  p.turnOff();
  assert(Math.abs(value-100)<0.001,"restore original value");
  const restored=value;
  conn.remoteAudioSSRCs=new Map([[123,"friend"]]);
  assert.equal(p.resolveId(conn,123),"friend","reverse SSRC mapping");
  assert.equal(restored,100);
  console.log("PASS: raw value 100, SSRC mapping both directions, ducking and restore");
})().catch(e=>{console.error(e);process.exitCode=1;});
