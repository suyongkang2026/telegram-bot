/**
 * @file Telegram Bot Supreme Final Pro (True Dynamic AI)
 * @author Xiaosu (https://t.me/xiaosu06)
 * @version 3.3.0
 */

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

    const getDb = async () => (await kv.get('config', { type: 'json' })) || { 
        users: [], banned: {}, whitelist: [], ai: { urls: [], keys: [], models: [] },
        stats: { totalMsg: 0, todayMsg: 0, todayNew: 0, start: Date.now() } 
    };

    const askAI = async (prompt, sys = "助手") => {
        const db = await getDb();
        if (!db.ai.urls || !db.ai.urls.length) return null;
        let apiUrl = db.ai.urls[0].trim();
        if (!apiUrl.endsWith('/chat/completions')) apiUrl = apiUrl.replace(/\/$/, '') + '/chat/completions';

        try {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${db.ai.keys[0].trim()}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    model: db.ai.models[0].trim(), 
                    messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
                    temperature: 0.9 
                })
            });
            const data = await res.json();
            return data.choices[0]?.message?.content || null;
        } catch (e) { return null; }
    };

    const payload = await context.request.json();
    const cb = payload.callback_query;
    const msg = payload.message || cb?.message;
    if (!msg) return new Response("OK");

    const uid = (cb ? cb.from.id : msg.from.id).toString();
    const text = (msg.text || "").trim();
    let db = await getDb();

    // --- 1. 处理按钮回调 ---
    if (cb) {
        const data = cb.data;
        if (uid === ADMIN_ID) {
            const tid = data.split(':')[1];
            if (data.startsWith('white:')) {
                if (!db.whitelist.includes(tid)) db.whitelist.push(tid);
                delete db.banned[tid];
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🛡️ <b>权限通知</b>\n您已被加入白名单，享有免审计特权。", parse_mode: "HTML" });
                return tg('answerCallbackQuery', { callback_query_id: cb.id, text: "✅ 已加白" });
            }
            if (data.startsWith('unban:')) {
                delete db.banned[tid];
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🎉 封禁已解除。" });
                return tg('answerCallbackQuery', { callback_query_id: cb.id, text: "✅ 已解封" });
            }
            if (data.startsWith('ban:')) {
                db.banned[tid] = true;
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🚫 您已被管理员永久封禁。", reply_markup: { inline_keyboard: [[{ text: "⚖️ 申诉", callback_data: "appeal" }]] } });
                return tg('answerCallbackQuery', { callback_query_id: cb.id, text: "🚫 已封禁" });
            }
            if (data.startsWith('sel:')) {
                await kv.put('admin_target', tid);
                return tg('sendMessage', { chat_id: ADMIN_ID, text: `🎯 <b>锁定回复模式</b>\n正在回复：<code>${tid}</code>\n发送内容直达，发送 /exit 退出。`, parse_mode: "HTML" });
            }
        }
        
        // 模式选择提示（根据要求强化）
        if (data === 'mode_ai') {
            await kv.put(`state:${uid}`, 'ai_chat');
            await tg('sendMessage', { chat_id: uid, text: "✅ <b>您已选择 AI 模式</b>\n请发送您的内容，我将智能回复您。", parse_mode: "HTML" });
        }
        if (data === 'mode_human') {
            await kv.put(`state:${uid}`, 'human_chat');
            await tg('sendMessage', { chat_id: uid, text: "✅ <b>您已选择 人工模式</b>\n请发送您的内容，消息将实时同步给主理人。", parse_mode: "HTML" });
        }
        if (data === 'exit_all') {
            await kv.delete(`state:${uid}`);
            await tg('sendMessage', { chat_id: uid, text: "📴 对话已结束。" });
        }
        if (data === 'appeal') {
            const count = parseInt(await kv.get(`appeal_count:${uid}`) || "0");
            if (count >= 5) return tg('answerCallbackQuery', { callback_query_id: cb.id, text: "❌ 今日申诉上限", show_alert: true });
            await kv.put(`state:${uid}`, 'appealing');
            await tg('sendMessage', { chat_id: uid, text: "📝 请发送申诉理由：" });
        }
        await tg('answerCallbackQuery', { callback_query_id: cb.id });
        return new Response("OK");
    }

    // --- 2. 管理员指令 ---
    if (uid === ADMIN_ID) {
        if (text.startsWith('/setai ')) {
            const p = text.split(' ');
            db.ai = { urls: p[1].split(','), keys: p[2].split(','), models: p[3].split(',') };
            await kv.put('config', JSON.stringify(db));
            return tg('sendMessage', { chat_id: ADMIN_ID, text: "✅ AI 配置成功！" });
        }
        if (text === '/exit') { await kv.delete('admin_target'); return tg('sendMessage', { chat_id: ADMIN_ID, text: "📴 已退出锁定回复。" }); }
        const target = await kv.get('admin_target');
        if (target && !text.startsWith('/')) {
            await tg('copyMessage', { chat_id: target, from_chat_id: ADMIN_ID, message_id: msg.message_id });
            return new Response("OK");
        }
    }

    // --- 3. 用户逻辑 ---
    if (uid !== ADMIN_ID) {
        // 统计
        db.stats.totalMsg++; db.stats.todayMsg++;
        if (!db.users.includes(uid)) { db.users.push(uid); db.stats.todayNew++; }
        await kv.put('config', JSON.stringify(db));

        const isWhite = db.whitelist.includes(uid);
        if (db.banned[uid] && !isWhite) {
            const s = await kv.get(`state:${uid}`);
            if (s === 'appealing') {
                const count = parseInt(await kv.get(`appeal_count:${uid}`) || "0");
                await kv.put(`appeal_count:${uid}`, (count + 1).toString(), { expirationTtl: 86400 });
                await tg('sendMessage', { chat_id: ADMIN_ID, text: `⚖️ <b>新申诉 (${count + 1}/5)</b>\nID: <code>${uid}</code>\n理由: ${text}`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "✅ 解封", callback_data: `unban:${uid}` }]] } });
                await kv.delete(`state:${uid}`);
                return tg('sendMessage', { chat_id: uid, text: "📨 申诉已提交。" });
            }
            return tg('sendMessage', { chat_id: uid, text: "🚫 您已被封禁。", reply_markup: { inline_keyboard: [[{ text: "⚖️ 申诉", callback_data: "appeal" }]] } });
        }

        const state = await kv.get(`state:${uid}`);

        // 【核心修复：100% 动态 AI 出题】
        if (text === '/start' || !state) {
            const qa = await askAI("随机出一个百科常识题（如历史地理），禁止数学题。格式严格：问题|答案（答案1-4字）。", "出题官");
            if (!qa || !qa.includes('|')) return tg('sendMessage', { chat_id: uid, text: "⚠️ 系统初始化中，请稍后再发 /start（管理员请检查 AI 配置）" });
            
            const [q, a] = qa.split('|');
            await kv.put(`ans:${uid}`, a.trim().toLowerCase());
            await kv.put(`state:${uid}`, 'verifying');
            return tg('sendMessage', { chat_id: uid, text: `🛡️ <b>请回答常识题完成验证：</b>\n\n${q}`, parse_mode: "HTML" });
        }

        if (state === 'verifying') {
            const correctAns = await kv.get(`ans:${uid}`);
            if (text.toLowerCase().includes(correctAns)) {
                await kv.put(`state:${uid}`, 'verified');
                return tg('sendMessage', { chat_id: uid, text: "✅ 验证成功！请选择模式：", reply_markup: { inline_keyboard: [[{ text: "🤖 AI 模式", callback_data: "mode_ai" }, { text: "🙋 人工模式", callback_data: "mode_human" }]] } });
            }
            return tg('sendMessage', { chat_id: uid, text: "❌ 验证失败。重新发 /start 试试。" });
        }

        if (state === 'ai_chat') {
            const aiReply = await askAI(text);
            return tg('sendMessage', { chat_id: uid, text: aiReply || "AI 思考失败", reply_markup: { inline_keyboard: [[{ text: "⏹️ 退出对话", callback_data: "exit_all" }]] } });
        }

        if (state === 'human_chat') {
            if (!isWhite) {
                const audit = await askAI(`这段话是否违规(推销/辱骂)，仅回是/否: "${text}"`, "审计员");
                if (audit && audit.includes("是")) {
                    db.banned[uid] = true; await kv.put('config', JSON.stringify(db));
                    await tg('sendMessage', { chat_id: ADMIN_ID, text: `⚠️ <b>自动审计封禁</b>\nID：<code>${uid}</code>\n内容：${text}`, parse_mode: "HTML" });
                    return tg('sendMessage', { chat_id: uid, text: "🚫 违规封禁。", reply_markup: { inline_keyboard: [[{ text: "⚖️ 申诉", callback_data: "appeal" }]] } });
                }
            }
            await tg('sendMessage', { 
                chat_id: ADMIN_ID, text: `📩 <b>来自：</b><code>${uid}</code> ${isWhite ? "🌟" : ""}`, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "💬 回复", callback_data: `sel:${uid}` }, { text: "🚫 封禁", callback_data: `ban:${uid}` }], [{ text: "🛡️ 白名单", callback_data: `white:${uid}` }]] }
            });
            await tg('copyMessage', { chat_id: ADMIN_ID, from_chat_id: uid, message_id: msg.message_id });
            await tg('sendMessage', { chat_id: uid, text: "✔️ 已同步。" });
        }
    }
    return new Response("OK");
}
