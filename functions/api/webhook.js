/**
 * @file Telegram Bot Supreme Version (Full-Featured)
 * @author Xiaosu (https://t.me/xiaosu06)
 * @copyright 2026 Xiaosu. All rights reserved.
 */
import { Telegraf, Markup } from 'telegraf';

export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.MY_KV;
    const bot = new Telegraf(env.BOT_TOKEN);
    const ADMIN_ID = parseInt(env.ADMIN_ID);

    // 1. 初始化数据库与配置
    const getDb = async () => (await kv.get('config', { type: 'json' })) || { 
        users: [], banned: {}, whitelist: [], appeals: {},
        ai: { urls: [], keys: [], models: [] }, stats: { totalMsg: 0, todayMsg: 0, newUser: 0, start: Date.now() } 
    };
    const saveDb = async (d) => await kv.put('config', JSON.stringify(d));

    // 2. 消息代理处理 (Cloudflare fetch 层面处理)
    const body = await context.request.json();

    // --- 管理员权限拦截 ---
    bot.on('message', async (ctx, next) => {
        const uid = ctx.from.id;
        if (uid !== ADMIN_ID) return next();
        const text = ctx.message.text || "";
        let db = await getDb();

        // [命令] 设置 AI: /setai url1,url2 key1,key2 m1,m2
        if (text.startsWith('/setai ')) {
            const [_, u, k, m] = text.split(' ');
            db.ai = { urls: u.split(','), keys: k.split(','), models: m.split(',') };
            await saveDb(db);
            return ctx.reply('✅ AI 映射配置成功！By Xiaosu');
        }

        // [命令] 查看黑名单: /blacklist
        if (text === '/blacklist') {
            const list = Object.entries(db.banned).map(([id, info]) => 
                `🆔 <code>${id}</code> | 👤 <code>${info.name}</code>\n原因: ${info.reason}\n时间: ${new Date(info.time).toLocaleString()}`
            ).join('\n\n');
            return ctx.replyWithHTML(`🚫 <b>黑名单详情</b>\n\n${list || '暂无封禁记录'}`);
        }

        // [逻辑] 锁定回复模式处理
        const activeTarget = await kv.get('admin_active_target');
        if (activeTarget && !text.startsWith('/')) {
            try {
                await bot.telegram.copyMessage(activeTarget, ctx.chat.id, ctx.message.message_id);
                return ctx.reply(`📤 已发送至 <code>${activeTarget}</code>`, 
                    Markup.inlineKeyboard([[Markup.button.callback('⏹️ 停止对话状态', 'admin_clear')]])
                );
            } catch (e) { return ctx.reply("❌ 发送失败。"); }
        }

        // [逻辑] 引用回复模式
        if (ctx.message.reply_to_message) {
            const rMsg = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || "";
            const tid = rMsg.match(/ID: (\d+)/)?.[1];
            if (tid) {
                await bot.telegram.copyMessage(tid, ctx.chat.id, ctx.message.message_id);
                return ctx.reply(`✔️ 已按引用格式回复给 ${tid}`);
            }
        }
        return next();
    });

    // --- 用户逻辑 ---
    bot.on(['message', 'photo', 'video', 'voice', 'document', 'sticker'], async (ctx) => {
        const uid = ctx.from.id.toString();
        const db = await getDb();
        if (uid == ADMIN_ID) return;

        // 1. 封禁检查与申诉
        if (db.banned[uid] && !db.whitelist.includes(uid)) {
            return ctx.reply(`🚫 您已被封禁！原因: ${db.banned[uid].reason}`, 
                Markup.inlineKeyboard([[Markup.button.callback('⚖️ 申诉理由', `appeal:${uid}`)]])
            );
        }

        const state = await kv.get(`state:${uid}`) || 'none';

        // 2. AI 验证逻辑
        if (state === 'verifying') {
            const ans = await kv.get(`ans:${uid}`);
            if (ctx.message.text === ans) {
                await kv.put(`state:${uid}`, 'verified');
                return ctx.reply("✅ 验证通过！请选择：", Markup.inlineKeyboard([
                    [Markup.button.callback('🙋 人工模式', 'go_human'), Markup.button.callback('🤖 AI 模式', 'go_ai')]
                ]));
            }
            return ctx.reply("❌ 验证错误，请重新 /start 发起验证。");
        }

        // 3. 人工模式转发
        if (state === 'human') {
            const header = `📩 <b>新消息</b>\n<b>名字:</b> <code>${ctx.from.first_name}</code>\n<b>ID:</b> <code>${uid}</code>`;
            const kb = Markup.inlineKeyboard([
                [Markup.button.callback('💬 回复此人', `admin_select:${uid}`), Markup.button.callback('🚫 封禁', `admin_ban:${uid}`)],
                [Markup.button.url('👤 主页', `tg://user?id=${uid}`), Markup.button.callback('🛡️ 白名单', `admin_white:${uid}`)]
            ]);
            await bot.telegram.sendMessage(ADMIN_ID, header, { parse_mode: 'HTML', ...kb });
            await bot.telegram.copyMessage(ADMIN_ID, ctx.chat.id, ctx.message.message_id);
            return ctx.reply("✔️ 消息已同步，请等待回复。");
        }
    });

    // --- 回调逻辑 (按钮点击) ---
    bot.on('callback_query', async (ctx) => {
        const data = ctx.callbackQuery.data;
        if (data.startsWith('admin_select:')) {
            const tid = data.split(':')[1];
            await kv.put('admin_active_target', tid);
            return ctx.reply(`✅ 已锁定 <code>${tid}</code>。现在发送任何内容都将直达。`, { parse_mode: 'HTML' });
        }
        if (data === 'admin_clear') {
            await kv.delete('admin_active_target');
            return ctx.reply("📴 对话状态已清除。");
        }
    });

    bot.start(async (ctx) => {
        const uid = ctx.from.id.toString();
        const db = await getDb();
        if (!db.users.includes(uid)) { db.users.push(uid); db.stats.newUser++; await saveDb(db); }
        
        await kv.put(`state:${uid}`, 'verifying');
        await kv.put(`ans:${uid}`, "7"); // 演示，实际可接入 AI 接口生成
        return ctx.reply("🛡️ AI 验证：2 + 5 = ?");
    });

    await bot.handleUpdate(body);
    return new Response('OK');
}
