import type { AdminRole } from '@translux/db';

// Rolurile operaționale de depozit care se pot lega de UN singur depozit (Etapa 2).
// Fișier FĂRĂ 'server-only' → importabil ȘI din client (UsersClient) ȘI din server (piese-access, users/actions),
// ca lista să fie o SINGURĂ sursă și afișarea dropdown-ului să nu poată diverge de garda de server.
export const DEPOT_BOUND_ROLES: AdminRole[] = ['DEPOZITAR', 'VINZATOR', 'GESTIONAR'];

// Rolurile limitate la PROPRIILE facturi în e-Factura (ADMIN/CONTABIL le văd oricum pe toate).
// Aici, nu în piese-access.ts (care e 'server-only'), ca UsersClient să afișeze comutatorul „vede toate
// facturile" exact pentru rolurile pe care garda de server îl și consultă — o singură listă, ca la depozite.
export const SELLER_SCOPED_ROLES: AdminRole[] = ['VINZATOR', 'GESTIONAR'];

// Plafonul ferestrei de corecție a documentelor (migr. 287), în zile.
// SURSĂ UNICĂ pentru: opțiunile din UI, validarea din server action și CHECK-ul din DB — ca cele trei
// să nu poată diverge (un cont setat peste plafon ar afișa în UI altă valoare decât are în realitate).
export const MAX_EDIT_WINDOW_DAYS = 30;
// Treptele oferite în /users. Orice valoare din DB care nu e aici se afișează ca atare, nu se falsifică.
export const EDIT_WINDOW_OPTIONS = [0, 1, 3, 7, 14, 30];

// Rolurile care chiar corectează recepții, deci singurele pentru care fereastra are efect.
// Oglindește RECEIPT_ROLES din piese/prihod/actions.ts, fără ADMIN (nelimitat prin cod).
export const EDIT_WINDOW_ROLES: AdminRole[] = ['DEPOZITAR', 'GESTIONAR'];
