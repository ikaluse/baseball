import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import * as T from '../assets/vendor/three/three.module.js';
const root=new URL('../',import.meta.url);
const source=fs.readFileSync(new URL('tools/characters-3d.js',root),'utf8');
const bytes=fs.readFileSync(new URL('assets/characters/baseball-player.glb',root));
const glb=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
const joints=new Set(glb.skins[0].joints);
const nodes=glb.nodes.map((n,i)=>{const b=joints.has(i)?new T.Bone():new T.Group();b.name=n.name;if(n.translation)b.position.fromArray(n.translation);if(n.rotation)b.quaternion.fromArray(n.rotation);if(n.scale)b.scale.fromArray(n.scale);return b;});
glb.nodes.forEach((n,i)=>(n.children||[]).forEach(j=>nodes[i].add(nodes[j])));
const character=nodes[68],actor=new T.Group();actor.add(character);actor.updateMatrixWorld(true);
const bones=new Map(nodes.filter(b=>b.isBone).map(b=>[b.name,b])),rest=new Map(),soles=[];
const states=new Map();const $=name=>{if(!states.has(name))states.set(name,{});return states.get(name);};
const mocap=JSON.parse(fs.readFileSync(new URL('assets/characters/baseball-motion.txt',root)));
const context=vm.createContext({THREE:T,Y:new T.Vector3(0,1,0),V:a=>new T.Vector3(...a),actor,character,bones,rest,soles,mocap,motionBindings:[],ready:true,pose:'swing',progress:0,document:{activeElement:null},$,glove:{},leftHand:{},bat:{position:new T.Vector3(),quaternion:new T.Quaternion()},ball:{position:new T.Vector3()}});
function declaration(name){const start=source.indexOf('function '+name+'(');assert(start>=0,name+' is defined');let cursor=source.indexOf('{',start)+1,depth=1;while(depth&&cursor<source.length){if(source[cursor]==='{')depth++;if(source[cursor]==='}')depth--;cursor++;}return source.slice(start,cursor);}
for(const name of ['tailorCharacter','attachment','worldPoint','aim','solveLimb','handRotation','orientHand','gripFrame','solveBatGrip','pitchBallCenter','posePitchGrip','poseFingers','prepareMocap','sampledCapture','capturedPose','syncProgress','updatePose'])vm.runInContext(declaration(name),context);
vm.runInContext('tailorCharacter()',context);
for(const [name,b] of bones)rest.set(name,{position:b.position.clone(),quaternion:b.quaternion.clone(),worldQuaternion:b.getWorldQuaternion(new T.Quaternion())});
for(const side of ['l','r']){const shoe=new T.Group(),sole=new T.Mesh(new T.SphereGeometry(1,8,6));sole.scale.set(.075,.013,.138);sole.position.y=-.035;shoe.add(sole);soles.push(sole);context.shoe=shoe;context.side=side;vm.runInContext("constPosition=worldPoint('foot_'+side);attachment('foot_'+side,shoe,[constPosition.x,constPosition.y-.04,constPosition.z+.05]);",context);}
vm.runInContext('prepareMocap()',context);
let maximumGripError=0,maximumAngularStep=0,maximumFingerRadius=0,maximumShoulderElevation=0,maximumSolvedAngularStep=0,maximumReadyWristAngle=0;
for(const [action,clip] of Object.entries(mocap.clips)){
 assert(clip.frames.length>80);
 for(let i=0;i<clip.frames.length;i++)for(let j=0;j<mocap.names.length;j++){const q=new T.Quaternion().fromArray(clip.frames[i].q[j]);assert(Math.abs(q.length()-1)<.00001);if(i)maximumAngularStep=Math.max(maximumAngularStep,q.angleTo(new T.Quaternion().fromArray(clip.frames[i-1].q[j])));}
 context.pose=action;
 const previous=new Map();
 for(let i=0;i<=400;i++){
  context.progress=i/400;vm.runInContext('updatePose()',context);
  for(const b of bones.values())assert([...b.position.toArray(),...b.quaternion.toArray(),...b.matrixWorld.elements].every(Number.isFinite));
  for(const [name,b] of bones){const q=b.getWorldQuaternion(new T.Quaternion());if(previous.has(name))maximumSolvedAngularStep=Math.max(maximumSolvedAngularStep,q.angleTo(previous.get(name)));previous.set(name,q);}
  if(action==='swing'&&i/400<=.32){const hand=bones.get('hand_r'),direction=hand.getWorldPosition(new T.Vector3()).sub(bones.get('lowerarm_r').getWorldPosition(new T.Vector3())).normalize(),handDirection=new T.Vector3(0,1,0).applyQuaternion(hand.getWorldQuaternion(new T.Quaternion()));maximumReadyWristAngle=Math.max(maximumReadyWristAngle,direction.angleTo(handDirection));}
  if(action==='pitch'&&context.ball.visible){
    const hand=bones.get('hand_r'),point=hand.worldToLocal(context.ball.position.clone());assert(point.x<-.035&&point.y>.07&&point.y<.12,'Ball must rest on the right palm surface');
    for(const digit of ['index','middle','ring','pinky','thumb']){const tip=hand.worldToLocal(bones.get(digit+'_04_leaf_r').getWorldPosition(new T.Vector3()));assert(tip.distanceTo(point)>.034&&tip.distanceTo(point)<.043,'Pitching fingertips must cup the ball at its surface');}
    if(i===184&&process.argv.includes('--inspect-grip'))for(const digit of ['index','middle','ring','pinky','thumb'])console.log('ball',digit,hand.worldToLocal(bones.get(digit+'_04_leaf_r').getWorldPosition(new T.Vector3())).toArray().map(v=>+v.toFixed(4)),hand.worldToLocal(bones.get(digit+'_04_leaf_r').getWorldPosition(new T.Vector3())).distanceTo(point));
  }
  const heading=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),clip.heading);
  // Shoulder retargeting must preserve the rig's neutral slope, not import
  // the ASF's static upward clavicle direction as an extra permanent shrug.
  for(const side of ['l','r']){
    context.captureProgress=i/400;
    const sampled=vm.runInContext('sampledCapture(pose,captureProgress)',context),neutral=heading.clone().multiply(sampled.q[mocap.names.indexOf('thorax')]).multiply(rest.get('clavicle_'+side).worldQuaternion);
    maximumShoulderElevation=Math.max(maximumShoulderElevation,neutral.angleTo(bones.get('clavicle_'+side).getWorldQuaternion(new T.Quaternion())));
  }
  if(action==='swing')for(const [side,height] of [['l',0],['r',.100]]){
    const sign=side==='l'?1:-1,hand=bones.get('hand_'+side),palm=hand.localToWorld(new T.Vector3(0,.114,0)),axis=new T.Vector3(0,1,0).applyQuaternion(context.bat.quaternion),anchor=context.bat.position.clone().addScaledVector(axis,height),towardBat=anchor.clone().sub(palm),normal=new T.Vector3(sign,0,0).applyQuaternion(hand.getWorldQuaternion(new T.Quaternion()));
    assert(towardBat.dot(normal)>.025,'Both palm normals must face toward the handle');
    const delta=palm.clone().sub(context.bat.position),axial=delta.dot(axis),radial=delta.addScaledVector(axis,-axial).length();maximumGripError=Math.max(maximumGripError,Math.abs(axial-height),Math.abs(radial-.026));
    for(const digit of ['index','middle','ring','pinky','thumb']){
      const tip=hand.worldToLocal(bones.get(digit+'_04_leaf_'+side).getWorldPosition(new T.Vector3())),radius=Math.hypot(tip.x-sign*.026,tip.y-.114);
      maximumFingerRadius=Math.max(maximumFingerRadius,radius);
      if(i===0&&process.argv.includes('--inspect-grip'))console.log(side,digit,tip.toArray().map(v=>+v.toFixed(4)),radius.toFixed(4));
      if(i===0&&digit==='thumb'&&process.argv.includes('--inspect-grip'))console.log('thumb joints',side,[1,2,3].map(j=>hand.worldToLocal(bones.get('thumb_0'+j+'_'+side).getWorldPosition(new T.Vector3())).toArray().map(v=>+v.toFixed(4))));
      assert(tip.x*sign>.015,'Fingers must flex toward the palm instead of bending backward');
      assert(radius>.020&&radius<.030,'Fingertips must surround the handle within 20–30 mm, without passing through it');
    }
  }
 }
 console.log(action,clip.frames.length,'frames validated at 401 timeline positions');
}
assert(maximumGripError<.004,'Hands must remain within 4 mm of their grip anchors');
assert(maximumAngularStep<1.0,'Capture must not contain discontinuous joint jumps');
assert(maximumShoulderElevation<=.181,'Clavicle motion must remain within the modest captured elevation limit');
assert(maximumSolvedAngularStep<1.0,'Solved hands and shoulders must not introduce sudden rotation flips');
assert(maximumReadyWristAngle<.09,'Right wrist must remain aligned with the forearm during batting setup and load');
context.pose='bat';context.progress=.91;vm.runInContext('updatePose()',context);
const readyHand=bones.get('hand_r'),readyForearm=readyHand.getWorldPosition(new T.Vector3()).sub(bones.get('lowerarm_r').getWorldPosition(new T.Vector3())).normalize(),readyDirection=new T.Vector3(0,1,0).applyQuaternion(readyHand.getWorldQuaternion(new T.Quaternion()));
assert(readyForearm.angleTo(readyDirection)<.09,'The annotated batting-ready pose at 91% must keep the right wrist straight');
console.log(JSON.stringify({maximumGripErrorMillimeters:maximumGripError*1000,maximumFingerRadiusMillimeters:maximumFingerRadius*1000,maximumShoulderElevationDegrees:T.MathUtils.radToDeg(maximumShoulderElevation),maximumAngularStepDegrees:T.MathUtils.radToDeg(maximumAngularStep),maximumSolvedAngularStepDegrees:T.MathUtils.radToDeg(maximumSolvedAngularStep),maximumReadyWristAngleDegrees:T.MathUtils.radToDeg(maximumReadyWristAngle)}));
