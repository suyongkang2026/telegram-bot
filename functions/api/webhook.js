/**
 * @file Telegram Bot Supreme Final Version (AI Common Sense Auth)
 * @author Xiaosu (https://t.me/xiaosu06)
 * @version 3.1.0
 */

export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.MY_KV;
    const BOT_TOKEN = env.BOT_TOKEN;
    const ADMIN_ID = env.ADMIN_ID.toString();

    // --- 核心工具函数 ---
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
        try {
            const res = await fetch(`${db.ai.urls[0]}/chat/completions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${db.ai.keys[0]}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    model: db.ai.models[0], 
                    messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
                    temperature: 0.7 
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

    // --- 1. 处理按钮回调 (Callback) ---
    if (cb) {
        const data = cb.data;
        if (uid === ADMIN_ID) {
            const tid = data.split(':')[1];
            if (data.startsWith('white:')) {
                if (!db.whitelist.includes(tid)) db.whitelist.push(tid);
                delete db.banned[tid];
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🛡️ <b>权限变更提醒</b>\n您已被管理员列入<b>白名单</b>，不再受 AI 审核限制。", parse_mode: "HTML" });
                await tg('answerCallbackQuery', { callback_query_id: cb.id, text: "✅ 已加白" });
            }
            if (data.startsWith('unban:')) {
                delete db.banned[tid];
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🎉 <b>封禁解除</b>\n您的账号已恢复正常使用。", parse_mode: "HTML"});
                await tg('answerCallbackQuery', { callback_query_id: cb.id, text: "✅ 已解封" });
            }
            if (data.startsWith('ban:')) {
                db.banned[tid] = true;
                await kv.put('config', JSON.stringify(db));
                await tg('answerCallbackQuery', { callback_query_id: cb.id, text: "🚫 已封禁" });
            }
            if (data.startsWith('sel:')) {
                await kv.put('admin_target', tid);
                await tg('sendMessage', { chat_id: ADMIN_ID, text: `🎯 <b>锁定回复模式</b>\n正在回复：<code>${tid}</code>\n发送任何内容直达，发送 /exit 退出。`, parse_mode: "HTML" });
            }
        }
        if (data === 'mode_ai') await kv.put(`state:${uid}`, 'ai_chat');
        if (data === 'mode_human') await kv.put(`state:${uid}`, 'human_chat');
        if (data === 'exit_all') { await kv.delete(`state:${uid}`); await tg('sendMessage', { chat_id: uid, text: "📴 对话已结束。" }); }
        if (data === 'appeal') {
            const count = parseInt(await kv.get(`appeal_count:${uid}`) || "0");
            if (count >= 5) return tg('answerCallbackQuery', { callback_query_id: cb.id, text: "❌ 今日申诉次数已达上限", show_alert: true });
            await kv.put(`state:${uid}`, 'appealing');
            await tg('sendMessage', { chat_id: uid, text: "📝 请发送您的申诉理由（不少于10字）：" });
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
            return tg('sendMessage', { chat_id: ADMIN_ID, text: "✅ AI 配置成功" });
        }
        if (text === '/exit') { await kv.delete('admin_target'); return tg('sendMessage', { chat_id: ADMIN_ID, text: "📴 退出锁定回复。" }); }
        if (text === '/bl') {
            const list = Object.keys(db.banned).map(id => `🆔 <code>${id}</code>`).join('\n') || "空";
            return tg('sendMessage', { chat_id: ADMIN_ID, text: `🚫 <b>黑名单：</b>\n${list}`, parse_mode: "HTML" });
        }
        if (text.startsWith('/sendall ')) {
            const content = text.replace('/sendall ', '');
            let s = 0;
            for (let uId of db.users) { const res = await tg('sendMessage', { chat_id: uId, text: `📢 <b>群发：</b>\n${content}`, parse_mode: "HTML" }); if(res.ok) s++; }
            return tg('sendMessage', { chat_id: ADMIN_ID, text: `📢 完成: ${s}/${db.users.length}` });
        }
        const target = await kv.get('admin_target');
        if (target && !text.startsWith('/')) {
            await tg('copyMessage', { chat_id: target, from_chat_id: ADMIN_ID, message_id: msg.message_id });
            await tg('sendMessage', { chat_id: ADMIN_ID, text: `📤 已发送`, reply_markup: { inline_keyboard: [[{ text: "⏹️ 停止", callback_data: "exit_all" }]] } });
            return new Response("OK");
        }
    }

    // --- 3. 用户核心业务 ---
    if (uid !== ADMIN_ID) {
        db.stats.totalMsg++; db.stats.todayMsg++;
        if (!db.users.includes(uid)) { db.users.push(uid); db.stats.todayNew++; }
        await kv.put('config', JSON.stringify(db));

        const isWhite = db.whitelist.includes(uid);
        if (db.banned[uid] && !isWhite) {
            const s = await kv.get(`state:${uid}`);
            if (s === 'appealing') {
                const count = parseInt(await kv.get(`appeal_count:${uid}`) || "0");
                await kv.put(`appeal_count:${uid}`, (count + 1).toString(), { expirationTtl: 86400 });
                await tg('sendMessage', { chat_id: ADMIN_ID, text: `⚖️ <b>用户申诉 (${count + 1}/5)</b>\nID: <code>${uid}</code>\n理由: ${text}`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "✅ 解封", callback_data: `unban:${uid}` }, { text: "🛡️ 加白", callback_data: `white:${uid}` }]] } });
                await kv.delete(`state:${uid}`);
                return tg('sendMessage', { chat_id: uid, text: "📨 申诉已提交。" });
            }
            return tg('sendMessage', { chat_id: uid, text: "🚫 您已被封禁。", reply_markup: { inline_keyboard: [[{ text: "⚖️ 申诉", callback_data: "appeal" }]] } });
        }

        const state = await kv.get(`state:${uid}`);

        // 【AI 常识人机验证逻辑】
        if (text === '/start' || !state) {
            // 这里强制 AI 只出常识题
            const qa = await askAI("请随机出一个常识问题（例如历史、地理、常识，不要数学计算题），必须严格遵守格式：问题内容|答案关键短语。比如：中国首都是哪？|北京", "你是一个常识验证码生成器");
            const [q, a] = (qa || "新中国是哪年成立的？|1949").split('|');
            await kv.put(`ans:${uid}`, a.trim());
            await kv.put(`state:${uid}`, 'verifying');
            return tg('sendMessage', { chat_id: uid, text: `🛡️ <b>人机验证</b> (请直接回复答案)\n\n<b>问：</b>${q}`, parse_mode: "HTML" });
        }

        if (state === 'verifying') {
            const correctAns = await kv.get(`ans:${uid}`);
            if (text.includes(correctAns)) {
                await kv.put(`state:${uid}`, 'verified');
                return tg('sendMessage', { chat_id: uid, text: "✅ 验证成功！请选择模式：", reply_markup: { inline_keyboard: [[{ text: "🤖 AI 模式", callback_data: "mode_ai" }, { text: "🙋 人工模式", callback_data: "mode_human" }]] } });
            }
            return tg('sendMessage', { chat_id: uid, text: "❌ 回答错误，请重新发送 /start 获取新题目。" });
        }

        // AI 对话逻辑
        if (state === 'ai_chat' && text !== '/start') {
            const aiReply = await askAI(text);
            return tg('sendMessage', { chat_id: uid, text: aiReply || "AI 思考中...", reply_markup: { inline_keyboard: [[{ text: "⏹️ 退出 AI", callback_data: "exit_all" }]] } });
        }

        // 人工模式逻辑
        if (state === 'human_chat') {
            if (!isWhite) {
                const audit = await askAI(`分析这段话是否违规(广告/辱骂)，仅回复是或否: "${text}"`, "审计员");
                if (audit && audit.includes("是")) {
                    db.banned[uid] = true; await kv.put('config', JSON.stringify(db));
                    await tg('sendMessage', { chat_id: ADMIN_ID, text: `⚠️ <b>自动审计封禁</b>\n用户：<code>${uid}</code>\n内容：${text}`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "✅ 解封", callback_data: `unban:${uid}` }]] } });
                    return tg('sendMessage', { chat_id: uid, text: "🚫 触发安全审计，已被封禁。", reply_markup: { inline_keyboard: [[{ text: "⚖️ 申诉", callback_data: "appeal" }]] } });
                }
            }
            await tg('sendMessage', { 
                chat_id: ADMIN_ID, text: `📩 <b>来自：</b><code>${uid}</code> ${isWhite ? "🌟" : ""}`, parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "💬 回复", callback_data: `sel:${uid}` }, { text: "🚫 封禁", callback_data: `ban:${uid}` }], [{ text: "🛡️ 加白", callback_data: `white:${uid}` }]] }
            });
            await tg('copyMessage', { chat_id: ADMIN_ID, from_chat_id: uid, message_id: msg.message_id });
            await tg('sendMessage', { chat_id: uid, text: "✔️ 消息已同步至后台。" });
        }
    }
    return new Response("OK");
}
