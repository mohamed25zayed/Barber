// اسم الملف: barber.js
// المسار: js/barber.js
// الوظيفة: لوحة الكابتن (نسخة محمية 🛡️ + نظام الحظر + ضغط الصور الذكي 🗜️ لحماية السيرفر)

(() => {
    // ==========================================
    // 📦 1. إدارة الحالة (State Management) - محمي بالكامل
    // ==========================================
    const state = {
        barberId: null,
        chatOrderId: null,
        activeChatSubs: {},
        tracking: {
            watchId: null,
            lastLat: null,
            lastLng: null
        }
    };

    // ==========================================
    // 🔊 2. نظام الصوت المدمج
    // ==========================================
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    window.playSound = function(type) {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'click') {
            oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(600, audioCtx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.1);
        } else if (type === 'msg') {
            oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime); gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.2);
        } else {
            const sounds = { 'new': '../assets/sounds/new-order.mp3', 'success': '../assets/sounds/success.mp3', 'error': '../assets/sounds/error.mp3' };
            if (sounds[type]) { const audio = new Audio(sounds[type]); audio.play().catch(err => console.log('تنبيه: المتصفح منع تشغيل الصوت', err)); }
        }
    };

    document.addEventListener('click', (e) => {
        if(e.target.closest('button, label.cursor-pointer, .nav-item, .floating-card')) window.playSound('click');
    });

    // ==========================================
    // 🚀 3. التهيئة وبدء التشغيل (مع نظام الحظر الإجباري)
    // ==========================================
    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof supabaseClient === 'undefined') return;

        const { data: { user }, error } = await supabaseClient.auth.getUser();
        if (error || !user) return window.location.replace('../index.html');
        
        state.barberId = user.id;

        // 🔥 تسجيل الموبايل فوراً في سيرفر الإشعارات بهوية الكابتن
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async function(OneSignal) {
            await OneSignal.login(state.barberId); 
            OneSignal.User.addTag("barber_id", state.barberId);
            OneSignal.User.addTag("user_type", "barber"); 
        });

        // 🚨 التحقق من حالة الإيقاف وعرض البانر الثابت 🚨
        const { data: profile } = await supabaseClient.from('profiles').select('warning_msg, status').eq('id', user.id).single();
        
        if (profile && profile.status === 'suspended') {
            const defaultMsg = "تم إيقاف حسابك لعدم سداد المديونية أو لمخالفة الشروط. يرجى سداد المديونية من قسم الماليات لإعادة تفعيل الحساب.";
            const finalMsg = profile.warning_msg ? profile.warning_msg : defaultMsg;
            
            const bannerHtml = `
            <div class="fixed top-0 left-0 w-full bg-red-600 text-white z-[99999] p-4 flex flex-col items-center justify-center shadow-2xl border-b-4 border-red-800 animate-[slideDown_0.5s_ease-out]">
                <div class="flex items-center gap-3 mb-2">
                    <i class="fa-solid fa-user-lock text-4xl animate-pulse text-yellow-300"></i>
                    <h3 class="font-black text-xl">عفواً، حسابك موقوف!</h3>
                </div>
                <p class="text-sm font-bold text-center max-w-md leading-relaxed text-red-50">${window.escapeHTML(finalMsg)}</p>
                <button onclick="window.location.reload()" class="mt-4 bg-white text-red-600 px-6 py-2.5 rounded-xl font-black text-xs hover:bg-red-50 transition active:scale-95 shadow-md flex items-center gap-2">
                    <i class="fa-solid fa-rotate-right"></i> تحديث الصفحة (بعد السداد)
                </button>
            </div>
            <style>@keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } } body { padding-top: 140px !important; }</style>`;
            
            document.body.insertAdjacentHTML('afterbegin', bannerHtml);
            
            // إيقاف زر العمل الإجباري
            const workCheck = document.getElementById('work-status-check');
            if(workCheck) { workCheck.checked = false; workCheck.disabled = true; }
        }

        injectChatModal(); // 💬 تجهيز واجهة المحادثة الاحترافية للكابتن
        
        // تحميل البيانات
        window.loadBarberProfileAndFinances();
        window.loadBarberOwedBalances(); 
        window.loadBarberOrders();
        window.loadPortfolioImages(); 
        window.loadSalonInvitations(); 
        window.loadBarberHistory('all'); 

        setupRealtimeListeners();
    });

    // ==========================================
    // 📡 4. الرادار المباشر (Real-time)
    // ==========================================
    function setupRealtimeListeners() {
        // 🔥 رادار الطلبات المباشرة
        supabaseClient
            .channel('barber-orders-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `barber_id=eq.${state.barberId}` }, payload => {
                if (payload.eventType === 'UPDATE' && payload.new.status === 'cancelled') {
                    window.playSound('error');
                    window.showToast('العميل قام بإلغاء الطلب ❌');
                } else if (payload.eventType === 'INSERT') {
                    window.playSound('new'); 
                    window.showToast('طلب جديد متاح الآن! ✂️');
                } else if (payload.eventType === 'UPDATE' && payload.new.status === 'pending') {
                    window.playSound('new');
                    window.showToast('العميل قام بتعديل الخدمات وتحديث السعر 🔄');
                }

                window.loadBarberOrders();
                if(document.getElementById('barber-history')?.classList.contains('active')) {
                    window.loadBarberHistory(document.querySelector('.filter-btn.bg-gray-900')?.id?.replace('filter-', '') || 'all');
                }
            }).subscribe();

        // رادار مديونية ومحفظة الكابتن
        supabaseClient
            .channel('barber-finances-channel')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'barber_finances', filter: `barber_id=eq.${state.barberId}` }, payload => {
                window.loadBarberProfileAndFinances(); 
                if (payload.new && payload.new.platform_debt === 0) {
                    window.playSound('success'); 
                    window.showToast('الإدارة أكدت الدفع وتم تصفير مديونيتك بنجاح');
                    if(typeof window.closeModal === 'function') window.closeModal('pay-debt-modal');
                }
            }).subscribe();

        // رادار مستحقات الصالونات
        supabaseClient
            .channel('barber-team-updates')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'salon_team', filter: `barber_id=eq.${state.barberId}` }, payload => {
                window.loadBarberOwedBalances();
            }).subscribe();

        // رادار دعوات الصالونات
        supabaseClient
            .channel('barber-invites-channel')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'salon_team', filter: `barber_id=eq.${state.barberId}` }, payload => {
                window.loadSalonInvitations(); 
                window.playSound('new'); 
                window.showToast('وصلتك دعوة انضمام جديدة من صالون');
            }).subscribe();
    }

    // ==========================================
    // 📍 5. نظام التتبع اللحظي الداخلي (Private Logic)
    // ==========================================
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))); 
    }

    window.startLiveLocationTracking = function() {
        if (!navigator.geolocation) {
            window.showToast("جهازك لا يدعم تتبع الموقع اللحظي.");
            return;
        }

        if(state.tracking.watchId) navigator.geolocation.clearWatch(state.tracking.watchId);
        console.log("🟢 تم بدء تتبع موقع الكابتن...");

        state.tracking.watchId = navigator.geolocation.watchPosition(async (position) => {
            const currentLat = position.coords.latitude;
            const currentLng = position.coords.longitude;

            if (state.tracking.lastLat && state.tracking.lastLng) {
                const distanceMoved = calculateDistance(state.tracking.lastLat, state.tracking.lastLng, currentLat, currentLng);
                if (distanceMoved < 0.05) return; // تحديث السيرفر فقط إذا تحرك أكثر من 50 متر
            }

            state.tracking.lastLat = currentLat;
            state.tracking.lastLng = currentLng;

            await supabaseClient.from('profiles').update({ 
                lat: currentLat, 
                lng: currentLng 
            }).eq('id', state.barberId);
            
        }, (error) => {
            console.error("خطأ في قراءة الموقع:", error);
        }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
    };

    window.stopLiveLocationTracking = function() {
        if (state.tracking.watchId) {
            navigator.geolocation.clearWatch(state.tracking.watchId);
            state.tracking.watchId = null;
            console.log("🔴 تم إيقاف تتبع الموقع.");
        }
    };

    // ==========================================
    // 💬 6. نظام المحادثة اللحظية
    // ==========================================
    function injectChatModal() {
        if(document.getElementById('chat-modal')) return;
        const html = `
        <div id="chat-modal" class="fixed inset-0 bg-gray-900/60 z-[8000] hidden items-center justify-center backdrop-blur-sm transition-opacity duration-300 p-4">
            <div id="chat-content-box" class="bg-[#ece5dd] w-full max-w-md h-[80vh] max-h-[650px] rounded-[2rem] flex flex-col shadow-2xl transform transition-all scale-90 opacity-0 duration-300 overflow-hidden border border-gray-200">
                <div class="p-4 border-b border-gray-200 flex justify-between items-center bg-white shrink-0 shadow-sm z-10">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center text-lg shadow-inner border border-blue-100"><i class="fa-solid fa-user"></i></div>
                        <div>
                            <h3 class="font-black text-gray-900 text-sm leading-tight">محادثة العميل</h3>
                            <p class="text-[10px] text-green-600 font-bold flex items-center gap-1.5 mt-0.5">
                                <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_5px_#22c55e]"></span> اتصال آمن ومشفر
                            </p>
                        </div>
                    </div>
                    <button onclick="closeChat()" class="w-8 h-8 bg-gray-50 rounded-full flex items-center justify-center text-gray-500 hover:bg-red-50 hover:text-red-500 transition active:scale-90"><i class="fa-solid fa-xmark text-sm"></i></button>
                </div>
                <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar flex flex-col relative bg-[#ece5dd]"></div>
                <div class="p-3 bg-white border-t border-gray-200 shrink-0 flex gap-2 z-10 shadow-[0_-5px_15px_rgba(0,0,0,0.03)]">
                    <input type="text" id="chat-input" placeholder="اكتب رسالتك للعميل..." class="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all" onkeypress="if(event.key === 'Enter') sendChatMessage()">
                    <button onclick="sendChatMessage()" id="send-chat-btn" class="w-12 h-12 bg-gray-900 text-blue-500 rounded-xl flex items-center justify-center hover:bg-black transition-all shadow-sm active:scale-95 text-lg disabled:opacity-50"><i class="fa-solid fa-paper-plane"></i></button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    async function loadChatMessages() {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '<div class="text-center text-gray-500 text-xs font-bold my-auto flex flex-col items-center justify-center h-full"><i class="fa-solid fa-circle-notch fa-spin mb-3 text-2xl text-blue-500"></i>جاري تحميل المحادثة...</div>';
        
        const { data, error } = await supabaseClient.from('chat_messages').select('*').eq('order_id', state.chatOrderId).order('created_at', { ascending: true });
        container.innerHTML = '';
        
        if(error || !data || data.length === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-500 text-[10px] font-bold my-4 bg-yellow-50/80 p-2.5 rounded-xl border border-yellow-200/50 mx-auto w-max shadow-sm backdrop-blur-sm">
                    <i class="fa-solid fa-lock text-blue-500 ml-1"></i> المحادثة مشفرة بالكامل.
                </div>`;
            return;
        }
        data.forEach(msg => appendMessage(msg));
    }

    function appendMessage(msg) {
        const container = document.getElementById('chat-messages');
        const isMe = msg.sender_id === state.barberId;
        const time = new Date(msg.created_at).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});
        
        const html = `
        <div class="flex ${isMe ? 'justify-end' : 'justify-start'} animate-[fadeIn_0.2s_ease-out] mb-1">
            <div class="max-w-[85%] ${isMe ? 'bg-blue-500 text-white rounded-tr-[1rem] rounded-tl-[1rem] rounded-bl-[1rem] rounded-br-sm' : 'bg-white text-gray-800 border border-gray-200 rounded-tr-[1rem] rounded-tl-[1rem] rounded-br-[1rem] rounded-bl-sm'} p-3 shadow-sm relative group">
                <p class="text-xs font-bold leading-relaxed break-words">${window.escapeHTML(msg.message)}</p>
                <p class="text-[8px] mt-1 ${isMe ? 'text-blue-100' : 'text-gray-400'} font-black flex items-center justify-end gap-1">
                    ${time} ${isMe ? '<i class="fa-solid fa-check-double text-[10px]"></i>' : ''}
                </p>
            </div>
        </div>`;
        
        const noMsg = container.querySelector('.fa-circle-notch') || container.querySelector('.fa-lock');
        if(noMsg) noMsg.parentElement.parentElement ? noMsg.parentElement.parentElement.remove() : noMsg.parentElement.remove();
        
        container.insertAdjacentHTML('beforeend', html);
        container.scrollTop = container.scrollHeight;
        if(!isMe && state.chatOrderId === msg.order_id) window.playSound('msg');
    }

    // ==========================================
    // 🌐 7. الدوال المكشوفة للواجهة (Public API)
    // ==========================================

    window.openChat = async function(orderId) {
        state.chatOrderId = orderId;
        const modal = document.getElementById('chat-modal');
        const box = document.getElementById('chat-content-box');
        
        const chatBtn = document.getElementById(`chat-btn-${orderId}`);
        if(chatBtn) chatBtn.querySelectorAll('.animate-ping, .bg-red-500').forEach(el => el.remove());

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => { box.classList.remove('scale-90', 'opacity-0'); box.classList.add('scale-100', 'opacity-100'); }, 10);
        
        await loadChatMessages();
    };

    window.closeChat = function() {
        const modal = document.getElementById('chat-modal');
        const box = document.getElementById('chat-content-box');
        box.classList.remove('scale-100', 'opacity-100');
        box.classList.add('scale-90', 'opacity-0');
        
        setTimeout(() => { 
            modal.classList.add('hidden'); 
            modal.classList.remove('flex');
            state.chatOrderId = null;
        }, 300);
    };

    window.sendChatMessage = async function() {
        const input = document.getElementById('chat-input');
        const btn = document.getElementById('send-chat-btn');
        let text = input.value.trim();
        if(!text || !state.chatOrderId) return;
        
        const phoneRegex = /(\d[\s\-._]*){8,}/g;
        if (phoneRegex.test(text)) {
            text = text.replace(phoneRegex, ' [رقم مخفي 🚫] ');
            window.showToast('عفواً، يمنع إرسال الأرقام في المحادثة حفاظاً على الخصوصية.');
        }
        
        input.value = '';
        btn.disabled = true;
        
        await supabaseClient.from('chat_messages').insert([{
            order_id: state.chatOrderId, sender_id: state.barberId, message: text
        }]);

        const { data: orderData } = await supabaseClient.from('orders').select('customer_id, barber:barber_id(full_name)').eq('id', state.chatOrderId).single();
        if(orderData && orderData.customer_id) {
            const barberName = orderData.barber ? orderData.barber.full_name : 'الكابتن';
            if(typeof window.sendAppNotification === 'function') {
                window.sendAppNotification(
                    orderData.customer_id, 
                    `الكابتن ${barberName} أرسل لك رسالة 💬`, text, 
                    `https://barberhome.pages.dev/pages/customer.html`, "chat"
                );
            }
        }
        btn.disabled = false;
        input.focus();
    };

    window.switchBarberView = function(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(viewId).classList.add('active');
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        
        if(viewId === 'barber-dash') document.getElementById('b-nav-dash').classList.add('active');
        if(viewId === 'barber-history') document.getElementById('b-nav-history').classList.add('active');
        if(viewId === 'barber-schedule') document.getElementById('b-nav-schedule').classList.add('active');
    };

    window.loadBarberProfileAndFinances = async function() {
        const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', state.barberId).single();
        if (profile) {
            document.getElementById('barber-welcome-name').innerHTML = `أهلاً كابتن <span class="text-amber-500">${window.escapeHTML(profile.full_name.split(' ')[0])}</span>`;
            document.getElementById('work-start').value = profile.work_start || "";
            document.getElementById('work-end').value = profile.work_end || "";
            
            const statusCheck = document.getElementById('work-status-check');
            const statusText = document.getElementById('work-status-text');
            const floatingBubble = document.getElementById('online-floating-bubble');
            
            if(statusCheck) {
                const isActive = (profile.status === 'active');
                statusCheck.checked = isActive;
                if(isActive) {
                    if(statusText) statusText.innerText = 'أنت متصل وتستقبل الطلبات';
                    if(floatingBubble) floatingBubble.classList.remove('hidden');
                    window.startLiveLocationTracking();
                } else {
                    if(statusText) statusText.innerText = 'غير متاح الآن';
                    if(floatingBubble) floatingBubble.classList.add('hidden');
                    window.stopLiveLocationTracking();
                }
            }
        }

        let { data: finances } = await supabaseClient.from('barber_finances').select('*').eq('barber_id', state.barberId).maybeSingle();
        if (!finances) {
            await supabaseClient.from('barber_finances').insert([{ barber_id: state.barberId, available_balance: 0, platform_debt: 0 }]);
            finances = { available_balance: 0, platform_debt: 0, debt_payment_pending: false };
        }
        
        const balanceSpan = document.getElementById('available-balance');
        const debtSpan = document.getElementById('platform-debt');
        if(balanceSpan) balanceSpan.innerText = finances.available_balance || 0;
        if(debtSpan) debtSpan.innerText = finances.platform_debt || 0;

        if(debtSpan) {
            const debtBtn = debtSpan.parentElement.nextElementSibling;
            if (finances.debt_payment_pending) {
                if(debtBtn) {
                    debtBtn.innerHTML = '<i class="fa-solid fa-clock ml-1"></i> جاري المراجعة';
                    debtBtn.className = "mt-4 w-full bg-amber-50 text-amber-600 font-bold text-xs py-3 rounded-xl transition shadow-sm border border-amber-100 cursor-not-allowed";
                    debtBtn.onclick = (e) => { e.preventDefault(); window.showToast('طلب السداد الخاص بك قيد المراجعة من الإدارة'); };
                }
            } else {
                if(debtBtn) {
                    debtBtn.innerHTML = '<i class="fa-solid fa-arrow-up-right-from-square ml-1"></i> سداد';
                    debtBtn.className = "mt-4 w-full bg-red-50 text-red-600 font-black text-xs py-3 rounded-xl hover:bg-red-100 transition shadow-sm border border-red-100 active:scale-95";
                    debtBtn.onclick = () => window.handleBarberAction('pay');
                }
            }
        }

        if(balanceSpan) {
            const { data: pendingPayout } = await supabaseClient.from('payout_requests').select('id').eq('barber_id', state.barberId).eq('status', 'pending').maybeSingle();
            const withdrawBtn = balanceSpan.parentElement.nextElementSibling;
            if (pendingPayout) {
                if(withdrawBtn) {
                    withdrawBtn.innerHTML = '<i class="fa-solid fa-clock ml-1"></i> سحب قيد المراجعة';
                    withdrawBtn.className = "mt-4 w-full bg-amber-50 text-amber-600 font-bold text-xs py-3 rounded-xl transition shadow-sm border border-amber-100 cursor-not-allowed";
                    withdrawBtn.onclick = (e) => { e.preventDefault(); window.showToast('لديك طلب سحب أرباح قيد المراجعة حالياً'); };
                }
            } else {
                if(withdrawBtn) {
                    withdrawBtn.innerHTML = '<i class="fa-solid fa-arrow-down ml-1 text-green-500"></i> سحب';
                    withdrawBtn.className = "mt-4 w-full bg-gray-50 text-gray-900 font-black text-xs py-3 rounded-xl hover:bg-gray-100 transition shadow-sm border border-gray-100 active:scale-95";
                    withdrawBtn.onclick = () => { if(typeof window.openModal === 'function') window.openModal('withdraw-modal'); };
                }
            }
        }
    };

    window.loadBarberOwedBalances = async function() {
        const { data: teams } = await supabaseClient.from('salon_team').select(`id, owed_balance, salon:salon_id (name)`).eq('barber_id', state.barberId).eq('status', 'accepted');
        const container = document.getElementById('barber-owed-balances-container');
        if (!container) return;
        container.innerHTML = '';
        if (!teams || teams.length === 0) {
            container.innerHTML = `<div class="text-center p-4 text-[10px] text-gray-400 font-bold bg-gray-50 rounded-xl border border-dashed">لست منضماً لأي فريق صالون حالياً.</div>`;
            return;
        }
        teams.forEach(team => {
            container.innerHTML += `
                <div class="floating-card p-4 border-r-4 border-purple-500 bg-white flex justify-between items-center shadow-sm transition hover:shadow-md mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-500"><i class="fa-solid fa-shop"></i></div>
                        <div><h4 class="font-bold text-gray-900 text-sm">${window.escapeHTML(team.salon?.name || 'صالون')}</h4><p class="text-[9px] text-gray-500 mt-1"><i class="fa-solid fa-hand-holding-dollar ml-1"></i> يتم التحصيل كاش من الإدارة</p></div>
                    </div>
                    <div class="text-left bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100"><p class="text-[9px] text-gray-500 font-bold mb-0.5">مستحقاتك</p><p class="text-lg font-black text-purple-700">${Math.max(0, Number(team.owed_balance)).toFixed(0)} <span class="text-[9px]">ج.م</span></p></div>
                </div>`;
        });
    };

    window.toggleWorkStatus = async function(checkbox) {
        window.showLoader();

        // 🚨 حماية: التأكد إن الإدارة مش مدياله بلوك مديونية قبل ما يفعل نفسه
        const { data: currentProfile } = await supabaseClient.from('profiles').select('warning_msg').eq('id', state.barberId).single();
        if (currentProfile && currentProfile.warning_msg) {
            window.hideLoader();
            checkbox.checked = false; // إرجاع الزرار لوضع الإغلاق إجبارياً
            window.playSound('error');
            return window.showToast('حسابك موقوف من قبل الإدارة! لا يمكنك استقبال الطلبات حتى سداد المديونية.');
        }

        const newStatus = checkbox.checked ? 'active' : 'suspended';
        const statusText = document.getElementById('work-status-text');
        const floatingBubble = document.getElementById('online-floating-bubble');
        
        const { error } = await supabaseClient.from('profiles').update({ status: newStatus }).eq('id', state.barberId);
        window.hideLoader();
        
        if (error) { 
            checkbox.checked = !checkbox.checked; window.playSound('error'); window.showToast('فشل في تغيير حالة العمل'); 
        } else { 
            window.playSound('success'); 
            if (checkbox.checked) {
                statusText.innerText = 'أنت متصل وتستقبل الطلبات'; 
                if(floatingBubble) floatingBubble.classList.remove('hidden'); 
                window.showToast('أنت الآن متاح لاستقبال الطلبات 🟢'); 
                window.startLiveLocationTracking();
            } else {
                statusText.innerText = 'غير متاح الآن'; 
                if(floatingBubble) floatingBubble.classList.add('hidden'); 
                window.showToast('تم إيقاف استقبال الطلبات 🔴'); 
                window.stopLiveLocationTracking();
            }
        }
    };

    window.saveBarberSchedule = async function() {
        let workStart = document.getElementById('work-start').value || null; let workEnd = document.getElementById('work-end').value || null;
        window.showLoader(); const { error } = await supabaseClient.from('profiles').update({ work_start: workStart, work_end: workEnd }).eq('id', state.barberId); window.hideLoader();
        if (error) { window.playSound('error'); window.showToast('حدث خطأ أثناء الحفظ'); } else { window.playSound('success'); window.showToast('تم حفظ الإعدادات بنجاح'); }
    };

    window.loadSalonInvitations = async function() {
        const { data: invites } = await supabaseClient.from('salon_team').select(`id, specialty, salon:salon_id (name, address)`).eq('barber_id', state.barberId).eq('status', 'pending');
        const container = document.getElementById('barber-invitations-container'); if (!container) return; container.innerHTML = '';
        if (invites && invites.length > 0) {
            invites.forEach(invite => {
                container.innerHTML += `
                    <div class="floating-card p-4 border-r-4 border-purple-500 bg-purple-50 shadow-sm mb-3">
                        <div class="flex items-center gap-3 mb-3">
                            <div class="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-purple-500 shadow-sm border border-purple-100"><i class="fa-solid fa-shop"></i></div>
                            <div><h4 class="font-bold text-gray-900 text-sm">دعوة انضمام لفريق الصالون</h4><p class="text-[10px] text-gray-500 font-bold mt-0.5"><span class="text-purple-600">${window.escapeHTML(invite.salon?.name || 'صالون')}</span> يطلب انضمامك كـ (${window.escapeHTML(invite.specialty || 'كابتن')})</p></div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="handleSalonInvite('accept', '${invite.id}')" class="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-black text-xs shadow-md hover:bg-purple-700 transition active:scale-95"><i class="fa-solid fa-check ml-1"></i> موافقة الانضمام</button>
                            <button onclick="handleSalonInvite('reject', '${invite.id}')" class="px-4 bg-white border border-gray-200 text-gray-600 py-2.5 rounded-xl font-bold text-xs hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition active:scale-95">رفض</button>
                        </div>
                    </div>`;
            });
        }
    };

    window.handleSalonInvite = async function(action, inviteId) {
        window.showLoader();
        if(action === 'accept') { await supabaseClient.from('salon_team').update({ status: 'accepted' }).eq('id', inviteId); window.playSound('success'); window.showToast('تم الانضمام لفريق الصالون بنجاح'); } 
        else { await supabaseClient.from('salon_team').delete().eq('id', inviteId); window.playSound('error'); window.showToast('تم رفض الدعوة'); }
        window.hideLoader(); window.loadSalonInvitations(); window.loadBarberOwedBalances();
    };

    window.loadBarberOrders = async function() {
        const { data: orders } = await supabaseClient
            .from('orders')
            .select(`*, customer:customer_id (full_name, phone)`)
            .eq('barber_id', state.barberId)
            .in('status', ['pending', 'accepted'])
            .order('created_at', { ascending: true });

        const container = document.getElementById('barber-orders-container');
        if (!container) return;
        container.innerHTML = '';

        if (!orders || orders.length === 0) {
            container.innerHTML = `<div class="text-center p-10 bg-white rounded-3xl shadow-sm border border-gray-100 border-dashed"><i class="fa-solid fa-mug-hot text-5xl text-gray-200 mb-4 block"></i><p class="text-gray-500 font-bold text-sm">لا توجد طلبات حالياً، استمتع بوقتك!</p></div>`;
            return;
        }

        orders.forEach(order => {
            const isPending = order.status === 'pending';
            const isSalon = order.booking_type === 'salon';
            const showPhone = order.show_phone !== false; 
            
            const actualPhone = order.recipient_phone ? order.recipient_phone : order.customer?.phone;
            const phoneLabel = order.recipient_phone ? 'رقم المستفيد (مطلوب للغير)' : 'رقم العميل';
            
            const borderColor = isPending ? 'border-amber-500' : 'border-blue-500';
            const payMethod = order.payment_method === 'cash' ? 'كاش' : 'فيزا/انستاباي';
            
            const typeBadge = isSalon 
                ? `<span class="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-lg text-[10px] font-black border border-purple-200"><i class="fa-solid fa-shop ml-1"></i> حجز صالون</span>`
                : `<span class="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-[10px] font-black border border-blue-200"><i class="fa-solid fa-house ml-1"></i> حجز منزلي</span>`;

            let actionButtons = ''; let phoneHtml = ''; let addressHtml = '';
            const safeDate = window.escapeHTML(order.booking_date || 'غير محدد');
            const safeTime = window.escapeHTML(order.booking_time || 'غير محدد');

            if (isSalon) {
                addressHtml = `<p class="text-xs text-gray-600 font-bold mt-2"><i class="fa-solid fa-location-dot text-amber-500 w-4 text-center ml-1"></i> داخل الصالون</p>`;
                phoneHtml = `<p class="text-[10px] text-gray-400 font-bold mt-1.5"><i class="fa-solid fa-phone-slash text-gray-300 ml-1"></i> الاتصال عبر الإدارة فقط</p>`;
            } else {
                addressHtml = `<p class="text-xs text-gray-600 font-bold mt-2 leading-relaxed"><i class="fa-solid fa-location-dot text-amber-500 w-4 text-center ml-1"></i> ${window.escapeHTML(order.address)}</p>`;
                if (isPending) {
                    phoneHtml = `<p class="text-[10px] text-gray-400 font-bold mt-1.5"><i class="fa-solid fa-lock text-gray-300 ml-1"></i> يظهر الهاتف بعد القبول</p>`;
                } else {
                    if (showPhone && actualPhone) {
                        phoneHtml = `<div class="mt-2 bg-gray-50 p-3 rounded-xl border border-gray-100">
                            <p class="text-[10px] text-gray-500 font-bold mb-1">${phoneLabel}</p>
                            <p class="text-sm text-gray-900 font-black flex items-center"><i class="fa-solid fa-phone text-blue-500 w-4 text-center ml-2"></i> <a href="tel:${actualPhone}" dir="ltr" class="hover:underline">${window.escapeHTML(actualPhone)}</a></p>
                        </div>`;
                    } else {
                        phoneHtml = `<p class="text-xs text-red-500 font-black mt-2 bg-red-50 p-3 rounded-xl border border-red-100 flex items-center"><i class="fa-solid fa-user-secret text-red-400 w-4 text-center ml-2"></i> العميل يفضل الدردشة فقط</p>`;
                    }
                }
            }

            if (isPending) {
                actionButtons = `
                <div class="flex gap-2 w-full mt-2">
                    <button onclick="handleOrderAction('accept', '${order.id}')" class="flex-1 bg-amber-500 text-gray-900 py-3.5 rounded-xl font-black text-xs shadow-md hover:bg-amber-400 hover:shadow-lg transition active:scale-95 flex justify-center items-center gap-2"><i class="fa-solid fa-check text-lg"></i> قبول وبدء</button>
                    <button onclick="handleOrderAction('ignore', '${order.id}')" class="px-5 bg-gray-100 text-gray-500 py-3.5 rounded-xl font-bold text-lg hover:bg-red-50 hover:text-red-500 transition active:scale-95"><i class="fa-solid fa-xmark"></i></button>
                </div>`;
            } else {
                let mapUrl = `https://www.google.com/maps/dir/?api=1&destination=...?daddr=$${encodeURIComponent(order.address)}`;
                if (order.lat && order.lng) { mapUrl = `https://www.google.com/maps/dir/?api=1&destination=...?daddr=$${order.lat},${order.lng}`; }

                const mapButton = isSalon ? '' : `<button onclick="window.open('${mapUrl}', '_blank')" class="flex-1 bg-gray-50 text-gray-700 py-3.5 rounded-xl font-bold text-[11px] border border-gray-200 hover:bg-gray-100 hover:text-gray-900 transition shadow-sm flex justify-center items-center gap-2 active:scale-95"><i class="fa-solid fa-map-location-dot text-amber-500 text-sm"></i> مسار GPS</button>`;
                const chatButton = `<button id="chat-btn-${order.id}" onclick="openChat('${order.id}')" class="flex-1 bg-blue-50 text-blue-600 py-3.5 rounded-xl font-bold text-[11px] border border-blue-100 hover:bg-blue-100 transition shadow-sm flex justify-center items-center gap-2 relative active:scale-95"><i class="fa-solid fa-comment-dots text-sm"></i> دردشة العميل</button>`;

                actionButtons = `
                <div class="flex gap-2 w-full mb-2 mt-1">
                    ${chatButton}
                    ${mapButton}
                </div>
                <button onclick="handleOrderAction('complete', '${order.id}')" class="w-full bg-gray-900 text-white py-3.5 rounded-xl font-black text-xs shadow-md hover:bg-black hover:shadow-lg transition active:scale-95 flex justify-center items-center gap-2">
                    <i class="fa-solid fa-flag-checkered text-amber-500 text-sm"></i> إنهاء الخدمة بنجاح
                </button>`;
            }

            container.innerHTML += `
                <div class="bg-white p-5 rounded-[2rem] border-2 border-transparent border-r-4 ${borderColor} shadow-sm transition hover:shadow-lg flex flex-col gap-1 relative mb-4">
                    <div class="flex justify-between items-start mb-2">
                        <h4 class="font-black text-gray-900 text-lg">${window.escapeHTML(order.customer?.full_name || 'عميل')}</h4>
                        ${typeBadge}
                    </div>
                    <div class="p-3 bg-blue-50/50 border border-blue-100/50 rounded-2xl flex items-center gap-3 mt-1">
                        <div class="w-10 h-10 bg-blue-100 text-blue-500 rounded-xl flex items-center justify-center text-lg shrink-0"><i class="fa-regular fa-calendar-check"></i></div>
                        <div>
                            <p class="text-[10px] text-gray-500 font-bold mb-0.5">موعد الحجز</p>
                            <p class="text-xs font-black text-gray-900" dir="ltr">${safeDate} | ${safeTime}</p>
                        </div>
                    </div>
                    <div class="flex flex-col mt-1 mb-2">
                        ${addressHtml}
                        ${phoneHtml}
                    </div>
                    <div class="bg-gray-50 p-4 rounded-2xl text-xs mb-3 border border-gray-100 flex flex-col gap-2.5">
                        <div class="flex justify-between items-start gap-4"><span class="font-bold text-gray-500 shrink-0"><i class="fa-solid fa-scissors ml-1 text-gray-400"></i>الخدمات:</span><span class="text-left font-bold text-gray-900 leading-relaxed">${window.escapeHTML(order.services_text)}</span></div>
                        <div class="flex justify-between items-center pt-2 border-t border-gray-200"><span class="font-bold text-gray-500">الإجمالي:</span><span class="font-black text-amber-500 text-sm">${order.final_total} ج.م <span class="bg-white border border-gray-200 text-gray-500 text-[9px] px-1.5 py-0.5 rounded-md font-bold ml-1">${payMethod}</span></span></div>
                    </div>
                    ${actionButtons}
                </div>`;

            // الاشتراك في شات هذا الطلب إذا لم نكن مشتركين
            if (!isPending && !state.activeChatSubs[order.id]) {
                state.activeChatSubs[order.id] = supabaseClient.channel(`chat-listener-${order.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `order_id=eq.${order.id}` }, payload => {
                    const modal = document.getElementById('chat-modal');
                    if ((modal && modal.classList.contains('hidden')) || state.chatOrderId !== order.id) {
                        const chatBtn = document.getElementById(`chat-btn-${order.id}`);
                        if(chatBtn && !chatBtn.querySelector('.animate-ping')) {
                            chatBtn.innerHTML += `<span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span><span class="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full shadow-sm"></span>`;
                        }
                        window.playSound('msg'); window.showToast('رسالة جديدة من العميل 💬');
                    } else if (state.chatOrderId === order.id) {
                        appendMessage(payload.new);
                    }
                }).subscribe();
            }
        });
    };

    window.handleOrderAction = async function(actionType, orderId) {
        window.showLoader();
        try {
            const { data: orderData } = await supabaseClient.from('orders').select('customer_id, customer:customer_id(full_name)').eq('id', orderId).single();
            const customerId = orderData ? orderData.customer_id : null;

            if (actionType === 'accept') {
                const { error } = await supabaseClient.from('orders').update({ status: 'accepted' }).eq('id', orderId);
                if (error) throw error;
                
                window.playSound('success'); 
                window.showToast('تم قبول الطلب! توجه للتنفيذ الآن.'); 
                window.loadBarberOrders(); 
                
                if(customerId && typeof window.sendAppNotification === 'function') {
                    window.sendAppNotification(customerId, "تم قبول طلبك! 🎉", "الكابتن وافق على الطلب وهو الآن في الطريق إليك.", "https://barberhome.pages.dev/pages/customer.html", "order");
                }
            } else if (actionType === 'ignore') {
                if(confirm('هل تود إلغاء هذا الطلب؟')) {
                    const { error } = await supabaseClient.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
                    if (error) throw error;
                    
                    window.playSound('error'); 
                    window.showToast('تم إلغاء الطلب.'); 
                    window.loadBarberOrders(); 
                    
                    if(customerId && typeof window.sendAppNotification === 'function') {
                        window.sendAppNotification(customerId, "عذراً، تم إلغاء الطلب ❌", "الكابتن غير متاح حالياً، يرجى اختيار كابتن آخر.", "https://barberhome.pages.dev/pages/customer.html", "order");
                    }
                }
            } else if (actionType === 'complete') {
                const { error: updateErr } = await supabaseClient.from('orders').update({ status: 'completed' }).eq('id', orderId);
                
                if (updateErr) {
                    console.error("Complete Order Error:", updateErr);
                    throw new Error("لا تملك صلاحية لإنهاء هذا الطلب أو حدث خطأ في النظام.");
                }

                const actionBtn = document.querySelector(`button[onclick="handleOrderAction('complete', '${orderId}')"]`);
                if(actionBtn) {
                    const card = actionBtn.closest('.bg-white');
                    if (card) card.remove();
                }

                window.playSound('success'); 
                window.showToast('تم إنهاء الخدمة بنجاح! السجل تم تحديثه.'); 
                window.loadBarberOrders(); 
                window.loadBarberProfileAndFinances(); 
                window.loadBarberOwedBalances();
                
                if(customerId && typeof window.sendAppNotification === 'function') {
                    window.sendAppNotification(customerId, "نعيماً! ✂️", "تم إنهاء الخدمة بنجاح. لا تنسَ تقييم الكابتن ومراجعة الفاتورة.", "https://barberhome.pages.dev/pages/customer.html", "order");
                }
            }
        } catch (err) {
            window.playSound('error');
            window.showToast(err.message || 'حدث خطأ غير متوقع. يرجى مراجعة الصلاحيات.');
        } finally {
            window.hideLoader();
        }
    };

    window.loadBarberHistory = async function(filterType = 'all') {
        document.querySelectorAll('.filter-btn').forEach(btn => { btn.classList.remove('bg-gray-900', 'text-white'); btn.classList.add('bg-white', 'text-gray-500'); });
        const activeBtn = document.getElementById(`filter-${filterType}`);
        if(activeBtn) { activeBtn.classList.add('bg-gray-900', 'text-white'); activeBtn.classList.remove('bg-white', 'text-gray-500'); }

        let query = supabaseClient.from('orders').select(`id, created_at, final_total, booking_type, status, services_text, customer:customer_id(full_name)`).eq('barber_id', state.barberId).in('status', ['completed', 'cancelled']).order('created_at', { ascending: false });
        if(filterType !== 'all') query = query.eq('booking_type', filterType);
        
        const { data: historyOrders } = await query;
        const container = document.getElementById('barber-history-container'); container.innerHTML = '';

        if (!historyOrders || historyOrders.length === 0) { container.innerHTML = `<div class="text-center p-8 bg-gray-50 rounded-2xl border border-gray-100 border-dashed"><i class="fa-solid fa-folder-open text-3xl text-gray-300 mb-2 block"></i><p class="text-gray-500 font-bold text-xs">لا توجد عمليات مسجلة في هذا القسم.</p></div>`; return; }

        historyOrders.forEach(order => {
            const isCompleted = order.status === 'completed'; const isSalon = order.booking_type === 'salon';
            const statusBadge = isCompleted ? `<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[9px] font-bold"><i class="fa-solid fa-check ml-1"></i>مكتمل</span>` : `<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[9px] font-bold"><i class="fa-solid fa-xmark ml-1"></i>ملغي</span>`;
            const typeIcon = isSalon ? `<i class="fa-solid fa-shop text-purple-500 ml-2" title="صالون"></i>` : `<i class="fa-solid fa-house text-blue-500 ml-2" title="منزلي"></i>`;
            const orderDate = new Date(order.created_at); const dateStr = orderDate.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }); const timeStr = orderDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

            container.innerHTML += `<div class="p-4 border border-gray-100 rounded-2xl bg-white shadow-sm flex justify-between items-center transition hover:shadow-md mb-3"><div class="flex items-center"><div class="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100 shrink-0">${typeIcon}</div><div class="mr-3"><div class="flex items-center gap-2"><h4 class="font-bold text-gray-900 text-sm truncate max-w-[120px]">${window.escapeHTML(order.customer?.full_name || 'عميل')}</h4>${statusBadge}</div><p class="text-[10px] text-gray-500 font-bold mt-1 truncate max-w-[150px]"><i class="fa-solid fa-scissors ml-1 text-gray-300"></i>${window.escapeHTML(order.services_text)}</p></div></div><div class="text-left shrink-0"><p class="text-sm font-black text-gray-900">${order.final_total} <span class="text-[9px] text-gray-500 font-bold">ج.م</span></p><p class="text-[9px] text-gray-400 font-bold mt-1">${dateStr} - ${timeStr}</p></div></div>`;
        });
    };

    // ==========================================
    // 🖼️ 8. إدارة الصور ومعرض الأعمال (تمت إضافة ضغط الصور وتحديد العدد لحماية السيرفر) 🗜️
    // ==========================================
    window.loadPortfolioImages = async function() {
        const { data: works } = await supabaseClient.from('barber_works').select('*').eq('barber_id', state.barberId).order('created_at', { ascending: false });
        const gallery = document.getElementById('portfolio-gallery'); 
        if (!gallery) return; 
        
        gallery.innerHTML = '';
        if (works && works.length > 0) { 
            works.forEach(work => { 
                gallery.innerHTML += `<div class="relative rounded-2xl overflow-hidden aspect-square group shadow-sm border border-gray-100"><img src="${work.image_url}" class="w-full h-full object-cover"><button onclick="deletePortfolioImage('${work.id}', '${work.image_url}')" class="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full text-[10px] opacity-0 group-hover:opacity-100 transition shadow hover:bg-red-600 flex items-center justify-center active:scale-90"><i class="fa-solid fa-trash"></i></button></div>`; 
            }); 
        } else {
            gallery.innerHTML = '<div class="col-span-3 text-center p-6 text-xs text-gray-400 font-bold bg-gray-50 rounded-2xl border border-dashed"><i class="fa-regular fa-images text-3xl mb-2 block"></i>لا توجد صور في معرضك.</div>';
        }
    };

    window.uploadPortfolioImage = async function(input) {
        if (!input.files || input.files.length === 0) return; 
        
        window.showLoader(); 
        
        // 1. التحقق من الحد الأقصى للصور (6 صور)
        const { count } = await supabaseClient.from('barber_works')
            .select('*', { count: 'exact', head: true })
            .eq('barber_id', state.barberId);
            
        if (count >= 6) {
            window.hideLoader();
            window.playSound('error');
            input.value = '';
            return window.showToast('عفواً، الحد الأقصى لمعرض الأعمال هو 6 صور. يرجى حذف صورة قديمة أولاً 🛑');
        }

        const file = input.files[0]; 
        
        // 2. ضغط الصورة (Client-Side Compression)
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = async function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // تحديد أقصى عرض وطول لتصغير الحجم مع الحفاظ على الأبعاد
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
                } else {
                    if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // تحويل الكانفاس لصورة مضغوطة (JPEG بجودة 70%)
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                
                // تحويل الـ DataUrl لـ Blob تمهيداً لرفعه لـ Supabase
                const res = await fetch(dataUrl);
                const compressedBlob = await res.blob();
                
                // 3. رفع الصورة المضغوطة
                const fileName = `${state.barberId}_${Date.now()}.jpg`;
                const { error: uploadError } = await supabaseClient.storage.from('barber_works').upload(fileName, compressedBlob, { contentType: 'image/jpeg' }); 
                
                if (uploadError) { 
                    window.hideLoader(); 
                    window.playSound('error'); 
                    return window.showToast('حدث خطأ أثناء رفع الصورة'); 
                }
                
                const { data: { publicUrl } } = supabaseClient.storage.from('barber_works').getPublicUrl(fileName); 
                const { error: dbError } = await supabaseClient.from('barber_works').insert([{ barber_id: state.barberId, image_url: publicUrl }]); 
                
                window.hideLoader();
                if (!dbError) { 
                    window.playSound('success'); 
                    window.showToast('تمت الإضافة لمعرض أعمالك بنجاح ✅'); 
                    window.loadPortfolioImages(); 
                } else { 
                    window.playSound('error'); 
                    window.showToast('حدث خطأ أثناء الحفظ.'); 
                } 
                input.value = ''; 
            };
        };
    };

    window.deletePortfolioImage = async function(id, imageUrl) {
        if (!confirm('تأكيد حذف الصورة من المعرض؟')) return; 
        window.showLoader(100, null); 
        const fileName = imageUrl.split('/').pop();
        await supabaseClient.storage.from('barber_works').remove([fileName]); 
        await supabaseClient.from('barber_works').delete().eq('id', id);
        window.hideLoader(); 
        window.showToast('تم حذف الصورة بنجاح'); 
        window.loadPortfolioImages();
    };

    // ==========================================
    // 💳 9. إدارة السحوبات والماليات
    // ==========================================
    window.toggleWithdrawFields = function() { 
        const method = document.querySelector('input[name="withdraw_method"]:checked').value; 
        document.getElementById('withdraw-visa-fields').classList.add('hidden'); 
        document.getElementById('withdraw-instapay-fields').classList.add('hidden'); 
        if (method === 'visa') document.getElementById('withdraw-visa-fields').classList.remove('hidden'); 
        if (method === 'instapay') document.getElementById('withdraw-instapay-fields').classList.remove('hidden'); 
    };

    window.confirmWithdraw = async function() {
        const amount = Math.max(0, Number(document.getElementById('available-balance').innerText) || 0); if (amount <= 0) return window.showToast('رصيدك لا يسمح بسحب حالياً');
        const method = document.querySelector('input[name="withdraw_method"]:checked').value; let details = (method === 'visa') ? `Visa: ${document.getElementById('withdraw-visa-name').value} - ${document.getElementById('withdraw-visa-card').value}` : document.getElementById('withdraw-instapay-address').value;
        if(!details || details.includes('undefined') || details === 'Visa:  - ') { window.playSound('error'); return window.showToast('يرجى إكمال بيانات السحب بشكل صحيح'); }
        window.showLoader(); const { data: existing } = await supabaseClient.from('payout_requests').select('id').eq('barber_id', state.barberId).eq('status', 'pending');
        if (existing && existing.length > 0) { window.hideLoader(); if(typeof window.closeModal === 'function') window.closeModal('withdraw-modal'); window.playSound('error'); return window.showToast('لديك طلب سحب قيد المراجعة بالفعل!'); }
        const { error } = await supabaseClient.from('payout_requests').insert([{ barber_id: state.barberId, amount: amount, method: method, account_details: details }]); window.hideLoader();
        if (!error) { await supabaseClient.from('barber_finances').update({ available_balance: 0 }).eq('barber_id', state.barberId); window.playSound('success'); window.loadBarberProfileAndFinances(); if(typeof window.closeModal === 'function') window.closeModal('withdraw-modal'); window.showToast('تم إرسال طلب السحب بنجاح ✅'); } else { window.playSound('error'); window.showToast('حدث خطأ أثناء إرسال الطلب'); }
    };

    window.handleBarberAction = function(actionType) { 
        if(actionType === 'pay') { 
            const currentDebt = Math.max(0, Number(document.getElementById('platform-debt').innerText) || 0); 
            if(currentDebt <= 0) { window.playSound('error'); return window.showToast('ليس عليك مديونية حالياً ✅'); } 
            document.getElementById('modal-debt-amount').innerText = `${currentDebt} ج.م`; 
            if(typeof window.openModal === 'function') window.openModal('pay-debt-modal'); 
        } 
    };

    window.copyAdminInstapay = function() { 
        const copyText = document.getElementById("admin-instapay-address"); 
        copyText.select(); document.execCommand("copy"); 
        window.playSound('success'); window.showToast("تم نسخ عنوان انستاباي"); 
    };

    window.notifyAdminDebtPaid = async function() {
        window.showLoader(); 
        const { error } = await supabaseClient.from('barber_finances').update({ debt_payment_pending: true }).eq('barber_id', state.barberId); 
        window.hideLoader();
        if(!error) { window.playSound('success'); if(typeof window.closeModal === 'function') window.closeModal('pay-debt-modal'); window.showToast("تم إرسال الإشعار للإدارة بنجاح"); window.loadBarberProfileAndFinances(); } else { window.playSound('error'); window.showToast("حدث خطأ أثناء الإرسال"); }
    };

    // التحديث عند العودة للصفحة
    document.addEventListener('visibilitychange', () => { 
        if (document.visibilityState === 'visible') { 
            if (typeof window.loadBarberOrders === 'function') window.loadBarberOrders(); 
            if (typeof window.loadBarberProfileAndFinances === 'function') window.loadBarberProfileAndFinances(); 
        } 
    });

})();