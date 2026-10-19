const assert = require("node:assert/strict");
const Plugin = require("../VoiceNormalizer.plugin.js");
let menuPatch;
const nativeVolumeItem = {props:{id:"user-volume",label:"Громкость пользователя"}};
global.BdApi = {
  Webpack:{
    getModule(match) {
      const exports = [
        {setLocalVolume(){},setLocalPan(){}},
        {getMediaEngine(){return {eachConnection(){}}}}
      ];
      return exports.find(match);
    },
    getStore(name) {
      if(name==="UserStore")return {getCurrentUser(){return {id:"me"}}};
      if(name==="MediaEngineStore")return {getLocalVolume(){return 40}};
    }
  },
  UI:{showToast(){}},
  ContextMenu:{
    patch(nav,cb){if(nav==="user-context")menuPatch=cb; return ()=>{};},
    buildItem(props){return {props};}
  },
  React:{
    createElement(type, props, ...children){return {type,props,children}},
    useState(){return [0,()=>{}]},
    useEffect(fn){const clean=fn();clean();}
  }
};
const plugin=new Plugin();
plugin.start();
assert.equal(typeof menuPatch,"function");
const tree={props:{children:[nativeVolumeItem]}};
menuPatch(tree,{user:{id:"friend"}});
assert.equal(tree.props.children.length,3);
const ids=tree.props.children.map(x=>x.props.id);
assert.equal(ids[0],"user-volume");
assert(ids.includes("voice-normalizer-toggle"));
assert(ids.includes("voice-normalizer-live-meter"));
const control=tree.props.children.find(x=>x.props.id==="voice-normalizer-live-meter");
const reactNode=control.props.control();
assert.equal(typeof reactNode.type,"function");
const visual=reactNode.type(reactNode.props);
assert.equal(visual.type,"div");
plugin.stop();
console.log("PASS: context menu placement, live control, render and hook cleanup");

[executed on device: KOMPUTER (a12ce151-ad35-42ae-a06f-8486c696e785)]
