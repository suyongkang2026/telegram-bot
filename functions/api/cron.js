export async function onCron(event, env, ctx) {
    const kv = env.MY_KV;
    const db = await kv.get('config', { type: 'json' });
    const bot_token = env.BOT_TOKEN;
    const admin_id = env.ADMIN_ID;

    const uptime = Date.now() - db.stats.start;
    const d = Math.floor(uptime / 86400000), h = Math.floor((uptime % 86400000) / 3600000);
    
    const report = `📊 <b>每日运行报告 (00:00)</b>\n\n` +
                   `⏱ 总运行时长: <code>${d}d ${h}h</code>\n` +
                   `👥 总用户数: ${db.users.length}\n` +
                   `💬 今日消息量: ${db.stats.todayMsg}\n` +
                   `🆕 今日新增人数: ${db.stats.newUser}`;

    await fetch(`https://api.telegram.org/bot${bot_token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: admin_id, text: report, parse_mode: 'HTML' })
    });

    // 重置今日计数
    db.stats.todayMsg = 0; db.stats.newUser = 0;
    await kv.put('config', JSON.stringify(db));
}
