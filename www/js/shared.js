// اسم الملف: shared.js
// المسار: js/shared.js
// الوظيفة: الدوال المشتركة (اللودر، الإشعارات، النوافذ، رفع الصور، التتبع، وفلترة الإشعارات الذكية، ومنع التكرار، والفتح الذكي لانستاباي)
// 🛡️ تم التحديث: إصلاح التكرار + دعم كامل لإشعارات Capacitor Native و Web PWA + دالة منع تكرار الحسابات + الفتح الآمن لانستاباي

(() => {
    // 📦 متغيرات الحالة الداخلية (محمية)
    let currentAlertId = null;

    // ==========================================
    // 🛡️ 1. دوال الحماية (Anti-XSS & Anti-Spam)
    // ==========================================
    window.escapeHTML = function(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(match) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[match];
        });
    };

    window.checkIfAccountExists = async function(phone) {
        try {
            if (typeof supabaseClient === 'undefined') return false;
            const { data, error } = await supabaseClient.from('profiles').select('id').eq('phone', phone).maybeSingle();
            if (data && data.id) return true; // الحساب موجود بالفعل
            return false; // الحساب غير موجود (جديد)
        } catch (e) {
            return false;
        }
    };

    // ==========================================
    // 🌐 2. مراقب حالة الإنترنت (Network Monitor)
    // ==========================================
    window.addEventListener('offline', () => {
        if(typeof window.playSound === 'function') window.playSound('error');
        window.showToast('⚠️ انقطع الاتصال بالإنترنت. يرجى التحقق من الشبكة.');
    });
    
    window.addEventListener('online', () => {
        if(typeof window.playSound === 'function') window.playSound('success');
        window.showToast('✅ عاد الاتصال بالإنترنت.');
    });

    // ==========================================
    // ⚙️ 3. إدارة الواجهة (Loader & Toast & Modals)
    // ==========================================
    window.showLoader = function(ms = 0, callback = null) {
        const loader = document.getElementById('global-loader');
        if(loader) {
            loader.classList.remove('hidden');
            loader.classList.add('flex');
            loader.style.zIndex = "9999";
            
            if (ms > 500) {
                setTimeout(() => { window.hideLoader(callback); }, ms);
            }
        } else if(callback && typeof callback === 'function') {
            callback();
        }
    };

    window.hideLoader = function(callback = null) {
        const loader = document.getElementById('global-loader');
        if(loader) {
            loader.classList.remove('flex');
            loader.classList.add('hidden');
        }
        if(callback && typeof callback === 'function') callback();
    };

    window.showToast = function(msg) {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toast-msg');
        if(toast && toastMsg) {
            toastMsg.innerText = msg; 
            toast.style.zIndex = "10000";
            toast.style.opacity = '1';
            toast.style.transform = 'translate(-50%, 0)';
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translate(-50%, -16px)';
            }, 3000);
        } else {
            alert(msg); 
        }
    };

    window.openModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if(!modal) return;
        const content = modal.querySelector('.modal-content');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.style.zIndex = "5000";
        if(content) {
            setTimeout(() => {
                content.classList.remove('translate-y-full', 'scale-95', 'opacity-0');
                content.classList.add('translate-y-0', 'scale-100', 'opacity-100');
            }, 10);
        }
    };

    window.closeModal = function(modalId) {
        const modal = document.getElementById(modalId);
        if(!modal) return;
        const content = modal.querySelector('.modal-content');
        if(content) {
            content.classList.remove('translate-y-0', 'scale-100', 'opacity-100');
            content.classList.add('translate-y-full', 'scale-95', 'opacity-0');
        }
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
    };

    // ==========================================
    // 🖼️ 4. معالجة ورفع الصور 
    // ==========================================
    window.previewImage = function(input, previewId) {
        const preview = document.getElementById(previewId);
        const placeholder = document.getElementById('avatar-placeholder');
        if (input.files && input.files[0]) {
            const file = input.files[0];
            
            if (!file.type.startsWith('image/')) {
                window.showToast("يرجى اختيار ملف صورة صحيح.");
                input.value = ''; 
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                if(preview) {
                    preview.src = e.target.result;
                    preview.classList.remove('hidden');
                }
                if(placeholder) placeholder.classList.add('hidden');
            }
            reader.readAsDataURL(file);
        }
    };

    window.uploadAvatar = async function(file, userId) {
        if (file.size > 5 * 1024 * 1024) {
            window.showToast("حجم الصورة كبير جداً. الحد الأقصى هو 5 ميجابايت.");
            return null;
        }

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${userId}_${Date.now()}.${fileExt}`;

            const { data, error } = await supabaseClient.storage
                .from('avatars')
                .upload(fileName, file);

            if (error) {
                console.error('Upload Error:', error.message);
                return null;
            }

            const { data: { publicUrl } } = supabaseClient.storage
                .from('avatars')
                .getPublicUrl(fileName);

            return publicUrl;
        } catch (err) {
            console.error('Unexpected Upload Error:', err);
            return null;
        }
    };

    // ==========================================
    // 🚪 5. تسجيل الخروج الآمن
    // ==========================================
    window.logout = async function() {
        window.showLoader();
        try {
            if (typeof supabaseClient !== 'undefined') {
                await supabaseClient.auth.signOut();
            }
        } catch (error) {
            console.error("خطأ أثناء تسجيل الخروج:", error);
        } finally {
            localStorage.clear();
            sessionStorage.clear();
            window.location.replace('../index.html');
        }
    };

    // ==========================================
    // 🗺️ 6. محرك حساب المسافات
    // ==========================================
    window.calculateRoute = async function(lat1, lon1, lat2, lon2) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            
            const data = await response.json();

            if (data.code === 'Ok' && data.routes.length > 0) {
                const distanceKm = data.routes[0].distance / 1000; 
                const durationMin = data.routes[0].duration / 60; 
                return { distance: distanceKm, duration: durationMin, success: true };
            }
            return { success: false };
        } catch (error) {
            clearTimeout(timeoutId);
            console.warn("تخطى حساب المسار:", error);
            return { success: false }; 
        }
    };

    window.calculateTransportFee = function(distanceKm) {
        const baseFee = 30; 
        let totalFee = baseFee;

        if (distanceKm <= 5) {
            totalFee += distanceKm * 6;
        } else if (distanceKm <= 10) {
            totalFee += (5 * 6) + ((distanceKm - 5) * 4);
        } else {
            totalFee += (5 * 6) + (5 * 4) + ((distanceKm - 10) * 3);
        }

        return Math.ceil(totalFee / 5) * 5;
    };

    // ==========================================
    // 🔔 7. إعدادات الإشعارات (Capacitor Native + Web PWA)
    // ==========================================
    window.OneSignalDeferred = window.OneSignalDeferred || [];

    // دالة طلب الإذن الذكية والموحدة (للهاتف والويب)
    window.requestAppNotificationPermission = async function(role = "user") {
        try {
            // 1. فحص ما إذا كنا داخل تطبيق Capacitor نيتف
            const isCapacitorNative = window.Capacitor && window.Capacitor.isNativePlatform();
            
            if (isCapacitorNative && window.plugins && window.plugins.OneSignal) {
                console.log("📱 طلب إشعارات لبيئة Capacitor Native...");
                window.plugins.OneSignal.promptForPushNotificationsWithUserResponse(function(accepted) {
                    console.log("حالة الإذن النيتف:", accepted);
                    if(accepted) {
                        window.plugins.OneSignal.sendTag("user_type", role);
                    }
                });
            } 
            // 2. إذا كنا على المتصفح (PWA)
            else if (window.OneSignal) {
                console.log("🌐 طلب إشعارات لبيئة Web/PWA...");
                const permission = await OneSignal.Notifications.requestPermission();
                console.log("حالة إذن الويب:", permission);
                await OneSignal.User.addTag("user_type", role);
            }
        } catch (e) {
            console.error("❌ فشل طلب إذن الإشعارات:", e);
        }
    };

    window.OneSignalDeferred.push(function(OneSignal) {
        OneSignal.Notifications.addEventListener('foregroundWillDisplay', function(event) {
            event.preventDefault(); 
            const notification = event.notification;
            
            if(typeof window.playSound === 'function') window.playSound('new');
            window.showToast(`🔔 ${notification.title || 'إشعار'}: ${notification.body}`);
        });

        // متابعة حالة الاشتراك
        OneSignal.User.PushSubscription.addEventListener('change', function(subscriptionState) {
            console.log("حالة الاشتراك تغيرت:", subscriptionState);
        });
    });

    // تسجيل Service Worker مخصص للويب فقط (Capacitor لا يحتاجه للإشعارات النيتف)
    if ('serviceWorker' in navigator && (!window.Capacitor || !window.Capacitor.isNativePlatform())) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/OneSignalSDKWorker.js')
            .then(reg => console.log('✅ تم تسجيل الـ Service Worker للويب بنجاح!'))
            .catch(err => console.error('❌ خطأ في تسجيل الـ Service Worker!', err));
        });
    }

    // ==========================================
    // 🚀 8. محرك إرسال الإشعارات التفاعلية (Native Push API)
    // ==========================================
    window.sendAppNotification = async function(targetUserId, title, message, targetUrl = "", type = "general", sendAfter = null) {
        const APP_ID = "b42c9e5d-cad6-470f-9eea-31f07b195168"; 
        const WORKER_URL = "https://barber-notifications.the-world22925.workers.dev"; 
        const baseUrl = "https://barberhome.pages.dev";
        const clickUrl = targetUrl ? targetUrl : baseUrl;

        const body = {
            app_id: APP_ID,
            include_external_user_ids: [String(targetUserId)], 
            target_channel: "push",
            headings: { "ar": title, "en": title },
            contents: { "ar": message, "en": message },
            app_url: clickUrl,
            chrome_web_icon: `${baseUrl}/assets/android/mipmap-xxxhdpi/icon.png`, 
            small_icon: `${baseUrl}/assets/android/mipmap-hdpi/icon.png`,
            android_accent_color: "FF8C00",
            android_group: type,
            thread_id: type
        };

        if (sendAfter) {
            body.send_after = sendAfter; 
        }

        try {
            await fetch(WORKER_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            console.log(`✅ تم إرسال إشعار [${type}] لـ ${targetUserId} بنجاح!`);
        } catch(e) {
            console.error("❌ فشل إرسال الإشعار:", e);
        }
    };

    // ==========================================
    // 📢 9. نظام الإعلانات المنبثقة الإجبارية (In-App Alerts)
    // ==========================================
    function injectInAppAlertModal() {
        if(document.getElementById('in-app-alert-modal')) return;
        const html = `
        <div id="in-app-alert-modal" class="fixed inset-0 bg-gray-900/60 z-[9999] hidden items-center justify-center p-4 backdrop-blur-md pb-safe transition-all duration-300">
            <div class="bg-white/95 backdrop-blur-xl w-full max-w-sm rounded-[2.5rem] p-8 text-center relative overflow-hidden shadow-2xl transform scale-90 opacity-0 transition-all duration-300 border border-white/50">
                <div class="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-amber-200/50 to-transparent rounded-bl-full -z-0 pointer-events-none"></div>
                <div class="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-blue-200/50 to-transparent rounded-tr-full -z-0 pointer-events-none"></div>
                
                <div class="relative z-10">
                    <div class="w-20 h-20 bg-gradient-to-br from-amber-400 to-amber-600 text-white rounded-[1.5rem] flex items-center justify-center text-4xl mx-auto mb-6 shadow-xl shadow-amber-500/30 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                        <i class="fa-solid fa-bullhorn"></i>
                    </div>
                    
                    <h3 id="in-app-title" class="font-black text-2xl text-gray-900 mb-3 tracking-tight">إعلان هام</h3>
                    
                    <div class="bg-gray-50/80 p-5 rounded-2xl border border-gray-100 mb-8 shadow-inner relative overflow-hidden">
                        <div class="absolute left-0 top-0 w-1 h-full bg-amber-500"></div>
                        <p id="in-app-message" class="text-sm text-gray-700 font-bold leading-relaxed"></p>
                    </div>
                    
                    <button onclick="dismissInAppAlert()" class="w-full bg-gray-900 text-white p-4 rounded-2xl font-black shadow-lg hover:bg-black active:scale-[0.98] transition-all text-sm flex items-center justify-center gap-2 group">
                        فهمت، شكراً <i class="fa-solid fa-check text-amber-500 group-hover:scale-125 transition-transform"></i>
                    </button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    window.showInAppAlert = function(id, title, message) {
        injectInAppAlertModal();
        
        const dismissedAlerts = JSON.parse(localStorage.getItem('dismissed_alerts') || '[]');
        if (dismissedAlerts.includes(id)) return; 

        currentAlertId = id;
        document.getElementById('in-app-title').innerText = window.escapeHTML(title);
        document.getElementById('in-app-message').innerText = window.escapeHTML(message);

        const modal = document.getElementById('in-app-alert-modal');
        const box = modal.querySelector('div > div');
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        if(typeof window.playSound === 'function') window.playSound('msg');

        setTimeout(() => {
            box.classList.remove('scale-90', 'opacity-0');
            box.classList.add('scale-100', 'opacity-100');
        }, 10);
    };

    window.dismissInAppAlert = function() {
        if (currentAlertId) {
            let dismissedAlerts = JSON.parse(localStorage.getItem('dismissed_alerts') || '[]');
            if (!dismissedAlerts.includes(currentAlertId)) {
                dismissedAlerts.push(currentAlertId);
                localStorage.setItem('dismissed_alerts', JSON.stringify(dismissedAlerts));
            }
        }
        
        const modal = document.getElementById('in-app-alert-modal');
        if(!modal) return;

        const box = modal.querySelector('div > div');
        box.classList.remove('scale-100', 'opacity-100');
        box.classList.add('scale-90', 'opacity-0');
        
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 300);
    };

    // ==========================================
    // 🚀 10. تشغيل مراقب الإعلانات الذكي
    // ==========================================
    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof supabaseClient === 'undefined') return;

        const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
        if (isLoginPage) return; 

        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) return;

            const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
            const userRole = profile ? profile.role : 'all';

            // تفعيل الإشعارات تلقائياً بناءً على دور المستخدم
            window.requestAppNotificationPermission(userRole);

            const { data: latestAlerts } = await supabaseClient
                .from('global_alerts')
                .select('*')
                .eq('is_active', true)
                .in('target_role', ['all', userRole]) 
                .order('created_at', { ascending: false })
                .limit(1);

            if (latestAlerts && latestAlerts.length > 0) {
                const latestAlert = latestAlerts[0];
                window.showInAppAlert(latestAlert.id, latestAlert.title, latestAlert.message);
            }

            supabaseClient.channel('global-alerts-channel')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_alerts' }, payload => {
                    const newAlert = payload.new;
                    if (newAlert.target_role === 'all' || newAlert.target_role === userRole) {
                        window.showInAppAlert(newAlert.id, newAlert.title, newAlert.message);
                    }
                }).subscribe();
        } catch(e) {
            console.error("خطأ في جلب الإعلانات:", e);
        }
    });

    // ==========================================
    // 📱 11. نظام دعوة تثبيت التطبيق (PWA) - ذكي للآيفون والأندرويد
    // ==========================================
    let deferredPrompt;

    window.addEventListener('beforeinstallprompt', (e) => {
        // إخفاء دعوة التثبيت إذا كنا نعمل داخل Capacitor Native
        if (window.Capacitor && window.Capacitor.isNativePlatform()) return;
        
        e.preventDefault();
        deferredPrompt = e;
        setTimeout(() => {
            showAndroidInstallBanner();
        }, 3000);
    });

    document.addEventListener('DOMContentLoaded', () => {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) return;

        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (!isStandalone) {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
            if (isIOS) {
                setTimeout(() => {
                    showIOSInstallBanner();
                }, 3000);
            }
        }
    });

    function showAndroidInstallBanner() {
        if (localStorage.getItem('hide_install_banner') === 'true') return;
        if (document.getElementById('smart-install-banner') || document.getElementById('ios-install-banner')) return;

        const bannerHtml = `
        <div id="smart-install-banner" class="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-md z-[99999] animate-[slideUp_0.6s_ease-out]">
            <div class="bg-gray-900/95 backdrop-blur-xl border border-gray-700 p-4 rounded-[2rem] shadow-2xl flex items-center justify-between gap-4 relative overflow-hidden">
                <div class="absolute -top-10 -right-10 w-24 h-24 bg-amber-500/20 rounded-full blur-2xl"></div>
                <div class="w-12 h-12 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center text-white text-xl shrink-0 shadow-lg animate-bounce">
                    <i class="fa-solid fa-mobile-screen-button"></i>
                </div>
                <div class="flex-1">
                    <h4 class="text-white font-black text-sm">ثبت التطبيق الآن!</h4>
                    <p class="text-gray-400 text-[10px] font-bold mt-0.5 leading-tight">احصل على تجربة أسرع، إشعارات فورية، ووصول مباشر.</p>
                </div>
                <div class="flex flex-col gap-2 shrink-0">
                    <button onclick="installAppAction()" class="bg-amber-500 text-gray-900 px-4 py-2 rounded-xl text-xs font-black hover:bg-amber-400 transition active:scale-95 shadow-md flex items-center gap-1">
                        <i class="fa-solid fa-download"></i> تثبيت
                    </button>
                    <button onclick="closeInstallBanner('smart-install-banner')" class="text-gray-400 hover:text-white text-[10px] font-bold transition">
                        ليس الآن
                    </button>
                </div>
            </div>
        </div>
        <style>
            @keyframes slideUp { 
                0% { transform: translate(-50%, 150%); opacity: 0; } 
                100% { transform: translate(-50%, 0); opacity: 1; } 
            }
        </style>
        `;
        document.body.insertAdjacentHTML('beforeend', bannerHtml);
    }

    function showIOSInstallBanner() {
        if (localStorage.getItem('hide_install_banner') === 'true') return;
        if (document.getElementById('ios-install-banner') || document.getElementById('smart-install-banner')) return;

        const bannerHtml = `
        <div id="ios-install-banner" class="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-[90%] max-w-md z-[99999] animate-[slideUp_0.6s_ease-out]">
            <div class="bg-gray-900/95 backdrop-blur-xl border border-gray-700 p-4 rounded-[2rem] shadow-2xl flex flex-col gap-3 relative overflow-hidden">
                <div class="absolute -top-10 -right-10 w-24 h-24 bg-blue-500/20 rounded-full blur-2xl pointer-events-none"></div>
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-gradient-to-br from-gray-700 to-gray-800 border border-gray-600 rounded-xl flex items-center justify-center text-white text-lg shrink-0 shadow-lg">
                            <i class="fa-brands fa-apple"></i>
                        </div>
                        <div>
                            <h4 class="text-white font-black text-sm">تثبيت BarberHome</h4>
                            <p class="text-gray-400 text-[10px] font-bold mt-0.5">احصل على أفضل أداء للآيفون</p>
                        </div>
                    </div>
                    <button onclick="closeInstallBanner('ios-install-banner')" class="text-gray-400 hover:text-white shrink-0 p-1">
                        <i class="fa-solid fa-xmark text-lg"></i>
                    </button>
                </div>
                <div class="bg-gray-800/80 p-3 rounded-2xl border border-gray-700 text-center">
                    <p class="text-gray-300 text-xs leading-relaxed font-bold">
                        1. اضغط على زر المشاركة <i class="fa-solid fa-arrow-up-from-bracket text-blue-400 mx-1 text-base align-middle"></i> بالأسفل<br>
                        2. ثم اختر <span class="text-white">"Add to Home Screen"</span> <i class="fa-regular fa-square-plus text-white mx-1 text-base align-middle"></i>
                    </p>
                </div>
            </div>
        </div>
        <style>
            @keyframes slideUp { 
                0% { transform: translate(-50%, 150%); opacity: 0; } 
                100% { transform: translate(-50%, 0); opacity: 1; } 
            }
        </style>
        `;
        document.body.insertAdjacentHTML('beforeend', bannerHtml);
    }

    window.installAppAction = async function() {
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('✅ العميل وافق على التثبيت');
                document.getElementById('smart-install-banner')?.remove();
            } else {
                console.log('❌ العميل رفض التثبيت');
            }
            deferredPrompt = null;
        }
    };

    window.closeInstallBanner = function(bannerId = 'smart-install-banner') {
        const banner = document.getElementById(bannerId) || document.getElementById('ios-install-banner');
        if (banner) {
            banner.style.transform = 'translate(-50%, 150%)';
            banner.style.opacity = '0';
            setTimeout(() => banner.remove(), 300);
        }
        localStorage.setItem('hide_install_banner', 'true'); 
    };

    // ==========================================
    // 💸 الدالة الذكية لفتح انستاباي بدون أخطاء
    // ==========================================
    window.openInstaPay = function(e) {
        if(e) e.preventDefault();
        
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isAndroid = /Android/.test(navigator.userAgent);
        
        if (isAndroid) {
            window.location.href = "intent://#Intent;package=com.egyptianbanks.instapay;end";
        } else if (isIOS) {
            window.location.href = "instapay://";
            setTimeout(() => {
                window.showToast("إذا لم يفتح التطبيق، يرجى فتحه يدوياً من هاتفك.");
            }, 1500);
        } else {
            window.showToast("هذه الميزة تعمل على الهواتف المحمولة. يرجى فتح انستاباي يدوياً 📱");
        }
    };

})(); // نهاية السكربت الآمنة