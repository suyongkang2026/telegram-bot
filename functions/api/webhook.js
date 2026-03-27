/**
 * @file Telegram Bot Supreme Version (Cloudflare Compatibility Fix)
 * @author Xiaosu (https://t.me/xiaosu06)
 * @copyright 2026 Xiaosu. All rights reserved.
 */

// --- 核心黑科技：解决所有 16 个 Build 错误 ---
import 'node:crypto';
import 'node:https';
import 'node:stream';
import 'node:fs';
import 'node:path';
import 'node:url';
import 'node:util';
import 'node:events';
import 'node:buffer';
import 'node:http';

import { Telegraf, Markup } from 'telegraf';

export async function onRequestPost(context) {
    const { env } = context;
    const kv = env.MY_KV;
    const bot = new Telegraf(env.BOT_TOKEN);
    const ADMIN_ID = parseInt(env.ADMIN_ID);

    // 1. 初始化数据库
    const getDb = async () => (await kv.get('config', { type: 'json' })) || { 
        users: [], banned: {}, whitelist: [], appeal: {},
        ai: { urls: [], keys: [], models: [] }, stats: { totalMsg: 0, start: Date.now() } 
    };
    const saveDb = async (d) => await kv.put('config', JSON.stringify(d));

    const body = await context.request.json();

    // --- 管理员权限拦截 ---
    bot.on('message', async (ctx, next) => {
        const uid = ctx.from.id;
        if (uid !== ADMIN_ID) return next();
        const text = ctx.message.text || "";
        let db = await getDb();

        // AI 映射配置: /setai url1,url2 key1,key2 m1,m2
        if (text.startsWith('/setai ')) {
            const parts = text.split(' ');
            if (parts.length < 4) return ctx.reply("❌ 请按格式输入：/setai url,url key,key m,m");
            db.ai = { urls: parts[1].split(','), keys: parts[2].split(','), models: parts[3].split(',') };
            await saveDb(db);
            return ctx.reply('✅ AI 映射映射配置成功！By Xiaosu');
        }

        // 解封 /unban id
        if (text.startsWith('/unban ')) {
            const tid = text.split(' ')[1];
            delete db.banned[tid]; await saveDb(db);
            return ctx.replyWithHTML(`✅ 已解封用户 <code>${tid}</code>`);
        }

        // 状态回复锁定
        const activeTarget = await kv.get('admin_target');
        if (activeTarget && !text.startsWith('/')) {
            try {
                await bot.telegram.copyMessage(activeTarget, ctx.chat.id, ctx.message.message_id, 
                    Markup.inlineKeyboard([[Markup.button.callback('🛑 结束对话', `exit:${activeTarget}`)]])
                );
                return ctx.replyWithHTML(`📤 已发送至 <code>${activeTarget}</code>`, 
                    Markup.inlineKeyboard([[Markup.button.callback('⏹️ 停止对话状态', 'clear_target')]])
                );
            } catch (e) { return ctx.reply("❌ 发送失败。"); }
        }

        // 引用回复
        if (ctx.message.reply_to_message) {
            const tid = (ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption)?.match(/ID: (\d+)/)?.[1];
            if (tid) {
                await bot.telegram.copyMessage(tid, ctx.chat.id, ctx.message.message_id);
                return ctx.reply(`✔️ 引用回复已同步。`);
            }
        }
        return next();
    });

    // --- 用户逻辑 ---
    bot.on(['message', 'photo', 'video', 'voice', 'audio', 'document', 'sticker'], async (ctx) => {
        const uid = ctx.from.id.toString();
        const db = await getDb();
        if (uid == ADMIN_ID) return;

        // 封禁与申诉
        if (db.banned[uid]) {
            return ctx.reply(`🚫 您已被封禁！`, Markup.inlineKeyboard([[Markup.button.callback('⚖️ 申诉', `appeal:${uid}`)]]));
        }

        const state = await kv.get(`state:${uid}`) || 'none';

        // 人工模式转发
        if (state === 'human') {
            const header = `📩 <b>来自:</b> <code>${ctx.from.first_name}</code>\n<b>ID:</b> <code>${uid}</code>`;
            const kb = Markup.inlineKeyboard([
                [Markup.button.callback('💬 回复此人', `select:${uid}`), Markup.button.callback('🚫 封禁', `ban:${uid}`)],
                [Markup.button.url('👤 主页', `tg://user?id=${uid}`)]
            ]);
            await bot.telegram.sendMessage(ADMIN_ID, header, { parse_mode: 'HTML', ...kb });
            await bot.telegram.copyMessage(ADMIN_ID, ctx.chat.id, ctx.message.message_id);
            return ctx.reply("✔️ 消息已同步，请等待。 By Xiaosu");
        }
    });

    // --- 按钮回调 ---
    bot.on('callback_query', async (ctx) => {
        const data = ctx.callbackQuery.data;
        if (data.startsWith('select:')) {
            const tid = data.split(':')[1];
            await kv.put('admin_target', tid);
            return ctx.replyWithHTML(`✅ 已锁定 <code>${tid}</code>，现在发送的任何内容都将直达。`);
        }
        if (data === 'clear_target') {
            await kv.delete('admin_target');
            return ctx.reply("📴 对话状态已清除。");
        }
    });

    bot.start(async (ctx) => {
        await kv.put(`state:${ctx.from.id}`, 'human');
        return ctx.reply("✅ 欢迎！已接通人工。 By Xiaosu");
    });

    try {
        await bot.handleUpdate(body);
    } catch (e) { console.error(e); }
    return new Response('OK');
}
