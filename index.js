require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const { handleMessage, handleCallbackQuery } = require('./botLogic');

// إعداد Express للـ health check (مطلوب لـ Render)
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ البوت يعمل بنجاح!');
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر يعمل على المنفذ ${PORT}`);
});

// إعداد بوت تلغرام
const token = process.env.TELEGRAM_TOKEN;
const bot = new TelegramBot(token, { polling: true });

console.log('🤖 البوت بدأ العمل...');

// معالجة الرسائل
bot.on('message', async (msg) => {
  try {
    await handleMessage(bot, msg);
  } catch (error) {
    console.error('❌ خطأ في معالجة الرسالة:', error);
    bot.sendMessage(msg.chat.id, '⚠️ حدث خطأ، يرجى المحاولة مرة أخرى.');
  }
});

// معالجة أزرار Callback
bot.on('callback_query', async (query) => {
  try {
    await handleCallbackQuery(bot, query);
  } catch (error) {
    console.error('❌ خطأ في معالجة Callback:', error);
    bot.answerCallbackQuery(query.id, { text: '⚠️ حدث خطأ' });
  }
});

// معالجة الأخطاء العامة
bot.on('polling_error', (error) => {
  console.error('❌ خطأ في الاتصال:', error.code);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ خطأ غير معالج:', error);
});
