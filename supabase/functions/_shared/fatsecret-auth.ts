// Server only. The verifier must call Supabase Auth getUser(token).
type VerifiedUser = { id: string; is_anonymous?: boolean };
type Verify = (token: string) => Promise<{data: {user: VerifiedUser | null}; error: unknown}>;
export async function requireFatSecretUser(request: Request, verify: Verify): Promise<string> {
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer ([A-Za-z0-9._~-]{1,8192})$/i.exec(header);
  if (!match) throw new Error('unauthorized');
  const {data,error} = await verify(match[1]);
  const user = data?.user;
  if (error || !user || user.is_anonymous || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id)) {
    throw new Error('unauthorized');
  }
  return user.id.toLowerCase();
}
