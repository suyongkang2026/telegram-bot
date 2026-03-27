/**
 * @file Telegram Bot Supreme Final Pro (UI/UX Optimized)
 * @author Xiaosu (https://t.me/xiaosu06)
 * @version 3.7.0
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
                body: JSON.stringify({ model: db.ai.models[0].trim(), messages: [{ role: "system", content: sys }, { role: "user", content: prompt }], temperature: 0.3 })
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
                await tg('sendMessage', { chat_id: tid, text: "🛡️ <b>权限通知</b>\n您已被管理员加入白名单，享有全协议免审计特权。", parse_mode: "HTML" });
            }
            if (data.startsWith('unban:')) {
                delete db.banned[tid];
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🎉 <b>封禁解除</b>\n您的账号已恢复正常。" , parse_mode: "HTML"});
            }
            if (data.startsWith('sel:')) {
                await kv.put('admin_target', tid);
                await tg('sendMessage', { chat_id: ADMIN_ID, text: `🎯 <b>锁定回复模式</b>\n目标：<code>${tid}</code>\n发送内容直达对方。`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⏹️ 退出锁定", callback_data: "clear_admin" }]] } });
            }
            if (data === 'clear_admin') {
                await kv.delete('admin_target');
                await tg('sendMessage', { chat_id: ADMIN_ID, text: "📴 已退出锁定模式。" });
            }
        }
        
        if (data === 'mode_ai') { await kv.put(`state:${uid}`, 'ai_chat'); await tg('sendMessage', { chat_id: uid, text: "✅ <b>AI 模式已开启</b>\n请发送内容。", parse_mode: "HTML" }); }
        if (data === 'mode_human') { await kv.put(`state:${uid}`, 'human_chat'); await tg('sendMessage', { chat_id: uid, text: "✅ <b>人工模式已开启</b>\n消息将同步给主理人。", parse_mode: "HTML" }); }
        if (data === 'exit_all') { await kv.delete(`state:${uid}`); await tg('sendMessage', { chat_id: uid, text: "📴 对话已结束。" }); }
        if (data === 'appeal') {
            const count = parseInt(await kv.get(`appeal_count:${uid}`) || "0");
            if (count >= 5) return tg('answerCallbackQuery', { callback_query_id: cb.id, text: "❌ 今日申诉上限", show_alert: true });
            await kv.put(`state:${uid}`, 'appealing');
            await tg('sendMessage', { chat_id: uid, text: "📝 <b>进入申诉流程</b>\n请发送申诉理由（不少于5字）。", parse_mode: "HTML" });
        }
        await tg('answerCallbackQuery', { callback_query_id: cb.id });
        return new Response("OK");
    }

    // --- 2. 管理员指令与锁定回复 ---
    if (uid === ADMIN_ID) {
        if (text === '/exit') { await kv.delete('admin_target'); return tg('sendMessage', { chat_id: ADMIN_ID, text: "📴 已退出。" }); }
        
        const target = await kv.get('admin_target');
        if (target && !text.startsWith('/')) {
            await tg('copyMessage', { chat_id: target, from_chat_id: ADMIN_ID, message_id: msg.message_id });
            // 【新增：每条消息后带退出按钮】
            return tg('sendMessage', { 
                chat_id: ADMIN_ID, 
                text: `📤 <b>已送达</b> <code>${target}</code>`, 
                parse_mode: "HTML",
                reply_markup: { inline_keyboard: [[{ text: "⏹️ 退出锁定", callback_data: "clear_admin" }]] } 
            });
        }
    }

    // --- 3. 用户逻辑 ---
    if (uid !== ADMIN_ID) {
        const isWhite = db.whitelist.includes(uid);
        const state = await kv.get(`state:${uid}`);

        if (db.banned[uid] && !isWhite) {
            if (state === 'appealing') {
                const count = parseInt(await kv.get(`appeal_count:${uid}`) || "0");
                await kv.put(`appeal_count:${uid}`, (count + 1).toString(), { expirationTtl: 86400 });
                await tg('sendMessage', { 
                    chat_id: ADMIN_ID, 
                    text: `⚖️ <b>用户申诉 (${count + 1}/5)</b>\nID: <code>${uid}</code>\n内容: ${text}`, 
                    parse_mode: "HTML", 
                    reply_markup: { inline_keyboard: [[{ text: "✅ 解封", callback_data: `unban:${tid}` }]] } 
                });
                await kv.delete(`state:${uid}`);
                return tg('sendMessage', { chat_id: uid, text: "✅ <b>已成功投递</b>\n管理员稍后将处理您的申诉。", parse_mode: "HTML" });
            }
            return tg('sendMessage', { chat_id: uid, text: "🚫 您已被封禁。", reply_markup: { inline_keyboard: [[{ text: "⚖️ 申诉", callback_data: "appeal" }]] } });
        }

        // 【验证与出题逻辑保持原样...】
        if (text === '/start' || !state) {
            const qa = await askAI("随机生成一个常识题，格式：问题|答案", "出题官");
            if (!qa || !qa.includes('|')) return tg('sendMessage', { chat_id: uid, text: "⚠️ 系统初始化中..." });
            const [q, a] = qa.split('|');
            await kv.put(`ans:${uid}`, a.trim().toLowerCase());
            await kv.put(`state:${uid}`, 'verifying');
            return tg('sendMessage', { chat_id: uid, text: `🛡️ <b>人机验证</b>\n\n${q}`, parse_mode: "HTML" });
        }

        if (state === 'verifying') {
            const ans = await kv.get(`ans:${uid}`);
            if (text.toLowerCase().includes(ans)) {
                await kv.put(`state:${uid}`, 'verified');
                return tg('sendMessage', { chat_id: uid, text: "✅ 验证通过！请选择模式：", reply_markup: { inline_keyboard: [[{ text: "🤖 AI 模式", callback_data: "mode_ai" }, { text: "🙋 人工模式", callback_data: "mode_human" }]] } });
            }
            return tg('sendMessage', { chat_id: uid, text: "❌ 验证失败。" });
        }

        if (state === 'human_chat') {
            // 【增强：审计逻辑...】
            const blackWords = ["傻逼", "操你", "尼玛", "sb"];
            if (!isWhite && blackWords.some(w => text.toLowerCase().includes(w))) {
                db.banned[uid] = true; await kv.put('config', JSON.stringify(db));
                return tg('sendMessage', { chat_id: uid, text: "🚫 违规封禁。", reply_markup: { inline_keyboard: [[{ text: "⚖️ 申诉", callback_data: "appeal" }]] } });
            }

            // 【核心修复：引用消息识别】
            let header = `📩 <b>来自：</b><code>${uid}</code>`;
            if (msg.reply_to_message) {
                header = `💬 <b>引用了您的消息</b>\n来自：<code>${uid}</code>\n───────`;
            }

            await tg('sendMessage', { 
                chat_id: ADMIN_ID, text: header, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "💬 回复", callback_data: `sel:${uid}` }, { text: "🚫 封禁", callback_data: `ban:${uid}` }]] }
            });
            await tg('copyMessage', { chat_id: ADMIN_ID, from_chat_id: uid, message_id: msg.message_id });
            return tg('sendMessage', { chat_id: uid, text: "✅ <b>已成功投递</b>", parse_mode: "HTML" });
        }

        if (state === 'ai_chat') {
            const aiRes = await askAI(text);
            return tg('sendMessage', { chat_id: uid, text: aiRes || "AI 思考中...", reply_markup: { inline_keyboard: [[{ text: "⏹️ 退出", callback_data: "exit_all" }]] } });
        }
    }
    return new Response("OK");
}
