import { mobileData, mobileFailure, requireMobileTeacher } from '@/lib/mobile-api';
import { updateTahfidzRecords, updateTahfidzRecordsSchema } from '@/features/tahfidz/server/mobile';
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const actor = requireMobileTeacher(request, { permission: 'tahfidz.write' });
    const { sessionId } = await params;
    const input = updateTahfidzRecordsSchema.parse(await request.json());
    updateTahfidzRecords(actor, sessionId, input);
    return mobileData({ ok: true, id: sessionId, updated: input.records.length });
  } catch (error) {
    return mobileFailure(error);
  }
}
