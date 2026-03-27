/**
 * @file Telegram Bot Supreme Final Pro V6.0
 * @author Xiaosu (https://t.me/xiaosu06)
 * @version 6.0.0
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
                body: JSON.stringify({ model: db.ai.models[0].trim(), messages: [{ role: "system", content: sys }, { role: "user", content: prompt }], temperature: 0.1 })
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

    // --- 1. 处理按钮回调 (包含所有管理操作) ---
    if (cb) {
        const data = cb.data;
        if (uid === ADMIN_ID) {
            const tid = data.split(':')[1];
            if (data.startsWith('white:')) {
                if (!db.whitelist.includes(tid)) db.whitelist.push(tid);
                delete db.banned[tid];
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🛡️ <b>权限通知</b>\n您已被加入白名单。\n请发送 /start 重新选择模式。", parse_mode: "HTML" });
                return tg('answerCallbackQuery', { callback_query_id: cb.id, text: "✅ 已加白" });
            }
            if (data.startsWith('unban:')) {
                delete db.banned[tid];
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🎉 <b>封禁解除</b>\n您的账号已恢复正常。\n请发送 /start 重新进入。", parse_mode: "HTML"});
                return tg('answerCallbackQuery', { callback_query_id: cb.id, text: "✅ 已解封" });
            }
            if (data.startsWith('ban:')) {
                db.banned[tid] = true;
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🚫 <b>封禁通知</b>\n您已被管理员手动封禁。", parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⚖️ 提交申诉", callback_data: "appeal" }]] } });
                return tg('answerCallbackQuery', { callback_query_id: cb.id, text: "🚫 已执行封禁" });
            }
            if (data.startsWith('sel:')) {
                await kv.put('admin_target', tid);
                await tg('sendMessage', { chat_id: ADMIN_ID, text: `🎯 锁定回复：<code>${tid}</code>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⏹️ 退出锁定", callback_data: "clear_admin" }]] } });
            }
            if (data === 'clear_admin') {
                await kv.delete('admin_target');
                await tg('sendMessage', { chat_id: ADMIN_ID, text: "📴 已退出锁定模式。" });
            }
        }
        
        // 用户模式切换提示
        if (data === 'mode_ai') { await kv.put(`state:${uid}`, 'ai_chat'); await tg('sendMessage', { chat_id: uid, text: "✅ <b>AI 模式已开启</b>", parse_mode: "HTML" }); }
        if (data === 'mode_human') { await kv.put(`state:${uid}`, 'human_chat'); await tg('sendMessage', { chat_id: uid, text: "✅ <b>人工模式已开启</b>\n(受 AI 实时审计)", parse_mode: "HTML" }); }
        if (data === 'exit_all') { await kv.delete(`state:${uid}`); await tg('sendMessage', { chat_id: uid, text: "📴 对话已结束。发送 /start 重新开启。" }); }
        if (data === 'appeal') {
            const count = parseInt(await kv.get(`appeal_count:${uid}`) || "0");
            if (count >= 5) return tg('answerCallbackQuery', { callback_query_id: cb.id, text: "❌ 今日申诉次数已达上限", show_alert: true });
            await kv.put(`state:${uid}`, 'appealing');
            await tg('sendMessage', { chat_id: uid, text: "📝 请发送您的申诉理由（不少于5字）。", parse_mode: "HTML" });
        }
        await tg('answerCallbackQuery', { callback_query_id: cb.id });
        return new Response("OK");
    }

    // --- 2. 管理员核心指令系统 ---
    if (uid === ADMIN_ID) {
        if (text.startsWith('/setai ')) {
            const p = text.split(' ');
            db.ai = { urls: [p[1]], keys: [p[2]], models: [p[3]] };
            await kv.put('config', JSON.stringify(db));
            return tg('sendMessage', { chat_id: ADMIN_ID, text: "✅ AI 配置成功！" });
        }
        if (text.startsWith('/sendall ')) {
            const content = text.replace('/sendall ', '');
            let s = 0;
            for (let uId of db.users) { const res = await tg('sendMessage', { chat_id: uId, text: `📢 <b>系统广播</b>\n\n${content}`, parse_mode: "HTML" }); if(res.ok) s++; }
            return tg('sendMessage', { chat_id: ADMIN_ID, text: `📢 广播完成：${s}/${db.users.length}` });
        }
        if (text === '/wl') {
            const list = db.whitelist.map(id => `<code>${id}</code>`).join('\n') || "空";
            return tg('sendMessage', { chat_id: ADMIN_ID, text: `🛡️ <b>白名单用户：</b>\n${list}`, parse_mode: "HTML" });
        }
        if (text === '/bl') {
            const list = Object.keys(db.banned).map(id => `<code>${id}</code>`).join('\n') || "空";
            return tg('sendMessage', { chat_id: ADMIN_ID, text: `🚫 <b>黑名单用户：</b>\n${list}`, parse_mode: "HTML" });
        }
        if (text === '/stats') {
            const report = `📊 <b>运行统计</b>\n──────────────\n总用户：${db.users.length}\n今日新用户：${db.stats.todayNew}\n白名单：${db.whitelist.length}\n黑名单：${Object.keys(db.banned).length}`;
            return tg('sendMessage', { chat_id: ADMIN_ID, text: report, parse_mode: "HTML" });
        }
        if (text === '/exit') { await kv.delete('admin_target'); return tg('sendMessage', { chat_id: ADMIN_ID, text: "📴 已退出锁定回复模式。" }); }

        // 管理员锁定回复
        const target = await kv.get('admin_target');
        if (target && !text.startsWith('/')) {
            await tg('copyMessage', { chat_id: target, from_chat_id: ADMIN_ID, message_id: msg.message_id });
            return tg('sendMessage', { chat_id: ADMIN_ID, text: `📤 <b>已送达</b> <code>${target}</code>`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⏹️ 退出锁定", callback_data: "clear_admin" }]] } });
        }
    }

    // --- 3. 用户逻辑系统 ---
    if (uid !== ADMIN_ID) {
        // 更新统计
        if (!db.users.includes(uid)) { db.users.push(uid); db.stats.todayNew++; await kv.put('config', JSON.stringify(db)); }
        
        const isWhite = db.whitelist.includes(uid);
        const state = await kv.get(`state:${uid}`);

        // 封禁状态处理
        if (db.banned[uid] && !isWhite) {
            if (state === 'appealing') {
                const count = parseInt(await kv.get(`appeal_count:${uid}`) || "0");
                await kv.put(`appeal_count:${uid}`, (count + 1).toString(), { expirationTtl: 86400 });
                await tg('sendMessage', { 
                    chat_id: ADMIN_ID, 
                    text: `⚖️ <b>收到申诉 (${count + 1}/5)</b>\nID: <code>${uid}</code>\n内容: ${text}`, 
                    parse_mode: "HTML", 
                    reply_markup: { inline_keyboard: [[{ text: "✅ 解封", callback_data: `unban:${uid}` }, { text: "🛡️ 加白", callback_data: `white:${uid}` }]] } 
                });
                await kv.delete(`state:${uid}`);
                return tg('sendMessage', { chat_id: uid, text: "✅ <b>已成功投递</b>\n您的申诉已送达后台，请等待管理员处理。", parse_mode: "HTML" });
            }
            return tg('sendMessage', { chat_id: uid, text: "🚫 您已被封禁。", reply_markup: { inline_keyboard: [[{ text: "⚖️ 提交申诉", callback_data: "appeal" }]] } });
        }

        // 人机验证逻辑
        if (text === '/start' || !state) {
            const qa = await askAI("随机生成一个常识题，格式：问题|答案", "出题官");
            if (!qa || !qa.includes('|')) return tg('sendMessage', { chat_id: uid, text: "⚠️ 系统初始化中，请稍后再发 /start" });
            const [q, a] = qa.split('|');
            await kv.put(`ans:${uid}`, a.trim().toLowerCase());
            await kv.put(`state:${uid}`, 'verifying');
            return tg('sendMessage', { chat_id: uid, text: `🛡️ <b>人机验证</b> (请直接回复答案)\n\n${q}`, parse_mode: "HTML" });
        }

        if (state === 'verifying') {
            const ans = await kv.get(`ans:${uid}`);
            if (text.toLowerCase().includes(ans)) {
                await kv.put(`state:${uid}`, 'verified');
                return tg('sendMessage', { chat_id: uid, text: "✅ 验证通过！请选择模式：", reply_markup: { inline_keyboard: [[{ text: "🤖 AI 模式", callback_data: "mode_ai" }, { text: "🙋 人工模式", callback_data: "mode_human" }]] } });
            }
            return tg('sendMessage', { chat_id: uid, text: "❌ 验证失败。\n请发送 /start 重新获取题目。", parse_mode: "HTML" });
        }

        // --- 人工模式 (核心 AI 审计逻辑) ---
        if (state === 'human_chat') {
            if (!isWhite) {
                const audit = await askAI(`分析内容是否违规（谩骂/广告/恶意攻击）。若违规，第一行回“是”，第二行写简短原因。若正常，回“否”。内容："${text}"`, "安全合规官");
                if (audit && audit.startsWith("是")) {
                    const reason = audit.split('\n')[1] || "内容违规";
                    db.banned[uid] = true; await kv.put('config', JSON.stringify(db));
                    // 同步违规日志给管理员
                    await tg('sendMessage', { 
                        chat_id: ADMIN_ID, 
                        text: `🚨 <b>AI 审计自动封禁</b>\n用户：<code>${uid}</code>\n原因：${reason}\n───────\n违规内容：`, 
                        parse_mode: "HTML",
                        reply_markup: { inline_keyboard: [[{ text: "✅ 误报解封", callback_data: `unban:${uid}` }]] }
                    });
                    await tg('copyMessage', { chat_id: ADMIN_ID, from_chat_id: uid, message_id: msg.message_id });
                    // 通知用户
                    return tg('sendMessage', { chat_id: uid, text: `🚫 <b>您已被 AI 自动封禁</b>\n原因：${reason}`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⚖️ 提交申诉", callback_data: "appeal" }]] } });
                }
            }
            // 正常转发
            let header = `📩 <b>来自：</b><code>${uid}</code>`;
            if (msg.reply_to_message) header = `💬 <b>引用了您的消息</b>\n来自：<code>${uid}</code>\n───────`;
            
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
