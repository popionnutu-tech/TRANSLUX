import type { AdminRole } from '@translux/db';

// Rolurile operaționale de depozit care se pot lega de UN singur depozit (Etapa 2).
// Fișier FĂRĂ 'server-only' → importabil ȘI din client (UsersClient) ȘI din server (piese-access, users/actions),
// ca lista să fie o SINGURĂ sursă și afișarea dropdown-ului să nu poată diverge de garda de server.
export const DEPOT_BOUND_ROLES: AdminRole[] = ['DEPOZITAR', 'VINZATOR', 'GESTIONAR'];
