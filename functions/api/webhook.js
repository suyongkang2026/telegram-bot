/**
 * @copyright 2026 Xiaosu (https://t.me/xiaosu06)
 */
export async function onRequestPost(context) {
    const { env } = context;
    const body = await context.request.json();
    
    // 基础参数 (从 Cloudflare 环境变量读取)
    const BOT_TOKEN = env.BOT_TOKEN;
    const ADMIN_ID = env.ADMIN_ID;
    const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

    // 处理逻辑：如果是普通消息，转发给管理员
    if (body.message && body.message.from.id != ADMIN_ID) {
        const uid = body.message.from.id;
        const text = body.message.text || "[媒体消息]";
        
        // 1. 自动审计 (调用 AI)
        // 2. 转发逻辑
        await fetch(`${API_URL}/sendMessage`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                chat_id: ADMIN_ID,
                text: `📩 收到消息\n来自 ID: ${uid}\n内容: ${text}\n\nBy Xiaosu`,
            })
        });
    }

    return new Response("OK");
}
