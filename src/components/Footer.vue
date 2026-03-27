<template>
  <div class="admin-footer">
    <div class="footer-text">Copyright © 2026 <b>Xiaosu</b>. All rights reserved.</div>
    <a href="https://t.me/xiaosu06" target="_blank" class="tg-link-btn">
      <span class="icon">✈️</span> 联系作者 (Xiaosu)
    </a>
  </div>
</template>

<style scoped>
.admin-footer { text-align: center; padding: 40px 0; border-top: 1px solid #eee; background: #fff; }
.footer-text { color: #8c8c8c; margin-bottom: 15px; font-size: 14px; }
.tg-link-btn {
  background: #0088cc; color: white !important; padding: 8px 24px; border-radius: 30px;
  display: inline-flex; align-items: center; transition: all 0.3s; box-shadow: 0 4px 15px rgba(0,136,204,0.3);
}
.tg-link-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,136,204,0.4); }
.icon { margin-right: 8px; transform: rotate(-30deg); display: inline-block; }
</style>
