const fs = require('fs').promises;
const NodeCache = require('node-cache');
const { getHubotResponse } = require('./hubotAdapter');

// إعداد الكاش (24 ساعة)
const cache = new NodeCache({ stdTTL: 86400 });

// تخزين حالات المستخدمين
const userStates = new Map();
const lastMessageTime = new Map();

const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const FAQ_FILE = './faq.json';

// قراءة قاعدة البيانات
async function loadFAQ() {
  try {
    const data = await fs.readFile(FAQ_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // إنشاء ملف جديد إذا لم يكن موجوداً
    const defaultData = { questions: [] };
    await fs.writeFile(FAQ_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
}

// حفظ قاعدة البيانات
async function saveFAQ(data) {
  await fs.writeFile(FAQ_FILE, JSON.stringify(data, null, 2));
  // مسح الكاش عند التعديل
  cache.flushAll();
}

// البحث عن إجابة
async function findAnswer(question) {
  const cacheKey = `answer_${question.toLowerCase()}`;
  const cachedAnswer = cache.get(cacheKey);
  
  if (cachedAnswer) {
    return cachedAnswer;
  }

  const faq = await loadFAQ();
  const normalizedQuestion = question.toLowerCase().trim();
  
  const match = faq.questions.find(q => 
    q.question.toLowerCase().trim() === normalizedQuestion
  );

  if (match) {
    cache.set(cacheKey, match.answer);
    return match.answer;
  }

  return null;
}

// التحقق من الـ throttling (30 ثانية)
function checkThrottle(userId) {
  const now = Date.now();
  const lastTime = lastMessageTime.get(userId);
  
  if (lastTime && (now - lastTime) < 30000) {
    const remaining = Math.ceil((30000 - (now - lastTime)) / 1000);
    return remaining;
  }
  
  lastMessageTime.set(userId, now);
  return 0;
}

// معالجة الرسائل الرئيسية
async function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  // التحقق من الـ throttling للمستخدمين العاديين
  if (userId !== ADMIN_ID) {
    const waitTime = checkThrottle(userId);
    if (waitTime > 0) {
      return bot.sendMessage(chatId, `⏳ يرجى الانتظار ${waitTime} ثانية قبل إرسال رسالة جديدة.`);
    }
  }

  // الأوامر الإدارية
  if (userId === ADMIN_ID) {
    if (text === '/addquestion') {
      userStates.set(userId, { action: 'add_question', step: 1 });
      return bot.sendMessage(chatId, '📝 أرسل السؤال الذي تريد إضافته:');
    }

    if (text === '/editquestion') {
      const faq = await loadFAQ();
      if (faq.questions.length === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أسئلة لتعديلها.');
      }
      
      const keyboard = faq.questions.map((q, index) => ([{
        text: q.question.substring(0, 50) + (q.question.length > 50 ? '...' : ''),
        callback_data: `edit_${index}`
      }]));
      
      return bot.sendMessage(chatId, '✏️ اختر السؤال الذي تريد تعديله:', {
        reply_markup: { inline_keyboard: keyboard }
      });
    }

    if (text === '/deletequestion') {
      const faq = await loadFAQ();
      if (faq.questions.length === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أسئلة لحذفها.');
      }
      
      const keyboard = faq.questions.map((q, index) => ([{
        text: q.question.substring(0, 50) + (q.question.length > 50 ? '...' : ''),
        callback_data: `delete_${index}`
      }]));
      
      return bot.sendMessage(chatId, '🗑️ اختر السؤال الذي تريد حذفه:', {
        reply_markup: { inline_keyboard: keyboard }
      });
    }

    if (text === '/listquestions') {
      const faq = await loadFAQ();
      if (faq.questions.length === 0) {
        return bot.sendMessage(chatId, '❌ لا توجد أسئلة في قاعدة البيانات.');
      }
      
      let message = '📋 *قائمة الأسئلة المحفوظة:*\n\n';
      faq.questions.forEach((q, index) => {
        message += `${index + 1}. *السؤال:* ${q.question}\n`;
        message += `   *الجواب:* ${q.answer.substring(0, 100)}${q.answer.length > 100 ? '...' : ''}\n\n`;
      });
      
      return bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
  }

  // معالجة حالات المستخدم
  const state = userStates.get(userId);
  if (state) {
    return handleUserState(bot, msg, state);
  }

  // البحث عن إجابة في قاعدة البيانات
  const answer = await findAnswer(text);
  if (answer) {
    return bot.sendMessage(chatId, `💡 ${answer}`);
  }

  // استخدام Hubot للرد الذكي
  const hubotResponse = await getHubotResponse(text);
  return bot.sendMessage(chatId, `🤖 ${hubotResponse}`);
}

// معالجة حالات الإدخال التفاعلي
async function handleUserState(bot, msg, state) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;

  if (state.action === 'add_question') {
    if (state.step === 1) {
      state.question = text;
      state.step = 2;
      userStates.set(userId, state);
      return bot.sendMessage(chatId, '✅ تم حفظ السؤال.\n📝 الآن أرسل الجواب:');
    }
    
    if (state.step === 2) {
      const faq = await loadFAQ();
      faq.questions.push({
        question: state.question,
        answer: text,
        createdAt: new Date().toISOString()
      });
      await saveFAQ(faq);
      userStates.delete(userId);
      return bot.sendMessage(chatId, '✅ تم إضافة السؤال والجواب بنجاح! 🎉');
    }
  }

  if (state.action === 'edit_answer') {
    const faq = await loadFAQ();
    faq.questions[state.index].answer = text;
    faq.questions[state.index].updatedAt = new Date().toISOString();
    await saveFAQ(faq);
    userStates.delete(userId);
    return bot.sendMessage(chatId, '✅ تم تعديل الجواب بنجاح! 🎉');
  }
}

// معالجة أزرار Callback
async function handleCallbackQuery(bot, query) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;

  if (userId !== ADMIN_ID) {
    return bot.answerCallbackQuery(query.id, { text: '⛔ غير مصرح لك' });
  }

  const faq = await loadFAQ();

  if (data.startsWith('edit_')) {
    const index = parseInt(data.split('_')[1]);
    const question = faq.questions[index];
    
    userStates.set(userId, { action: 'edit_answer', index: index });
    
    await bot.editMessageText(
      `✏️ *تعديل السؤال:*\n\n*السؤال:* ${question.question}\n*الجواب الحالي:* ${question.answer}\n\n📝 أرسل الجواب الجديد:`,
      {
        chat_id: chatId,
        message_id: query.message.message_id,
        parse_mode: 'Markdown'
      }
    );
    
    return bot.answerCallbackQuery(query.id);
  }

  if (data.startsWith('delete_')) {
    const index = parseInt(data.split('_')[1]);
    const deletedQuestion = faq.questions[index].question;
    
    faq.questions.splice(index, 1);
    await saveFAQ(faq);
    
    await bot.editMessageText(
      `✅ تم حذف السؤال بنجاح!\n\n🗑️ السؤال المحذوف: ${deletedQuestion}`,
      {
        chat_id: chatId,
        message_id: query.message.message_id
      }
    );
    
    return bot.answerCallbackQuery(query.id, { text: '✅ تم الحذف' });
  }
}

module.exports = { handleMessage, handleCallbackQuery };
