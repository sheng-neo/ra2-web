/**
 * What this install knows about itself, kept apart from the person's records.
 *
 * It is a second, small database on purpose. Nothing in it is part of a backup, a spreadsheet
 * export or the account mirror, so the random id used for anonymous counts can never travel to
 * another phone with a restored backup, and the answer to "share anonymous counts?" is given
 * again on every phone. A build that neither counts nor has the Pro row never opens it.
 */
import Dexie, { type Table } from 'dexie';
import { NO_PROGRESS, type CountMessage, type CountProgress } from '../core/counts';

export interface InstallState {
  id: 'me';
  /** When setup was first finished on this phone. Redoing setup does not change it. */
  setupDoneAt: number | null;
  /** The answer to "share anonymous counts?". null = not asked yet. */
  countsConsent: boolean | null;
  /** The random id sent with the counts. It exists only while the answer is yes. */
  installId: string | null;
  /** Which counts have already been queued for this id. */
  progress: CountProgress;
  /** Ids whose delete request the server has not confirmed yet. */
  pendingDeletes: string[];
  /** When "I would want this" was tapped, so the sheet can say so. Not sent. */
  proTappedAt: number | null;
  /** The same moment, if counts were being shared at the time. Only then is the tap counted. */
  proCountedAt: number | null;
}

export const BLANK_INSTALL: InstallState = { id: 'me', setupDoneAt: null, countsConsent: null, installId: null, progress: NO_PROGRESS, pendingDeletes: [], proTappedAt: null, proCountedAt: null };

/** One count waiting to be sent, exactly as it will be sent. */
export interface QueuedCount {
  seq?: number;
  message: CountMessage;
}

export class InstallDB extends Dexie {
  state!: Table<InstallState, string>;
  queue!: Table<QueuedCount, number>;

  constructor(name = 'glp1-companion-install') {
    super(name);
    this.version(1).stores({ state: 'id', queue: '++seq' });
  }
}

let opened: InstallDB | null = null;

/** The database. It is made on first use, so a build that never asks for it never creates it. */
export function installDb(): InstallDB {
  return (opened ??= new InstallDB());
}

export async function readInstall(): Promise<InstallState> {
  return (await installDb().state.get('me')) ?? { ...BLANK_INSTALL };
}
