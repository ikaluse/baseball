import fs from 'node:fs';
import * as T from '../assets/vendor/three/three.module.js';
const directory=new URL('../assets/characters/mocap/',import.meta.url);
const asf=fs.readFileSync(new URL('124.asf',directory),'utf8');
const rig={},hierarchy={};
for(const block of asf.split(':bonedata')[1].split(':hierarchy')[0].matchAll(/begin\s+([\s\S]*?)\s+end/g)){
 const data={};for(const line of block[1].split(/\r?\n/)){const [key,...words]=line.trim().split(/\s+/);if(['name','direction','length','axis','dof'].includes(key))data[key]=words;}
 const axis=new T.Quaternion().setFromEuler(new T.Euler(...data.axis.slice(0,3).map(x=>+x*Math.PI/180),'ZYX'));
 rig[data.name[0]]={direction:data.direction.map(Number),length:+data.length[0],axis,dof:data.dof||[]};
}
for(const line of asf.split(':hierarchy')[1].split(/\r?\n/)){const names=line.trim().split(/\s+/);if(names.length>1)hierarchy[names[0]]=names.slice(1);}
const names=['root','lowerback','upperback','thorax','lowerneck','upperneck','head','lclavicle','lhumerus','lradius','lwrist','lhand','rclavicle','rhumerus','rradius','rwrist','rhand','lhipjoint','lfemur','ltibia','lfoot','ltoes','rhipjoint','rfemur','rtibia','rfoot','rtoes'];
function readMotion(file){const frames=[];let frame;for(const line of fs.readFileSync(new URL(file,directory),'utf8').split(/\r?\n/)){const words=line.trim().split(/\s+/);if(/^\d+$/.test(words[0])){frame={};frames.push(frame);}else if(frame&&words.length>1)frame[words[0]]=words.slice(1).map(Number);}return frames;}
function fk(frame){
 const points={root:new T.Vector3(...frame.root.slice(0,3))},rotations={root:new T.Quaternion().setFromEuler(new T.Euler(...frame.root.slice(3,6).map(x=>x*Math.PI/180),'ZYX'))};
 const visit=parent=>{for(const name of hierarchy[parent]||[]){const b=rig[name],angle={rx:0,ry:0,rz:0};b.dof.forEach((d,i)=>angle[d]=frame[name]?.[i]||0);const motion=new T.Quaternion().setFromEuler(new T.Euler(angle.rx*Math.PI/180,angle.ry*Math.PI/180,angle.rz*Math.PI/180,'ZYX'));
 rotations[name]=rotations[parent].clone().multiply(b.axis).multiply(motion).multiply(b.axis.clone().invert()).normalize();
 points[name]=points[parent].clone().add(new T.Vector3(...b.direction).multiplyScalar(b.length).applyQuaternion(rotations[name]));visit(name);}};visit('root');return {points,rotations};
}
const data={source:'CMU Graphics Lab Motion Capture Database, subject 124',url:'https://mocap.cs.cmu.edu/search.php?subjectnumber=124',fps:60,names,directions:Object.fromEntries(Object.entries(rig).map(([n,b])=>[n,b.direction])),clips:{}};
for(const [action,file] of [['pitch','124_01.amc'],['swing','124_07.amc']]){
 const frames=readMotion(file).map(fk);let peak=0,maximum=0;
 for(let i=2;i<frames.length-2;i++){const speed=frames[i+2].points.rwrist.distanceTo(frames[i-2].points.rwrist);if(speed>maximum){maximum=speed;peak=i;}}
 // Keep the first captured action, including setup and the complete follow-through.
 const speed=frames.map((f,i)=>i?f.points.rwrist.distanceTo(frames[i-1].points.rwrist)*120:0);
 const peaks=speed.map((v,i)=>({v,i})).filter(p=>p.v>maximum*120/4*.60);
 console.log(action,'frames',frames.length,'duration',frames.length/120,'peak',peak,'first high speed',peaks[0]?.i);
 console.log('sample joint positions',Object.fromEntries(['root','lclavicle','lhumerus','lwrist','rclavicle','rhumerus','rwrist','lfemur','ltibia'].map(n=>[n,frames[0].points[n].toArray().map(v=>+v.toFixed(2))])));
 for(let i=0;i<frames.length;i+=60)console.log('time',i/120,'left ankle',+frames[i].points.ltibia.y.toFixed(1),'right ankle',+frames[i].points.rtibia.y.toFixed(1),'speed',+speed[i].toFixed(1));
 const end=Math.min(frames.length-1,peak+(action==='pitch'?140:90)),start=Math.max(0,peak-(action==='pitch'?245:100));
 const velocity=frames[peak+2].points.rwrist.clone().sub(frames[peak-2].points.rwrist),heading=action==='pitch'?-Math.atan2(velocity.x,velocity.z):Math.atan2(frames[start].points.lclavicle.z-frames[start].points.rclavicle.z,frames[start].points.lclavicle.x-frames[start].points.rclavicle.x);
 const selected=[];for(let i=start;i<=end;i+=2){const f=frames[i];selected.push({p:f.points.root.toArray().map(x=>+x.toFixed(5)),q:names.map(n=>f.rotations[n].toArray().map(x=>+x.toFixed(6))),j:names.map(n=>f.points[n].toArray().map(x=>+x.toFixed(5)))});}
 const kernel=[1,6,15,20,15,6,1],filtered=selected.map((frame,i)=>{
  const neighbors=kernel.map((weight,k)=>({weight,f:selected[Math.max(0,Math.min(selected.length-1,i+k-3))]}));
  const p=frame.p.map((_,j)=>neighbors.reduce((sum,n)=>sum+n.weight*n.f.p[j],0)/64);
  const q=names.map((_,j)=>{const reference=new T.Quaternion().fromArray(frame.q[j]),sum=[0,0,0,0];for(const n of neighbors){const quaternion=new T.Quaternion().fromArray(n.f.q[j]),sign=reference.dot(quaternion)<0?-1:1;n.f.q[j].forEach((value,k)=>sum[k]+=value*n.weight*sign);}return new T.Quaternion().fromArray(sum).normalize().toArray().map(x=>+x.toFixed(6));});
  return {...frame,p,q};
 });
 data.clips[action]={frames:filtered,peak:(peak-start)/2,range:[start,end],heading};
 for(const index of [start,start+40,peak,peak+60,end])if(frames[index])console.log('checkpoint',index,'wrists',frames[index].points.lwrist.toArray().map(x=>+x.toFixed(1)),frames[index].points.rwrist.toArray().map(x=>+x.toFixed(1)),'heading',heading);
}
fs.writeFileSync(new URL('baseball-motion.json',directory),JSON.stringify(data));
fs.writeFileSync(new URL('../baseball-motion.txt',directory),JSON.stringify(data));
