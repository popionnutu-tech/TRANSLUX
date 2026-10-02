/**
 * Regulile PURE ale comenzii de bilete au trecut în @translux/db (ION-197), ca site-ul să calculeze `sale_open`
 * cu exact aceleași funcții ca API-ul comenzii. Aici rămâne doar re-exportul (testele din reguli.test.ts le acoperă).
 */
export { calculeazaDepartureAt, vanzareDeschisa, ziuaUrmatoare } from '@translux/db';
