import fs from 'fs';
const hav=(a,b)=>{const R=6371,r=Math.PI/180;const x=Math.sin((b.lat-a.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((b.lon-a.lon)*r/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
const U = JSON.parse(fs.readFileSync('/root/lde-worker/drax/date/saptamanal/2026-09-14/economie-urme/830MUM/2026-09-14.json', 'utf8')).pts;
const ta = Date.parse('2026-09-14T02:45:00Z'), tb = Date.parse('2026-09-14T02:54:00Z');
let prev=null; for (const p of U.filter(p=>p.t>=ta&&p.t<=tb)) { console.log(new Date(p.t+3*3600e3).toISOString().slice(11,19), 'v', String(p.v).padStart(3), 'dt', prev?((p.t-prev.t)/1000).toFixed(0).padStart(4):'   -', 'd m', prev?(hav(prev,p)*1000).toFixed(0).padStart(4):'   -'); prev=p; }
