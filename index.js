require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cron = require('node-cron');
const axios = require('axios');
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

// Self-ping كل 10 دقائق لمنع النوم
const APP_URL = process.env.RENDER_EXTERNAL_URL || 'https://telegram-smot.onrender.com';

cron.schedule('*/10 * * * *', async () => {
  try {
    const response = await axios.get(APP_URL);
    const time = new Date().toLocaleTimeString('ar-DZ', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    console.log(`✅ Keep-alive نجح - Status: ${response.status} - الوقت: ${time}`);
  } catch (error) {
    console.error(`⚠️ Keep-alive فشل: ${error.message}`);
  }
});

console.log('⏰ Keep-alive Cron مفعّل - سيعمل كل 10 دقائق لمنع النوم');

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
