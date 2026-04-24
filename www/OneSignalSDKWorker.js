importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

// وبعدين سيب باقي الكود بتاعنا زي ما هو تحت..
// const CACHE_NAME = 'barberhome-offline-v2';
// ... إلخ
const CACHE_NAME = 'barberhome-offline-v2';
const OFFLINE_URL = '/offline.html'; // تأكد من وجود السلاش (/) في البداية

// قائمة الملفات الأساسية اللي هتتخزن في الموبايل عشان تسرع التطبيق وتدعم الأوفلاين
const URLS_TO_CACHE = [
    OFFLINE_URL,
    '/css/style.css',
    '/assets/192.png',
    '/assets/512.png',
    '/manifest.json'
];

// 1. مرحلة التثبيت (Install) - تخزين الملفات المهمة
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching offline resources');
            return cache.addAll(URLS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 2. مرحلة التفعيل (Activate) - تنظيف الكاش القديم لو عملنا تحديث
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Deleting old cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 3. مرحلة الاستجابة (Fetch) - التحكم في جلب البيانات
self.addEventListener('fetch', (event) => {
    // استثناء طلبات قاعدة البيانات (Supabase) عشان متتكيّش وتعمل مشاكل
    if (event.request.url.includes('supabase.co')) {
        return;
    }

    // التعامل مع طلبات صفحات الـ HTML (التنقل بين الصفحات)
    if (event.request.mode === 'navigate' || (event.request.method === 'GET' && event.request.headers.get('accept').includes('text/html'))) {
        event.respondWith(
            fetch(event.request).catch(() => {
                // لو مفيش إنترنت، اعرض صفحة الأوفلاين من الكاش
                return caches.match(OFFLINE_URL);
            })
        );
    } else {
        // التعامل مع باقي الملفات (CSS, JS, صور)
        // جرب تجيبها من الكاش الأول عشان السرعة، لو مش موجودة هاتها من النت
        event.respondWith(
            caches.match(event.request).then((response) => {
                return response || fetch(event.request);
            })
        );
    }
});

