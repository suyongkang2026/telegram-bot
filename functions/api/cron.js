export async function onCron(event, env, ctx) {
    const kv = env.MY_KV;
    const db = await kv.get('config', { type: 'json' });
    const uptime = Date.now() - db.stats.start;
    
    const d = Math.floor(uptime / 86400000);
    const h = Math.floor((uptime % 86400000) / 3600000);
    const m = Math.floor((uptime % 3600000) / 60000);
    
    const report = `📊 <b>每日运行报告</b>\n\n⏱ 运行时长: <code>${d}d ${h}h${m}m</code>\n👤 总用户: ${db.users.length}\n💬 今日消息: ${db.stats.totalMsg}`;

    await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: env.ADMIN_ID, text: report, parse_mode: 'HTML' })
    });
}
