import { Telegraf, Markup } from 'telegraf';

export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.MY_KV;
    const bot = new Telegraf(env.BOT_TOKEN);
    const ADMIN_ID = parseInt(env.ADMIN_ID);

    const getDb = async () => (await kv.get('config', { type: 'json' })) || { 
        users: [], banned: {}, appeal: {}, ai: { urls: [], keys: [], models: [] }, stats: { totalMsg: 0, start: Date.now() } 
    };
    const saveDb = async (d) => await kv.put('config', JSON.stringify(d));

    const body = await context.request.json();

    // 1. 管理员逻辑拦截
    bot.on('message', async (ctx, next) => {
        const uid = ctx.from.id;
        const text = ctx.message.text || "";
        const db = await getDb();

        if (uid === ADMIN_ID) {
            // AI 映射: /setai url1,url2 key1,key2 m1,m2
            if (text.startsWith('/setai ')) {
                const [_, u, k, m] = text.split(' ');
                db.ai = { urls: u.split(','), keys: k.split(','), models: m.split(',') };
                await saveDb(db);
                return ctx.reply('✅ AI 映射成功！By Xiaosu');
            }

            // 广播: /post 内容
            if (text.startsWith('/post ')) {
                const msg = text.replace('/post ', '');
                let s = 0, f = 0;
                for (const uId of db.users) {
                    try { await bot.telegram.sendMessage(uId, msg); s++; } catch { f++; }
                }
                return ctx.reply(`📢 广播完成\n成功: ${s}\n失败: ${f}`);
            }

            // 解封 /unban id
            if (text.startsWith('/unban ')) {
                const tid = text.split(' ')[1];
                delete db.banned[tid]; await saveDb(db);
                return ctx.reply(`✅ 已解封: <code>${tid}</code>`, { parse_mode: 'HTML' });
            }

            // 锁定回复模式处理 (优先级最高)
            const activeTarget = await kv.get('admin_active_target');
            if (activeTarget && !text.startsWith('/')) {
                await bot.telegram.copyMessage(activeTarget, ctx.chat.id, ctx.message.message_id);
                return ctx.reply(`📤 已发送至 <code>${activeTarget}</code>`, 
                    Markup.inlineKeyboard([[Markup.button.callback('⏹️ 停止对话状态', 'admin_clear')]])
                );
            }

            // 引用回复
            if (ctx.message.reply_to_message) {
                const rText = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || "";
                const tid = rText.match(/ID: (\d+)/)?.[1];
                if (tid) {
                    await bot.telegram.copyMessage(tid, ctx.chat.id, ctx.message.message_id);
                    return ctx.reply(`✔️ 已引用回复给 ${tid}`);
                }
            }
        }
        return next();
    });

    // 2. 用户逻辑与按钮回调
    bot.on('callback_query', async (ctx) => {
        const data = ctx.callbackQuery.data;
        const db = await getDb();

        if (data.startsWith('admin_select:')) {
            const tid = data.split(':')[1];
            await kv.put('admin_active_target', tid);
            return ctx.reply(`✅ 已锁定用户 <code>${tid}</code>，现在发送的任何内容都将直接传给他。`, { parse_mode: 'HTML' });
        }
        if (data === 'admin_clear') {
            await kv.delete('admin_active_target');
            return ctx.reply("📴 已退出锁定回复模式。");
        }
        if (data.startsWith('admin_ban:')) {
            const tid = data.split(':')[1];
            db.banned[tid] = { reason: '违规', time: Date.now() };
            await saveDb(db);
            return ctx.answerCbQuery("已封禁");
        }
    });

    // 用户全格式转发
    bot.on(['message', 'photo', 'video', 'voice', 'document', 'sticker'], async (ctx) => {
        const uid = ctx.from.id.toString();
        const db = await getDb();
        if (uid == ADMIN_ID) return;

        if (db.banned[uid]) return ctx.reply("🚫 您已被封禁。");

        const state = await kv.get(`state:${uid}`) || 'none';
        if (state === 'verifying') {
            const ans = await kv.get(`ans:${uid}`);
            if (ctx.message.text === ans) {
                await kv.put(`state:${uid}`, 'human');
                return ctx.reply("✅ 验证通过，已进入人工模式。");
            }
            return ctx.reply("❌ 错误。");
        }

        // 转发给管理员
        const header = `📩 <b>来自:</b> <code>${ctx.from.first_name}</code>\n<b>ID:</b> <code>${uid}</code>`;
        const kb = Markup.inlineKeyboard([
            [Markup.button.callback('💬 进入回复模式', `admin_select:${uid}`), Markup.button.callback('🚫 封禁', `admin_ban:${uid}`)],
            [Markup.button.url('👤 个人主页', `tg://user?id=${uid}`)]
        ]);
        await bot.telegram.sendMessage(ADMIN_ID, header, { parse_mode: 'HTML', ...kb });
        await bot.telegram.copyMessage(ADMIN_ID, ctx.chat.id, ctx.message.message_id);
    });

    bot.start(async (ctx) => {
        const uid = ctx.from.id.toString();
        const db = await getDb();
        if (!db.users.includes(uid)) db.users.push(uid);
        await saveDb(db);
        await kv.put(`state:${uid}`, 'verifying');
        await kv.put(`ans:${uid}`, "7");
        return ctx.reply("🛡️ AI 验证：2+5=?");
    });

    await bot.handleUpdate(body);
    return new Response('OK');
}
