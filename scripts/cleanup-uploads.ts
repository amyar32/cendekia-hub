import { db } from '../src/lib/db';
import { pruneOrphanedUploads } from '../src/lib/uploads';

const removed = pruneOrphanedUploads({ limit: 500 });
db().close();
console.log(`Cleanup upload selesai: ${removed} file yatim dihapus.`);
