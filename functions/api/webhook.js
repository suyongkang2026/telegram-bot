export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.MY_KV;
    const BOT_TOKEN = env.BOT_TOKEN;
    const ADMIN_ID = env.ADMIN_ID.toString();

    const tg = async (method, body) => {
        return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    };

    const getDb = async () => (await kv.get('config', { type: 'json' })) || { users: [], banned: {} };

    const payload = await context.request.json();
    const cb = payload.callback_query;
    const msg = payload.message || cb?.message;
    if (!msg) return new Response("OK");

    const user = cb ? cb.from : msg.from;
    const uid = user.id.toString();
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    const username = user.username ? `@${user.username}` : '无';
    const userTag = `<b>${name}</b> (${username}) [<code>${uid}</code>]`;
    let db = await getDb();

    if (cb) {
        if (uid === ADMIN_ID) {
            const [action, tid] = cb.data.split(':');
            if (action === 'unban') {
                delete db.banned[tid]; await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🎉 您的账号已解封。" });
            }
            if (action === 'ban') {
                db.banned[tid] = true; await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🚫 您已被管理员封禁。" });
            }
        }
        if (cb.data === 'start_chat') {
            await kv.put(`state:${uid}`, 'active');
            await tg('sendMessage', { chat_id: uid, text: "✅ 验证通过，请发送您的消息。" });
        }
        await tg('answerCallbackQuery', { callback_query_id: cb.id });
        return new Response("OK");
    }

    if (uid === ADMIN_ID) {
        const text = (msg.text || "").trim();
        if (text === '/bl') return tg('sendMessage', { chat_id: ADMIN_ID, text: `🚫 <b>黑名单:</b>\n${Object.keys(db.banned).join('\n') || '空'}`, parse_mode: "HTML" });

        if (!text.startsWith('/')) {
            if (!msg.reply_to_message) return tg('sendMessage', { chat_id: ADMIN_ID, text: "⚠️ <b>请通过【引用】对方的消息进行回复</b>" });

            const refMsg = msg.reply_to_message;
            const refText = refMsg.text || refMsg.caption || "";
            const idMatch = refText.match(/\[<code>(\d+)<\/code>\]/) || refText.match(/(\d{7,10})/);
            
            if (!idMatch) return tg('sendMessage', { chat_id: ADMIN_ID, text: "❌ 无法识别目标用户。" });
            const targetId = idMatch[1];

            const res = await tg('copyMessage', { chat_id: targetId, from_chat_id: ADMIN_ID, message_id: msg.message_id });
            if (res.ok) return tg('sendMessage', { chat_id: ADMIN_ID, text: "📤 <b>已送达</b>", parse_mode: "HTML" });
        }
    } else {
        if (!db.users.includes(uid)) { db.users.push(uid); await kv.put('config', JSON.stringify(db)); }
        if (db.banned[uid]) return tg('sendMessage', { chat_id: uid, text: "🚫 您已被封禁。" });

        const state = await kv.get(`state:${uid}`);
        if (msg.text === '/start' || !state) {
            return tg('sendMessage', { chat_id: uid, text: "🛡️ <b>人机验证</b>", parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "✅ 开始对话", callback_data: "start_chat" }]] } });
        }

        if (state === 'active') {
            const header = `📩 来自: ${userTag}\n───────`;
            await tg('sendMessage', { chat_id: ADMIN_ID, text: header, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: "🚫 封禁", callback_data: `ban:${uid}` }, { text: "✅ 解封", callback_data: `unban:${uid}` }]] } });
            await tg('copyMessage', { chat_id: ADMIN_ID, from_chat_id: uid, message_id: msg.message_id });
            return tg('sendMessage', { chat_id: uid, text: "✅ 已投递" });
        }
    }
    return new Response("OK");
}
