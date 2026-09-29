import fs from 'fs';
const Cm = await import('/root/lde-worker/drax/cod/economie/comun.mjs');
const { PORTI, PARC } = Cm;
const W = '/root/lde-worker/drax/date/saptamanal/2026-09-14';
const Z = JSON.parse(fs.readFileSync(W+'/economie-zile.json','utf8'));
const h = (a, b) => { const r = Math.PI / 180, x = Math.sin((b.lat - a.lat) * r / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin((b.lon - a.lon) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
const V = []; for (const l of fs.readFileSync('/root/lde-worker/places.geojsonseq', 'utf8').split('\n')) { if (!l.includes('"place"')) continue; try { const g = JSON.parse(l.replace(/^\x1e/, '')); if (!/village|town|city|hamlet|suburb|neighbourhood/.test(g.properties.place)) continue; const [x, y] = g.geometry.coordinates; if (y > 47.0 && y < 48.5 && x > 27.0 && x < 29.0) V.push({ n: g.properties.name, lat: y, lon: x }); } catch {} }
const loc = (p) => { let b = null, d = 1e9; for (const v of V) { const k = h(p, v); if (k < d) { d = k; b = v.n; } } return `${b}${d > 1.5 ? `+${d.toFixed(1)}` : ''}`; };
const ora = (t) => new Date(t + 3 * 3600e3).toISOString().slice(11, 16);
const [m,z,o,step,lim] = process.argv.slice(2);
const d = Z.zile.find(x=>x.m===m&&x.z===z);
for (const s of d.seg) console.log('seg', s.ora, s.cat, s.km?.toFixed(1), s.ocol?'ocol':'', s.motiv??'');
const s=d.seg.find(s=>s.ora===o);
const pts=[]; for (const f of [z]) { const u=JSON.parse(fs.readFileSync(`${W}/economie-urme/${m}/${f}.json`,'utf8')); for (const p of u.pts??[]) { if(p.mut||p.lat==null) continue; if(p.t==null&&p.t0!=null){pts.push({lat:p.lat,lon:p.lon,t:p.t0,v:0}); if(p.t1>p.t0)pts.push({lat:p.lat,lon:p.lon,t:p.t1,v:0});} else pts.push(p);} }
// include next day file for night
try { const nz=new Date(Date.parse(z+'T12:00:00Z')+864e5).toISOString().slice(0,10); const u=JSON.parse(fs.readFileSync(`${W}/economie-urme/${m}/${nz}.json`,'utf8')); for (const p of u.pts??[]) { if(p.mut||p.lat==null) continue; if(p.t==null&&p.t0!=null){pts.push({lat:p.lat,lon:p.lon,t:p.t0,v:0}); if(p.t1>p.t0)pts.push({lat:p.lat,lon:p.lon,t:p.t1,v:0});} else pts.push(p);} } catch {}
pts.sort((a,b)=>a.t-b.t);
const Q=pts.filter((p,i)=>(i===0||p.t!==pts[i-1].t)&&p.t>=s.t0&&p.t<=s.t1);
const A=Q[0],B=Q.at(-1); let c=0, last=-1e15;
const G=(p)=>{const g=[...PORTI.map(g=>[g.n,h(p,g)]),['PARC',h(p,PARC)]].sort((a,b)=>a[1]-b[1])[0]; return g[1]<1.5?`${g[0]}@${g[1].toFixed(1)}`:'';};
for (let k=0;k<Q.length;k++){ if(k) c+=h(Q[k-1],Q[k]); if (Q[k].t-last>=(+step||60)*1e3 || k===Q.length-1) { if (lim && Q[k].t> s.t0+ (+lim)*60e3 && Q[k].t < s.t1-(+lim)*60e3) continue; console.log(ora(Q[k].t), 'cum', c.toFixed(1), 'dA', h(Q[k],A).toFixed(1), 'dB', h(Q[k],B).toFixed(1), 'v', Q[k].v??'-', loc(Q[k]), G(Q[k])); last=Q[k].t; } }
