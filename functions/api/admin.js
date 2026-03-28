export async function onRequestGet(context) {
    const { env } = context;
    const kv = env.MY_KV;
    const authHeader = context.request.headers.get('Authorization');

    if (!authHeader || authHeader !== `Bearer ${env.JWT_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    const db = (await kv.get('config', { type: 'json' })) || { users: [], banned: {} };
    return new Response(JSON.stringify(db), { headers: { 'Content-Type': 'application/json' } });
}
