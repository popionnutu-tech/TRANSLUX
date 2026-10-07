/**
 * Cine ce poate în Numărare și pe unde intră rolurile închise într-un singur colț al panoului.
 * Funcții pure (fără importuri de server), folosite de middleware, de acțiunile din /numarare și de bara laterală.
 *
 * Ion, 07.10.2026: Clava (CONTABIL_LDE) «este și admin pe camere» → un singur cont: contul ei primește drepturile
 * ADMIN_CAMERE în Numărare, «de oriunde» (fără filtrul IP al rolului ADMIN_CAMERE), pe lângă agrearea și normele LDE.
 */
import type { AdminRole } from '@translux/db';

/** Pot deschide Numărarea și număra (operatorii de la peron inclusiv). */
export const ROLURI_NUMARARE = ['ADMIN', 'ADMIN_CAMERE', 'OPERATOR_CAMERE', 'CONTABIL_LDE'] as const satisfies readonly AdminRole[];
/** Admin pe camere: sume, audit, operatori, salarii, tarife, corectarea sesiunilor închise. */
export const ROLURI_ADMIN_CAMERE = ['ADMIN', 'ADMIN_CAMERE', 'CONTABIL_LDE'] as const satisfies readonly AdminRole[];

export const poateNumara = (role: string | null | undefined): boolean =>
  !!role && (ROLURI_NUMARARE as readonly string[]).includes(role);
export const esteAdminCamere = (role: string | null | undefined): boolean =>
  !!role && (ROLURI_ADMIN_CAMERE as readonly string[]).includes(role);

/** Căile CONTABIL_LDE (prefix): agrearea + normele + consumul (sub /lde/agreare) și Numărarea. */
export const CAI_CONTABIL_LDE = ['/lde/agreare', '/numarare'] as const;

export const calePermisaContabilLde = (pathname: string): boolean =>
  CAI_CONTABIL_LDE.some((r) => pathname === r || pathname.startsWith(r + '/'));
