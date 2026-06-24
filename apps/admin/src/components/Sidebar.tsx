'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminRole } from '@translux/db';
import { pieseHrefsForRole } from '@/lib/piese-nav';

type NavItem = { href: string; label: string; adminOnly: boolean; icon: string; exact?: boolean; tab?: string };
type ModuleItem = NavItem & { children?: NavItem[] };

const nomenclatorItems: NavItem[] = [
  { href: '/users',        label: 'Utilizatori',   adminOnly: true,  icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { href: '/users/ip-access', label: 'Acces IP',  adminOnly: true,  icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z' },
  { href: '/routes',       label: 'Rute',          adminOnly: true,  icon: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z' },
  { href: '/drivers',      label: 'Soferi',        adminOnly: true,  icon: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z' },
  { href: '/vehicles',     label: 'Mașini',        adminOnly: true,  icon: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z' },
  { href: '/trips',        label: 'Curse',         adminOnly: true,  icon: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z' },
  { href: '/mapping',      label: 'Mapping rute',  adminOnly: true,  icon: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z' },
  { href: '/smm-accounts', label: 'Conturi SMM',   adminOnly: true,  icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z' },
];

// Sub-paginile modulului Numărare (tab-urile interne, adresate prin ?tab=) — apar în dropdown.
const numarareChildren: NavItem[] = [
  { href: '/numarare?tab=numarare',  label: 'GO',  adminOnly: false, tab: 'numarare',  icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { href: '/numarare?tab=incasare',  label: 'Încasare',  adminOnly: true,  tab: 'incasare',  icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
  { href: '/numarare?tab=operatori', label: 'Operatori', adminOnly: true,  tab: 'operatori', icon: 'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z' },
  { href: '/numarare?tab=salariu',   label: 'Salariu',   adminOnly: true,  tab: 'salariu',   icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
  { href: '/numarare?tab=tarife',    label: 'Tarife',    adminOnly: true,  tab: 'tarife',    icon: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z' },
];

// Sub-paginile modulului Piese (aceleași 12 tab-uri ca PieseNav) — apar în dropdown-ul din sidebar.
const pieseChildren: NavItem[] = [
  { href: '/piese',              label: 'Tablou',    adminOnly: true, exact: true, icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { href: '/piese/stoc',         label: 'Stoc',      adminOnly: true, icon: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z' },
  { href: '/piese/catalog',      label: 'Catalog',   adminOnly: true, icon: 'M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z' },
  { href: '/piese/nomenclator',  label: 'Nomenclator', adminOnly: true, icon: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z' },
  { href: '/piese/prihod',       label: 'Prihod',    adminOnly: true, icon: 'M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z' },
  { href: '/piese/rashod',       label: 'Rashod',    adminOnly: true, icon: 'M5 20h14v-2H5v2zM5 9h4v6h6V9h4l-7-7-7 7z' },
  { href: '/piese/mutari',       label: 'Mutări',    adminOnly: true, icon: 'M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z' },
  { href: '/piese/inventar',     label: 'Inventar',  adminOnly: true, icon: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z' },
  { href: '/piese/harta',        label: 'Hartă',     adminOnly: true, icon: 'M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z' },
  { href: '/piese/magazin',      label: 'Magazin',   adminOnly: true, icon: 'M20 4H4v2h16V4zm1 10v-2l-1-5H4l-1 5v2h1v6h10v-6h4v6h2v-6h1zm-9 4H6v-4h6v4z' },
  { href: '/piese/fiscal',       label: 'e-Factura', adminOnly: true, icon: 'M19.5 3.5L18 2l-1.5 1.5L15 2l-1.5 1.5L12 2l-1.5 1.5L9 2 7.5 3.5 6 2 4.5 3.5 3 2v20l1.5-1.5L6 22l1.5-1.5L9 22l1.5-1.5L12 22l1.5-1.5L15 22l1.5-1.5L18 22l1.5-1.5L21 22V2l-1.5 1.5zM19 19.09H5V4.91h14v14.18zM6 15h12v2H6zm0-4h12v2H6zm0-4h12v2H6z' },
  { href: '/piese/integrare-1c', label: '1C',        adminOnly: true, icon: 'M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z' },
  { href: '/piese/rapoarte',     label: 'Rapoarte',  adminOnly: true, icon: 'M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z' },
];

// Sub-paginile modulului LDE (autopark autobuze, transport uzine). Doar ADMIN.
const ldeChildren: NavItem[] = [
  { href: '/lde',                label: 'Tablou',         adminOnly: true, exact: true, icon: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z' },
  { href: '/lde/tablou-zilnic',  label: 'Tablou zilnic',  adminOnly: true, icon: 'M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z' },
  { href: '/lde/tipuri-masini',  label: 'Tipuri mașini',  adminOnly: true, icon: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z' },
  { href: '/lde/vehicule',       label: 'Mașini (tip & normă)', adminOnly: true, icon: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z' },
  { href: '/lde/uzine',          label: 'Uzine',          adminOnly: true, icon: 'M22 11V3h-7v3H9V3H2v8h7V8h2v13h4V8h2v3h5zM7 9H4V5h3v4zm6 0h-2V5h2v4zm7 0h-3V5h3v4z' },
  { href: '/lde/curse',          label: 'Curse uzine',    adminOnly: true, icon: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z' },
  { href: '/lde/soferi',         label: 'Șoferi LDE',     adminOnly: true, icon: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z' },
  { href: '/lde/atribuiri',      label: 'Atribuiri',      adminOnly: true, icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z' },
  { href: '/lde/salarii',        label: 'Salarii UZINE',  adminOnly: true, icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
  { href: '/lde/comenzi',        label: 'Comenzi & școlar', adminOnly: true, icon: 'M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z' },
  { href: '/lde/numerar',        label: 'Alimentări numerar', adminOnly: true, icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
  { href: '/lde/carduri',        label: 'Carduri (sumă)', adminOnly: true, icon: 'M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z' },
  { href: '/lde/acte',           label: 'Acte recepție',  adminOnly: true, icon: 'M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z' },
  { href: '/lde/alerte',         label: 'Alerte DT',      adminOnly: true, icon: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z' },
  { href: '/lde/indicatii',      label: 'Indicații AI',   adminOnly: true, icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z' },
  { href: '/lde/experimente',    label: 'Experimente',    adminOnly: true, icon: 'M19.8 18.4L14 10.67V6.5l1.35-1.69c.26-.33.03-.81-.39-.81H9.04c-.42 0-.65.48-.39.81L10 6.5v4.17L4.2 18.4c-.49.66-.02 1.6.8 1.6h14c.82 0 1.29-.94.8-1.6z' },
];

// Module — fiecare e auto-conținut (rute + navigație proprie). Se adaugă un modul nou = o linie aici + folderul lui.
// children → modulul devine dropdown cu sub-paginile lui; fără children → link direct (ex. Numărare = un singur ecran).
const moduleItems: ModuleItem[] = [
  { href: '/numarare',     label: 'GO',        adminOnly: false, icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z', children: numarareChildren },
  { href: '/piese',        label: 'Piese & depozit', adminOnly: true,  icon: 'M20 2H4c-1.1 0-2 .9-2 2v3.01c0 .72.43 1.34 1 1.69V20c0 1.1 1.1 2 2 2h14c.9 0 2-.9 2-2V8.7c.57-.35 1-.97 1-1.69V4c0-1.1-.9-2-2-2zm-5 12H9v-2h6v2zm5-7H4V4h16v3z', children: pieseChildren },
  { href: '/lde',          label: 'LDE — Autopark',  adminOnly: true,  icon: 'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z', children: ldeChildren },
];

// Sub-paginile Piese vizibile pentru CONTABIL (doar citire + fiscal/1C; operațiunile de depozit rămân ADMIN/DEPOZITAR).
const CONTABIL_PIESE_HREFS = new Set(['/piese', '/piese/stoc', '/piese/catalog', '/piese/prihod', '/piese/harta', '/piese/rapoarte', '/piese/fiscal', '/piese/integrare-1c']);
// DEPOZITAR (vânzător-depozitar) — operează depozitul + vânzări; fără fiscal/1C.
const DEPOZITAR_PIESE_HREFS = new Set(['/piese', '/piese/stoc', '/piese/catalog', '/piese/prihod', '/piese/rashod', '/piese/mutari', '/piese/inventar', '/piese/harta', '/piese/magazin', '/piese/rapoarte']);
// MANAGER — doar supraveghere (citire).
const MANAGER_PIESE_HREFS = new Set(['/piese', '/piese/stoc', '/piese/catalog', '/piese/harta', '/piese/rapoarte']);

const nav: NavItem[] = [
  { href: '/reports',      label: 'Rapoarte',     adminOnly: true,  icon: 'M3 3v18h18V3H3zm16 16H5V5h14v14zM7 12h2v5H7v-5zm4-3h2v8h-2V9zm4-2h2v10h-2V7z' },
  // { href: '/fb-bot',       label: 'Bot Facebook',  adminOnly: true,  icon: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z' }, // hidden — feature paused, code preserved
  { href: '/salary',       label: 'Salariu',       adminOnly: true,  icon: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z' },
  { href: '/offers',       label: 'Oferte',        adminOnly: true,  icon: 'M21.41 11.58l-9-9C12.05 2.22 11.55 2 11 2H4c-1.1 0-2 .9-2 2v7c0 .55.22 1.05.59 1.42l9 9c.36.36.86.58 1.41.58.55 0 1.05-.22 1.41-.59l7-7c.37-.36.59-.86.59-1.41 0-.55-.23-1.06-.59-1.42zM5.5 7C4.67 7 4 6.33 4 5.5S4.67 4 5.5 4 7 4.67 7 5.5 6.33 7 5.5 7z' },
  { href: '/grafic',       label: 'Grafic',        adminOnly: true,  icon: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 10h2v7H7v-7zm4-3h2v10h-2V7zm4 6h2v4h-2v-4z' },  // admin-only grafic view
  { href: '/verificare-aprobari', label: 'Aprobare orar', adminOnly: true, icon: 'M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z' },
  { href: '/analytics',   label: 'Analitică',     adminOnly: true,  icon: 'M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z' },
];

const sidebarStyle: React.CSSProperties = {
  width: 240,
  minHeight: '100vh',
  background: 'rgba(255,255,255,0.85)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  color: '#333',
  display: 'flex',
  flexDirection: 'column',
  borderRight: '1px solid rgba(155,27,48,0.06)',
  flexShrink: 0,
  position: 'relative',
  zIndex: 10,
  fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
};

const brandStyle: React.CSSProperties = {
  padding: '24px 20px 20px',
  textAlign: 'center',
  borderBottom: '1px solid rgba(155,27,48,0.06)',
};

const logoStyle: React.CSSProperties = {
  display: 'inline-block',
  height: 26,
  width: '100%',
  maxWidth: 180,
  backgroundColor: '#9B1B30',
  WebkitMaskImage: 'url(/translux-logo-red.png)',
  WebkitMaskSize: 'contain',
  WebkitMaskRepeat: 'no-repeat',
  WebkitMaskPosition: 'center',
  maskImage: 'url(/translux-logo-red.png)',
  maskSize: 'contain',
  maskRepeat: 'no-repeat',
  maskPosition: 'center',
};

const subtitleStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: '0.15em',
  color: 'rgba(155,27,48,0.35)',
  textTransform: 'uppercase',
  fontWeight: 500,
  marginTop: 4,
};

const navStyle: React.CSSProperties = {
  flex: 1,
  padding: '12px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};

const linkBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 14px',
  borderRadius: 10,
  color: '#999',
  fontSize: 13,
  fontWeight: 500,
  fontStyle: 'italic',
  textDecoration: 'none',
  transition: 'all 0.2s ease',
  position: 'relative',
};

const linkActive: React.CSSProperties = {
  ...linkBase,
  color: '#9B1B30',
  background: 'rgba(155,27,48,0.06)',
  fontWeight: 600,
};

const activeBar: React.CSSProperties = {
  position: 'absolute',
  left: 0,
  top: 6,
  bottom: 6,
  width: 3,
  borderRadius: '0 3px 3px 0',
  background: '#9B1B30',
};

const footerStyle: React.CSSProperties = {
  padding: '16px 10px',
  borderTop: '1px solid rgba(155,27,48,0.06)',
};

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'rgba(155,27,48,0.4)',
  padding: '14px 14px 6px',
  fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
};

const logoutStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px',
  background: 'transparent',
  border: '1px solid rgba(155,27,48,0.1)',
  color: 'rgba(155,27,48,0.4)',
  borderRadius: 10,
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
  fontStyle: 'italic',
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
};

function isItemActive(item: NavItem, pathname: string, currentTab: string | null = null) {
  // item cu tab (ex. /numarare?tab=tarife): activ doar dacă pathname + tab-ul curent coincid
  if (item.tab) {
    const base = item.href.split('?')[0];
    return pathname === base && (currentTab || 'numarare') === item.tab;
  }
  return item.exact ? pathname === item.href : (pathname === item.href || pathname.startsWith(item.href + '/'));
}

function NavLink({ item, pathname, currentTab = null }: { item: NavItem; pathname: string; currentTab?: string | null }) {
  const active = isItemActive(item, pathname, currentTab);
  return (
    <Link href={item.href} style={active ? linkActive : linkBase}>
      {active && <span style={activeBar} />}
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20, flexShrink: 0, opacity: active ? 0.8 : 0.4 }}>
        <path d={item.icon} />
      </svg>
      {item.label}
    </Link>
  );
}

// Pereche buton + listă pliabilă, folosită pentru modulele cu sub-pagini (Piese, Numărare) și pentru Digital.
function Collapsible({ label, icon, items, pathname, currentTab = null }: { label: string; icon: string; items: NavItem[]; pathname: string; currentTab?: string | null }) {
  const active = items.some((i) => isItemActive(i, pathname, currentTab));
  const [open, setOpen] = useState(active);
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          ...linkBase,
          background: active ? 'rgba(155,27,48,0.06)' : 'transparent',
          color: active ? '#9B1B30' : '#999',
          fontWeight: active ? 600 : 500,
          border: 'none',
          cursor: 'pointer',
          width: '100%',
          fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
        }}
      >
        {active && <span style={activeBar} />}
        <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20, flexShrink: 0, opacity: active ? 0.8 : 0.4 }}>
          <path d={icon} />
        </svg>
        <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
        <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 18, height: 18, opacity: 0.4, transition: 'transform 0.2s ease', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
        </svg>
      </button>
      <div style={{ overflow: 'hidden', maxHeight: open ? 720 : 0, transition: 'max-height 0.3s ease', paddingLeft: 12 }}>
        {items.map((item) => (
          <NavLink key={item.href + item.label} item={item} pathname={pathname} currentTab={currentTab} />
        ))}
      </div>
    </>
  );
}

const nomenclatorHrefs = nomenclatorItems.map(i => i.href);

export default function Sidebar({ role = 'ADMIN' }: { role?: AdminRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');

  const nomenclatorActive = nomenclatorHrefs.some(h => pathname === h || pathname.startsWith(h + '/'));
  const [nomenclatorOpen, setNomenclatorOpen] = useState(nomenclatorActive);

  const filteredNav = role === 'ADMIN' ? nav
    : role === 'GRAFIC' || role === 'DISPATCHER' ? nav.filter(n => n.href === '/grafic' && n.label === 'Grafic')
    : role === 'OPERATOR_CAMERE' || role === 'ADMIN_CAMERE' || role === 'EVALUATOR_INCASARI' || role === 'CONTABIL' || role === 'DEPOZITAR' || role === 'MANAGER' ? []
    : nav;

  // doar ADMIN primește dropdown-urile pe module; rolurile de cameră văd Numărare ca link direct (tab-urile lor sunt în pagină)
  // CONTABIL vede doar modulul Piese, cu sub-paginile de citire + fiscal/1C.
  const filteredModules = role === 'ADMIN' ? moduleItems
    : role === 'CONTABIL' ? moduleItems.filter(m => m.href === '/piese').map(m => ({ ...m, children: m.children?.filter(c => CONTABIL_PIESE_HREFS.has(c.href)) }))
    : role === 'DEPOZITAR' ? moduleItems.filter(m => m.href === '/piese').map(m => ({ ...m, children: m.children?.filter(c => DEPOZITAR_PIESE_HREFS.has(c.href)) }))
    : role === 'MANAGER' ? moduleItems.filter(m => m.href === '/piese').map(m => ({ ...m, children: m.children?.filter(c => MANAGER_PIESE_HREFS.has(c.href)) }))
    : (role === 'OPERATOR_CAMERE' || role === 'ADMIN_CAMERE' || role === 'EVALUATOR_INCASARI') ? moduleItems.filter(m => m.href === '/numarare').map(m => ({ ...m, children: undefined }))
    : [];

  const showNomenclator = role === 'ADMIN' || role === 'DISPATCHER';
  const filteredNomenclator = role === 'ADMIN'
    ? nomenclatorItems
    : nomenclatorItems.filter(i => i.href === '/drivers' || i.href === '/vehicles');

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside style={sidebarStyle}>
      <div style={brandStyle}>
        <span style={logoStyle} />
        <div style={subtitleStyle}>Panou Administrativ</div>
      </div>

      <nav style={navStyle}>
        {filteredModules.length > 0 && <div style={sectionLabelStyle}>Module</div>}
        {filteredModules.map((item) => (
          item.children
            ? <Collapsible key={item.href} label={item.label} icon={item.icon} items={item.children} pathname={pathname} currentTab={currentTab} />
            : <NavLink key={item.href + item.label} item={item} pathname={pathname} currentTab={currentTab} />
        ))}

        {filteredNav.length > 0 && (
          <Collapsible label="Digital" icon="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" items={filteredNav} pathname={pathname} currentTab={currentTab} />
        )}

        {showNomenclator && (
          <>
            <button
              onClick={() => setNomenclatorOpen(o => !o)}
              style={{
                ...linkBase,
                background: nomenclatorActive ? 'rgba(155,27,48,0.06)' : 'transparent',
                color: nomenclatorActive ? '#9B1B30' : '#999',
                fontWeight: nomenclatorActive ? 600 : 500,
                border: 'none',
                cursor: 'pointer',
                width: '100%',
                fontFamily: 'var(--font-opensans), Open Sans, sans-serif',
              }}
            >
              {nomenclatorActive && <span style={activeBar} />}
              <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20, flexShrink: 0, opacity: nomenclatorActive ? 0.8 : 0.4 }}>
                <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z" />
              </svg>
              <span style={{ flex: 1, textAlign: 'left' }}>Nomenclator</span>
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                style={{
                  width: 18,
                  height: 18,
                  opacity: 0.4,
                  transition: 'transform 0.2s ease',
                  transform: nomenclatorOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                }}
              >
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
              </svg>
            </button>

            <div style={{
              overflow: 'hidden',
              maxHeight: nomenclatorOpen ? 300 : 0,
              transition: 'max-height 0.25s ease',
              paddingLeft: 12,
            }}>
              {filteredNomenclator.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </div>
          </>
        )}
      </nav>

      <div style={footerStyle}>
        <button onClick={handleLogout} style={logoutStyle}>
          <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 20, height: 20, flexShrink: 0, opacity: 0.4 }}>
            <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z" />
          </svg>
          Deconectare
        </button>
      </div>
    </aside>
  );
}
