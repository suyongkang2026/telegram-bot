/**
 * @file Telegram Bot Supreme Full-Featured Logic
 * @author Xiaosu (https://t.me/xiaosu06)
 * @copyright 2026 Xiaosu. All rights reserved.
 * @version 2.0.0 (Cloudflare Pages Functions Optimized)
 */

// --- 核心黑科技：解决 Cloudflare 兼容性报错 (必须放在最顶端) ---
import 'node:crypto';
import 'node:events';
import 'node:https';
import 'node:stream';
import 'node:util';
import 'node:buffer';

import { Telegraf, Markup } from 'telegraf';

export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.MY_KV;
    const bot = new Telegraf(env.BOT_TOKEN);
    const ADMIN_ID = parseInt(env.ADMIN_ID);

    // 1. 数据库助手
    const getDb = async () => (await kv.get('config', { type: 'json' })) || { 
        users: [], banned: {}, whitelist: [], appeal: {}, 
        ai: { urls: [], keys: [], models: [] }, stats: { totalMsg: 0, start: Date.now() } 
    };
    const saveDb = async (d) => await kv.put('config', JSON.stringify(d));

    // 2. 解析 Telegram 推送
    const body = await context.request.json();

    // --- 管理员权限拦截器 ---
    bot.on('message', async (ctx, next) => {
        const uid = ctx.from.id;
        if (uid !== ADMIN_ID) return next();
        
        const text = ctx.message.text || "";
        let db = await getDb();

        // [功能 1] AI 映射配置: /setai url1,url2 key1,key2 m1,m2
        if (text.startsWith('/setai ')) {
            const parts = text.split(' ');
            if (parts.length < 4) return ctx.reply("❌ 格式错误！使用: /setai url1,key1,m1");
            db.ai = { urls: parts[1].split(','), keys: parts[2].split(','), models: parts[3].split(',') };
            await saveDb(db);
            return ctx.reply('✅ AI 映射映射配置成功！By Xiaosu');
        }

        // [功能 2] 解封指令: /unban id
        if (text.startsWith('/unban ')) {
            const tid = text.split(' ')[1];
            delete db.banned[tid];
            await saveDb(db);
            return ctx.replyWithHTML(`✅ 已解封用户 <code>${tid}</code>`);
        }

        // [功能 3] 锁定回复逻辑 (状态锁定模式)
        const activeTarget = await kv.get('admin_active_target');
        if (activeTarget && !text.startsWith('/')) {
            try {
                // 发送任何格式 (文本, 图片, 文件等)
                await bot.telegram.copyMessage(activeTarget, ctx.chat.id, ctx.message.message_id, 
                    Markup.inlineKeyboard([[Markup.button.callback('🛑 结束对话', `user_exit:${activeTarget}`)]])
                );
                return ctx.replyWithHTML(`📤 已发送至 <code>${activeTarget}</code>`, 
                    Markup.inlineKeyboard([[Markup.button.callback('⏹️ 退出锁定状态', 'admin_clear')]])
                );
            } catch (e) { return ctx.reply("❌ 发送失败，对方可能已拉黑。"); }
        }

        // [功能 4] 引用回复模式 (管理员点回复)
        if (ctx.message.reply_to_message) {
            const rMsg = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || "";
            const tid = rMsg.match(/ID: (\d+)/)?.[1];
            if (tid) {
                await bot.telegram.copyMessage(tid, ctx.chat.id, ctx.message.message_id);
                return ctx.reply(`✔️ 已按[引用格式]同步至 ${tid}`);
            }
        }
        return next();
    });

    // --- 用户逻辑中间件 ---
    bot.on(['message', 'photo', 'video', 'voice', 'audio', 'document', 'sticker'], async (ctx) => {
        const uid = ctx.from.id.toString();
        const db = await getDb();
        if (uid == ADMIN_ID) return;

        // [功能 5] 封禁与申诉
        if (db.banned[uid] && !db.whitelist.includes(uid)) {
            return ctx.reply(`🚫 您已被封禁！原因: ${db.banned[uid].reason}`, 
                Markup.inlineKeyboard([[Markup.button.callback('⚖️ 申诉理由', `appeal_req:${uid}`)]])
            );
        }

        const state = await kv.get(`state:${uid}`) || 'none';

        // [功能 6] AI 动态验证
        if (state === 'verifying') {
            const ans = await kv.get(`ans:${uid}`);
            if (ctx.message.text === ans) {
                await kv.put(`state:${uid}`, 'none');
                return ctx.reply("✅ 验证通过！请选择：", Markup.inlineKeyboard([
                    [Markup.button.callback('🙋 人工模式', 'go_human'), Markup.button.callback('🤖 AI 模式', 'go_ai')]
                ]));
            }
            return ctx.reply("❌ 验证错误，请重新 /start 发起验证。");
        }

        // [功能 7] 全格式转发至管理员
        if (state === 'human') {
            const header = `📩 <b>新消息</b>\n<b>来自:</b> <code>${ctx.from.first_name}</code>\n<b>ID:</b> <code>${uid}</code>`;
            const kb = Markup.inlineKeyboard([
                [Markup.button.callback('💬 进入回复模式', `admin_select:${uid}`), Markup.button.callback('🚫 封禁', `admin_ban:${uid}`)],
                [Markup.button.url('👤 主页', `tg://user?id=${uid}`)]
            ]);
            await bot.telegram.sendMessage(ADMIN_ID, header, { parse_mode: 'HTML', ...kb });
            await bot.telegram.copyMessage(ADMIN_ID, ctx.chat.id, ctx.message.message_id);
            return ctx.reply("✔️ 消息已同步，请等待。 By Xiaosu");
        }
    });

    // --- 回调动作 (Callback) ---
    bot.on('callback_query', async (ctx) => {
        const data = ctx.callbackQuery.data;
        const db = await getDb();

        if (data.startsWith('admin_select:')) {
            const tid = data.split(':')[1];
            await kv.put('admin_active_target', tid);
            return ctx.replyWithHTML(`✅ <b>锁定模式已开启</b>\n目标: <code>${tid}</code>\n现在你发送的任何内容都将直接传给对方。`);
        }
        if (data === 'admin_clear') {
            await kv.delete('admin_active_target');
            return ctx.editMessageText("📴 已退出锁定模式。");
        }
        if (data.startsWith('admin_ban:')) {
            const tid = data.split(':')[1];
            db.banned[tid] = { reason: '管理员手动', time: Date.now(), name: '用户' };
            await saveDb(db);
            return ctx.answerCbQuery("已封禁");
        }
    });

    bot.start(async (ctx) => {
        const uid = ctx.from.id.toString();
        const db = await getDb();
        if (!db.users.includes(uid)) db.users.push(uid);
        await saveDb(db);
        
        await kv.put(`state:${uid}`, 'verifying');
        await kv.put(`ans:${uid}`, "7"); // 演示，可改为 AI 动态生成
        return ctx.reply("🛡️ AI 安全验证：2 + 5 = ?");
    });

    try {
        await bot.handleUpdate(body);
    } catch (e) { console.error(e); }
    return new Response('OK');
}
