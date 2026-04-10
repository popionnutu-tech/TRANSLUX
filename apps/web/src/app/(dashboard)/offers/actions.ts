'use server';

import { revalidatePath } from 'next/cache';
import { getSupabase } from '@/lib/supabase';
import { verifySession, requireRole } from '@/lib/auth';
import type { Offer } from '@translux/db';

export async function getOffers(): Promise<Offer[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('offers')
    .select('*')
    .order('created_at', { ascending: false });
  return (data || []) as Offer[];
}

export async function getLocalities(): Promise<{ name_ro: string }[]> {
  requireRole(await verifySession(), 'ADMIN');
  const { data } = await getSupabase()
    .from('localities')
    .select('name_ro')
    .eq('active', true)
    .order('name_ro');
  return (data || []) as { name_ro: string }[];
}

export async function createOffer(from_locality: string, to_locality: string, original_price: number, offer_price: number) {
  requireRole(await verifySession(), 'ADMIN');

  const { error } = await getSupabase()
    .from('offers')
    .insert({ from_locality, to_locality, original_price, offer_price, active: true });
  if (error) throw new Error(error.message);
  revalidateOfferPages();
}

export async function toggleOffer(id: number, active: boolean) {
  requireRole(await verifySession(), 'ADMIN');

  const { error } = await getSupabase()
    .from('offers')
    .update({ active })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidateOfferPages();
}

export async function deleteOffer(id: number) {
  requireRole(await verifySession(), 'ADMIN');

  const { error } = await getSupabase()
    .from('offers')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidateOfferPages();
}

function revalidateOfferPages() {
  revalidatePath('/offers');
  revalidatePath('/');
  revalidatePath('/ro');
  revalidatePath('/ru');
}
