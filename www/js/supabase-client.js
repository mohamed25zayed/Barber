// اسم الملف: supabase-client.js
// المسار: js/supabase-client.js

// 1. رابط مشروعك (Project URL)
const supabaseUrl = 'https://gzvqhbkpmeiwmxobgclw.supabase.co'; 

// 2. مفتاح الـ Publishable key الخاص بك
const supabaseKey = 'sb_publishable_4GCQU1SXokCRWv1cDGWwHg_tC00gzYN'; 

// 3. تهيئة الاتصال (استخدمنا supabaseClient لحل مشكلة التصادم)
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

console.log("تم الاتصال بـ Supabase بنجاح! 🚀");
