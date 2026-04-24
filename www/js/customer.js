// اسم الملف: customer.js
// المسار: js/customer.js
// الوظيفة: لوحة العميل (النسخة المتكاملة 🛡️ + إغلاق الصالون + الـ VIP + الاستكشاف 🧭 + أكواد الخصم + التحقق الإجباري لجوجل)

(() => {
    // ==========================================
    // 📦 1. إدارة الحالة (State Management)
    // ==========================================
    let baseTotal = 0;
    let peopleCount = 1;
    let currentTransportFee = 0; 
    let currentBookingType = 'home'; 
    let selectedServicesNames = []; 
    let selectedServicesIds = []; 
    let currentActiveOrderId = null; 
    let selectedRatingStars = 5; 
    let userLat = null;
    let userLng = null;
    let allSalons = [];
    let allBarbers = []; 
    let currentChatOrderId = null; 
    let activeChatSubs = {}; 
    let activeTrackingSub = null; 
    let isEligibleForFreeCut = false;
    let appliedPromo = null; 
    let exploreTarget = null;

    // ==========================================
    // 🛡️ 2. دوال الحماية والمساعدة المدمجة
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

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    window.playSound = function(type) {
        if(audioCtx.state === 'suspended') audioCtx.resume();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        if (type === 'click') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(600, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
            oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.1);
        } else if (type === 'success') {
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); 
            oscillator.frequency.setValueAtTime(554.37, audioCtx.currentTime + 0.1); 
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
            oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.3);
        } else if (type === 'error') {
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
            oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.3);
        } else if (type === 'new') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
            oscillator.start(); oscillator.stop(audioCtx.currentTime + 0.2);
        }
    };

    document.addEventListener('click', (e) => {
        if(e.target.closest('button, label.cursor-pointer, .nav-item, .floating-card')) {
            window.playSound('click');
        }
    });

    // ==========================================
    // 🚀 3. التهيئة وبدء التشغيل (معالجة الدخول بجوجل)
    // ==========================================
    document.addEventListener('DOMContentLoaded', async () => {
        window.showLoader();

        if (typeof supabaseClient === 'undefined') return;

        const { data: { user } } = await supabaseClient.auth.getUser();
        
        if (user) {
            const { data: profile, error } = await supabaseClient.from('profiles').select('full_name, phone, role').eq('id', user.id).maybeSingle();
            
            // 1. التحقق من اكتمال البيانات (لو مسجل بجوجل ومفيش رقم)
            if (error || !profile || !profile.phone || profile.phone.trim() === '') {
                window.hideLoader();
                const modal = document.getElementById('complete-profile-modal');
                if (modal) {
                    modal.classList.remove('hidden');
                    modal.classList.add('flex');
                }
            } else {
                // 2. البيانات كاملة -> نشغل التطبيق
                const firstName = profile.full_name ? profile.full_name.split(' ')[0] : 'عميلنا';
                const welcomeMsg = document.getElementById('welcome-msg');
                if(welcomeMsg) welcomeMsg.innerText = `أهلاً بك يا ${firstName} 👋`;

                // التحقق من تفعيل ميزة الصالونات
                const { data: appSettings } = await supabaseClient.from('app_settings').select('is_salon_booking_active').eq('id', 1).maybeSingle();
                
                if (appSettings && appSettings.is_salon_booking_active === false) {
                    const salonLabel = document.getElementById('salon-booking-label');
                    const salonRadio = document.getElementById('salon-booking-radio');
                    const salonCard = document.getElementById('salon-booking-card');
                    const salonBadge = document.getElementById('salon-booking-badge');
                    
                    if(salonRadio) salonRadio.disabled = true;
                    if(salonLabel) {
                        salonLabel.classList.remove('cursor-pointer', 'active:scale-[0.98]');
                        salonLabel.classList.add('cursor-not-allowed', 'opacity-60');
                        salonLabel.style.pointerEvents = 'none'; 
                    }
                    if(salonCard) {
                        salonCard.classList.remove('hover:shadow-md');
                        salonCard.classList.add('bg-gray-50');
                    }
                    if(salonBadge) {
                        salonBadge.innerText = 'قريباً 🚀';
                        salonBadge.className = 'absolute top-0 right-0 bg-amber-500 text-gray-900 text-[10px] px-3 py-1.5 rounded-bl-2xl rounded-tr-[1.8rem] font-black shadow-sm border-b border-l border-amber-600';
                    }
                }

                injectChatModal(); 
                loadLoyaltyProgress();
                await loadPlatformServices();
                checkActiveOrders(); 
                setupStarsInteraction(); 
                autoFetchLocation(); 
                
                window.hideLoader();
            }
        } else {
            window.location.replace('../index.html');
        }
    });

    window.saveMissingProfileData = async function() {
        let phone = document.getElementById('complete-phone').value.trim();
        phone = phone.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');

        if (phone.length < 10) {
            if(typeof window.playSound === 'function') window.playSound('error');
            return window.showToast('يرجى إدخال رقم هاتف صحيح!');
        }

        window.showLoader();
        const { data: { user } } = await supabaseClient.auth.getUser();

        const { error } = await supabaseClient.from('profiles').upsert([{
            id: user.id,
            phone: phone,
            role: 'customer',
            status: 'active',
            full_name: user.user_metadata?.full_name || 'عميل مميز'
        }], { onConflict: 'id' });

        if (error) {
            window.hideLoader();
            if(typeof window.playSound === 'function') window.playSound('error');
            if (error.message.includes('unique') || error.message.includes('duplicate')) {
                window.showToast('رقم الهاتف هذا مسجل بحساب آخر بالفعل!');
            } else {
                window.showToast('حدث خطأ أثناء الحفظ. يرجى المحاولة لاحقاً.');
            }
        } else {
            window.hideLoader();
            if(typeof window.playSound === 'function') window.playSound('success');
            window.showToast('تم استكمال البيانات بنجاح! 🎉');
            
            const modal = document.getElementById('complete-profile-modal');
            if (modal) {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }
            
            setTimeout(() => {
                window.location.reload();
            }, 1000);
        }
    };

    // ==========================================
    // 🌍 4. نظام الاستكشاف (Explore Feed)
    // ==========================================
    window.loadExploreFeed = async function() {
        const container = document.getElementById('explore-feed-container');
        if(!container) return;

        if (container.innerHTML.trim() !== '') return;

        container.innerHTML = `<div class="col-span-2 text-center py-10"><i class="fa-solid fa-spinner fa-spin text-amber-500 text-3xl"></i></div>`;

        try {
            const [barberWorksRes, salonWorksRes] = await Promise.all([
                supabaseClient.from('barber_works').select('*, barber:barber_id(full_name, portfolio_url)').order('created_at', { ascending: false }).limit(20),
                supabaseClient.from('salon_works').select('*, salon:salon_id(name, main_image)').order('created_at', { ascending: false }).limit(20)
            ]);

            let allWorks = [];

            if (barberWorksRes.data) {
                barberWorksRes.data.forEach(w => {
                    if(w.barber) allWorks.push({ type: 'home', id: w.barber_id, image: w.image_url, name: w.barber.full_name, avatar: w.barber.portfolio_url, time: new Date(w.created_at) });
                });
            }

            if (salonWorksRes.data) {
                salonWorksRes.data.forEach(w => {
                    if(w.salon) allWorks.push({ type: 'salon', id: w.salon_id, image: w.image_url, name: w.salon.name, avatar: w.salon.main_image, time: new Date(w.created_at) });
                });
            }

            allWorks.sort((a, b) => b.time - a.time);

            container.innerHTML = '';

            if (allWorks.length === 0) {
                container.innerHTML = `<div class="col-span-2 text-center py-10 text-gray-400 font-bold"><i class="fa-solid fa-camera text-4xl mb-3 block"></i>لا توجد صور متاحة بعد.</div>`;
                return;
            }

            allWorks.forEach(work => {
                const safeName = window.escapeHTML(work.name);
                const safeAvatar = window.escapeHTML(work.avatar) || `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=111827&color=fff`;
                const typeText = work.type === 'salon' ? 'صالون' : 'كابتن';
                const typeIcon = work.type === 'salon' ? '<i class="fa-solid fa-shop"></i>' : '<i class="fa-solid fa-motorcycle"></i>';

                container.innerHTML += `
                    <div class="relative rounded-3xl overflow-hidden mb-4 group shadow-sm border border-gray-100 break-inside-avoid transform transition-all hover:scale-[1.02] hover:shadow-lg bg-gray-900">
                        <img src="${window.escapeHTML(work.image)}" class="w-full h-auto object-cover opacity-90 group-hover:opacity-100 transition-opacity" loading="lazy">
                        
                        <div class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                            <div class="flex items-center gap-2 mb-3">
                                <img src="${safeAvatar}" class="w-8 h-8 rounded-full border border-gray-500 object-cover shadow-sm">
                                <div>
                                    <p class="text-white text-xs font-black leading-tight drop-shadow-md">${safeName}</p>
                                    <p class="text-amber-400 text-[9px] font-bold flex items-center gap-1">${typeIcon} ${typeText}</p>
                                </div>
                            </div>
                            <button onclick="bookFromExplore('${work.type}', '${work.id}', '${safeName}')" class="w-full bg-amber-500 text-gray-900 py-2.5 rounded-xl text-xs font-black shadow-lg hover:bg-amber-400 active:scale-95 transition-transform flex items-center justify-center gap-1.5">
                                احجز هذا الستايل <i class="fa-solid fa-arrow-left"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

        } catch (e) {
            console.error("Explore Error:", e);
            container.innerHTML = '<p class="col-span-2 text-center text-red-500 text-xs font-bold p-4">حدث خطأ أثناء جلب الصور.</p>';
        }
    };

    window.bookFromExplore = function(targetType, targetId, targetName) {
        window.playSound('click');
        
        exploreTarget = { type: targetType, id: targetId };

        const typeRadio = document.querySelector(`input[name="booking_type"][value="${targetType}"]`);
        if (typeRadio && !typeRadio.disabled) {
            typeRadio.checked = true;
            window.updateBookingType();
        } else if (typeRadio && typeRadio.disabled) {
            return window.showToast('عفواً، هذا الحجز غير متاح حالياً.');
        }

        window.switchCustomerView('customer-home');
        window.showToast(`اختر خدماتك الآن للحجز مع ${targetName} ✨`);
    };

    // ==========================================
    // 💬 5. نظام المحادثة اللحظية (Chat)
    // ==========================================
    function injectChatModal() {
        if(document.getElementById('chat-modal')) return;
        const html = `
        <div id="chat-modal" class="fixed inset-0 bg-gray-900/60 z-[8000] hidden items-center justify-center backdrop-blur-sm transition-opacity duration-300 p-4">
            <div id="chat-content-box" class="bg-[#ece5dd] w-full max-w-md h-[80vh] max-h-[650px] rounded-[2rem] flex flex-col shadow-2xl transform transition-all scale-90 opacity-0 duration-300 overflow-hidden border border-gray-200">
                <div class="p-4 border-b border-gray-200 flex justify-between items-center bg-white shrink-0 shadow-sm z-10">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center text-lg shadow-inner border border-amber-100">
                            <i class="fa-solid fa-user-tie"></i>
                        </div>
                        <div>
                            <h3 class="font-black text-gray-900 text-sm leading-tight">محادثة الكابتن</h3>
                            <p class="text-[10px] text-green-600 font-bold flex items-center gap-1.5 mt-0.5">
                                <span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shadow-[0_0_5px_#22c55e]"></span> اتصال آمن ومشفر
                            </p>
                        </div>
                    </div>
                    <button onclick="closeChat()" class="w-8 h-8 bg-gray-50 rounded-full flex items-center justify-center text-gray-500 hover:bg-red-50 hover:text-red-500 transition active:scale-90"><i class="fa-solid fa-xmark text-sm"></i></button>
                </div>
                <div id="chat-messages" class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar flex flex-col relative bg-[#ece5dd]"></div>
                <div class="p-3 bg-white border-t border-gray-200 shrink-0 flex gap-2 z-10 shadow-[0_-5px_15px_rgba(0,0,0,0.03)]">
                    <input type="text" id="chat-input" placeholder="اكتب رسالتك للكابتن..." class="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 transition-all" onkeypress="if(event.key === 'Enter') sendChatMessage()">
                    <button onclick="sendChatMessage()" id="send-chat-btn" class="w-12 h-12 bg-gray-900 text-amber-500 rounded-xl flex items-center justify-center hover:bg-black transition-all shadow-sm active:scale-95 text-lg disabled:opacity-50"><i class="fa-solid fa-paper-plane"></i></button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    }

    window.openChat = async function(orderId) {
        currentChatOrderId = orderId;
        const modal = document.getElementById('chat-modal');
        const box = document.getElementById('chat-content-box');
        
        const chatBtn = document.getElementById(`chat-btn-${orderId}`);
        if(chatBtn) chatBtn.querySelectorAll('.animate-ping, .bg-red-500').forEach(el => el.remove());

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        setTimeout(() => { 
            box.classList.remove('scale-90', 'opacity-0'); 
            box.classList.add('scale-100', 'opacity-100'); 
        }, 10);
        
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
            currentChatOrderId = null;
        }, 300);
    };

    async function loadChatMessages() {
        const container = document.getElementById('chat-messages');
        container.innerHTML = '<div class="text-center text-gray-500 text-xs font-bold my-auto flex flex-col items-center justify-center h-full"><i class="fa-solid fa-circle-notch fa-spin mb-3 text-2xl text-amber-500"></i>جاري تحميل المحادثة...</div>';
        
        const { data, error } = await supabaseClient.from('chat_messages').select('*').eq('order_id', currentChatOrderId).order('created_at', { ascending: true });
        container.innerHTML = '';
        
        if(error || !data || data.length === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-500 text-[10px] font-bold my-4 bg-yellow-50/80 p-2.5 rounded-xl border border-yellow-200/50 mx-auto w-max shadow-sm backdrop-blur-sm">
                    <i class="fa-solid fa-lock text-amber-500 ml-1"></i> المحادثة مشفرة بالكامل.
                </div>`;
            return;
        }
        data.forEach(msg => appendMessage(msg));
    }

    function appendMessage(msg) {
        const container = document.getElementById('chat-messages');
        supabaseClient.auth.getUser().then(({data: {user}}) => {
            const isMe = msg.sender_id === user.id;
            const time = new Date(msg.created_at).toLocaleTimeString('ar-EG', {hour:'2-digit', minute:'2-digit'});
            
            const html = `
            <div class="flex ${isMe ? 'justify-end' : 'justify-start'} animate-[fadeIn_0.2s_ease-out] mb-1">
                <div class="max-w-[80%] ${isMe ? 'bg-amber-500 text-gray-900 rounded-tr-[1.5rem] rounded-tl-[1.5rem] rounded-bl-[1.5rem] rounded-br-sm' : 'bg-white text-gray-800 border border-gray-200 rounded-tr-[1.5rem] rounded-tl-[1.5rem] rounded-br-[1.5rem] rounded-bl-sm'} p-3 shadow-sm relative group">
                    <p class="text-xs font-bold leading-relaxed break-words">${window.escapeHTML(msg.message)}</p>
                    <p class="text-[8px] mt-1 ${isMe ? 'text-gray-900/60' : 'text-gray-400'} font-black flex items-center justify-end gap-1">
                        ${time} ${isMe ? '<i class="fa-solid fa-check-double text-[10px]"></i>' : ''}
                    </p>
                </div>
            </div>`;
            
            const noMsg = container.querySelector('.fa-circle-notch') || container.querySelector('.fa-lock');
            if(noMsg) noMsg.parentElement.remove();
            
            container.insertAdjacentHTML('beforeend', html);
            container.scrollTop = container.scrollHeight;
            if(!isMe && currentChatOrderId === msg.order_id) window.playSound('new');
        });
    }

    window.sendChatMessage = async function() {
        const input = document.getElementById('chat-input');
        const btn = document.getElementById('send-chat-btn');
        let text = input.value.trim();
        if(!text || !currentChatOrderId) return;
        
        const phoneRegex = /(\d[\s\-._]*){8,}/g;
        if (phoneRegex.test(text)) {
            text = text.replace(phoneRegex, ' [رقم مخفي 🚫] ');
            window.showToast('عفواً، يمنع إرسال الأرقام في المحادثة حفاظاً على الخصوصية.');
        }
        
        input.value = '';
        btn.disabled = true;
        
        try {
            const { data: {user} } = await supabaseClient.auth.getUser();
            
            await supabaseClient.from('chat_messages').insert([{
                order_id: currentChatOrderId,
                sender_id: user.id,
                message: text
            }]);

            const { data: orderData } = await supabaseClient.from('orders').select('barber_id, customer:customer_id(full_name)').eq('id', currentChatOrderId).single();
            if(orderData && orderData.barber_id) {
                const customerName = orderData.customer ? orderData.customer.full_name : 'العميل';
                if(typeof window.sendAppNotification === 'function') {
                    window.sendAppNotification(
                        orderData.barber_id, 
                        `رسالة جديدة من ${customerName} 💬`, 
                        text, 
                        `https://barberhome.pages.dev/pages/barber.html`, 
                        "chat"
                    );
                }
            }
        } catch(e) {
            window.showToast("حدث خطأ في إرسال الرسالة.");
        } finally {
            btn.disabled = false;
            input.focus();
        }
    };

    // ==========================================
    // 📡 6. التتبع الحي وتفاصيل الحجز المباشر
    // ==========================================
    async function checkActiveOrders() {
        const { data: { user } } = await supabaseClient.auth.getUser(); if (!user) return;
        const { data: activeOrder } = await supabaseClient.from('orders').select('*').eq('customer_id', user.id).in('status', ['pending', 'accepted', 'completed']).order('created_at', { ascending: false }).limit(1).maybeSingle();
        
        if (activeOrder) {
            if (activeOrder.status === 'completed' && activeOrder.payment_method === 'instapay' && activeOrder.payment_status === 'unpaid') {
                startLiveTracking(activeOrder.id); handleOrderUpdate(activeOrder);
            } else if (activeOrder.status !== 'completed') {
                document.getElementById('active-tracking-shortcut')?.classList.remove('hidden'); 
                document.getElementById('active-tracking-shortcut')?.classList.add('flex');
                startLiveTracking(activeOrder.id);
            } else { resetTrackingUI(); }
        } else { resetTrackingUI(); }
    }

    function resetTrackingUI() {
        const title = document.getElementById('tracking-title'); const bar = document.getElementById('tracking-bar'); const cancelBtn = document.getElementById('cancel-order-btn'); const icon = document.getElementById('tracking-icon');
        const detailsContainer = document.getElementById('tracking-order-details');
        
        if (title) title.innerText = "لا يوجد طلب نشط حالياً"; 
        if (icon) icon.className = "fa-solid fa-magnifying-glass text-4xl text-gray-300 mb-4 transition-all duration-300";
        if (bar) bar.style.width = '0%'; 
        if (cancelBtn) cancelBtn.classList.add('hidden'); 
        if (detailsContainer) detailsContainer.classList.add('hidden');
        const phoneEl = document.getElementById('tracking-barber-phone'); if(phoneEl) phoneEl.classList.add('hidden');
    }

    function startLiveTracking(orderId) {
        currentActiveOrderId = orderId; 
        loadOrderDetailsForTracking(orderId);
        
        if(activeTrackingSub) {
            supabaseClient.removeChannel(activeTrackingSub);
        }
        
        activeTrackingSub = supabaseClient.channel(`tracking-${orderId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, payload => { 
            loadOrderDetailsForTracking(orderId); 
        }).subscribe();

        if (!activeChatSubs[orderId]) {
            activeChatSubs[orderId] = supabaseClient.channel(`chat-listener-${orderId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `order_id=eq.${orderId}` }, payload => {
                const modal = document.getElementById('chat-modal');
                if ((modal && modal.classList.contains('hidden')) || currentChatOrderId !== orderId) {
                    const chatBtn = document.getElementById(`chat-btn-${orderId}`);
                    if(chatBtn && !chatBtn.querySelector('.animate-ping')) {
                        chatBtn.innerHTML += `<span class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span><span class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>`;
                    }
                    window.playSound('new');
                    window.showToast('رسالة جديدة من الكابتن 💬');
                } else if (currentChatOrderId === orderId) {
                    appendMessage(payload.new);
                }
            }).subscribe();
        }
    }

    async function loadOrderDetailsForTracking(orderId) {
        try {
            const { data: order, error } = await supabaseClient.from('orders')
                .select('*, barber:barber_id(phone), salon:salon_id(name, lat, lng, address)')
                .eq('id', orderId)
                .single();
            
            if (error) return console.error("خطأ في جلب تفاصيل التتبع:", error);
            if (order) handleOrderUpdate(order);
        } catch(e) { console.error(e); }
    }

    function handleOrderUpdate(order) {
        const status = order.status; const bar = document.getElementById('tracking-bar'); 
        const title = document.getElementById('tracking-title'); const cancelBtn = document.getElementById('cancel-order-btn');
        const phoneEl = document.getElementById('tracking-barber-phone');
        const icon = document.getElementById('tracking-icon');
        
        let detailsContainer = document.getElementById('tracking-order-details');
        if(!detailsContainer) {
            detailsContainer = document.createElement('div');
            detailsContainer.id = 'tracking-order-details';
            detailsContainer.className = 'bg-gray-50 border border-gray-100 rounded-2xl p-4 mt-4 mb-4 text-sm shadow-inner hidden';
            const iconDiv = document.getElementById('tracking-icon')?.parentElement;
            if(iconDiv) iconDiv.parentElement.insertAdjacentElement('afterend', detailsContainer);
        }

        if (order && detailsContainer) {
            detailsContainer.innerHTML = `
                <div class="flex justify-between items-center mb-2 pb-2 border-b border-gray-200">
                    <span class="text-[11px] text-gray-500 font-bold"><i class="fa-regular fa-clock ml-1"></i>الموعد:</span>
                    <span class="text-xs font-black text-gray-900" dir="ltr">${window.escapeHTML(order.booking_date)} | ${window.escapeHTML(order.booking_time)}</span>
                </div>
                <div class="flex justify-between items-start mb-2 pb-2 border-b border-gray-200">
                    <span class="text-[11px] text-gray-500 font-bold"><i class="fa-solid fa-scissors ml-1"></i>الخدمات:</span>
                    <span class="text-[10px] font-bold text-gray-900 text-left max-w-[65%] leading-relaxed">${window.escapeHTML(order.services_text)}</span>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-[11px] text-gray-500 font-bold"><i class="fa-solid fa-money-bill-wave ml-1"></i>الإجمالي:</span>
                    <span class="text-sm font-black text-amber-500">${order.final_total} ج.م <span class="text-[9px] text-gray-400 font-normal">(${order.payment_method === 'cash' ? 'كاش' : 'انستاباي'})</span></span>
                </div>
            `;
            detailsContainer.classList.remove('hidden');
        }

        document.querySelectorAll('[id^="step-"]').forEach(el => { el.classList.remove('text-gray-900'); el.classList.add('text-gray-400'); });
        if(phoneEl) phoneEl.classList.add('hidden');

        if (status === 'pending') {
            if(bar) { bar.style.width = '25%'; bar.className = 'h-full bg-amber-500 transition-all duration-1000 rounded-full relative'; }
            if(title) title.innerText = 'بانتظار موافقة الكابتن/الصالون...';
            if(icon) icon.className = "fa-solid fa-spinner fa-spin text-4xl text-amber-500 mb-4";
            document.getElementById('step-1')?.classList.add('text-gray-900'); 
            cancelBtn?.classList.remove('hidden'); 

        } else if (status === 'accepted') {
            if(bar) { bar.style.width = '50%'; bar.className = 'h-full bg-blue-500 transition-all duration-1000 rounded-full relative'; }
            document.getElementById('step-1')?.classList.add('text-gray-900'); document.getElementById('step-2')?.classList.add('text-gray-900');
            cancelBtn?.classList.remove('hidden'); 
            
            if (order.booking_type === 'salon') {
                if(title) title.innerText = 'تم تأكيد الموعد بالصالون';
                if(icon) icon.className = "fa-solid fa-shop text-4xl text-blue-500 mb-4 animate-bounce";
                
                if (order.salon && order.salon.lat && order.salon.lng && phoneEl) {
                    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=...?daddr=$${order.salon.lat},${order.salon.lng}`;
                    phoneEl.innerHTML = `<a href="${mapsUrl}" target="_blank" class="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-3 text-sm hover:bg-black transition shadow-md mx-auto w-max active:scale-95"><i class="fa-solid fa-location-arrow text-amber-500"></i> مسار الخريطة للصالون</a>`;
                    phoneEl.classList.remove('hidden'); phoneEl.classList.add('flex');
                }
            } else {
                if(title) title.innerText = 'الكابتن وافق على طلبك';
                if(icon) icon.className = "fa-solid fa-motorcycle text-4xl text-blue-500 mb-4 animate-bounce";
                
                if(order.barber && order.barber.phone && phoneEl) {
                    let callBtnHtml = `<a href="tel:${window.escapeHTML(order.barber.phone)}" class="flex-1 bg-gray-900 text-white px-4 py-3.5 rounded-xl font-black flex items-center justify-center gap-2 text-xs hover:bg-black transition shadow-md active:scale-95"><i class="fa-solid fa-phone text-amber-500"></i> اتصال</a>`;
                    let chatBtnHtml = `<button id="chat-btn-${order.id}" onclick="openChat('${order.id}')" class="flex-1 bg-blue-50 text-blue-600 border border-blue-100 px-4 py-3.5 rounded-xl font-black flex items-center justify-center gap-2 text-xs hover:bg-blue-100 transition shadow-sm active:scale-95 relative"><i class="fa-solid fa-comment-dots text-lg"></i> محادثة الكابتن</button>`;
                    
                    phoneEl.innerHTML = `<div class="flex gap-3 justify-center w-full max-w-[280px] mx-auto mt-2">${chatBtnHtml} ${callBtnHtml}</div>`;
                    phoneEl.classList.remove('hidden'); phoneEl.classList.add('flex');
                }
            }
        } else if (status === 'completed') {
            if(bar) { bar.style.width = '100%'; bar.className = 'h-full bg-green-500 transition-all duration-1000 rounded-full relative'; }
            if(title) title.innerText = 'الخدمة تمت بنجاح'; 
            if(icon) icon.className = "fa-solid fa-check text-5xl text-green-500 mb-4";
            document.getElementById('step-4')?.classList.add('text-gray-900');
            cancelBtn?.classList.add('hidden'); 
            
            const ratingSection = document.getElementById('customer-rating');
            if (ratingSection && order.barber_id && order.booking_type === 'home') {
                ratingSection.setAttribute('data-barber-id', order.barber_id);
                if(!document.getElementById('fav-checkbox-container')) {
                    const btnHtml = `
                    <div id="fav-checkbox-container" class="mt-4 mb-4 flex justify-center items-center gap-2 bg-gray-50 p-4 rounded-2xl border border-gray-100 cursor-pointer active:scale-95 transition shadow-sm" onclick="const cb=document.getElementById('mark-favorite'); cb.checked=!cb.checked;">
                        <input type="checkbox" id="mark-favorite" class="w-5 h-5 text-amber-500 rounded focus:ring-amber-500 pointer-events-none">
                        <label class="text-sm font-bold text-gray-700 pointer-events-none">حفظ الكابتن في المفضلة للحجوزات القادمة <i class="fa-solid fa-heart text-red-500 ml-1"></i></label>
                    </div>`;
                    const submitBtn = ratingSection.querySelector('button[onclick="submitRating()"]');
                    if(submitBtn) submitBtn.insertAdjacentHTML('beforebegin', btnHtml);
                }
            }

            if (order.payment_method === 'instapay' && order.payment_status === 'unpaid') {
                const amountEl = document.getElementById('modal-instapay-amount');
                if(amountEl) amountEl.innerHTML = `${order.final_total} <span class="text-sm text-amber-500 font-bold">ج.م</span>`;
                if(typeof window.openModal === 'function') window.openModal('instapay-payment-modal');
            } else { 
                if(typeof window.closeModal === 'function') window.closeModal('instapay-payment-modal'); 
                setTimeout(() => window.switchCustomerView('customer-rating'), 2500); 
            }
        } else if (status === 'cancelled') {
            if(bar) { bar.style.width = '100%'; bar.className = 'h-full bg-red-500 transition-all duration-1000 rounded-full relative'; }
            if(title) title.innerText = 'تم الإلغاء'; 
            if(icon) icon.className = "fa-solid fa-xmark text-5xl text-red-500 mb-4";
            cancelBtn?.classList.add('hidden'); 
            setTimeout(() => location.reload(), 3000);
        }
    }

    // ==========================================
    // 🎁 7. نظام الولاء
    // ==========================================
    async function loadLoyaltyProgress() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if(!user) return;
        
        try {
            const { count } = await supabaseClient.from('orders')
                .select('*', { count: 'exact', head: true })
                .eq('customer_id', user.id)
                .eq('status', 'completed');
                
            let totalCompleted = count || 0;
            let currentProgress = totalCompleted % 6; 
            isEligibleForFreeCut = (currentProgress === 5); 
            
            const countEl = document.getElementById('loyalty-count');
            if(countEl) countEl.innerText = currentProgress;
            
            const progressBar = document.getElementById('loyalty-bar');
            if(progressBar) setTimeout(() => { progressBar.style.width = ((currentProgress / 5) * 100) + '%'; }, 500);
            
            const msgEl = document.getElementById('loyalty-msg');
            if(isEligibleForFreeCut && msgEl) msgEl.innerText = "أنت VIP! حلاقتك القادمة مجانية بالكامل 🎉";
        } catch(e) { console.error(e); }
    }

    // ==========================================
    // 🎟️ 8. أكواد الخصم (Promo Codes)
    // ==========================================
    window.applyPromoCode = async function() {
        const codeInput = document.getElementById('promo-code-input');
        const code = codeInput.value.trim().toUpperCase();
        const btn = document.getElementById('apply-promo-btn');

        if (!code) return window.showToast('يرجى كتابة كود الخصم أولاً 🎟️');
        if (isEligibleForFreeCut) return window.showToast('أنت بالفعل تمتلك حلاقة VIP مجانية! لا حاجة لكود خصم 🎉');

        const originalBtnHTML = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        btn.disabled = true;

        try {
            const { data: promoData, error } = await supabaseClient
                .from('promo_codes')
                .select('*')
                .eq('code', code)
                .eq('is_active', true)
                .maybeSingle();

            if (error || !promoData) {
                window.playSound('error');
                window.showToast('الكود غير صحيح أو منتهي الصلاحية ❌');
                appliedPromo = null;
                btn.innerHTML = originalBtnHTML;
                btn.disabled = false;
            } else {
                const selectedSalon = document.querySelector('#customer-salon-select input[name="target_select"]:checked')?.value;
                if (promoData.salon_id && promoData.salon_id !== selectedSalon && currentBookingType === 'salon') {
                    window.playSound('error');
                    window.showToast('هذا الكود غير صالح للصالون المختار ❌');
                    appliedPromo = null;
                    btn.innerHTML = originalBtnHTML;
                    btn.disabled = false;
                } else {
                    appliedPromo = promoData;
                    window.playSound('success');
                    window.showToast(`تم تطبيق خصم ${promoData.discount_percentage}% بنجاح! 🎉`);
                    
                    codeInput.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-check text-white text-lg"></i>';
                    btn.classList.replace('bg-gray-900', 'bg-green-600');
                    document.getElementById('promo-container').classList.replace('border-amber-100', 'border-green-200');
                    document.getElementById('promo-container').classList.replace('bg-amber-50/50', 'bg-green-50/50');
                }
            }
        } catch (e) {
            window.showToast('حدث خطأ أثناء التحقق من الكود.');
            btn.innerHTML = originalBtnHTML;
            btn.disabled = false;
        } finally {
            window.updateFinalPriceDisplay();
        }
    };

    // ==========================================
    // 🔄 9. التنقل وحساب الأسعار
    // ==========================================
    window.switchCustomerView = function(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active', 'block'));
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        
        const targetView = document.getElementById(viewId);
        if(targetView) {
            targetView.classList.remove('hidden');
            targetView.classList.add('active', 'block');
        }
        
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        if(viewId === 'customer-home') document.getElementById('c-nav-home')?.classList.add('active');
        if(viewId === 'customer-explore') document.getElementById('c-nav-explore')?.classList.add('active'); 
        if(viewId === 'customer-tracking') document.getElementById('c-nav-track')?.classList.add('active');
        if(viewId === 'customer-history') document.getElementById('c-nav-history')?.classList.add('active');
        
        const homeBar = document.getElementById('home-checkout-bar');
        const salonBar = document.getElementById('salon-checkout-bar');
        
        if(viewId !== 'customer-home' && homeBar) { 
            homeBar.classList.remove('translate-y-0', 'opacity-100'); 
            homeBar.classList.add('translate-y-32', 'opacity-0', 'pointer-events-none'); 
            homeBar.style.pointerEvents = 'none';
        }
        if(viewId !== 'customer-salon-menu' && salonBar) { 
            salonBar.classList.remove('translate-y-0', 'opacity-100'); 
            salonBar.classList.add('translate-y-32', 'opacity-0', 'pointer-events-none'); 
            salonBar.style.pointerEvents = 'none';
        }

        if(viewId === 'customer-home') {
            setTimeout(() => window.updateFinalPriceDisplay(), 50);
        }
        
        window.scrollTo(0,0);
    };

    window.switchCustomerMenuTab = function(tabName) {
        const btnServices = document.getElementById('c-tab-services-btn');
        const btnProducts = document.getElementById('c-tab-products-btn');
        const listServices = document.getElementById('customer-salon-services-list');
        const listProducts = document.getElementById('customer-salon-products-list');

        if(btnServices && btnProducts) {
            btnServices.className = "flex-1 py-2.5 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition active:scale-95";
            btnProducts.className = "flex-1 py-2.5 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition active:scale-95";
        }
        
        if(listServices) listServices.classList.add('hidden');
        if(listProducts) listProducts.classList.add('hidden');

        if(tabName === 'services') {
            if(btnServices) btnServices.className = "flex-1 py-2.5 rounded-lg text-xs font-black bg-gray-900 text-white shadow-sm transition active:scale-95";
            if(listServices) listServices.classList.remove('hidden');
        } else {
            if(btnProducts) btnProducts.className = "flex-1 py-2.5 rounded-lg text-xs font-black bg-gray-900 text-white shadow-sm transition active:scale-95";
            if(listProducts) listProducts.classList.remove('hidden');
        }
    };

    window.goBackFromBooking = function() {
        if (currentBookingType === 'home') window.switchCustomerView('customer-barber-select');
        else window.switchCustomerView('customer-salon-menu');
        window.updateFinalPriceDisplay();
    };

    window.goBackToSalons = function() {
        window.switchCustomerView('customer-salon-select');
    };

    window.updateBookingType = function() {
        const salonRadio = document.getElementById('salon-booking-radio');
        const homeRadio = document.querySelector('input[name="booking_type"][value="home"]');
        
        if (salonRadio && salonRadio.disabled && salonRadio.checked) {
            if (homeRadio) homeRadio.checked = true;
            return window.showToast('عفواً، حجز الصالونات مغلق من الإدارة حالياً 🚀');
        }

        const typeInput = document.querySelector('input[name="booking_type"]:checked');
        if(typeInput) currentBookingType = typeInput.value;
        currentTransportFee = 0; 
        
        const btnText = document.getElementById('btn-proceed-text');
        const platServices = document.getElementById('platform-services-section');
        const homeBar = document.getElementById('home-checkout-bar');
        const homeTotal = document.getElementById('home-total-price');

        if(currentBookingType === 'salon') {
            if(btnText) btnText.innerHTML = 'متابعة لاختيار الصالون';
            if(platServices) platServices.classList.add('hidden'); 
            baseTotal = 0; selectedServicesNames = []; selectedServicesIds = [];
            document.querySelectorAll('.service-checkbox').forEach(cb => cb.checked = false);
            
            if(homeBar) {
                homeBar.classList.remove('translate-y-32', 'translate-y-24', 'opacity-0', 'pointer-events-none');
                homeBar.classList.add('translate-y-0', 'opacity-100');
                homeBar.style.pointerEvents = 'auto';
            }
            if(homeTotal) homeTotal.classList.add('hidden');

        } else {
            if(btnText) btnText.innerHTML = 'متابعة لاختيار الكابتن';
            if(platServices) platServices.classList.remove('hidden');
        }
        window.updateFinalPriceDisplay();
    };

    window.togglePaymentFields = function() { 
        const methodInput = document.querySelector('input[name="payment"]:checked');
        const method = methodInput ? methodInput.value : 'cash'; 
        const instapayFields = document.getElementById('payment-instapay-fields'); 
        if(instapayFields) instapayFields.classList.toggle('hidden', method !== 'instapay');
    };

    function renderServicesToDOM(services, offersContainer, basicsContainer) {
        offersContainer.innerHTML = '';
        basicsContainer.innerHTML = '';

        services.forEach(srv => {
            const title = window.escapeHTML(srv.title);
            const desc = window.escapeHTML(srv.description || '');
            const html = `
                <label class="${srv.type === 'offer' ? 'min-w-[260px]' : ''} cursor-pointer group snap-center active:scale-[0.98] transition-transform">
                    <input type="checkbox" class="hidden peer service-checkbox" value="${title}" data-price="${srv.price}" data-id="${srv.id}" onchange="calculateBaseTotal('home')">
                    <div class="h-full bg-white border-2 border-gray-100 rounded-[2rem] ${srv.type === 'offer' ? 'p-5 relative peer-checked:border-gray-900 peer-checked:bg-gray-900 transition-all shadow-sm peer-checked:text-white' : 'p-5 flex flex-col items-center peer-checked:bg-amber-50 peer-checked:border-amber-500 peer-checked:text-gray-900'} transition-all hover:shadow-md">
                        ${srv.type === 'offer' ? `<div class="absolute -top-3 -right-2 bg-gray-900 text-amber-500 px-3 py-1 rounded-xl text-[10px] font-black shadow-md transform rotate-3">عرض خاص</div><h4 class="text-lg font-black mt-2">${title}</h4><p class="text-[10px] mt-1 font-medium leading-relaxed line-clamp-2 text-gray-500 group-hover:text-gray-400">${desc}</p><div class="mt-4 flex justify-between items-center border-t border-gray-100/30 pt-3"><p class="font-black text-amber-500 text-xl">${srv.price} <span class="text-[10px]">ج.م</span></p><div class="w-6 h-6 bg-amber-500 text-gray-900 rounded-full flex items-center justify-center opacity-0 peer-checked:opacity-100 transition-opacity shadow-sm"><i class="fa-solid fa-check text-[10px]"></i></div></div>` : `<div class="absolute top-3 left-3 opacity-0 peer-checked:opacity-100 transition-opacity"><i class="fa-solid fa-circle-check text-amber-500"></i></div><div class="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3 text-xl text-gray-400 transition-colors peer-checked:bg-amber-200 peer-checked:text-amber-700"><i class="fa-solid fa-scissors"></i></div><span class="font-bold text-sm text-center text-gray-900">${title}</span><span class="text-xs font-black mt-2 text-amber-600">${srv.price} ج.م</span>`}
                    </div>
                </label>`;
            if (srv.type === 'offer') offersContainer.innerHTML += html; else basicsContainer.innerHTML += html;
        });
    }

    window.loadPlatformServices = async function() {
        const offersContainer = document.getElementById('offers-container');
        const basicsContainer = document.getElementById('basics-container');
        if(!offersContainer || !basicsContainer) return;

        const cachedServices = localStorage.getItem('cached_platform_services');
        if (cachedServices) {
            renderServicesToDOM(JSON.parse(cachedServices), offersContainer, basicsContainer);
        } else {
            offersContainer.innerHTML = '<div class="text-center w-full py-4 text-gray-400"><i class="fa-solid fa-spinner fa-spin"></i></div>';
            basicsContainer.innerHTML = '<div class="text-center w-full py-4 col-span-2 text-gray-400"><i class="fa-solid fa-spinner fa-spin"></i></div>';
        }

        try {
            const { data: services, error } = await supabaseClient
                .from('services')
                .select('*')
                .eq('is_active', true)
                .is('salon_id', null)
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (services) {
                localStorage.setItem('cached_platform_services', JSON.stringify(services));
                renderServicesToDOM(services, offersContainer, basicsContainer);
            }
        } catch(e) {
            console.error("Error loading services:", e);
        }
    }

    window.openSalonMenu = async function(salonId, salonName) {
        window.showLoader(100, null);
        document.querySelectorAll('.service-checkbox').forEach(cb => cb.checked = false);
        baseTotal = 0; selectedServicesNames = []; selectedServicesIds = []; window.updateFinalPriceDisplay();

        const nameEl = document.getElementById('menu-salon-name');
        if(nameEl) nameEl.innerText = window.escapeHTML(salonName);
        
        try {
            const [salonReq, servicesReq] = await Promise.all([
                supabaseClient.from('salons').select('*').eq('id', salonId).single(),
                supabaseClient.from('services').select('*').eq('is_active', true).eq('salon_id', salonId).order('created_at', { ascending: false })
            ]);

            const salonData = salonReq.data;
            const services = servicesReq.data;

            if(salonData) {
                const coverImg = document.getElementById('menu-salon-cover');
                if(coverImg) coverImg.src = salonData.cover_image ? window.escapeHTML(salonData.cover_image) : 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=800';

                const logoImg = document.getElementById('menu-salon-logo');
                if(logoImg) logoImg.src = salonData.main_image ? window.escapeHTML(salonData.main_image) : `https://ui-avatars.com/api/?name=${encodeURIComponent(salonName)}&background=111827&color=fff`;

                const mapBtn = document.getElementById('menu-salon-map-btn');
                if(mapBtn) {
                    if (salonData.lat && salonData.lng) {
                        mapBtn.onclick = () => window.open(`https://www.google.com/maps/dir/?api=1&destination=...?daddr=$$${salonData.lat},${salonData.lng}`, '_blank');
                        mapBtn.classList.remove('hidden');
                    } else {
                        mapBtn.classList.add('hidden');
                    }
                }

                const tagsContainer = document.getElementById('menu-salon-tags');
                if(tagsContainer) {
                    let tagsHtml = '';
                    if(salonData.features) {
                        const features = salonData.features.split('،').map(f => f.trim());
                        features.forEach(f => {
                            if(f) tagsHtml += `<span class="bg-gray-100 text-gray-600 px-2 py-1 rounded-md text-[9px] font-bold border border-gray-200 shadow-sm">${window.escapeHTML(f)}</span>`;
                        });
                    }
                    tagsContainer.innerHTML = tagsHtml;
                }
            }

            const offersContainer = document.getElementById('salon-specific-offers');
            const basicsContainer = document.getElementById('salon-specific-basics');
            const productsContainer = document.getElementById('salon-specific-products');

            let offersHtml = '', basicsHtml = '', productsHtml = '';
            let srvCount = 0, prodCount = 0;

            if (services && services.length > 0) {
                services.forEach(srv => {
                    const title = window.escapeHTML(srv.title);
                    const desc = window.escapeHTML(srv.description || '');
                    
                    if (srv.type === 'product' && productsContainer) {
                        prodCount++;
                        const stock = srv.original_price || 0;
                        const isAvailable = stock > 0;
                        const imgHtml = srv.image_url ? `<img src="${window.escapeHTML(srv.image_url)}" class="w-full h-full object-cover rounded-xl shadow-sm" loading="lazy">` : `<i class="fa-solid fa-box-open text-blue-300 text-xl"></i>`;
                        
                        productsHtml += `
                            <label class="cursor-pointer block relative active:scale-[0.98] transition-transform ${!isAvailable ? 'opacity-60 grayscale' : ''}">
                                <input type="checkbox" class="hidden peer service-checkbox" value="${title}" data-price="${srv.price}" data-id="${srv.id}" ${!isAvailable ? 'disabled' : ''} onchange="calculateBaseTotal('salon')">
                                <div class="bg-white p-4 rounded-2xl border-2 border-transparent peer-checked:border-blue-500 peer-checked:bg-blue-50 transition-all shadow-sm hover:shadow-md flex justify-between items-center">
                                    <div class="w-14 h-14 bg-gray-50 flex items-center justify-center rounded-xl border border-gray-100 shrink-0 ml-4 relative">
                                        ${imgHtml}
                                    </div>
                                    <div class="flex-1 pr-1">
                                        <h4 class="font-black text-sm text-gray-900 mb-1">${title}</h4>
                                        <p class="font-black text-lg text-blue-600">${srv.price} <span class="text-[10px] text-gray-400">ج.م</span></p>
                                    </div>
                                    <div class="w-6 h-6 border-2 border-gray-200 rounded-full flex items-center justify-center text-white peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-colors">
                                        <i class="fa-solid fa-check text-[10px] opacity-0 peer-checked:opacity-100"></i>
                                    </div>
                                </div>
                                ${!isAvailable ? '<div class="absolute top-2 left-2 bg-red-500 text-white text-[9px] px-2 py-0.5 rounded font-bold shadow-sm">نفذت الكمية</div>' : ''}
                            </label>`;
                    } else {
                        srvCount++;
                        const html = `
                            <label class="${srv.type === 'offer' ? 'min-w-[260px]' : ''} cursor-pointer group snap-center active:scale-[0.98] transition-transform">
                                <input type="checkbox" class="hidden peer service-checkbox" value="${title}" data-price="${srv.price}" data-id="${srv.id}" onchange="calculateBaseTotal('salon')">
                                <div class="h-full bg-white border-2 border-gray-100 rounded-[2rem] ${srv.type === 'offer' ? 'p-5 relative peer-checked:border-gray-900 peer-checked:bg-gray-900 transition-all shadow-sm peer-checked:text-white' : 'p-5 flex flex-col items-center peer-checked:bg-amber-50 peer-checked:border-amber-500 peer-checked:text-gray-900'} transition-all hover:shadow-md">
                                    ${srv.type === 'offer' ? `<div class="absolute -top-3 -right-2 bg-gray-900 text-amber-500 px-3 py-1 rounded-xl text-[10px] font-black shadow-md transform rotate-3">عرض خاص</div><h4 class="text-lg font-black mt-2">${title}</h4><p class="text-[10px] mt-1 font-medium leading-relaxed line-clamp-2 text-gray-500 group-hover:text-gray-400">${desc}</p><div class="mt-4 flex justify-between items-center border-t border-gray-100/30 pt-3"><p class="font-black text-amber-500 text-xl">${srv.price} <span class="text-[10px]">ج.م</span></p><div class="w-6 h-6 bg-amber-500 text-gray-900 rounded-full flex items-center justify-center opacity-0 peer-checked:opacity-100 transition-opacity shadow-sm"><i class="fa-solid fa-check text-[10px]"></i></div></div>` : `<div class="absolute top-3 left-3 opacity-0 peer-checked:opacity-100 transition-opacity"><i class="fa-solid fa-circle-check text-amber-500"></i></div><div class="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3 text-xl text-gray-400 transition-colors peer-checked:bg-amber-200 peer-checked:text-amber-700"><i class="fa-solid fa-scissors"></i></div><span class="font-bold text-sm text-center text-gray-900">${title}</span><span class="text-xs font-black mt-2 text-amber-600">${srv.price} ج.م</span>`}
                                </div>
                            </label>`;
                        if (srv.type === 'offer') offersHtml += html; 
                        else basicsHtml += html;
                    }
                });
            }

            if(offersContainer) offersContainer.innerHTML = offersHtml;
            if(basicsContainer) {
                basicsContainer.innerHTML = srvCount > 0 ? basicsHtml : '<div class="col-span-2 text-center text-gray-400 font-bold text-sm py-10 bg-white rounded-2xl border border-dashed"><i class="fa-solid fa-folder-open text-2xl mb-2 block"></i> قائمة الأسعار للصالون فارغة.</div>';
            }
            if(productsContainer) {
                productsContainer.innerHTML = prodCount > 0 ? productsHtml : '<div class="text-center text-gray-400 font-bold text-sm py-10 bg-white rounded-2xl border border-dashed"><i class="fa-solid fa-box-open text-2xl mb-2 block"></i> لا توجد منتجات معروضة حالياً.</div>';
            }

        } catch(e) { 
            console.error("Error loading salon menu:", e); 
            window.showToast("حدث خطأ أثناء تحميل الخدمات.");
        }
        
        window.hideLoader(); 
        window.switchCustomerView('customer-salon-menu');
    };

    window.calculateBaseTotal = function(context) {
        baseTotal = 0; selectedServicesNames = []; selectedServicesIds = [];
        const selector = context === 'salon' ? '#customer-salon-menu .service-checkbox:checked' : '#customer-home .service-checkbox:checked';
        document.querySelectorAll(selector).forEach(cb => { 
            let price = parseFloat(cb.getAttribute('data-price')) || 0;
            let id = cb.getAttribute('data-id');
            baseTotal += Math.max(0, price); 
            selectedServicesNames.push(cb.value); 
            if(id) selectedServicesIds.push(id);
        });
        window.updateFinalPriceDisplay();
    };

    window.updateCount = function(change) {
        peopleCount += change; if (peopleCount < 1) peopleCount = 1;
        const countEl = document.getElementById('people-count');
        if(countEl) countEl.innerText = parseInt(peopleCount); 
        window.updateFinalPriceDisplay();
    };

    window.updateFinalPriceDisplay = function() {
        try {
            const homeBar = document.getElementById('home-checkout-bar');
            const homeTotal = document.getElementById('home-total-price');
            
            const salonBar = document.getElementById('salon-checkout-bar');
            const salonTotal = document.getElementById('salon-menu-total-price');
            
            if (homeBar && homeTotal) {
                if (currentBookingType === 'home') {
                    if (baseTotal > 0) { 
                        homeTotal.innerText = baseTotal + ' ج.م'; 
                        homeTotal.classList.remove('hidden'); 
                        homeBar.classList.remove('translate-y-32', 'opacity-0', 'pointer-events-none');
                        homeBar.classList.add('translate-y-0', 'opacity-100');
                        homeBar.style.pointerEvents = 'auto'; 
                    } else { 
                        homeTotal.classList.add('hidden');
                        homeBar.classList.remove('translate-y-0', 'opacity-100');
                        homeBar.classList.add('translate-y-32', 'opacity-0', 'pointer-events-none');
                        homeBar.style.pointerEvents = 'none'; 
                    }
                } else if (currentBookingType === 'salon') {
                    homeTotal.classList.add('hidden'); 
                    
                    const homeView = document.getElementById('customer-home');
                    if (homeView && homeView.classList.contains('active')) {
                        homeBar.classList.remove('translate-y-32', 'opacity-0', 'pointer-events-none');
                        homeBar.classList.add('translate-y-0', 'opacity-100');
                        homeBar.style.pointerEvents = 'auto'; 
                    }
                }
            }

            if (currentBookingType === 'salon' && salonBar && salonTotal) {
                if (baseTotal > 0) { 
                    salonTotal.innerText = baseTotal + ' ج.م'; 
                    salonTotal.classList.remove('hidden');
                    salonBar.classList.remove('translate-y-32', 'opacity-0', 'pointer-events-none');
                    salonBar.classList.add('translate-y-0', 'opacity-100');
                    salonBar.style.pointerEvents = 'auto'; 
                } else { 
                    salonTotal.classList.add('hidden');
                    salonBar.classList.remove('translate-y-0', 'opacity-100');
                    salonBar.classList.add('translate-y-32', 'opacity-0', 'pointer-events-none');
                    salonBar.style.pointerEvents = 'none'; 
                }
            }
            
            let safeBaseTotal = Math.max(0, Number(baseTotal) || 0);
            let safePeopleCount = Math.max(1, parseInt(peopleCount) || 1);
            let safeTransportFee = currentBookingType === 'salon' ? 0 : Math.max(0, currentTransportFee);

            let servicesTotal = safeBaseTotal * safePeopleCount; 
            let finalPrice = 0;
            let discountAmount = 0;

            const discountRow = document.getElementById('invoice-discount-row'); 
            const discountPriceEl = document.getElementById('invoice-discount-price');
            const promoRow = document.getElementById('invoice-promo-row'); 
            const promoPriceEl = document.getElementById('invoice-promo-price');
            const loyaltyRow = document.getElementById('invoice-loyalty-row');

            if(isEligibleForFreeCut) {
                if(loyaltyRow) loyaltyRow.classList.remove('hidden');
                if(discountRow) discountRow.classList.add('hidden'); 
                if(promoRow) promoRow.classList.add('hidden'); 
                
                let paidPeople = safePeopleCount - 1; 
                let tempServices = safeBaseTotal * paidPeople; 
                finalPrice = tempServices + safeTransportFee; 
            } else {
                if(loyaltyRow) loyaltyRow.classList.add('hidden');
                
                if (currentBookingType === 'salon') {
                    discountAmount = servicesTotal * 0.20; 
                    servicesTotal -= discountAmount;
                    if(discountRow) discountRow.classList.remove('hidden');
                    if(discountPriceEl) discountPriceEl.innerText = `- ${discountAmount.toFixed(0)} ج.م`;
                } else { 
                    if(discountRow) discountRow.classList.add('hidden'); 
                }

                let promoDiscountAmount = 0;
                if (appliedPromo) {
                    promoDiscountAmount = servicesTotal * (appliedPromo.discount_percentage / 100);
                    servicesTotal -= promoDiscountAmount;
                    if(promoRow) promoRow.classList.remove('hidden');
                    if(promoPriceEl) promoPriceEl.innerText = `- ${promoDiscountAmount.toFixed(0)} ج.م`;
                } else {
                    if(promoRow) promoRow.classList.add('hidden');
                }
                
                finalPrice = servicesTotal + safeTransportFee;
            }
            
            if (document.getElementById('invoice-services-price')) document.getElementById('invoice-services-price').innerText = (safeBaseTotal * safePeopleCount) + ' ج.م';
            
            const transEl = document.getElementById('invoice-transport-price');
            if (transEl) {
                if (currentBookingType === 'salon') {
                    transEl.innerText = 'مجانياً';
                    transEl.classList.remove('text-[10px]', 'text-amber-600');
                } else if (safeTransportFee === 0) {
                    transEl.innerText = 'يُحدد حسب المسافة';
                    transEl.classList.add('text-[10px]', 'text-amber-600');
                } else {
                    transEl.innerText = `+ ${safeTransportFee} ج.م`;
                    transEl.classList.remove('text-[10px]', 'text-amber-600');
                }
            }
            
            if (document.getElementById('final-invoice-price')) document.getElementById('final-invoice-price').innerText = finalPrice.toFixed(0) + ' ج.م';
        } catch(e) {
            console.error("Error updating price display: ", e);
        }
    };

    window.proceedToNextStep = async function() {
        if (currentBookingType === 'home' && baseTotal === 0) { window.playSound('error'); return window.showToast('يرجى اختيار خدمة واحدة على الأقل للاستمرار'); }
        if (currentBookingType === 'home') await loadBarbersList();
        else await loadSalonsList();
    };

    window.goToBooking = async function(type) {
        if (baseTotal === 0) { window.playSound('error'); return window.showToast('يرجى اختيار خدمة واحدة على الأقل للمتابعة للصفحة التالية'); }
        
        const selected = document.querySelector('input[name="target_select"]:checked');
        if(!selected && currentBookingType === 'home') { window.playSound('error'); return window.showToast('يرجى اختيار الكابتن المطلوب'); }
        if(!selected && currentBookingType === 'salon') { window.playSound('error'); return window.showToast('يرجى تحديد الصالون'); }
        
        let targetId = selected ? selected.value : null;

        if (currentBookingType === 'home' && targetId) {
            const selectedBarber = allBarbers.find(b => b.id === targetId);

            window.showLoader();
            try {
                const { data: freshBarberLocation } = await supabaseClient.from('profiles').select('lat, lng').eq('id', targetId).single();
                
                let targetLat = (freshBarberLocation && freshBarberLocation.lat) ? freshBarberLocation.lat : (selectedBarber ? selectedBarber.lat : null);
                let targetLng = (freshBarberLocation && freshBarberLocation.lng) ? freshBarberLocation.lng : (selectedBarber ? selectedBarber.lng : null);

                if (targetLat && targetLng && userLat && userLng) {
                    const route = await window.calculateRoute(userLat, userLng, targetLat, targetLng);
                    if (route && route.success) {
                        currentTransportFee = window.calculateTransportFee(route.distance);
                    } else {
                        currentTransportFee = 30; 
                    }
                } else {
                    currentTransportFee = 0;
                }
            } catch(e) {
                currentTransportFee = 0;
            } finally {
                window.hideLoader();
            }
        }

        const addressContainer = document.getElementById('address-section-container');
        const bookAddress = document.getElementById('book-address');
        const safetyContainer = document.getElementById('safety-instructions-container');

        if(currentBookingType === 'salon') {
            if(addressContainer) addressContainer.classList.add('hidden');
            if(bookAddress) bookAddress.value = "زيارة داخل الصالون";
            if(safetyContainer) safetyContainer.innerHTML = `<h4 class="font-bold text-sm mb-2 text-gray-900"><i class="fa-solid fa-shield-halved ml-1 text-gray-400"></i>معايير الأمان (بالصالون)</h4><p class="text-[11px] text-gray-600 font-medium">الصالون يلتزم بتعقيم الأدوات واستخدام شفرات وفوط جديدة لكل عميل لضمان سلامتك.</p>`;
        } else {
            if(addressContainer) addressContainer.classList.remove('hidden');
            if(bookAddress) { if(bookAddress.value === "زيارة داخل الصالون") bookAddress.value = ""; bookAddress.placeholder = "المحافظة، المدينة، المنطقة، الشارع، العمارة (اختياري يمكنك التعديل يدوياً)..."; }
            if (!userLat && navigator.geolocation) window.getLocation(document.getElementById('gps-btn'));
            
            if(safetyContainer) {
                safetyContainer.innerHTML = `
                <h4 class="font-bold text-sm mb-2 text-gray-900"><i class="fa-solid fa-shield-halved ml-1 text-gray-400"></i>استعدادات الزيارة المنزلية</h4>
                <p class="text-[11px] text-gray-600 font-medium leading-relaxed">الكابتن مزود بأدوات معقمة مسبقاً. يرجى تجهيز مكان جيد الإضاءة.</p>
                
                <div class="mt-4 p-4 bg-white rounded-[1rem] border border-gray-100 flex items-start gap-3 shadow-sm cursor-pointer transition active:scale-[0.98]" onclick="const cb=document.getElementById('show-phone-checkbox'); cb.checked=!cb.checked;">
                    <input type="checkbox" id="show-phone-checkbox" checked class="mt-1 w-4 h-4 text-amber-500 rounded focus:ring-amber-500 pointer-events-none">
                    <div>
                        <label class="text-xs font-black text-gray-900 pointer-events-none block mb-0.5">مشاركة رقم هاتفي مع الكابتن</label>
                        <p class="text-[9px] text-gray-500 font-bold pointer-events-none">إذا قمت بإلغاء التحديد، سيتم التواصل عبر المحادثة الداخلية فقط.</p>
                    </div>
                </div>

                <div class="mt-4 p-4 bg-white rounded-[1rem] border border-gray-100 shadow-sm transition">
                    <label class="text-xs font-black text-gray-900 block mb-2"><i class="fa-solid fa-user-plus ml-1 text-amber-500"></i> هل تطلب الخدمة لشخص آخر؟ (اختياري)</label>
                    <input type="tel" id="recipient-phone" placeholder="أدخل رقم هاتف المستفيد..." class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:border-amber-500 transition-all" dir="ltr">
                    <p class="text-[9px] text-gray-500 font-bold mt-2">اترك الحقل فارغاً إذا كان الطلب لك. يمكنك تعديل العنوان يدوياً من مربع العنوان بالأعلى.</p>
                </div>
                `;
            }
        }
        
        window.updateFinalPriceDisplay(); 
        
        document.getElementById('home-checkout-bar')?.classList.replace('translate-y-0', 'translate-y-32');
        document.getElementById('salon-checkout-bar')?.classList.replace('translate-y-0', 'translate-y-32');
        
        window.switchCustomerView('customer-booking');
        window.scrollTo(0,0);
    };

    // ==========================================
    // 📝 10. تأكيد وإرسال الحجز
    // ==========================================
    window.confirmBooking = async function() {
        const date = document.getElementById('book-date')?.value; 
        const time = document.getElementById('book-time')?.value;
        const address = document.getElementById('book-address')?.value.trim(); 
        const paymentInput = document.querySelector('input[name="payment"]:checked');
        const paymentMethod = paymentInput ? paymentInput.value : 'cash';
        
        const showPhoneCheckbox = document.getElementById('show-phone-checkbox');
        const showPhone = showPhoneCheckbox ? showPhoneCheckbox.checked : true; 
        
        const recipientPhoneEl = document.getElementById('recipient-phone');
        const recipientPhone = recipientPhoneEl ? window.escapeHTML(recipientPhoneEl.value.trim()) : null;
        
        let targetId = null;
        if (currentBookingType === 'home') {
            const selectedBarber = document.querySelector('#customer-barber-select input[name="target_select"]:checked');
            if(selectedBarber) targetId = selectedBarber.value;
        } else {
            const selectedSalon = document.querySelector('#customer-salon-select input[name="target_select"]:checked');
            if(selectedSalon) targetId = selectedSalon.value;
        }
        
        if (!date || !time || !address || !targetId || selectedServicesIds.length === 0) { 
            window.playSound('error'); 
            return window.showToast('يرجى استكمال البيانات واختيار خدمات صحيحة'); 
        }

        if (currentBookingType === 'home' && currentTransportFee === 0) {
            window.playSound('error'); 
            return window.showToast('يرجى الضغط على زر "تحديد موقعي (GPS)" لحساب رسوم الانتقال الدقيقة أولاً'); 
        }

        let safeBaseTotal = Math.max(0, Number(baseTotal) || 0);
        let safePeopleCount = Math.max(1, parseInt(peopleCount) || 1);
        let safeTransportFee = currentBookingType === 'salon' ? 0 : Math.max(0, Number(currentTransportFee) || 0);
        
        let servicesTotal = safeBaseTotal * safePeopleCount; 
        let finalPriceToDB = 0;
        
        if(isEligibleForFreeCut) {
            let paidPeople = safePeopleCount - 1; 
            let tempServices = safeBaseTotal * paidPeople; 
            if (currentBookingType === 'salon' && tempServices > 0) {
                tempServices -= (tempServices * 0.20); 
            }
            finalPriceToDB = tempServices + safeTransportFee; 
        } else {
            if (currentBookingType === 'salon') {
                servicesTotal -= (servicesTotal * 0.20);
            }
            if (appliedPromo) {
                servicesTotal -= (servicesTotal * (appliedPromo.discount_percentage / 100));
            }
            finalPriceToDB = servicesTotal + safeTransportFee;
        }

        window.showLoader(100, null);
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();

            const { data: newOrder, error } = await supabaseClient.from('orders').insert([{
                customer_id: user.id, 
                barber_id: currentBookingType === 'home' ? targetId : null, 
                salon_id: currentBookingType === 'salon' ? targetId : null,
                booking_type: currentBookingType, 
                status: 'pending',
                booking_date: window.escapeHTML(date), 
                booking_time: window.escapeHTML(time), 
                address: window.escapeHTML(address),
                lat: userLat, 
                lng: userLng, 
                people_count: safePeopleCount,
                transport_fee: safeTransportFee, 
                payment_method: paymentMethod, 
                payment_status: 'unpaid',
                services_text: window.escapeHTML(selectedServicesNames.join('، ')),
                service_ids: selectedServicesIds,
                show_phone: showPhone,
                recipient_phone: recipientPhone,
                final_total: finalPriceToDB 
            }]).select().single();

            if (error) { 
                console.error("Insert Error:", error);
                window.playSound('error'); 
                window.hideLoader();
                return window.showToast('حدث خطأ أثناء إرسال الطلب'); 
            }

            if (currentBookingType === 'home' && targetId) {
                const { data: profile } = await supabaseClient.from('profiles').select('full_name').eq('id', user.id).single();
                const customerName = profile ? profile.full_name : 'عميل';
                window.sendPushWithActions(targetId, newOrder.id, customerName, window.escapeHTML(selectedServicesNames.join('، ')));
            }

            if (typeof window.sendAppNotification === 'function') {
                const bookingDateTime = new Date(`${date}T${time}`);
                const reminderTime = new Date(bookingDateTime.getTime() - 30 * 60000);

                if (reminderTime > new Date()) {
                    const timeString = reminderTime.toString();
                    window.sendAppNotification(
                        user.id, 
                        "تذكير بموعدك ✂️",
                        `موعدك اليوم الساعة ${window.escapeHTML(time)}. استعد!`,
                        "https://barberhome.pages.dev/pages/customer.html",
                        "reminder",
                        timeString 
                    );
                }
            }

            window.playSound('success');
            window.switchCustomerView('customer-tracking');
            document.getElementById('active-tracking-shortcut')?.classList.remove('hidden');
            startLiveTracking(newOrder.id);
            window.showToast('تم إرسال طلبك بنجاح! ✨');
            
        } catch(e) {
            window.playSound('error'); 
            window.showToast('حدث خطأ غير متوقع.');
        } finally {
            window.hideLoader();
        }
    };

    // ==========================================
    // 🧔 11. جلب الكباتن والصالونات
    // ==========================================
    async function loadBarbersList() {
        window.showLoader(100, null);
        try {
            const { data: barbers } = await supabaseClient.from('profiles').select('*').eq('role', 'barber').eq('status', 'active');
            
            const { data: ratingsData } = await supabaseClient.from('orders').select('barber_id, rating_score').not('rating_score', 'is', null);
            const barberRatings = {};
            if (ratingsData) {
                ratingsData.forEach(r => {
                    if(r.barber_id) {
                        if(!barberRatings[r.barber_id]) barberRatings[r.barber_id] = { sum: 0, count: 0 };
                        barberRatings[r.barber_id].sum += r.rating_score;
                        barberRatings[r.barber_id].count += 1;
                    }
                });
            }
            
            const favBarberId = window.escapeHTML(localStorage.getItem('favoriteBarber') || '');

            if (barbers && barbers.length > 0) {
                barbers.sort((a, b) => {
                    // 🚀 1. الأولوية القصوى للكابتن القادم من شاشة الاستكشاف
                    if (exploreTarget && exploreTarget.type === 'home') {
                        if (a.id === exploreTarget.id) return -1;
                        if (b.id === exploreTarget.id) return 1;
                    }
                    if (a.is_featured && !b.is_featured) return -1;
                    if (!a.is_featured && b.is_featured) return 1;
                    if (a.id === favBarberId) return -1;
                    if (b.id === favBarberId) return 1;
                    return 0;
                });
                allBarbers = barbers; 
            }

            const container = document.getElementById('barbers-list-container'); 
            if(!container) return;
            container.innerHTML = '';
            
            if (!barbers || barbers.length === 0) { 
                container.innerHTML = '<div class="text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-100 border-dashed"><i class="fa-solid fa-user-slash text-4xl text-gray-200 mb-3 block"></i><p class="text-gray-500 font-bold text-sm">عذراً، لا يوجد كباتن متاحين حالياً.</p></div>'; 
            } else {
                barbers.forEach((barber, index) => {
                    const safeName = window.escapeHTML(barber.full_name);
                    const avatar = (barber.portfolio_url && barber.portfolio_url.includes('http')) ? window.escapeHTML(barber.portfolio_url) : `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=111827&color=fff`;
                    
                    let rating = 5.0; let countStr = '';
                    if(barberRatings[barber.id] && barberRatings[barber.id].count > 0) {
                        rating = barberRatings[barber.id].sum / barberRatings[barber.id].count;
                        countStr = `(${barberRatings[barber.id].count} تقييم فعلي)`;
                    } else { countStr = '(جديد)'; }

                    let starsHtml = '';
                    for(let i=1; i<=5; i++) {
                        if(i <= rating) starsHtml += '<i class="fa-solid fa-star text-amber-500"></i>';
                        else if(i - 0.5 <= rating) starsHtml += '<i class="fa-solid fa-star-half-stroke text-amber-500"></i>';
                        else starsHtml += '<i class="fa-regular fa-star text-amber-500"></i>';
                    }

                    const isFav = barber.id === favBarberId;
                    const favBadge = isFav ? `<span class="bg-red-50 text-red-500 px-2 py-0.5 rounded-lg text-[9px] font-bold shadow-sm border border-red-100 flex items-center gap-1"><i class="fa-solid fa-heart"></i> المفضل لك</span>` : '';
                    
                    const featuredBadge = barber.is_featured ? `<div class="absolute -top-3 -right-2 bg-gradient-to-l from-amber-500 to-yellow-400 text-gray-900 px-3 py-1 rounded-xl text-[10px] font-black shadow-lg transform rotate-3 z-20 flex items-center gap-1 border border-yellow-300"><i class="fa-solid fa-crown"></i> اختيار التطبيق</div>` : '';
                    
                    const instagramBtn = barber.instagram_link ? `<button onclick="event.preventDefault(); window.open('${window.escapeHTML(barber.instagram_link)}', '_blank')" class="w-8 h-8 bg-gradient-to-tr from-[#f9ce34] via-[#ee2a7b] to-[#6228d7] text-white rounded-[10px] flex items-center justify-center hover:scale-110 transition-transform shadow-md"><i class="fa-brands fa-instagram text-sm"></i></button>` : '';

                    container.innerHTML += `
                    <label class="cursor-pointer block relative group active:scale-[0.98] transition-transform ${barber.is_featured ? 'mt-3' : ''}">
                        <input type="radio" name="target_select" value="${barber.id}" class="hidden peer" ${index === 0 ? 'checked' : ''}>
                        ${featuredBadge}
                        <div class="absolute -right-6 top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-gray-300 rounded-full peer-checked:border-amber-500 peer-checked:bg-amber-500 transition-all z-10 duration-300 shadow-sm"></div>

                        <div class="bg-white rounded-[2rem] p-4 flex items-center gap-4 border-2 border-transparent peer-checked:border-gray-900 peer-checked:shadow-lg transition-all duration-300 shadow-sm hover:shadow-md ${barber.is_featured ? 'ring-2 ring-amber-400 ring-offset-2 bg-gradient-to-r from-amber-50/30 to-white' : ''}">
                            <div class="relative">
                                <img src="${avatar}" class="w-16 h-16 rounded-2xl object-cover shadow-sm border border-gray-100 ${isFav ? 'ring-2 ring-red-500 ring-offset-2' : ''}">
                                <div class="absolute -bottom-2 -right-2 bg-gray-900 text-white text-[10px] font-black px-2 py-0.5 rounded-lg shadow-sm">${rating.toFixed(1)}</div>
                            </div>
                            <div class="flex-1">
                                <div class="flex justify-between items-start">
                                    <h4 class="font-black text-gray-900 text-sm mb-1">${safeName}</h4>
                                    ${favBadge}
                                </div>
                                <div class="text-[9px] flex items-center gap-0.5 mt-1">${starsHtml} <span class="text-gray-400 ml-1">${countStr}</span></div>
                                <div class="flex items-center gap-2 mt-2">
                                    <button onclick="event.preventDefault(); openPortfolio('barber', '${barber.id}', '${safeName}')" class="text-[10px] bg-gray-50 border border-gray-100 text-gray-600 px-3 py-1.5 rounded-xl font-bold hover:bg-gray-100 hover:text-gray-900 transition shadow-sm flex items-center gap-1 active:scale-95"><i class="fa-solid fa-images text-amber-500"></i> أعمالي</button>
                                    ${instagramBtn}
                                </div>
                            </div>
                            <div class="w-6 h-6 bg-gray-900 text-white rounded-full flex items-center justify-center opacity-0 peer-checked:opacity-100 transition-opacity shadow-md"><i class="fa-solid fa-check text-[10px]"></i></div>
                        </div>
                    </label>`;
                });
            }
            window.switchCustomerView('customer-barber-select'); window.scrollTo(0,0);
        } catch(e) {
            console.error("Error loading barbers:", e);
        } finally {
            window.hideLoader();
        }
    }

    async function loadSalonsList() {
        window.showLoader(100, null);
        try {
            const { data: salons } = await supabaseClient.from('salons').select('*').eq('is_active', true).eq('status', 'approved');
            
            const container = document.getElementById('salons-list-container');
            if(!container) return;

            if (!salons || salons.length === 0) { 
                container.innerHTML = '<div class="text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-100 border-dashed"><i class="fa-solid fa-shop-slash text-4xl text-gray-200 mb-3 block"></i><p class="text-gray-500 font-bold text-sm">عذراً، لا توجد صالونات متاحة حالياً.</p></div>'; 
            } else { 
                allSalons = salons; renderSalons(allSalons); 
            }
            window.switchCustomerView('customer-salon-select'); window.scrollTo(0,0);
        } catch(e) {
            console.error("Error loading salons:", e);
        } finally {
            window.hideLoader();
        }
    }

    function renderSalons(salonsArray) {
        const container = document.getElementById('salons-list-container'); 
        if(!container) return;
        
        salonsArray.sort((a, b) => {
            // 🚀 1. الأولوية القصوى للصالون القادم من شاشة الاستكشاف
            if (exploreTarget && exploreTarget.type === 'salon') {
                if (a.id === exploreTarget.id) return -1;
                if (b.id === exploreTarget.id) return 1;
            }
            if(a.distanceKm && b.distanceKm) {
                 return a.distanceKm - b.distanceKm; 
            }
            if (a.is_featured && !b.is_featured) return -1;
            if (!a.is_featured && b.is_featured) return 1;
            return 0;
        });

        container.innerHTML = '';

        salonsArray.forEach((salon, index) => {
            const salonImage = window.escapeHTML(salon.main_image) || 'https://images.unsplash.com/photo-1522337660859-02fbefca4702?q=80&w=800';
            const safeSalonName = window.escapeHTML(salon.name);
            
            const distanceHtml = salon.distanceKm ? `<div class="absolute top-3 left-3 bg-white/95 backdrop-blur text-gray-900 text-[10px] font-bold px-3 py-1.5 rounded-full shadow-md border border-gray-100 flex items-center gap-1.5"><i class="fa-solid fa-route text-amber-500"></i> ${salon.distanceKm.toFixed(1)} كم</div>` : '';
            
            const locationBtnHtml = (salon.lat && salon.lng) ? `<button onclick="event.preventDefault(); window.open('https://www.google.com/maps/dir/?api=1&destination=...?daddr=$${salon.lat},${salon.lng}', '_blank')" class="w-10 h-10 bg-gray-50 border border-gray-100 text-gray-600 rounded-full flex items-center justify-center hover:bg-gray-200 hover:text-gray-900 transition shadow-sm active:scale-90" title="مسار الخريطة المباشر"><i class="fa-solid fa-location-arrow text-amber-500 text-sm"></i></button>` : '';
            
            let featuresHtml = '';
            if(salon.features) {
                const featuresArray = salon.features.split('،').slice(0, 3); 
                featuresArray.forEach(f => {
                    if(f.trim()) featuresHtml += `<span class="bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-lg text-[9px] font-bold border border-gray-200 shadow-sm">${window.escapeHTML(f.trim())}</span>`;
                });
            }

            const featuredBadge = salon.is_featured ? `<div class="absolute -top-3 -right-2 bg-gradient-to-l from-amber-500 to-yellow-400 text-gray-900 px-3 py-1 rounded-xl text-[10px] font-black shadow-lg transform rotate-3 z-20 flex items-center gap-1 border border-yellow-300"><i class="fa-solid fa-crown"></i> صالون مميز</div>` : '';
            
            const instagramBtn = salon.instagram_link ? `<button onclick="event.preventDefault(); window.open('${window.escapeHTML(salon.instagram_link)}', '_blank')" class="w-10 h-10 bg-white border border-gray-100 rounded-full flex items-center justify-center hover:scale-110 transition-transform shadow-sm text-pink-600"><i class="fa-brands fa-instagram text-lg"></i></button>` : '';

            container.innerHTML += `
            <label class="cursor-pointer block relative group active:scale-[0.98] transition-transform ${salon.is_featured ? 'mt-3' : ''}">
                <input type="radio" name="target_select" value="${salon.id}" class="hidden peer" ${index === 0 ? 'checked' : ''}>
                ${featuredBadge}
                
                <div class="bg-white p-3 rounded-[2rem] border-2 border-transparent peer-checked:border-gray-900 peer-checked:shadow-xl transition-all duration-300 shadow-sm hover:shadow-md flex flex-col gap-3 ${salon.is_featured ? 'ring-2 ring-amber-400 ring-offset-2' : ''}">
                    
                    <div class="h-44 w-full relative rounded-2xl overflow-hidden border border-gray-100">
                        <img src="${salonImage}" class="w-full h-full object-cover">
                        ${distanceHtml}
                        <div class="absolute top-3 right-3 w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center opacity-0 peer-checked:opacity-100 transition-opacity shadow-lg border border-gray-700"><i class="fa-solid fa-check text-sm text-amber-500"></i></div>
                    </div>
                    
                    <div class="px-2 pb-2">
                        <div class="flex justify-between items-start mb-3">
                            <div class="flex-1">
                                <h4 class="font-black text-gray-900 text-lg mb-1">${safeSalonName}</h4>
                                <p class="text-[10px] text-gray-500 font-bold truncate flex items-center gap-1.5"><i class="fa-solid fa-map-location-dot text-amber-500"></i> ${window.escapeHTML(salon.address)}</p>
                            </div>
                            <div class="flex gap-2">
                                ${instagramBtn}
                                ${locationBtnHtml}
                            </div>
                        </div>

                        <div class="flex flex-wrap gap-2 mb-4">
                            ${featuresHtml}
                        </div>

                        <div class="flex gap-2 border-t border-gray-100 pt-3 mt-1">
                            <button onclick="event.preventDefault(); openPortfolio('salon', '${salon.id}', '${safeSalonName}')" class="px-4 py-2.5 bg-gray-50 border border-gray-200 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-100 hover:text-gray-900 transition shadow-sm text-xs font-bold gap-2 active:scale-95"><i class="fa-solid fa-images text-amber-500"></i> صور</button>
                            <button onclick="event.preventDefault(); openSalonMenu('${salon.id}', '${safeSalonName}')" class="flex-1 bg-gray-900 text-white px-4 py-2.5 rounded-xl text-xs font-black hover:bg-black transition shadow-md flex items-center justify-center gap-2 active:scale-95">الخدمات والأسعار <i class="fa-solid fa-arrow-left text-amber-500"></i></button>
                        </div>
                    </div>

                </div>
            </label>`;
        });
    }

    // ==========================================
    // 📍 12. الموقع الجغرافي وحساب المسافات
    // ==========================================
    window.parseAddressData = function(data) {
        if (!data) return "";
        let finalAddress = "";

        if (data.address) {
            let parts = [];
            const a = data.address;
            if (a.state || a.region || a.county) parts.push(a.state || a.region || a.county);
            if (a.city || a.town || a.village || a.municipality) parts.push(a.city || a.town || a.village || a.municipality);
            if (a.suburb || a.neighbourhood || a.district || a.quarter) parts.push(a.suburb || a.neighbourhood || a.district || a.quarter);
            if (a.road || a.pedestrian || a.street) parts.push(a.road || a.pedestrian || a.street);

            let uniqueParts = [];
            parts.forEach(p => { if (!uniqueParts.includes(p)) uniqueParts.push(p); });
            
            if (uniqueParts.length > 0) finalAddress = uniqueParts.join('، ');
        }

        if (!finalAddress && data.display_name) {
            finalAddress = data.display_name;
        }

        return finalAddress.replace("، مصر", "").replace(", Egypt", "");
    };

    function autoFetchLocation() {
        if (navigator.geolocation && !userLat) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                userLat = position.coords.latitude; userLng = position.coords.longitude;
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLng}&zoom=16&addressdetails=1&accept-language=ar`);
                    const data = await response.json();
                    const fullAddress = window.parseAddressData(data);
                    const addrInput = document.getElementById('book-address');
                    if(addrInput && fullAddress && !addrInput.value) {
                        addrInput.value = `${fullAddress}\n(يرجى إضافة رقم العمارة والشقة)`;
                    }
                } catch(e) {}
            });
        }
    }

    window.getLocation = function(btn) {
        const textarea = document.getElementById('book-address');
        if (!navigator.geolocation) return window.showToast("عفواً، متصفحك لا يدعم تحديد الموقع.");
        
        const selectedRadio = document.querySelector('input[name="target_select"]:checked');
        const targetIdAtRequest = selectedRadio ? selectedRadio.value : null;

        window.showLoader(); 
        navigator.geolocation.getCurrentPosition(async (position) => {
            userLat = position.coords.latitude; userLng = position.coords.longitude;
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLat}&lon=${userLng}&zoom=16&addressdetails=1&accept-language=ar`);
                const data = await response.json();
                const fullAddress = window.parseAddressData(data);
                
                if (fullAddress && textarea) {
                    textarea.value = `${fullAddress}\n(يرجى إضافة رقم العمارة والشقة)`;
                } else if(textarea) { 
                    textarea.value = "تم تحديد الإحداثيات بدقة (يرجى كتابة التفاصيل يدوياً)"; 
                }
            } catch (error) { 
                if(textarea) textarea.value = "تم تحديد الإحداثيات بدقة (يرجى كتابة التفاصيل يدوياً)"; 
            }

            if (currentBookingType === 'home') {
                const selectedNow = document.querySelector('input[name="target_select"]:checked');
                if (selectedNow && selectedNow.value === targetIdAtRequest) {
                    try {
                        const { data: freshBarberLocation } = await supabaseClient.from('profiles').select('lat, lng').eq('id', selectedNow.value).single();
                        const selectedBarber = allBarbers.find(b => b.id === selectedNow.value);
                        
                        let targetLat = (freshBarberLocation && freshBarberLocation.lat) ? freshBarberLocation.lat : (selectedBarber ? selectedBarber.lat : null);
                        let targetLng = (freshBarberLocation && freshBarberLocation.lng) ? freshBarberLocation.lng : (selectedBarber ? selectedBarber.lng : null);

                        if (targetLat && targetLng) {
                            const route = await window.calculateRoute(userLat, userLng, targetLat, targetLng);
                            if(route && route.success) {
                                currentTransportFee = window.calculateTransportFee(route.distance);
                                window.showToast(`تم حساب التوصيل بدقة: ${route.distance.toFixed(1)} كم ✅`);
                            } else {
                                currentTransportFee = 30; 
                                window.showToast("لم نتمكن من حساب الطريق بدقة، تم تطبيق الحد الأدنى 30 ج.م ⚠️");
                            }
                        } else {
                            currentTransportFee = 30; 
                            window.showToast("الكابتن لم يحدد موقعه بعد، تم تطبيق الحد الأدنى 30 ج.م ⚠️");
                        }
                    } catch(e) {
                        currentTransportFee = 30;
                    }
                    window.updateFinalPriceDisplay();
                }
            }

            window.hideLoader();
        }, (error) => { window.hideLoader(); window.showToast("يرجى تفعيل الـ GPS"); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
    };

    window.sortSalonsByLocation = function() {
        if (!navigator.geolocation) return window.showToast("متصفحك لا يدعم تحديد الموقع");
        window.showLoader();
        navigator.geolocation.getCurrentPosition((position) => {
            const uLat = position.coords.latitude; const uLng = position.coords.longitude;
            allSalons.forEach(salon => {
                if(salon.lat && salon.lng) salon.distanceKm = calculateDistance(uLat, uLng, salon.lat, salon.lng);
                else salon.distanceKm = 999; 
            });
            allSalons.sort((a, b) => a.distanceKm - b.distanceKm);
            window.hideLoader(); renderSalons(allSalons); window.showToast("تم ترتيب الصالونات حسب الأقرب لك");
        }, (error) => { window.hideLoader(); window.showToast("يرجى تفعيل الـ GPS من الموبايل."); }, { enableHighAccuracy: true });
    };

    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))); 
    }

    // ==========================================
    // 🖼️ 13. إدارة النوافذ الفرعية
    // ==========================================
    window.openPortfolio = async function(type, id, name) {
        window.showLoader();
        try {
            const table = type === 'salon' ? 'salon_works' : 'barber_works'; 
            const column = type === 'salon' ? 'salon_id' : 'barber_id';
            const { data: works } = await supabaseClient.from(table).select('image_url').eq(column, id).order('created_at', { ascending: false });
            
            const titleEl = document.getElementById('portfolio-modal-title');
            if(titleEl) titleEl.innerHTML = `<i class="fa-solid fa-images text-amber-500 ml-1"></i> ${type === 'salon' ? `صور ${window.escapeHTML(name)}` : `أعمال ${window.escapeHTML(name)}`}`;
            
            const gallery = document.getElementById('customer-portfolio-gallery'); 
            if(gallery) gallery.innerHTML = '';
            
            if (works && works.length > 0 && gallery) {
                works.forEach(w => { gallery.innerHTML += `<div class="rounded-2xl overflow-hidden aspect-square shadow-sm border border-gray-100 cursor-pointer hover:opacity-80 transition active:scale-95" onclick="window.open('${window.escapeHTML(w.image_url)}', '_blank')"><img src="${window.escapeHTML(w.image_url)}" class="w-full h-full object-cover"></div>`; });
            } else if(gallery) { 
                gallery.innerHTML = '<div class="col-span-2 text-center p-8 bg-gray-50 rounded-2xl border border-dashed text-gray-400 font-bold text-xs"><i class="fa-solid fa-folder-open text-3xl mb-3 block"></i>لا توجد صور متاحة حالياً.</div>'; 
            }
            
            if(typeof window.openModal === 'function') window.openModal('portfolio-modal');
        } catch(e) {
            console.error(e);
        } finally {
            window.hideLoader();
        }
    };

    window.openCancelModal = function() { 
        if (!currentActiveOrderId) return; 
        if(typeof window.openModal === 'function') window.openModal('cancel-modal');
    };

   window.submitCancelOrder = async function(reason) {
        if (!currentActiveOrderId) return;
        window.showLoader(100, null); 
        try {
            const { data: orderData, error: fetchErr } = await supabaseClient.from('orders')
                .select('barber_id, salon_id')
                .eq('id', currentActiveOrderId)
                .single();
            
            const { error: updateErr } = await supabaseClient.from('orders')
                .update({ status: 'cancelled' })
                .eq('id', currentActiveOrderId);
            
            if (updateErr) throw updateErr;
            
            if(orderData && orderData.barber_id && typeof window.sendAppNotification === 'function') {
                window.sendAppNotification(
                    orderData.barber_id, 
                    "تم إلغاء الطلب ❌", 
                    `قام العميل بإلغاء الطلب. السبب: ${window.escapeHTML(reason)}`, 
                    "https://barberhome.pages.dev/pages/barber.html", 
                    "order"
                );
            }

            if(orderData && orderData.salon_id && typeof window.sendAppNotification === 'function') {
                const { data: salonInfo } = await supabaseClient.from('salons').select('owner_id').eq('id', orderData.salon_id).single();
                if(salonInfo && salonInfo.owner_id) {
                    window.sendAppNotification(
                        salonInfo.owner_id, 
                        "تم إلغاء حجز ❌", 
                        `قام العميل بإلغاء حجزه. السبب: ${window.escapeHTML(reason)}`, 
                        "https://barberhome.pages.dev/pages/salon.html", 
                        "order"
                    );
                }
            }

            if(typeof window.closeModal === 'function') window.closeModal('cancel-modal'); 
            window.playSound('success');
            window.showToast('تم إلغاء الطلب بنجاح.'); 
            
            setTimeout(() => location.reload(), 1500);

        } catch(e) {
            console.error("Cancel Error:", e);
            window.playSound('error');
            window.showToast('حدث خطأ في قاعدة البيانات، تأكد من صلاحيات حسابك (RLS).');
        } finally {
            window.hideLoader();
        }
    };

    function setupStarsInteraction() { 
        const stars = document.querySelectorAll('#star-rating i'); 
        stars.forEach((star, index) => { star.addEventListener('click', () => { selectedRatingStars = index + 1; updateStarsUI(selectedRatingStars); }); }); 
    }

    function updateStarsUI(rating) { 
        const stars = document.querySelectorAll('#star-rating i'); 
        stars.forEach((star, index) => { if (index < rating) { star.classList.add('text-amber-500'); star.classList.remove('text-gray-200'); } else { star.classList.add('text-gray-200'); star.classList.remove('text-amber-500'); } }); 
    }

    window.submitRating = async function() { 
        if (!currentActiveOrderId) return location.reload(); 
        
        const favCheckbox = document.getElementById('mark-favorite');
        const ratingSection = document.getElementById('customer-rating');
        const bId = ratingSection ? ratingSection.getAttribute('data-barber-id') : null;
        
        if(favCheckbox && favCheckbox.checked && bId) {
            localStorage.setItem('favoriteBarber', window.escapeHTML(bId));
        }

        window.showLoader(100, null); 
        try {
            await supabaseClient.from('orders').update({ rating_score: selectedRatingStars }).eq('id', currentActiveOrderId); 
            window.showToast('شكراً لتقييمك!'); 
            setTimeout(() => { location.reload(); }, 1500); 
        } catch(e) {
            window.showToast('حدث خطأ أثناء التقييم.');
        } finally {
            window.hideLoader();
        }
    };

    window.sendPushWithActions = async function(barberId, orderId, customerName, services) {
        const APP_ID = "b42c9e5d-cad6-470f-9eea-31f07b195168"; 
        const WORKER_URL = "https://barber-notifications.the-world22925.workers.dev"; 

        const body = {
            app_id: APP_ID,
            include_external_user_ids: [String(barberId)], 
            target_channel: "push",
            headings: { "ar": `طلب حجز جديد من ${window.escapeHTML(customerName)} ✂️` },
            contents: { "ar": `الخدمات المطلوبة: ${window.escapeHTML(services)}\nاضغط للتفاصيل أو للقبول مباشرة.` },
            data: { orderId: orderId, type: "private_order" }, 
            buttons: [{ id: "accept-btn", text: "✅ قبول" }, { id: "reject-btn", text: "❌ رفض" }],
            web_buttons: [
                { id: "accept-btn", text: "✅ قبول", url: `https://barberhome.pages.dev/pages/barber.html?orderId=${orderId}&action=accept` },
                { id: "reject-btn", text: "❌ رفض", url: `https://barberhome.pages.dev/pages/barber.html?orderId=${orderId}&action=ignore` }
            ],
            app_url: `https://barberhome.pages.dev/pages/barber.html?orderId=${orderId}`,
            android_accent_color: "FF8C00"
        };

        try {
            await fetch(WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        } catch(e) { console.error("Push Error", e); }
    };

    // ==========================================
    // 🕰️ 14. سجل الطلبات والدعم الفني (الشكاوى)
    // ==========================================
    window.loadCustomerHistory = async function() {
        const container = document.getElementById('customer-history-container');
        if(!container) return;

        container.innerHTML = `
            <div class="text-center py-10 bg-white rounded-[2rem] border border-dashed border-gray-200">
                <div class="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3"><i class="fa-solid fa-spinner fa-spin text-gray-300 text-2xl"></i></div>
                <p class="text-gray-500 font-bold text-xs">جاري تحميل السجل...</p>
            </div>`;

        try {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return;

            const { data: historyOrders, error } = await supabaseClient
                .from('orders')
                .select('*, barber:barber_id(full_name), salon:salon_id(name)')
                .eq('customer_id', user.id)
                .in('status', ['completed', 'cancelled'])
                .order('created_at', { ascending: false });

            if (error || !historyOrders || historyOrders.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-10 bg-white rounded-[2rem] border border-dashed border-gray-200">
                        <div class="w-14 h-14 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3"><i class="fa-solid fa-clock-rotate-left text-gray-300 text-2xl"></i></div>
                        <p class="text-gray-500 font-bold text-xs">لا توجد طلبات سابقة في سجلك.</p>
                    </div>`;
                return;
            }

            container.innerHTML = '';
            historyOrders.forEach(order => {
                const isCompleted = order.status === 'completed';
                const statusBadge = isCompleted 
                    ? `<span class="bg-green-50 text-green-600 border border-green-100 px-2 py-0.5 rounded-lg text-[9px] font-black"><i class="fa-solid fa-check ml-1"></i>مكتمل</span>` 
                    : `<span class="bg-red-50 text-red-500 border border-red-100 px-2 py-0.5 rounded-lg text-[9px] font-black"><i class="fa-solid fa-xmark ml-1"></i>ملغي</span>`;
                
                const targetName = order.booking_type === 'home' 
                    ? (order.barber ? window.escapeHTML(order.barber.full_name) : 'كابتن') 
                    : (order.salon ? window.escapeHTML(order.salon.name) : 'صالون');
                    
                const typeIcon = order.booking_type === 'home' ? '<i class="fa-solid fa-motorcycle text-amber-500"></i>' : '<i class="fa-solid fa-shop text-purple-500"></i>';
                const orderDate = new Date(order.created_at).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });

                container.innerHTML += `
                    <div class="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm hover:shadow-md transition-all relative overflow-hidden">
                        <div class="flex justify-between items-start mb-3 border-b border-gray-50 pb-3">
                            <div>
                                <h4 class="font-black text-gray-900 text-sm flex items-center gap-2">${typeIcon} ${targetName}</h4>
                                <p class="text-[10px] text-gray-400 font-bold mt-1">${orderDate}</p>
                            </div>
                            <div class="text-left">
                                <p class="font-black text-lg text-gray-900">${order.final_total} <span class="text-[10px] text-gray-400">ج.م</span></p>
                                ${statusBadge}
                            </div>
                        </div>
                        
                        <p class="text-[10px] text-gray-600 font-bold mb-4 line-clamp-2"><i class="fa-solid fa-scissors ml-1 text-gray-400"></i>${window.escapeHTML(order.services_text)}</p>
                        
                        <div class="flex gap-2">
                            <button onclick="openComplaintModal('${order.id}', '${targetName}')" class="flex-1 bg-red-50 text-red-600 border border-red-100 py-2.5 rounded-xl font-bold text-xs hover:bg-red-100 transition active:scale-95 flex items-center justify-center gap-2">
                                <i class="fa-solid fa-circle-exclamation"></i> تقديم شكوى
                            </button>
                        </div>
                    </div>`;
            });
        } catch(e) {
            container.innerHTML = '<p class="text-center text-red-500 font-bold text-xs p-4">حدث خطأ أثناء جلب السجل.</p>';
        }
    };

    window.openComplaintModal = function(orderId, targetName) {
        document.getElementById('complaint-order-id').value = orderId;
        document.getElementById('complaint-target-text').innerHTML = `بخصوص الطلب مع: <span class="text-gray-900 font-black">${window.escapeHTML(targetName)}</span>`;
        document.getElementById('complaint-type').value = '';
        document.getElementById('complaint-details').value = '';
        
        if(typeof window.openModal === 'function') window.openModal('complaint-modal');
    };

    window.submitComplaint = async function() {
        const orderId = document.getElementById('complaint-order-id').value;
        const type = document.getElementById('complaint-type').value;
        const details = document.getElementById('complaint-details').value.trim();

        if (!type) {
            window.playSound('error');
            return window.showToast('يرجى اختيار نوع الشكوى أولاً.');
        }

        window.showLoader();
        try {
            const { data: { user } } = await supabaseClient.auth.getUser();

            const { error } = await supabaseClient.from('support_tickets').insert([{
                customer_id: user.id,
                order_id: orderId || null,
                complaint_type: type,
                details: window.escapeHTML(details)
            }]);

            if (error) { throw error; } 
            
            window.playSound('success');
            window.showToast('تم الإرسال بنجاح، سيتم مراجعتها في أقرب وقت. شكراً لك!');
            if(typeof window.closeModal === 'function') window.closeModal('complaint-modal');
        } catch(e) {
            window.playSound('error');
            window.showToast('حدث خطأ أثناء إرسال الشكوى، يرجى المحاولة لاحقاً.');
        } finally {
            window.hideLoader();
        }
    };

})();

// 1. دالة لجلب الرصيد وتحديث الواجهة
async function updateWalletDisplay() {
    const { data: profile } = await supabaseClient
        .from('profiles')
        .select('wallet_balance')
        .single();
    
    if (profile) {
        const walletEl = document.getElementById('wallet-display');
        if (walletEl) walletEl.innerText = `${profile.wallet_balance.toLocaleString()} ج.م`;
    }
}

// 2. دالة إرسال طلب الشحن للإدارة
window.submitChargeRequest = async function() {
    const amount = document.getElementById('charge-amount').value;
    if (!amount || amount <= 0) return alert("برجاء إدخال مبلغ صحيح");

    window.showLoader();
    const { data: { user } } = await supabaseClient.auth.getUser();

    const { error } = await supabaseClient.from('wallet_requests').insert([
        { user_id: user.id, amount: parseFloat(amount) }
    ]);

    window.hideLoader();
    if (!error) {
        window.showToast("تم إرسال طلبك! سيتم مراجعة التحويل وإضافة الرصيد فوراً ✅");
        if(typeof window.closeModal === 'function') window.closeModal('charge-wallet-modal');
    } else {
        window.showToast("حدث خطأ، حاول مرة أخرى ❌");
    }
};

// تشغيل جلب الرصيد وتفعيل المراقبة بأمان
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof supabaseClient === 'undefined') return;
    
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        updateWalletDisplay();

        // الاشتراك في تغييرات جدول الـ profiles للمستخدم الحالي
        supabaseClient
          .channel('wallet-updates')
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, payload => {
              const walletEl = document.getElementById('wallet-display');
              if (walletEl) walletEl.innerText = `${payload.new.wallet_balance.toLocaleString()} ج.م`;
              if(typeof window.showToast === 'function') window.showToast("تم تحديث رصيد محفظتك! 💰");
          })
          .subscribe();
    }
});