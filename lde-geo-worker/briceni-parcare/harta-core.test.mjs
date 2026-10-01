// ION-148 — proba funcțiilor pure: node harta-core.test.mjs (ieșire 0 = trece)
import assert from 'node:assert/strict';
import { tipInterval, linieSchelet, economieZile, dp } from './harta-core.mjs';

assert.equal(tipInterval({ cuOameni: 30 }), 'cursa');
assert.equal(tipInterval({ livrare: 5, golTure: 20 }), 'fortat');          // ocolul mic, drumul direct impus mare
assert.equal(tipInterval({ livrare: 12, legatura: 3 }), 'gol');
assert.equal(tipInterval({ golRuta: 4 }), 'fortat');
assert.equal(tipInterval({ legatura: 4 }), 'fortat');
assert.equal(tipInterval({ service: 90 }), 'munca');
assert.equal(tipInterval({ stat: 0.1 }), 'parcare');
assert.equal(tipInterval({ livrare: 0, brambura: 6 }), 'gol');
assert.equal(linieSchelet('53'), '46+52+53+54');
assert.equal(linieSchelet('46+52+53'), '46+52+53+54');
assert.equal(linieSchelet('T3'), 'T3');
assert.equal(linieSchelet(57), '57');
assert.equal(linieSchelet(null), null);
const e = economieZile([{ z: 'a', real: 10, prop: 4 }, { z: 'a', real: 5, prop: 5 }, { z: 'b', real: 3, prop: 1 }]);
assert.equal(e.get('a'), 6); assert.equal(e.get('b'), 2);
assert.equal(dp([{ lat: 48, lon: 27 }, { lat: 48.0000001, lon: 27.001 }, { lat: 48, lon: 27.002 }], 15).length, 2);
console.log('harta-core: toate probele trec');
