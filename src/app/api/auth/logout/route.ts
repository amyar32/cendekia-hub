import { cookies } from 'next/headers';
import { checkOrigin, COOKIE, currentUser, tokenHash } from '@/lib/auth';
import { db, audit } from '@/lib/db';
import { failure } from '@/lib/http';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const user = await currentUser();
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    db().transaction(() => {
      if (token) db().prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(token));
      if (user) audit(user.email, 'logout', 'auth', user.id);
    })();
    jar.delete(COOKIE);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
