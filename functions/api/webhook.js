/**
 * @file Telegram Bot Supreme (Native Engine Version)
 * @author Xiaosu (https://t.me/xiaosu06)
 */

export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.MY_KV;
    const BOT_TOKEN = env.BOT_TOKEN;
    const ADMIN_ID = env.ADMIN_ID;

    // --- 核心工具函数 ---
    const tg = async (method, body) => {
        return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    };

    const getDb = async () => (await kv.get('config', { type: 'json' })) || { 
        users: [], banned: {}, ai: { urls: [], keys: [], models: [] } 
    };

    const payload = await context.request.json();
    const msg = payload.message;
    if (!msg) return new Response("OK");

    const uid = msg.from.id.toString();
    const text = msg.text || "";

    // --- 1. 管理员逻辑 ---
    if (uid === ADMIN_ID) {
        // AI 映射配置
        if (text.startsWith('/setai ')) {
            const parts = text.split(' ');
            let db = await getDb();
            db.ai = { urls: parts[1].split(','), keys: parts[2].split(','), models: parts[3].split(',') };
            await kv.put('config', JSON.stringify(db));
            await tg('sendMessage', { chat_id: ADMIN_ID, text: "✅ AI 映射映射配置成功！By Xiaosu" });
            return new Response("OK");
        }

        // 退出锁定模式指令
        if (text === '/exit') {
            await kv.delete('admin_target');
            await tg('sendMessage', { chat_id: ADMIN_ID, text: "📴 已退出锁定回复模式。" });
            return new Response("OK");
        }

        // 状态锁定回复逻辑
        const target = await kv.get('admin_target');
        if (target && !text.startsWith('/')) {
            await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/copyMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: target,
                    from_chat_id: ADMIN_ID,
                    message_id: msg.message_id,
                    reply_markup: { inline_keyboard: [[{ text: "🛑 结束对话", callback_data: `exit:${target}` }]] }
                })
            });
            await tg('sendMessage', { chat_id: ADMIN_ID, text: `📤 已发送至 <code>${target}</code>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⏹️ 停止对话状态", callback_data: "clear_admin" }]] } });
            return new Response("OK");
        }

        // 引用回复逻辑
        if (msg.reply_to_message) {
            const rText = msg.reply_to_message.text || msg.reply_to_message.caption || "";
            const tid = rText.match(/ID: (\d+)/)?.[1];
            if (tid) {
                await tg('copyMessage', { chat_id: tid, from_chat_id: ADMIN_ID, message_id: msg.message_id });
                await tg('sendMessage', { chat_id: ADMIN_ID, text: `✔️ 已通过[引用格式]回复给 ${tid}` });
                return new Response("OK");
            }
        }
    }

    // --- 2. 用户逻辑 ---
    if (uid !== ADMIN_ID) {
        // 全格式转发给管理员 (包含 ID 锚点供回复使用)
        const header = `📩 <b>来自:</b> <code>${msg.from.first_name}</code>\n<b>ID:</b> <code>${uid}</code>`;
        await tg('sendMessage', { 
            chat_id: ADMIN_ID, 
            text: header, 
            parse_mode: 'HTML',
            reply_markup: { 
                inline_keyboard: [
                    [{ text: "💬 回复此人", callback_data: `sel:${uid}` }, { text: "🚫 封禁", callback_data: `ban:${uid}` }],
                    [{ text: "👤 个人主页", url: `tg://user?id=${uid}` }]
                ]
            } 
        });
        await tg('copyMessage', { chat_id: ADMIN_ID, from_chat_id: uid, message_id: msg.message_id });
        await tg('sendMessage', { chat_id: uid, text: "✔️ 消息已送达人工后台，请等待回复。" });
    }

    // --- 3. 按钮回调处理 (Callback Query) ---
    const cb = payload.callback_query;
    if (cb) {
        const data = cb.data;
        if (data.startsWith('sel:')) {
            const tid = data.split(':')[1];
            await kv.put('admin_target', tid);
            await tg('sendMessage', { chat_id: ADMIN_ID, text: `✅ 锁定模式：<code>${tid}</code>，现在发送内容将直接传达。`, parse_mode: "HTML" });
        }
        if (data === 'clear_admin') {
            await kv.delete('admin_target');
            await tg('sendMessage', { chat_id: ADMIN_ID, text: "📴 锁定状态已解除。" });
        }
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ callback_query_id: cb.id })
        });
    }

    return new Response("OK");
}
