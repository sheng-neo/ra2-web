/**
 * "Delete all data": everything the app keeps on this phone, and what it keeps elsewhere for
 * the person. Used by the button in settings and by the "Under 18" stop of a redone setup.
 */
import { wipeCloud } from './cloud';
import { wipeInstall } from './counting';
import { db } from './db';
import { features } from './features';

export async function wipeAllData(): Promise<void> {
  if (features.hostServices) await wipeCloud();
  // This phone's own notes go too, and with them the counts it has sent (counting.ts).
  if (features.anonymousCounts || features.proInterest) await wipeInstall().catch(() => undefined);
  await db.delete();
  location.reload();
}
