import { z } from 'zod';
import { mobileData, mobileFailure, rotateMobileSession } from '@/lib/mobile-api';

const schema = z.object({ refresh_token: z.string().min(32).max(256) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    return mobileData(rotateMobileSession(input.refresh_token));
  } catch (error) {
    return mobileFailure(error);
  }
}
