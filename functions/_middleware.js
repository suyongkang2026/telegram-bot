export async function onRequest(context) {
    const { request, env, next } = context;
    const url = new URL(request.url);

    // 只有访问 /api/admin 时才检查 Token
    if (url.pathname.startsWith('/api/admin')) {
        const token = request.headers.get('Authorization');
        if (token !== `Bearer ${env.JWT_SECRET}`) {
            return new Response("Unauthorized", { status: 401 });
        }
    }
    return next();
}
