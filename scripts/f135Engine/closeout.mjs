// 0sfs closeout between AF267's aft fuselage and the 0sfs F135. AF267 closed
// the engine bay with a static engine tube that removeOriginalNozzle takes
// away; these surfaces replace it. They are shaped by clearance to the swept
// swivel nozzle, not by a drawing
// (F-35B/docs/proposals/f35b-aft-fuselage-closeout.md):
//  shroud   livery flange from the fuselage's aft (sawtooth) edge in to a rim
//           that clears the swept nozzle by MARGIN in every pose;
//  recess   dark tunnel from that rim forward to the bulkhead, its lower edges
//           on the engine-door cut, every station outside the swept volume + MARGIN;
//  bulkhead dark forward wall at the front of the door cut, round the casing.
// The engine side of the joint is F135_AftCasing in source.mjs.
// World here is the AF267 scene frame: nose -Z, up +Y, right wing +X; azimuth
// about the engine axis is 0 up and +90 toward +X.
import { accessor, posedMeshes } from './glb.mjs';
import { exportedFrames } from './mechanism.mjs';
import { triangle, segmentTriangle } from './intersections.mjs';
import { AFT_CASING } from './source.mjs';
export const MARGIN=0.015, INSET=0.004;
const STATIONS=[2.62,2.84,2.96,3.08,3.2,3.32,3.44,3.56,3.65], HALF_SEGMENTS=14, BULKHEAD_SEGMENTS=72, MIN_RADIUS=0.565, CASING_CLEARANCE=0.003;
// A plain-paint texel inside AF267's top-view livery island, forward of the
// aft edge: the edge itself is a few texels from the island's black border.
const LIVERY_UV=[0.212,0.555];
const rad=d=>d*Math.PI/180;
// Column-major 4x4, as glTF stores node matrices.
const compose=(t=[0,0,0],q=[0,0,0,1],s=[1,1,1])=>{const [x,y,z,w]=q;return [(1-2*(y*y+z*z))*s[0],2*(x*y+z*w)*s[0],2*(x*z-y*w)*s[0],0,2*(x*y-z*w)*s[1],(1-2*(x*x+z*z))*s[1],2*(y*z+x*w)*s[1],0,2*(x*z+y*w)*s[2],2*(y*z-x*w)*s[2],(1-2*(x*x+y*y))*s[2],0,t[0],t[1],t[2],1];};
const multiply=(a,b)=>Array.from({length:16},(_,i)=>{const c=Math.floor(i/4),r=i%4;let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];return s;});
const apply=(m,p)=>[0,1,2].map(r=>m[r]*p[0]+m[4+r]*p[1]+m[8+r]*p[2]+m[12+r]);
function invert(m){
  const [a,b,c,,d,e,f,,g,h,i,,x,y,z]=m,det=a*(e*i-f*h)-d*(b*i-c*h)+g*(b*f-c*e);
  const r=[(e*i-h*f)/det,(h*c-b*i)/det,(b*f-e*c)/det,0,(g*f-d*i)/det,(a*i-g*c)/det,(d*c-a*f)/det,0,(d*h-g*e)/det,(g*b-a*h)/det,(a*e-d*b)/det,0,0,0,0,1];
  for(let k=0;k<3;k++)r[12+k]=-(r[k]*x+r[4+k]*y+r[8+k]*z);return r;
}
function worldMatrices(json){
  const parents=new Map(),world=[];json.nodes.forEach((n,i)=>(n.children??[]).forEach(c=>parents.set(c,i)));
  const get=i=>{if(world[i])return world[i];const n=json.nodes[i],local=n.matrix??compose(n.translation,n.rotation,n.scale);return world[i]=parents.has(i)?multiply(get(parents.get(i)),local):local;};
  return name=>{const i=json.nodes.findIndex(n=>n.name===name);if(i<0)throw new Error(`AF267 has no ${name} node`);return get(i);};
}
/** One node's triangles in the scene frame. */
function nodeTriangles(gltf,name,world){
  const m=world(name),node=gltf.json.nodes.find(n=>n.name===name),out=[];
  for(const p of gltf.json.meshes[node.mesh].primitives){
    const pos=accessor(gltf,p.attributes.POSITION),idx=accessor(gltf,p.indices),pts=[];
    for(let i=0;i<pos.length;i+=3)pts.push(apply(m,pos.slice(i,i+3)));
    for(let i=0;i<idx.length;i+=3)out.push([pts[idx[i]],pts[idx[i+1]],pts[idx[i+2]]]);
  }
  return out;
}
/** The fuselage's open boundary round the engine bay: the aft opening and the engine-door cut. */
function bayLoop(fuselage){
  const key=p=>p.map(v=>Math.round(v*2000)).join(','),edges=new Map(),points=new Map(),next=new Map();
  for(const t of fuselage)for(let i=0;i<3;i++){const a=t[i],b=t[(i+1)%3],ka=key(a),kb=key(b),k=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`,e=edges.get(k)??{n:0,ka,kb};e.n++;edges.set(k,e);points.set(ka,a);points.set(kb,b);}
  for(const e of edges.values())if(e.n===1)for(const [x,y]of[[e.ka,e.kb],[e.kb,e.ka]])(next.get(x)??next.set(x,[]).get(x)).push(y);
  let start=null,top=-Infinity;for(const k of next.keys()){const p=points.get(k);if(p[2]>3.6&&Math.abs(p[0])<.08&&p[1]>top){top=p[1];start=k;}}
  const loop=[start],seen=new Set([start]);for(;;){const k=(next.get(loop.at(-1))??[]).find(k=>!seen.has(k));if(!k)break;loop.push(k);seen.add(k);}
  if(loop.length!==64)throw new Error('AF267 engine-bay opening changed; re-audit the closeout');
  return loop.map(k=>points.get(k));
}
/** Right-hand door-cut edge: from the cut's forward corner aft, while each step is a long one. */
function doorCutEdge(loop){
  const n=loop.length,corner=loop.reduce((best,p,i)=>p[0]>0&&p[2]<2.6&&p[0]>loop[best][0]?i:best,loop.findIndex(p=>p[0]>0&&p[2]<2.6));
  const step=loop[(corner+1)%n][2]>loop[corner][2]?1:n-1,edge=[loop[corner]];
  for(let i=(corner+step)%n;loop[i][2]>edge.at(-1)[2]+.05;i=(i+step)%n)edge.push(loop[i]);
  if(edge.length!==4||edge.some(p=>!loop.some(q=>Math.hypot(q[0]+p[0],q[1]-p[1],q[2]-p[2])<1e-3)))throw new Error('AF267 engine-door cut changed; re-audit the closeout');
  return edge;
}
/**
 * Largest radius about the engine axis that the installed engine reaches, per
 * 2 cm of engine z and 2.5 degrees of azimuth, over the swivel's poses and the
 * aperture's ends. Triangles that cannot reach a queried bin, or cannot reach
 * `floor` there, are skipped: below it the closeout keeps MIN_RADIUS anyway.
 */
function sweptEnvelope(engine,profile,zMin,zMax,floor){
  const DZ=.02,Z0=-.8,NZ=125,DA=2.5,NA=144,env=Array.from({length:NZ},()=>new Float64Array(NA));
  const lo=Z0+Math.floor((zMin-Z0)/DZ)*DZ,hi=Z0+(Math.floor((zMax-Z0)/DZ)+1)*DZ;
  for(const aperture of [0,1]){const meshes=posedMeshes(engine,aperture);
    for(let pitch=0;pitch<=95;pitch+=5)for(let yaw=-10;yaw<=10;yaw+=5){
      const frames=exportedFrames(engine,profile,aperture,rad(pitch),rad(yaw));
      for(const m of meshes){const f=frames[m.parent];for(let i=0;i<m.positions.length;i+=9){
        const v=[0,3,6].map(j=>f(m.positions.slice(i+j,i+j+3)));
        if(Math.max(v[0][2],v[1][2],v[2][2])<lo||Math.min(v[0][2],v[1][2],v[2][2])>hi||Math.max(...v.map(p=>Math.hypot(p[0],p[1])))<floor)continue;
        const L=Math.max(...[[0,1],[1,2],[2,0]].map(([p,q])=>Math.hypot(v[p][0]-v[q][0],v[p][1]-v[q][1],v[p][2]-v[q][2]))),n=Math.max(1,Math.ceil(L/.012));
        for(let I=0;I<=n;I++)for(let J=0;J<=n-I;J++){
          const a=I/n,b=J/n,c=1-a-b,q=[0,1,2].map(k=>a*v[0][k]+b*v[1][k]+c*v[2][k]),zi=Math.floor((q[2]-Z0)/DZ);if(zi<0||zi>=NZ)continue;
          const r=Math.hypot(q[0],q[1]),ai=Math.floor(((Math.atan2(q[0],q[1])*180/Math.PI+360)%360)/DA)%NA;if(r>env[zi][ai])env[zi][ai]=r;
        }
      }}
    }
  }
  /** Largest swept radius over engine z0..z1 and azimuth az±daz degrees. */
  return (z0,z1,az,daz)=>{let r=0;const i0=Math.max(0,Math.floor((z0-Z0)/DZ)),i1=Math.min(NZ-1,Math.floor((z1-Z0)/DZ));
    for(let zi=i0;zi<=i1;zi++)for(let a=az-daz;a<=az+daz+1e-9;a+=DA/2)r=Math.max(r,env[zi][Math.floor((((a%360)+360)%360)/DA)%NA]);return r;};
}
/** Per-vertex normals of an indexed part: each turned toward `side(p)`, or only their sum when `everyVertex` is false. */
function smoothNormals(positions,indices,side,everyVertex=true){
  const n=positions.map(()=>[0,0,0]);
  for(let i=0;i<indices.length;i+=3){const [a,b,c]=[0,1,2].map(k=>positions[indices[i+k]]),u=[0,1,2].map(k=>b[k]-a[k]),w=[0,1,2].map(k=>c[k]-a[k]),f=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]];for(let k=0;k<3;k++)for(let j=0;j<3;j++)n[indices[i+k]][j]+=f[j];}
  const facing=(v,p)=>{const s=side(p),d=v[0]*s[0]+v[1]*s[1]+v[2]*s[2];if(!(d>0))throw new Error(`Closeout facing does not match its winding at ${p.map(x=>x.toFixed(3))}`);};
  if(everyVertex)n.forEach((v,i)=>facing(v,positions[i]));else facing([0,1,2].map(k=>n.reduce((s,v)=>s+v[k],0)),positions[0]);
  return n.map(v=>{const l=Math.hypot(...v);if(!(l>0))throw new Error('Degenerate closeout vertex');return v.map(x=>x/l);});
}
/**
 * Closeout parts for AF267 (decoded) round the installed F135 export
 * (decoded), in the local frame of AF267's `extras` node, by material.
 */
export function buildCloseout(af267,engine,profile){
  const world=worldMatrices(af267.json),[,YC,ZE]=profile.attachment;
  const P=(r,az,z)=>[r*Math.sin(rad(az)),YC+r*Math.cos(rad(az)),z],azOf=p=>Math.atan2(p[0],p[1]-YC)*180/Math.PI,radius=p=>Math.hypot(p[0],p[1]-YC);
  const fuselage=nodeTriangles(af267,'fuselage',world),loop=bayLoop(fuselage),edge=doorCutEdge(loop);
  const ZB=Math.min(...loop.map(p=>p[2]))-.003,ZRIM=Math.min(...loop.filter(p=>p[2]>3.6).map(p=>p[2])),stations=[ZB,...STATIONS,ZRIM];
  if(stations.some((z,i)=>i&&z<=stations[i-1]))throw new Error('Closeout stations out of order');
  const doorEdge=z=>{z=Math.max(z,edge[0][2]);for(let i=0;i<edge.length-1;i++)if(z<=edge[i+1][2]){const s=(z-edge[i][2])/(edge[i+1][2]-edge[i][2]);return [0,1].map(k=>edge[i][k]+s*(edge[i+1][k]-edge[i][k]));}return edge.at(-1).slice(0,2);};
  const envMax=sweptEnvelope(engine,profile,ZB-.02-ZE,ZRIM+.02-ZE,MIN_RADIUS-MARGIN);
  // Right half from the top (az 0) to the door-cut edge, mirrored for the left.
  function section(z,zLo,zHi){
    const [xe0,ye0]=doorEdge(z),xe=xe0-INSET,ye=ye0+INSET,A=azOf([xe,ye]),pts=[];
    const clamp=p=>p[1]<YC&&p[0]>xe?[xe,p[1],z]:p; // never outboard of the door-cut edge line
    for(let i=0;i<=HALF_SEGMENTS;i++){const az=A*i/HALF_SEGMENTS;pts.push(clamp(P(i===HALF_SEGMENTS?radius([xe,ye]):Math.max(MIN_RADIUS,envMax(zLo-ZE,zHi-ZE,az,1.25+A/HALF_SEGMENTS/2)+MARGIN),az,z)));}
    // Keep the curve fair: radius non-decreasing toward the edge.
    for(let i=1;i<HALF_SEGMENTS;i++)if(radius(pts[i])<radius(pts[i-1]))pts[i]=clamp(P(radius(pts[i-1]),azOf(pts[i]),z));
    return [...pts.slice(1).map(p=>[-p[0],p[1],p[2]]).reverse(),...pts];
  }
  const secs=stations.map((z,k)=>section(z,stations[Math.max(0,k-1)]-.02,stations[Math.min(stations.length-1,k+1)]+.02)),width=secs[0].length;
  const recess={positions:secs.flat(),indices:[]};
  for(let k=0;k<secs.length-1;k++)for(let i=0;i<width-1;i++){const a=k*width+i,b=a+1,c=b+width,d=a+width;recess.indices.push(a,b,c,a,c,d);}
  recess.normals=smoothNormals(recess.positions,recess.indices,p=>[-p[0],YC-p[1],0]);
  // Shroud: rim to the fuselage's aft edge between the door-cut corners, a fan merged by azimuth.
  const rim=secs.at(-1),aft=loop.filter(p=>p[2]>3.6).map(p=>p[1]<1.86?[Math.sign(p[0])*(Math.abs(p[0])-INSET),p[1]+INSET,p[2]]:p).sort((a,b)=>azOf(a)-azOf(b));
  const shroud={positions:[...rim,...aft],indices:[]},R=i=>i,F=j=>rim.length+j;
  for(let i=0,j=0;i<rim.length-1||j<aft.length-1;){
    if(j>=aft.length-1||(i<rim.length-1&&azOf(rim[i+1])<=azOf(aft[j+1]))){shroud.indices.push(R(i),R(i+1),F(j));i++;}
    else{shroud.indices.push(R(i),F(j+1),F(j));j++;}
  }
  // Aft-facing, except slivers at the door-cut corners that close the few
  // centimetres between the recess's end and the corner, which face sideways.
  shroud.normals=smoothNormals(shroud.positions,shroud.indices,()=>[0,0,1],false);
  // Bulkhead: the section's outline above the door-cut edge, the lower skin below it, round the casing.
  const near=fuselage.filter(t=>t.some(p=>Math.abs(p[2]-ZB)<.15)).map(t=>triangle(t)),half=secs[0].slice(HALF_SEGMENTS),edgeAz=azOf(half.at(-1));
  const skinRadius=az=>{const a=P(.3,az,ZB),b=P(1.6,az,ZB);let best=Infinity;for(const t of near){const p=segmentTriangle(a,b,t);if(p)best=Math.min(best,Math.hypot(p[0]-a[0],p[1]-a[1],p[2]-a[2]));}if(!Number.isFinite(best))throw new Error(`No AF267 skin under the closeout bulkhead at ${az} degrees`);return .3+best;};
  const outline=az=>{const a=Math.abs(az);if(a<=edgeAz)for(let i=0;i<half.length-1;i++){const a0=azOf(half[i]),a1=azOf(half[i+1]);if(a<=a1+1e-9){const s=(a-a0)/(a1-a0||1);return radius(half[i])+s*(radius(half[i+1])-radius(half[i]));}}return skinRadius(az)-INSET;};
  const ze=ZB-ZE,seg=AFT_CASING.findIndex(([z],i)=>i&&z>=ze),[[z0,r0],[z1,r1]]=[AFT_CASING[seg-1],AFT_CASING[seg]],rc=r0+(r1-r0)*(ze-z0)/(z1-z0)+CASING_CLEARANCE;
  const bulkhead={positions:[],indices:[]};
  for(let k=0;k<BULKHEAD_SEGMENTS;k++){const az=-180+360*k/BULKHEAD_SEGMENTS;bulkhead.positions.push(P(outline(az),az,ZB),P(rc,az,ZB));}
  for(let k=0;k<BULKHEAD_SEGMENTS;k++){const o0=2*k,i0=o0+1,o1=2*((k+1)%BULKHEAD_SEGMENTS),i1=o1+1;bulkhead.indices.push(o0,i1,o1,o0,i0,i1);}
  bulkhead.normals=bulkhead.positions.map(()=>[0,0,1]);
  // Into the `extras` node's frame; normals by the transpose of its linear part.
  const m=world('extras'),inverse=invert(m),local=part=>({positions:part.positions.map(p=>apply(inverse,p)),normals:part.normals.map(n=>{const v=[0,1,2].map(r=>m[r*4]*n[0]+m[r*4+1]*n[1]+m[r*4+2]*n[2]),l=Math.hypot(...v);return v.map(x=>x/l);}),indices:part.indices});
  const merge=(...parts)=>{const out={positions:[],normals:[],indices:[]};for(const p of parts){const base=out.positions.length;out.positions.push(...p.positions);out.normals.push(...p.normals);out.indices.push(...p.indices.map(i=>i+base));}return out;};
  const livery=local(shroud),dark=merge(local(recess),local(bulkhead));
  const roundTrip=Math.max(...[...shroud.positions,...recess.positions].map((p,i)=>{const q=apply(m,i<shroud.positions.length?livery.positions[i]:dark.positions[i-shroud.positions.length]);return Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]);}));
  if(roundTrip>1e-9)throw new Error('Closeout frame does not round-trip');
  return {node:'extras',parts:[{material:'livery',...livery,uvs:livery.positions.map(()=>LIVERY_UV)},{material:'darkmet2',...dark,uvs:dark.positions.map(()=>[0,0])}],
    triangles:{shroud:shroud.indices.length/3,recess:recess.indices.length/3,bulkhead:bulkhead.indices.length/3},
    stations:stations.map(z=>+z.toFixed(4)),margin:MARGIN,approximation:true};
}
