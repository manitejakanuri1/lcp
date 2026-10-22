import type { Request } from 'express';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { UserRole, Uuid } from '../contracts';
import { query } from './db';
import { StoreError } from './envelope';

export interface Caller {
  id: Uuid;
  role: UserRole;
}

function firebaseAuth() {
  // Verifying an ID token needs only the project id (public signing keys are fetched from Google);
  // on Cloud Functions the project is picked up automatically.
  if (!getApps().length) initializeApp(process.env.FIREBASE_PROJECT_ID ? { projectId: process.env.FIREBASE_PROJECT_ID } : undefined);
  return getAuth();
}

/**
 * Verifies the Firebase ID token in `Authorization: Bearer`, maps its uid to store.staff_users and enforces
 * the allowed roles. The role in the database is authoritative (a token claim is never trusted for it).
 */
export async function requireRole(req: Request, allowed: readonly UserRole[]): Promise<Caller> {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new StoreError('UNAUTHENTICATED', 'Missing bearer token.');

  let uid: string;
  try {
    uid = (await firebaseAuth().verifyIdToken(token)).uid;
  } catch {
    throw new StoreError('UNAUTHENTICATED', 'Invalid or expired session.');
  }

  const { rows } = await query<{ id: string; role: UserRole }>(
    `SELECT id, role FROM store.staff_users WHERE provider = 'firebase' AND provider_uid = $1 AND is_active`,
    [uid],
  );
  const staff = rows[0];
  if (!staff) throw new StoreError('FORBIDDEN', 'No staff account for this user.');
  if (!allowed.includes(staff.role)) throw new StoreError('FORBIDDEN', `Role "${staff.role}" may not call this function.`);
  return { id: staff.id, role: staff.role };
}
