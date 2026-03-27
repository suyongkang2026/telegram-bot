/**
 * @file Telegram Bot Supreme Final Pro (Pure AI Engine)
 * @author Xiaosu (https://t.me/xiaosu06)
 * @version 3.5.0
 */

export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.MY_KV;
    const BOT_TOKEN = env.BOT_TOKEN;
    const ADMIN_ID = env.ADMIN_ID.toString();

    // --- 核心工具：TG 接口请求 ---
    const tg = async (method, body) => {
        return fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    };

    // --- 核心工具：获取 KV 配置 ---
    const getDb = async () => (await kv.get('config', { type: 'json' })) || { 
        users: [], banned: {}, whitelist: [], ai: { urls: [], keys: [], models: [] },
        stats: { totalMsg: 0, todayMsg: 0, todayNew: 0, start: Date.now() } 
    };

    // --- 核心工具：纯 AI 请求引擎 ---
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

    // --- 1. 处理按钮回调 (Callback Query) ---
    if (cb) {
        const data = cb.data;
        if (uid === ADMIN_ID) {
            const tid = data.split(':')[1];
            if (data.startsWith('white:')) {
                if (!db.whitelist.includes(tid)) db.whitelist.push(tid);
                delete db.banned[tid];
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🛡️ <b>权限通知</b>\n您已被管理员加入白名单，享有全协议透传免审计特权。", parse_mode: "HTML" });
                await tg('answerCallbackQuery', { callback_query_id: cb.id, text: "✅ 已加白并通知用户" });
            }
            if (data.startsWith('unban:')) {
                delete db.banned[tid];
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🎉 您的申诉经审核已通过，封禁已解除。" });
                await tg('answerCallbackQuery', { callback_query_id: cb.id, text: "✅ 已解封" });
            }
            if (data.startsWith('ban:')) {
                db.banned[tid] = true;
                await kv.put('config', JSON.stringify(db));
                await tg('sendMessage', { chat_id: tid, text: "🚫 <b>封禁提醒</b>\n您的账号已被管理员手动<b>永久封禁</b>。", parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "⚖️ 提交申诉", callback_data: "appeal" }]] } });
                await tg('answerCallbackQuery', { callback_query_id: cb.id, text: "🚫 已执行封禁" });
            }
            if (data.startsWith('sel:')) {
                await kv.put('admin_target', tid);
                await tg('sendMessage', { chat_id: ADMIN_ID, text: `🎯 <b>锁定回复模式</b>\n正在向 <code>${tid}</code> 发送消息，发送 /exit 退出。`, parse_mode: "HTML" });
            }
        }
        
        // 用户模式确认提示
        if (data === 'mode_ai') {
            await kv.put(`state:${uid}`, 'ai_chat');
            await tg('sendMessage', { chat_id: uid, text: "✅ <b>模式确认</b>\n您已选择 <b>AI 模式</b>，请发送您的内容，我将智能回复您。", parse_mode: "HTML" });
        }
        if (data === 'mode_human') {
            await kv.put(`state:${uid}`, 'human_chat');
            await tg('sendMessage', { chat_id: uid, text: "✅ <b>模式确认</b>\n您已选择 <b>人工模式</b>，请发送您的内容，消息将同步给主理人。", parse_mode: "HTML" });
        }
        if (data === 'exit_all') {
            await kv.delete(`state:${uid}`);
            await tg('sendMessage', { chat_id: uid, text: "📴 对话已结束。发送 /start 重新开启。" });
        }
        if (data === 'appeal') {
            const count = parseInt(await kv.get(`appeal_count:${uid}`) || "0");
            if (count >= 5) return tg('answerCallbackQuery', { callback_query_id: cb.id, text: "❌ 今日申诉次数已达上限", show_alert: true });
            await kv.put(`state:${uid}`, 'appealing');
            await tg('sendMessage', { chat_id: uid, text: "📝 请发送您的申诉理由（不少于10字）：" });
        }
        await tg('answerCallbackQuery', { callback_query_id: cb.id });
        return new Response("OK");
    }

    // --- 2. 管理员指令系统 ---
    if (uid === ADMIN_ID) {
        if (text.startsWith('/setai ')) {
            const p = text.split(' ');
            db.ai = { urls: p[1].split(','), keys: p[2].split(','), models: p[3].split(',') };
            await kv.put('config', JSON.stringify(db));
            return tg('sendMessage', { chat_id: ADMIN_ID, text: "✅ AI 配置成功！" });
        }
        if (text === '/exit') {
            await kv.delete('admin_target');
            return tg('sendMessage', { chat_id: ADMIN_ID, text: "📴 已主动退出锁定回复模式。" });
        }
        if (text === '/bl') {
            const list = Object.keys(db.banned).map(id => `🆔 <code>${id}</code>`).join('\n') || "空";
            return tg('sendMessage', { chat_id: ADMIN_ID, text: `🚫 <b>当前黑名单：</b>\n${list}`, parse_mode: "HTML" });
        }
        if (text.startsWith('/sendall ')) {
            const content = text.replace('/sendall ', '');
            let s = 0;
            for (let uId of db.users) { const res = await tg('sendMessage', { chat_id: uId, text: `📢 <b>系统广播</b>\n\n${content}`, parse_mode: "HTML" }); if(res.ok) s++; }
            return tg('sendMessage', { chat_id: ADMIN_ID, text: `📢 广播完成！成功率：${s}/${db.users.length}` });
        }
        // 管理员锁定回复 (支持全格式转发)
        const target = await kv.get('admin_target');
        if (target && !text.startsWith('/')) {
            await tg('copyMessage', { chat_id: target, from_chat_id: ADMIN_ID, message_id: msg.message_id });
            return new Response("OK");
        }
    }

    // --- 3. 用户核心业务流 ---
    if (uid !== ADMIN_ID) {
        // 数据统计
        db.stats.totalMsg++; db.stats.todayMsg++;
        if (!db.users.includes(uid)) { db.users.push(uid); db.stats.todayNew++; }
        await kv.put('config', JSON.stringify(db));

        const isWhite = db.whitelist.includes(uid);
        // 封禁检查
        if (db.banned[uid] && !isWhite) {
            const s = await kv.get(`state:${uid}`);
            if (s === 'appealing' && text.length > 5) {
                const count = parseInt(await kv.get(`appeal_count:${uid}`) || "0");
                await kv.put(`appeal_count:${uid}`, (count + 1).toString(), { expirationTtl: 86400 });
                await tg('sendMessage', { chat_id: ADMIN_ID, text: `⚖️ <b>收到新申诉 (${count + 1}/5)</b>\nID: <code>${uid}</code>\n理由: ${text}`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "✅ 解封", callback_data: `unban:${uid}` }, { text: "🛡️ 永久加白", callback_data: `white:${uid}` }]] } });
                await kv.delete(`state:${uid}`);
                return tg('sendMessage', { chat_id: uid, text: "📨 申诉已提交，请等待审核。" });
            }
            return tg('sendMessage', { chat_id: uid, text: "🚫 您已被封禁。", reply_markup: { inline_keyboard: [[{ text: "⚖️ 点击申诉", callback_data: "appeal" }]] } });
        }

        const state = await kv.get(`state:${uid}`);

        // 【核心：AI 动态常识验证】
        if (text === '/start' || !state) {
            const qa = await askAI("请随机生成一个常识性百科问题（地理、历史、科学、文学或常识），严禁数学计算题。格式严格遵守：问题内容|答案关键短语。要求问题发散，答案简短（1-5字）。", "你是一个随机出题官，每次必须给出不同领域的知识点。");
            
            if (!qa || !qa.includes('|')) {
                return tg('sendMessage', { chat_id: uid, text: "⚠️ <b>系统初始化中</b>\nAI 引擎未能生成验证问题，请管理员检查 API 配置。", parse_mode: "HTML" });
            }
            
            const [q, a] = qa.split('|');
            await kv.put(`ans:${uid}`, a.trim().toLowerCase());
            await kv.put(`state:${uid}`, 'verifying');
            return tg('sendMessage', { chat_id: uid, text: `🛡️ <b>人机验证</b> (请直接回复答案)\n\n<b>问：</b>${q}`, parse_mode: "HTML" });
        }

        if (state === 'verifying') {
            const correctAns = await kv.get(`ans:${uid}`);
            if (text.toLowerCase().includes(correctAns)) {
                await kv.put(`state:${uid}`, 'verified');
                return tg('sendMessage', { chat_id: uid, text: "✅ 验证通过！请选择对话模式：", reply_markup: { inline_keyboard: [[{ text: "🤖 AI 模式", callback_data: "mode_ai" }, { text: "🙋 人工模式", callback_data: "mode_human" }]] } });
            }
            return tg('sendMessage', { chat_id: uid, text: "❌ 验证失败。发送 /start 重新获取题目。" });
        }

        // 【AI 对话模式】
        if (state === 'ai_chat' && text !== '/start') {
            const aiReply = await askAI(text);
            return tg('sendMessage', { chat_id: uid, text: aiReply || "AI 暂时无法回应...", reply_markup: { inline_keyboard: [[{ text: "⏹️ 退出 AI 对话", callback_data: "exit_all" }]] } });
        }

        // 【人工模式 + 审计】
        if (state === 'human_chat') {
            if (!isWhite) {
                const audit = await askAI(`分析这段话是否违规(广告/辱骂/色情)，仅回复是或否: "${text}"`, "安全审计员");
                if (audit && audit.includes("是")) {
                    db.banned[uid] = true; await kv.put('config', JSON.stringify(db));
                    await tg('sendMessage', { chat_id: ADMIN_ID, text: `⚠️ <b>自动审计封禁</b>\n用户：<code>${uid}</code>\n内容：${text}`, parse_mode: "HTML", reply_markup: { inline_keyboard: [[{ text: "✅ 误报解封", callback_data: `unban:${uid}` }]] } });
                    return tg('sendMessage', { chat_id: uid, text: "🚫 您的消息包含违规内容，已自动封禁。", reply_markup: { inline_keyboard: [[{ text: "⚖️ 提交申诉", callback_data: "appeal" }]] } });
                }
            }
            // 全格式透传转发给管理员
            await tg('sendMessage', { 
                chat_id: ADMIN_ID, 
                text: `📩 <b>来自：</b><code>${uid}</code> ${isWhite ? "🌟" : ""}`, 
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: [[{ text: "💬 回复", callback_data: `sel:${uid}` }, { text: "🚫 封禁", callback_data: `ban:${uid}` }], [{ text: "🛡️ 加白", callback_data: `white:${uid}` }]] }
            });
            await tg('copyMessage', { chat_id: ADMIN_ID, from_chat_id: uid, message_id: msg.message_id });
            await tg('sendMessage', { chat_id: uid, text: "✔️ 消息已同步至后台。" });
        }
    }
    return new Response("OK");
}
