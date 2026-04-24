// اسم الملف: admin.js
    // المسار: js/admin.js
    // الوظيفة: لوحة تحكم الإدارة المرتبطة بقاعدة بيانات Supabase (نسخة محمية 🛡️ + رادار المديونيات وإيقاف الحسابات + الإعدادات الديناميكية)

    (() => {
        // ==========================================
        // 📦 1. إدارة الحالة (State Management)
        // ==========================================
        const state = {
            adminId: null,
            adminRole: null, 
            editingServiceId: null,
            activeSupportTicketFilter: 'pending' 
        };

        // ==========================================
        // 🚀 2. التهيئة وبدء التشغيل (Initialization)
        // ==========================================
        document.addEventListener('DOMContentLoaded', async () => {
            if (typeof supabaseClient === 'undefined') {
                console.error("Supabase client is not loaded!");
                return;
            }

            const { data: { session } } = await supabaseClient.auth.getSession();
            
            if (session) {
                const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', session.user.id).single();
                
                if (profile && (profile.role === 'admin' || profile.role === 'sub_admin')) {
                    state.adminId = session.user.id;
                    state.adminRole = profile.role;

                    document.getElementById('admin-login-view').classList.add('hidden');
                    document.getElementById('sidebar').classList.remove('hidden');
                    document.getElementById('main-content').classList.remove('hidden');
                    
                    applyAdminPermissions(state.adminRole);

                    loadDashboardStats();
                    loadPendingBarbers();
                    loadActiveBarbers();
                    loadLiveOrders();
                    loadServicesList();
                    loadAdminSalons(); 
                    loadSupportTickets(state.activeSupportTicketFilter); 
                    
                    if (state.adminRole === 'admin') {
                        loadAdminsList();
                        loadDebtRequests();
                        loadPayoutRequests();
                        loadPendingCustomerPayments(); 
                        loadAppSettings(); // 🚀 جلب الإعدادات فور الدخول
                    }

                    setupRealtimeListeners();
                } else {
                    await supabaseClient.auth.signOut();
                    window.location.replace('../index.html');
                }
            }
        });

        // ==========================================
        // ⚙️ إعدادات التطبيق الديناميكية (جديد)
        // ==========================================
        async function loadAppSettings() {
            const { data: settings, error } = await supabaseClient.from('app_settings').select('*').eq('id', 1).maybeSingle();
            if (settings) {
                const bComm = document.getElementById('setting-barber-comm');
                const sComm = document.getElementById('setting-salon-comm');
                const salonToggle = document.getElementById('setting-salon-active');
                const salonText = document.getElementById('salon-status-text');
                
                if(bComm) bComm.value = settings.barber_commission;
                if(sComm) sComm.value = settings.salon_commission;
                
                if (salonToggle && salonText) {
                    salonToggle.checked = settings.is_salon_booking_active;
                    salonText.innerText = settings.is_salon_booking_active ? 'متاح الآن' : 'مغلق (قريباً)';
                    salonText.className = settings.is_salon_booking_active ? 'text-[10px] text-green-400 mt-2 font-bold' : 'text-[10px] text-red-400 mt-2 font-bold';
                }
            }
        }

        window.saveAppSettings = async function() {
            window.showLoader();
            const bComm = Number(document.getElementById('setting-barber-comm').value);
            const sComm = Number(document.getElementById('setting-salon-comm').value);
            const isSalonActive = document.getElementById('setting-salon-active').checked;

            const { error } = await supabaseClient.from('app_settings').update({
                barber_commission: bComm,
                salon_commission: sComm,
                is_salon_booking_active: isSalonActive
            }).eq('id', 1);

            window.hideLoader();
            if (error) {
                window.playSound('error');
                window.showToast('حدث خطأ أثناء حفظ الإعدادات!');
            } else {
                window.playSound('success');
                window.showToast('تم حفظ الإعدادات بنجاح. ستطبق على الطلبات الجديدة فوراً ✅');
            }
        };

        // ==========================================
        // 📡 3. الرادار المباشر (Real-time Subscriptions)
        // ==========================================
        function setupRealtimeListeners() {
            supabaseClient
                .channel('admin-mega-channel')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                    loadLiveOrders(); 
                    loadDashboardStats();
                    if(state.adminRole === 'admin') loadPendingCustomerPayments(); 

                    if (payload.eventType === 'INSERT') {
                        window.playAdminSound('order');
                        window.showToast('تنبيه: تم تسجيل حجز جديد في النظام 🔔');
                    }
                    if (payload.new && payload.new.status === 'completed' && payload.new.payment_method === 'instapay' && payload.new.payment_status === 'unpaid') {
                        window.playAdminSound('payment');
                        window.showToast('تنبيه: يوجد عميل في انتظار تأكيد تحويل InstaPay! 💸');
                    }
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
                    loadPendingBarbers(); 
                    loadActiveBarbers();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'salons' }, () => {
                    loadAdminSalons(); 
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'payout_requests' }, () => {
                    if(state.adminRole === 'admin') loadPayoutRequests();
                    window.showToast('طلب سحب أرباح جديد من كابتن! 💰');
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'salon_payout_requests' }, () => {
                    if(state.adminRole === 'admin') loadPayoutRequests();
                    window.showToast('طلب سحب أرباح جديد من صالون! 💰');
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'barber_finances' }, (payload) => {
                    if(state.adminRole === 'admin') loadDebtRequests(); 
                    loadActiveBarbers(); // لتحديث بادج المديونية اللحظي
                    if (payload.new && payload.new.debt_payment_pending === true) {
                        window.showToast('كابتن يطلب تأكيد دفع مديونية! 🧾');
                    }
                })
                .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'salon_finances' }, (payload) => {
                    if(state.adminRole === 'admin') loadDebtRequests(); 
                    loadAdminSalons(); // لتحديث بادج المديونية اللحظي
                    if (payload.new && payload.new.debt_payment_pending === true) {
                        window.showToast('صالون يطلب تأكيد دفع مديونية! 🧾');
                    }
                })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_tickets' }, () => {
                    if(document.getElementById('view-support').classList.contains('active')) {
                        loadSupportTickets(state.activeSupportTicketFilter);
                    }
                    window.playAdminSound('order'); 
                    window.showToast('تنبيه: تم تقديم شكوى جديدة من أحد العملاء ⚠️');
                })
                .subscribe();
        }

        // ==========================================
        // 🔒 4. الدوال الداخلية (Private Functions)
        // ==========================================
        function applyAdminPermissions(role) {
            if (role === 'sub_admin') {
                const financeTab = document.querySelector('[onclick*="finance"]');
                const adminsTab = document.querySelector('[onclick*="admins"]');
                const salonsTab = document.querySelector('[onclick*="salons"]');
                const pendingPaymentsSec = document.getElementById('admin-pending-payments-section');
                
                if(financeTab) financeTab.classList.add('hidden');
                if(adminsTab) adminsTab.classList.add('hidden');
                if(salonsTab) salonsTab.classList.add('hidden'); 
                if(pendingPaymentsSec) pendingPaymentsSec.classList.add('hidden');
            }
        }

        async function loadDashboardStats() {
            const { data: completedOrders } = await supabaseClient.from('orders').select('platform_fee').eq('status', 'completed');
            let totalProfits = 0;
            let completedCount = 0;
            if(completedOrders) {
                completedOrders.forEach(o => totalProfits += Number(o.platform_fee || 0));
                completedCount = completedOrders.length;
            }
            document.getElementById('stat-earnings').innerHTML = `${totalProfits.toLocaleString()} <span class="text-xs font-bold text-gray-400">ج.م</span>`;
            document.getElementById('stat-orders').innerHTML = `${completedCount} <span class="text-xs font-bold text-gray-400">طلب</span>`;
        }

        async function loadPendingCustomerPayments() {
            const { data: pendingPayments, error } = await supabaseClient
                .from('orders')
                .select('*, customer:customer_id(full_name, phone), barber:barber_id(full_name)')
                .eq('payment_method', 'instapay')
                .eq('status', 'completed')
                .eq('payment_status', 'unpaid')
                .order('created_at', { ascending: false }); 

            if(error) return;

            const section = document.getElementById('admin-pending-payments-section');
            const container = document.getElementById('admin-pending-payments-container');
            if(!section || !container) return;

            if(pendingPayments && pendingPayments.length > 0) {
                section.classList.remove('hidden');
                container.innerHTML = '';
                pendingPayments.forEach(order => {
                    const customerName = order.customer ? window.escapeHTML(order.customer.full_name) : 'غير معروف';
                    const barberName = order.barber ? window.escapeHTML(order.barber.full_name) : 'غير معروف';
                    
                    container.innerHTML += `
                        <div class="floating-card p-4 border-r-4 border-blue-500 bg-white shadow-sm transition hover:shadow-md">
                            <div class="flex justify-between items-start mb-3">
                                <div>
                                    <h4 class="font-bold text-sm text-gray-900">${customerName}</h4>
                                    <p class="text-[10px] text-gray-500 font-bold mt-1">كابتن: ${barberName}</p>
                                </div>
                                <span class="font-black text-lg text-blue-600">${order.final_total} <span class="text-[10px] text-gray-400">ج.م</span></span>
                            </div>
                            <button onclick="confirmInstapayReceipt('${order.id}')" class="w-full bg-blue-600 text-white py-2.5 rounded-xl text-xs font-bold shadow-sm hover:bg-blue-700 transition">
                                <i class="fa-solid fa-check ml-1"></i> تأكيد استلام التحويل
                            </button>
                        </div>`;
                });
            } else {
                section.classList.add('hidden');
                container.innerHTML = '';
            }
        }

        async function loadPendingBarbers() {
            const { data: pendingBarbers } = await supabaseClient.from('profiles').select('*').eq('role', 'barber').eq('status', 'pending');
            const container = document.getElementById('pending-barbers-container');
            if (!container || !pendingBarbers) return;
            container.innerHTML = '';
            
            const { count: pendingSalons } = await supabaseClient.from('salons').select('*', { count: 'exact', head: true }).eq('status', 'pending');
            document.getElementById('stat-pending').innerHTML = `${(pendingBarbers.length || 0) + (pendingSalons||0)} <span class="text-xs font-bold text-red-400">طلبات</span>`;

            if (pendingBarbers.length === 0) {
                container.innerHTML = '<p class="text-sm text-gray-500 font-bold p-6 w-full text-center border-2 border-dashed rounded-2xl col-span-2">لا يوجد طلبات انضمام جديدة للكباتن.</p>';
                return;
            }
            pendingBarbers.forEach(barber => {
                const safeName = window.escapeHTML(barber.full_name);
                const safeID = window.escapeHTML(barber.national_id || 'غير متوفر');
                const safePhone = window.escapeHTML(barber.phone);

                container.innerHTML += `
                    <div class="floating-card p-4 border-l-4 border-amber-500 flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white shadow-sm hover:shadow-md transition">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-500"><i class="fa-solid fa-user"></i></div>
                            <div>
                                <h4 class="font-bold text-sm text-gray-900">${safeName}</h4>
                                <p class="text-[10px] text-gray-500 font-bold mt-1">الرقم القومي: <span dir="ltr">${safeID}</span><br><i class="fa-solid fa-phone mt-1 ml-1 text-gray-300"></i> <span dir="ltr">${safePhone}</span></p>
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="approveBarberAction('${barber.id}')" class="flex-1 bg-green-500 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-green-600 shadow-sm transition"><i class="fa-solid fa-check"></i></button>
                            <button onclick="rejectBarberAction('${barber.id}')" class="px-4 bg-red-50 text-red-500 border border-red-100 py-2 rounded-lg text-xs font-bold hover:bg-red-100 shadow-sm transition"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </div>`;
            });
        }

        async function loadActiveBarbers() {
            const { data: activeBarbers } = await supabaseClient.from('profiles').select('*').eq('role', 'barber').in('status', ['active', 'suspended']).order('is_featured', { ascending: false });
            const { data: finances } = await supabaseClient.from('barber_finances').select('barber_id, platform_debt');
            
            const tbody = document.getElementById('active-barbers-body');
            if (!tbody || !activeBarbers) return;
            tbody.innerHTML = '';
            
            const activeCount = activeBarbers.filter(b => b.status === 'active').length;
            document.getElementById('stat-barbers').innerHTML = `${activeCount} <span class="text-xs font-bold text-gray-400">كابتن نشط</span>`;

            if (activeBarbers.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="text-center p-6 text-gray-500 font-bold text-xs">لا يوجد كباتن مسجلين حالياً.</td></tr>';
                return;
            }

            activeBarbers.forEach(barber => {
                const safeName = window.escapeHTML(barber.full_name);
                const safePhone = window.escapeHTML(barber.phone);
                
                const barberFin = finances?.find(f => f.barber_id === barber.id);
                const hasDebt = barberFin && Number(barberFin.platform_debt) > 0;
                const debtAmount = hasDebt ? Number(barberFin.platform_debt).toFixed(0) : 0;

                const isFeatured = barber.is_featured;
                const isSuspended = barber.status === 'suspended';

                const starClass = isFeatured ? 'text-amber-500 bg-amber-50 border border-amber-200' : 'text-gray-400 bg-gray-50 border border-gray-100 hover:bg-gray-100';
                const starIcon = isFeatured ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
                const featuredBtn = !isSuspended ? `<button onclick="toggleFeaturedStatus('${barber.id}', 'barber', ${isFeatured})" class="px-3 py-1.5 rounded-lg text-xs transition shadow-sm ${starClass}" title="تمييز كابتن (VIP)">${starIcon}</button>` : '';

                const statusBadge = isSuspended 
                    ? `<span class="bg-red-100 text-red-700 text-[9px] px-2 py-0.5 rounded-full font-bold">موقوف ⛔</span>` 
                    : `<span class="bg-green-100 text-green-700 text-[9px] px-2 py-0.5 rounded-full font-bold">نشط</span>`;
                
                const featureTag = isFeatured ? `<span class="bg-amber-100 text-amber-700 text-[9px] px-2 py-0.5 rounded-full font-bold ml-1 flex items-center gap-1"><i class="fa-solid fa-crown text-[8px]"></i> مميز</span>` : '';
                const debtBadge = hasDebt ? `<span class="bg-red-50 text-red-600 border border-red-100 text-[9px] px-2 py-0.5 rounded-md font-bold block mt-1 w-max">مديونية: ${debtAmount} ج.م</span>` : '';

                let actionBtns = featuredBtn;
                
                if (isSuspended) {
                    actionBtns += `<button onclick="reactivateAccount('${barber.id}', 'barber')" class="text-white bg-green-600 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-green-700 transition shadow-sm ml-1"><i class="fa-solid fa-unlock ml-1"></i> تفعيل</button>`;
                } else {
                    if (hasDebt) {
                        actionBtns += `<button onclick="suspendForDebt('${barber.id}', 'barber')" class="text-white bg-red-600 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-red-700 transition shadow-sm ml-1" title="إيقاف للمديونية"><i class="fa-solid fa-lock"></i> إيقاف</button>`;
                    }
                    actionBtns += `<button onclick="warnBarber('${barber.id}', '${safeName}')" class="text-amber-600 bg-amber-50 border border-amber-100 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-amber-100 transition shadow-sm ml-1" title="إرسال تحذير"><i class="fa-solid fa-exclamation-triangle"></i></button>`;
                }

                tbody.innerHTML += `
                    <tr class="${isSuspended ? 'bg-red-50/30' : 'hover:bg-gray-50'} transition-all border-b border-gray-50 text-sm">
                        <td class="p-4 font-bold flex items-center gap-3">
                            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=${isSuspended ? 'ef4444' : 'f59e0b'}&color=fff" class="w-8 h-8 rounded-full shadow-sm ${isSuspended ? 'grayscale' : ''}">
                            <div class="flex flex-col">
                                <span class="${isSuspended ? 'line-through text-gray-400' : ''}">${safeName}</span>
                                <div class="flex items-center mt-1 gap-1">
                                    ${statusBadge} ${featureTag}
                                </div>
                                ${debtBadge}
                            </div>
                        </td>
                        <td class="p-4 text-amber-600 font-bold text-xs" dir="ltr">${safePhone}</td>
                        <td class="p-4 text-center flex justify-center items-center">
                            ${actionBtns}
                        </td>
                        <td class="p-4 text-center">
                            <button onclick="openBarberDetailHistory('${barber.id}', '${safeName}')" class="bg-gray-900 text-white px-4 py-1.5 rounded-xl text-[10px] font-bold hover:bg-black transition shadow-sm w-full max-w-[120px]"><i class="fa-solid fa-file-invoice-dollar ml-1"></i> كشف الحساب</button>
                        </td>
                    </tr>`;
            });
        }

        async function loadLiveOrders() {
            const { data: orders } = await supabaseClient.from('orders').select(`*, customer:customer_id (full_name, phone), barber:barber_id (full_name)`).order('created_at', { ascending: false }).limit(50);
            const tbody = document.querySelector('#view-orders tbody');
            if (!tbody || !orders) return;
            tbody.innerHTML = '';
            if (orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center p-6 text-gray-500 font-bold text-xs">لا يوجد أي طلبات حتى الآن.</td></tr>';
                return;
            }
            orders.forEach(order => {
                const customerName = order.customer ? window.escapeHTML(order.customer.full_name) : 'غير معروف';
                const customerPhone = order.customer ? window.escapeHTML(order.customer.phone) : '';
                const barberName = order.barber ? window.escapeHTML(order.barber.full_name) : 'غير محدد';
                const safeServices = window.escapeHTML(order.services_text);
                
                let statusBadge = '';
                if (order.status === 'pending') statusBadge = '<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md text-[10px] font-bold">بانتظار الكابتن</span>';
                else if (order.status === 'accepted') statusBadge = '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-md text-[10px] font-bold animate-pulse">في الطريق/تنفيذ</span>';
                else if (order.status === 'completed') statusBadge = '<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded-md text-[10px] font-bold">مكتمل</span>';
                else if (order.status === 'cancelled') statusBadge = '<span class="bg-red-100 text-red-700 px-2 py-0.5 rounded-md text-[10px] font-bold">ملغي</span>';

                let actionBtn = '';
                if (order.payment_method === 'instapay' && order.status === 'completed' && order.payment_status === 'unpaid') {
                    actionBtn = `<button onclick="confirmInstapayReceipt('${order.id}')" class="mt-2 w-full bg-blue-600 text-white px-2 py-1.5 rounded-lg text-[10px] font-bold hover:bg-blue-700 shadow-sm transition">تأكيد الدفع</button>`;
                } else if (order.payment_method === 'instapay' && order.payment_status === 'paid') {
                    actionBtn = `<div class="mt-2 text-center text-green-600 text-[10px] font-bold"><i class="fa-solid fa-check-circle"></i> تم التحصيل</div>`;
                }
                const payStyle = order.payment_method === 'cash' ? 'bg-gray-100 text-gray-700 border border-gray-200' : 'bg-blue-50 text-blue-700 border border-blue-200';
                const payText = order.payment_method === 'cash' ? 'كاش' : 'انستاباي';
                const typeBadge = order.booking_type === 'salon' ? `<span class="text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md text-[9px] ml-1 font-bold">صالون</span>` : `<span class="text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md text-[9px] ml-1 font-bold">منزلي</span>`;
                const dateStr = new Date(order.created_at).toLocaleDateString('ar-EG', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});

                tbody.innerHTML += `
                    <tr class="hover:bg-gray-50 border-b border-gray-50 transition-all text-sm">
                        <td class="p-4 font-bold text-gray-500 text-xs" dir="ltr">...${order.id.substring(0,6)} <br><span class="text-[9px] text-gray-400 font-normal">${dateStr}</span></td>
                        <td class="p-4 font-bold text-gray-900">${customerName}<br><span class="text-[10px] text-gray-400 font-bold" dir="ltr">${customerPhone}</span></td>
                        <td class="p-4 font-bold text-gray-700">${barberName} <br> ${typeBadge}</td>
                        <td class="p-4 text-[10px] text-gray-600 max-w-[150px] truncate font-bold" title="${safeServices}">${safeServices}</td>
                        <td class="p-4 text-center font-black text-gray-900">${order.final_total} <span class="text-xs">ج.م</span> <span class="text-[9px] ${payStyle} px-1.5 py-0.5 rounded-md block mt-1 w-max mx-auto">${payText}</span></td>
                        <td class="p-4 text-center font-black text-red-500 text-xs">${order.platform_fee} <span class="text-[9px]">ج.م</span></td>
                        <td class="p-4 text-center">${statusBadge} ${actionBtn}</td>
                    </tr>`;
            });
        }

        async function loadServicesList() {
            const { data: services } = await supabaseClient.from('services').select('*').is('salon_id', null).order('created_at', { ascending: false });
            const tbody = document.getElementById('services-table-body');
            if(!tbody || !services) return;
            tbody.innerHTML = '';
            services.forEach(srv => {
                const safeTitle = window.escapeHTML(srv.title);
                const typeBadge = srv.type === 'offer' ? '<span class="bg-amber-100 text-amber-800 px-2 py-1 rounded-md text-[10px] font-bold">عرض خاص 🔥</span>' : '<span class="bg-gray-100 text-gray-800 px-2 py-1 rounded-md text-[10px] font-bold">خدمة أساسية</span>';
                tbody.innerHTML += `
                    <tr class="hover:bg-gray-50 border-b border-gray-50 transition-all text-sm">
                        <td class="p-4 font-bold text-gray-900">${safeTitle}</td>
                        <td class="p-4">${typeBadge}</td>
                        <td class="p-4 text-green-600 font-bold">${srv.price} ج.م</td>
                        <td class="p-4 text-center">
                            <button onclick="editService('${srv.id}')" class="text-blue-600 bg-blue-50 border border-blue-100 hover:bg-blue-100 p-2.5 rounded-xl transition-all shadow-sm ml-1"><i class="fa-solid fa-pen-to-square"></i></button>
                            <button onclick="deleteServiceAction('${srv.id}')" class="text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 p-2.5 rounded-xl transition-all shadow-sm"><i class="fa-solid fa-trash"></i></button>
                        </td>
                    </tr>`;
            });
        }

        async function loadAdminSalons() {
            const { data: salons } = await supabaseClient.from('salons').select('*, profiles(id, full_name, phone)').in('status', ['approved', 'pending', 'suspended']).order('is_featured', {ascending: false}).order('created_at', {ascending: false});
            const { data: finances } = await supabaseClient.from('salon_finances').select('salon_id, platform_debt');

            const list = document.getElementById('admin-salons-list');
            if(!list) return; 
            list.innerHTML = '';

            if (!salons || salons.length === 0) {
                list.innerHTML = '<tr><td colspan="4" class="text-center p-4 text-gray-500 font-bold">لا يوجد صالونات مسجلة.</td></tr>';
                return;
            }

            salons.forEach(salon => {
                const isPending = salon.status === 'pending';
                const isSuspended = salon.status === 'suspended';
                
                const badge = isPending ? `<span class="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold">قيد المراجعة</span>` : 
                            (isSuspended ? `<span class="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">موقوف ⛔</span>` : 
                            `<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">معتمد</span>`);

                const safeSalonId = window.escapeHTML(salon.id);
                const safeOwnerId = salon.profiles ? window.escapeHTML(salon.profiles.id) : '';
                const safeSalonName = window.escapeHTML(salon.name || 'صالون');
                const safeSalonAddress = window.escapeHTML(salon.address || 'لم يحدد');

                const salonFin = finances?.find(f => f.salon_id === salon.id);
                const hasDebt = salonFin && Number(salonFin.platform_debt) > 0;
                const debtAmount = hasDebt ? Number(salonFin.platform_debt).toFixed(0) : 0;
                const debtBadge = hasDebt ? `<span class="bg-red-50 text-red-600 border border-red-100 text-[9px] px-2 py-0.5 rounded-md font-bold block mt-1 w-max">مديونية للمنصة: ${debtAmount} ج.م</span>` : '';

                const isFeatured = salon.is_featured;
                const starClass = isFeatured ? 'text-amber-500 bg-amber-50 border-amber-200' : 'text-gray-400 bg-gray-50 border-gray-100 hover:bg-gray-100';
                const starIcon = isFeatured ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
                const featuredBtn = (salon.status === 'approved') ? `<button onclick="toggleFeaturedStatus('${salon.id}', 'salon', ${isFeatured})" class="px-3 py-1.5 rounded-lg text-xs transition shadow-sm border ${starClass}" title="تمييز صالون (VIP)">${starIcon}</button>` : '';

                let actionButtons = '';
                
                if (isPending) {
                    actionButtons = `
                        <button onclick="setSalonStatus('${safeSalonId}', 'approved')" class="bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-600 shadow-sm transition">اعتماد</button>
                        <button onclick="setSalonStatus('${safeSalonId}', 'rejected')" class="bg-red-50 text-red-500 border border-red-100 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 shadow-sm transition">رفض</button>
                    `;
                } else if (isSuspended) {
                    actionButtons = `<button onclick="reactivateAccount('${safeSalonId}', 'salon', '${safeOwnerId}')" class="text-white bg-green-600 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-green-700 transition shadow-sm w-full"><i class="fa-solid fa-unlock ml-1"></i> تفعيل الصالون</button>`;
                } else {
                    actionButtons = `
                        ${featuredBtn}
                        <button onclick="openSalonDetails('${safeSalonId}', '${safeSalonName}')" class="bg-purple-50 text-purple-600 border border-purple-100 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-purple-100 shadow-sm transition flex-1"><i class="fa-solid fa-chart-pie ml-1"></i> الإحصائيات</button>
                    `;
                    if (hasDebt) {
                        actionButtons += `<button onclick="suspendForDebt('${safeSalonId}', 'salon', '${safeOwnerId}')" class="text-white bg-red-600 px-3 py-1.5 rounded-lg text-[10px] font-bold hover:bg-red-700 transition shadow-sm ml-1 flex-1" title="إيقاف للمديونية"><i class="fa-solid fa-lock"></i> إيقاف</button>`;
                    }
                }

                const ownerName = salon.profiles ? window.escapeHTML(salon.profiles.full_name) : 'غير محدد';
                const ownerPhone = salon.profiles ? window.escapeHTML(salon.profiles.phone) : '';
                const featureTag = isFeatured ? `<span class="bg-amber-100 text-amber-700 text-[9px] px-2 py-0.5 rounded-full font-bold ml-1 inline-flex items-center gap-1"><i class="fa-solid fa-crown text-[8px]"></i> مميز</span>` : '';

                list.innerHTML += `
                    <tr class="${isSuspended ? 'bg-red-50/30' : 'hover:bg-gray-50'} border-b border-gray-50 transition-all">
                        <td class="p-4">
                            <div class="font-bold ${isSuspended ? 'text-gray-400 line-through' : 'text-gray-900'} text-sm flex items-center">${safeSalonName} ${featureTag}</div>
                            <div class="text-[10px] text-gray-500 font-bold mt-1">${ownerName} | <span dir="ltr">${ownerPhone}</span></div>
                            ${debtBadge}
                        </td>
                        <td class="p-4 text-xs text-gray-500 font-bold max-w-[150px] truncate" title="${safeSalonAddress}">${safeSalonAddress}</td>
                        <td class="p-4 text-center">${badge}</td>
                        <td class="p-4 text-center flex flex-wrap gap-2 justify-center items-center">${actionButtons}</td>
                    </tr>`;
            });
        }

        async function loadSupportTickets(status) {
            state.activeSupportTicketFilter = status;
            document.getElementById('btn-filter-pending').className = status === 'pending' ? 'bg-gray-900 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm' : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900 px-5 py-2 rounded-lg text-xs font-bold transition-all';
            document.getElementById('btn-filter-resolved').className = status === 'resolved' ? 'bg-gray-900 text-white px-5 py-2 rounded-lg text-xs font-bold transition-all shadow-sm' : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900 px-5 py-2 rounded-lg text-xs font-bold transition-all';

            window.showLoader(100, null);
            const { data: tickets, error } = await supabaseClient
                .from('support_tickets')
                .select('*, customer:customer_id(full_name, phone), order:order_id(final_total, created_at, barber:barber_id(full_name), salon:salon_id(name))')
                .eq('status', status)
                .order('created_at', { ascending: false });

            window.hideLoader();
            const container = document.getElementById('support-tickets-container');
            container.innerHTML = '';

            if (!tickets || tickets.length === 0) {
                container.innerHTML = `<div class="col-span-full text-center py-10 bg-white rounded-[2rem] border border-dashed border-gray-200"><i class="fa-solid fa-check-double text-4xl text-gray-200 mb-3 block"></i><p class="text-gray-500 font-bold text-sm">لا توجد شكاوى في هذا القسم حالياً.</p></div>`;
                return;
            }

            tickets.forEach(ticket => {
                const customerName = ticket.customer ? window.escapeHTML(ticket.customer.full_name) : 'عميل مجهول';
                const customerPhone = ticket.customer ? window.escapeHTML(ticket.customer.phone) : '';
                const complaintType = window.escapeHTML(ticket.complaint_type);
                const details = window.escapeHTML(ticket.details || 'لا توجد تفاصيل إضافية مسجلة.');
                const dateStr = new Date(ticket.created_at).toLocaleDateString('ar-EG', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});

                let targetName = 'غير محدد';
                let targetInfo = '<span class="text-gray-400">شكوى عامة</span>';
                
                if (ticket.order) {
                    if (ticket.order.barber) targetName = window.escapeHTML(ticket.order.barber.full_name);
                    else if (ticket.order.salon) targetName = window.escapeHTML(ticket.order.salon.name);
                    targetInfo = `<span class="text-blue-600 font-bold">بخصوص: ${targetName}</span>`;
                }

                const actionBtn = status === 'pending' ? `
                    <button onclick="resolveTicket('${ticket.id}', '${ticket.customer_id}')" class="w-full mt-4 bg-green-500 text-white py-3 rounded-xl text-xs font-black shadow-md hover:bg-green-600 transition active:scale-95 flex items-center justify-center gap-2">
                        <i class="fa-solid fa-check-double text-lg"></i> تحديد كـ "تم الحل" وإشعار العميل
                    </button>
                ` : `<div class="mt-4 text-center bg-green-50 text-green-600 py-3 rounded-xl text-xs font-black border border-green-100"><i class="fa-solid fa-check-circle"></i> المشكلة محلولة</div>`;

                container.innerHTML += `
                    <div class="bg-white p-5 rounded-[1.5rem] border-r-4 ${status === 'pending' ? 'border-red-500' : 'border-green-500'} shadow-sm hover:shadow-md transition relative flex flex-col justify-between">
                        <div>
                            <div class="flex justify-between items-start mb-3 border-b border-gray-50 pb-3">
                                <div>
                                    <h4 class="font-black text-gray-900 text-sm"><i class="fa-solid fa-user text-gray-400 ml-1"></i>${customerName}</h4>
                                    <p class="text-[10px] text-gray-500 font-bold mt-1" dir="ltr"><i class="fa-solid fa-phone text-gray-300 mr-1"></i>${customerPhone}</p>
                                </div>
                                <span class="text-[9px] text-gray-400 font-bold">${dateStr}</span>
                            </div>
                            <div class="bg-red-50 p-3 rounded-xl border border-red-100 mb-3">
                                <p class="text-[10px] text-red-600 font-black mb-1">نوع المشكلة: ${complaintType}</p>
                                <p class="text-xs text-gray-800 font-bold leading-relaxed">${details}</p>
                            </div>
                            <div class="text-[10px] bg-blue-50 p-2 rounded-lg border border-blue-100 inline-block mb-1">
                                ${targetInfo}
                            </div>
                        </div>
                        ${actionBtn}
                    </div>`;
            });
        }

        async function loadAdminsList() {
            const { data: admins } = await supabaseClient.from('profiles').select('*').in('role', ['admin', 'sub_admin']);
            const tbody = document.getElementById('admins-table-body');
            if (!tbody || !admins) return;
            
            tbody.innerHTML = '';
            admins.forEach(admin => {
                const safeAdminName = window.escapeHTML(admin.full_name);
                const safeAdminPhone = window.escapeHTML(admin.phone);

                const deleteBtn = admin.id === state.adminId 
                    ? `<span class="text-gray-400 text-[10px] font-bold bg-gray-100 px-2 py-1 rounded">حسابك الحالي</span>` 
                    : `<button onclick="deleteAdminAction('${admin.id}')" class="text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 px-3 py-1.5 rounded-lg shadow-sm transition"><i class="fa-solid fa-trash"></i></button>`;
                
                const roleBadge = admin.role === 'admin' 
                    ? '<span class="bg-gray-900 text-white px-2 py-1 rounded-md text-[10px] font-bold">تحكم كامل</span>'
                    : '<span class="bg-gray-200 text-gray-800 px-2 py-1 rounded-md text-[10px] font-bold">صلاحيات محدودة</span>';

                tbody.innerHTML += `
                    <tr class="hover:bg-gray-50 transition-all border-b border-gray-50 text-sm">
                        <td class="p-4 font-bold text-gray-900">${safeAdminName}</td>
                        <td class="p-4 font-bold text-gray-500" dir="ltr">${safeAdminPhone}</td>
                        <td class="p-4 text-center">${roleBadge}</td>
                        <td class="p-4 flex gap-2 justify-center">${deleteBtn}</td>
                    </tr>`;
            });
        }

        async function loadPayoutRequests() {
            const container = document.querySelector('#view-finance .grid > div:first-child #admin-payouts-list');
            if(!container) return;

            const { data: bReqs } = await supabaseClient.from('payout_requests').select('*, profiles(full_name)').eq('status', 'pending');
            const { data: sReqs } = await supabaseClient.from('salon_payout_requests').select('*, salons(name)').eq('status', 'pending');
            
            let allReqs = [];
            if(bReqs) bReqs.forEach(r => allReqs.push({...r, type: 'barber', entityName: r.profiles?.full_name, entityId: r.barber_id}));
            if(sReqs) sReqs.forEach(r => allReqs.push({...r, type: 'salon', entityName: r.salons?.name, entityId: r.salon_id}));

            let html = '';
            if(allReqs.length > 0) {
                allReqs.forEach(r => {
                    const safeEntityName = window.escapeHTML(r.entityName || 'غير محدد');
                    const safeDetails = window.escapeHTML(r.account_details || '');
                    const typeBadge = r.type === 'salon' ? '<span class="text-[10px] text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full ml-1">صالون</span>' : '<span class="text-[10px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full ml-1">كابتن</span>';
                    
                    html += `<div class="floating-card p-4 mb-3 border-r-4 ${r.type === 'salon' ? 'border-purple-500' : 'border-amber-500'} bg-white shadow-sm transition hover:shadow-md">
                        <div class="flex justify-between items-start mb-3">
                            <div><h4 class="font-bold text-sm text-gray-900">${safeEntityName} ${typeBadge}</h4><p class="text-[10px] text-gray-500 font-bold mt-1">${window.escapeHTML(r.method.toUpperCase())}: ${safeDetails}</p></div>
                            <span class="font-black text-lg text-red-600">${r.amount} <span class="text-[10px] text-gray-500">ج.م</span></span>
                        </div>
                        <button onclick="approvePayout('${r.id}', '${r.entityId}', '${r.type}')" class="w-full bg-gray-900 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-black transition shadow-sm"><i class="fa-solid fa-check ml-1"></i> تأكيد التحويل (تم الدفع)</button>
                    </div>`;
                });
            } else {
                html += '<p class="text-gray-400 text-xs font-bold bg-gray-50 p-6 rounded-2xl text-center border-2 border-dashed">لا توجد طلبات سحب حالياً</p>';
            }
            container.innerHTML = html;
        }

        async function loadDebtRequests() {
            const container = document.querySelector('#view-finance .grid > div:last-child #admin-debts-list');
            if(!container) return;

            const { data: bDebts } = await supabaseClient.from('barber_finances').select('*, profiles(full_name)').eq('debt_payment_pending', true);
            const { data: sDebts } = await supabaseClient.from('salon_finances').select('*, salons(name)').eq('debt_payment_pending', true);

            let allDebts = [];
            if(bDebts) bDebts.forEach(d => allDebts.push({...d, type: 'barber', entityName: d.profiles?.full_name, entityId: d.barber_id}));
            if(sDebts) sDebts.forEach(d => allDebts.push({...d, type: 'salon', entityName: d.salons?.name, entityId: d.salon_id}));

            let html = '';
            if(allDebts.length > 0) {
                allDebts.forEach(d => {
                    const cleanDebt = Number(d.platform_debt || 0).toFixed(2).replace(/\.00$/, '');
                    const safeEntityName = window.escapeHTML(d.entityName || 'غير محدد');
                    const typeBadge = d.type === 'salon' ? '<span class="text-[10px] text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full ml-1">صالون</span>' : '<span class="text-[10px] text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full ml-1">كابتن</span>';
                    
                    html += `<div class="floating-card p-4 mb-3 border-r-4 border-green-500 bg-green-50 shadow-sm transition hover:shadow-md">
                        <div class="flex justify-between items-start mb-3">
                            <div><h4 class="font-bold text-sm text-green-900">${safeEntityName} ${typeBadge}</h4><p class="text-[10px] text-green-600 font-bold mt-1">يؤكد أنه قام بالتحويل للمنصة</p></div>
                            <span class="font-black text-lg text-green-600">${cleanDebt} <span class="text-[10px] text-green-600/70">ج.م</span></span>
                        </div>
                        <button onclick="markDebtPaid('${d.entityId}', '${d.type}')" class="w-full bg-green-600 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-green-700 transition shadow-sm"><i class="fa-solid fa-check-double ml-1"></i> تأكيد الاستلام وتصفير الحساب</button>
                    </div>`;
                });
            } else {
                html += '<p class="text-gray-400 text-xs font-bold bg-gray-50 p-6 rounded-2xl text-center border-2 border-dashed">لا توجد مديونيات معلقة</p>';
            }
            container.innerHTML = html;
        }

        // ==========================================
        // 🌐 5. الدوال المكشوفة للواجهة (Public API)
        // ==========================================

        window.loadSupportTickets = loadSupportTickets; 

        window.suspendForDebt = async function(entityId, entityType, ownerId) {
            if(!confirm('هل متأكد من إيقاف هذا الحساب بسبب المديونية؟\nسيتم إخفاؤه من التطبيق وسيظهر له تنبيه بضرورة الدفع فوراً.')) return;
            
            window.showLoader();
            
            const msg = "تم إيقاف حسابك لعدم سداد المديونية المستحقة للمنصة. الرجاء التوجه لصفحة المالية ودفع المديونية فوراً لاستعادة تفعيل الحساب واستقبال الطلبات.";

            if (entityType === 'barber') {
                await supabaseClient.from('profiles').update({ status: 'suspended', warning_msg: msg }).eq('id', entityId);
                loadActiveBarbers();
            } else if (entityType === 'salon') {
                await supabaseClient.from('salons').update({ status: 'suspended', is_active: false }).eq('id', entityId);
                if(ownerId) {
                    await supabaseClient.from('profiles').update({ warning_msg: msg }).eq('id', ownerId);
                }
                loadAdminSalons();
            }

            window.hideLoader();
            window.playSound('success');
            window.showToast('تم إيقاف الحساب وإرسال التنبيه للمديونية بنجاح ⛔');
        };

        window.reactivateAccount = async function(entityId, entityType, ownerId) {
            if(!confirm('هل متأكد من إعادة تفعيل هذا الحساب؟')) return;
            window.showLoader();

            if (entityType === 'barber') {
                await supabaseClient.from('profiles').update({ status: 'active', warning_msg: null }).eq('id', entityId);
                loadActiveBarbers();
            } else if (entityType === 'salon') {
                await supabaseClient.from('salons').update({ status: 'approved', is_active: true }).eq('id', entityId);
                if(ownerId) {
                    await supabaseClient.from('profiles').update({ warning_msg: null }).eq('id', ownerId);
                }
                loadAdminSalons();
            }

            window.hideLoader();
            window.playSound('success');
            window.showToast('تم فك الحظر وإعادة تفعيل الحساب بنجاح 🔓');
        };

        window.toggleFeaturedStatus = async function(id, type, currentStatus) {
            window.showLoader();
            const table = type === 'barber' ? 'profiles' : 'salons';
            
            const { data: check } = await supabaseClient.from(table).select('status').eq('id', id).single();
            if(check && check.status === 'suspended') {
                window.hideLoader();
                window.playSound('error');
                return window.showToast('عفواً، لا يمكن تمييز حساب موقوف!');
            }

            const { error } = await supabaseClient.from(table).update({ is_featured: !currentStatus }).eq('id', id);
            window.hideLoader();

            if (!error) {
                window.playSound('success');
                window.showToast(!currentStatus ? 'تم التمييز بنجاح ⭐' : 'تم إزالة التمييز بنجاح');
                if (type === 'barber') loadActiveBarbers();
                else loadAdminSalons();
            } else {
                window.playSound('error');
                window.showToast('حدث خطأ أثناء تحديث حالة التمييز.');
            }
        };

        window.adminLogin = async function() {
            const phone = document.getElementById('admin-phone').value.trim();
            const pass = document.getElementById('admin-pass').value.trim();
            const errorText = document.getElementById('login-error');

            if(!phone || !pass) {
                errorText.innerText = "يرجى إدخال البيانات كاملة!";
                errorText.classList.remove('hidden');
                return;
            }

            window.showLoader(100, null); 
            const pseudoEmail = `${phone}@barberhome.com`; 
            const { data, error } = await supabaseClient.auth.signInWithPassword({ email: pseudoEmail, password: pass });

            if (error) {
                window.hideLoader();
                errorText.innerText = "البيانات غير صحيحة!";
                errorText.classList.remove('hidden');
                return;
            }

            const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', data.user.id).single();

            window.hideLoader();
            if (profile && (profile.role === 'admin' || profile.role === 'sub_admin')) {
                errorText.classList.add('hidden');
                document.getElementById('admin-login-view').classList.add('hidden');
                document.getElementById('sidebar').classList.remove('hidden');
                document.getElementById('main-content').classList.remove('hidden');
                window.showToast("تم تسجيل الدخول للوحة الإدارة بنجاح");
                
                state.adminId = data.user.id;
                state.adminRole = profile.role;
                applyAdminPermissions(profile.role);

                loadDashboardStats(); loadPendingBarbers(); loadActiveBarbers(); loadLiveOrders(); loadServicesList(); loadAdminSalons(); loadSupportTickets(state.activeSupportTicketFilter);
                
                if (profile.role === 'admin') {
                    loadAdminsList(); loadPayoutRequests(); loadDebtRequests(); loadPendingCustomerPayments(); 
                    loadAppSettings(); // 🚀 جلب الإعدادات فور الدخول
                }
                setupRealtimeListeners();
            } else {
                supabaseClient.auth.signOut();
                errorText.innerText = "عفواً، هذا الحساب ليس لديه صلاحيات الإدارة!";
                errorText.classList.remove('hidden');
            }
        };

        window.adminLogout = function() {
            window.showLoader(800, async () => {
                await supabaseClient.auth.signOut();
                window.location.reload();
            });
        };

        window.toggleSidebar = function() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            sidebar.classList.toggle('translate-x-full');
            overlay.classList.toggle('hidden');
        };

        window.switchAdminView = function(viewId, element) {
            document.querySelectorAll('#main-content .view').forEach(v => v.classList.remove('active'));
            document.getElementById('view-' + viewId).classList.add('active');

            document.querySelectorAll('.sidebar-item').forEach(item => {
                item.classList.remove('active', 'bg-amber-50', 'border-amber-600', 'text-gray-900');
                item.classList.add('border-transparent', 'text-gray-500');
            });
            
            if(element) {
                element.classList.add('active', 'bg-amber-50', 'border-amber-600', 'text-gray-900');
                element.classList.remove('text-gray-500');
            }

            const titles = {
                'dashboard': 'الرئيسية (نظرة عامة)',
                'salons': 'اعتماد وإدارة الصالونات',
                'services': 'إدارة الخدمات والعروض',
                'barbers': 'إدارة الكباتن (الحلاقين)',
                'finance': 'الماليات والتحصيل',
                'orders': 'سجل الطلبات المباشر',
                'support': 'الدعم والشكاوى',
                'admins': 'إدارة المديرين'
            };
            document.getElementById('page-title').innerText = titles[viewId] || 'الرئيسية';

            if(window.innerWidth < 768) {
                window.toggleSidebar();
            }
        };

        window.resolveTicket = async function(ticketId, customerId) {
            if(!confirm('هل تم حل المشكلة مع العميل وتود إغلاق التذكرة؟')) return;

            window.showLoader();
            const { error } = await supabaseClient.from('support_tickets').update({ status: 'resolved' }).eq('id', ticketId);
            
            if (!error) {
                if (customerId && typeof window.sendAppNotification === 'function') {
                    window.sendAppNotification(
                        customerId, 
                        "تم حل مشكلتك ✅", 
                        "الإدارة قامت بمراجعة شكوتك وحلها، نعتذر لك عن أي إزعاج ونتمنى لك تجربة أفضل في المرات القادمة.", 
                        "https://barberhome.pages.dev/pages/customer.html", 
                        "support"
                    );
                }
                window.playSound('success');
                window.showToast('تم إغلاق الشكوى وإرسال الإشعار للعميل بنجاح!');
                loadSupportTickets(state.activeSupportTicketFilter);
            } else {
                window.playSound('error');
                window.showToast('حدث خطأ أثناء تحديث حالة الشكوى.');
            }
            window.hideLoader();
        };

        window.setSalonStatus = async function(id, status) {
            window.showLoader(100, null);
            await supabaseClient.from('salons').update({ status: status }).eq('id', id);
            window.hideLoader();
            window.showToast(status === 'approved' ? 'تم اعتماد الصالون بنجاح' : 'تم الرفض');
            loadAdminSalons();
        };

        window.openSalonDetails = async function(salonId, salonName) {
            window.showLoader(100, null);
            document.getElementById('details-salon-name').innerText = window.escapeHTML(salonName);

            const { data: finances } = await supabaseClient.from('salon_finances').select('*').eq('salon_id', salonId).maybeSingle();
            const { data: orders } = await supabaseClient.from('orders').select('final_total').eq('salon_id', salonId).eq('status', 'completed');
            
            window.hideLoader();

            const balance = finances ? finances.available_balance : 0;
            const debt = finances ? finances.platform_debt : 0;
            
            let totalRevenue = 0;
            let totalOrders = 0;
            if(orders) {
                totalOrders = orders.length;
                orders.forEach(o => totalRevenue += Number(o.final_total || 0));
            }

            document.getElementById('salon-modal-balance').innerHTML = `${Number(balance).toFixed(0)} <span class="text-xs font-bold text-gray-400">ج.م</span>`;
            document.getElementById('salon-modal-debt').innerHTML = `${Number(debt).toFixed(0)} <span class="text-xs font-bold text-red-400">ج.م</span>`;
            document.getElementById('salon-modal-orders').innerText = totalOrders;
            document.getElementById('salon-modal-revenue').innerHTML = `${Number(totalRevenue).toFixed(0)} <span class="text-xs font-bold text-green-400">ج.م</span>`;

            window.openModal('salon-details-modal');
        };

        // 🌟 تحديث قوي: دالة تأكيد السحب (مع صيد الأخطاء)
        window.approvePayout = async function(payoutId, entityId, type) {
            if(!confirm('هل قمت بتحويل المبلغ بالفعل وتود تأكيد العملية؟')) return;
            window.showLoader(100, null);
            
            try {
                let err1, err2;
                if (type === 'salon') {
                    const res1 = await supabaseClient.from('salon_payout_requests').update({ status: 'completed' }).eq('id', payoutId);
                    const res2 = await supabaseClient.from('salon_finances').update({ available_balance: 0 }).eq('salon_id', entityId);
                    err1 = res1.error; err2 = res2.error;
                } else {
                    const res1 = await supabaseClient.from('payout_requests').update({ status: 'completed' }).eq('id', payoutId);
                    const res2 = await supabaseClient.from('barber_finances').update({ available_balance: 0 }).eq('barber_id', entityId);
                    err1 = res1.error; err2 = res2.error;
                }
                
                if(err1 || err2) throw new Error("التحديث تم رفضه من قاعدة البيانات بسبب الصلاحيات");
                
                window.showToast('تمت الموافقة على السحب وتصفير الرصيد بنجاح.');
                loadPayoutRequests(); 
            } catch(e) {
                console.error("Payout error:", e);
                window.playSound('error');
                window.showToast('حدث خطأ أثناء التصفير، يرجى مراجعة الصلاحيات (RLS).');
            } finally {
                window.hideLoader();
            }
        };

        // 🌟 تحديث قوي: دالة تأكيد تحصيل المديونية (مع صيد الأخطاء)
        window.markDebtPaid = async function(entityId, type) {
            if(!confirm('هل استلمت المديونية في حسابك البنكي وتود التصفير؟')) return;
            window.showLoader(100, null);
            
            try {
                let err;
                if (type === 'salon') {
                    const res = await supabaseClient.from('salon_finances').update({ platform_debt: 0, debt_payment_pending: false }).eq('salon_id', entityId);
                    err = res.error;
                    if (!err) await supabaseClient.from('salons').update({ status: 'approved', is_active: true }).eq('id', entityId);
                } else {
                    const res = await supabaseClient.from('barber_finances').update({ platform_debt: 0, debt_payment_pending: false }).eq('barber_id', entityId);
                    err = res.error;
                    if (!err) await supabaseClient.from('profiles').update({ status: 'active', warning_msg: null }).eq('id', entityId);
                }

                if (err) throw err;

                window.showToast("تم تحصيل المديونية وتفعيل الحساب بنجاح!");
                loadDebtRequests(); 
                loadDashboardStats(); 
                if(type === 'salon') loadAdminSalons();
                if(type === 'barber') loadActiveBarbers();
            } catch (e) {
                console.error("Mark Debt Paid Error:", e);
                window.playSound('error');
                window.showToast("حدث خطأ أثناء التصفير. يرجى مراجعة الصلاحيات (RLS).");
            } finally {
                window.hideLoader();
            }
        };

        window.confirmInstapayReceipt = async function(orderId) {
            if(confirm('هل راجعت حسابك وتؤكد استلام المبلغ؟')) {
                window.showLoader(100, null);
                await supabaseClient.from('orders').update({ payment_status: 'paid' }).eq('id', orderId);
                window.hideLoader();
                window.showToast('تم تأكيد الدفع بنجاح!'); 
                
                loadLiveOrders();
                loadPendingCustomerPayments();
                loadDashboardStats();
            }
        };

        window.openServiceModal = function() {
            state.editingServiceId = null; 
            document.getElementById('srv-modal-title').innerText = 'إضافة خدمة / عرض جديد';
            document.getElementById('srv-input-name').value = ''; 
            document.getElementById('srv-input-price').value = '';
            document.getElementById('srv-input-basic').checked = true;
            if (document.getElementById('srv-desc')) document.getElementById('srv-desc').value = '';
            if (document.getElementById('srv-original-price')) document.getElementById('srv-original-price').value = '';
            if (document.getElementById('srv-end-date')) document.getElementById('srv-end-date').value = '';
            window.toggleServiceFields(); 
            
            window.openModal('service-modal');
        };

        window.editService = async function(id) {
            state.editingServiceId = id; 
            window.showLoader();
            const { data: srv } = await supabaseClient.from('services').select('*').eq('id', id).single();
            window.hideLoader();
            if (srv) {
                document.getElementById('srv-modal-title').innerText = 'تعديل الخدمة / العرض';
                document.getElementById('srv-input-name').value = srv.title;
                document.getElementById('srv-input-price').value = srv.price;
                if (srv.type === 'offer') {
                    document.getElementById('srv-input-offer').checked = true;
                    document.getElementById('srv-desc').value = srv.description || '';
                    document.getElementById('srv-original-price').value = srv.original_price || '';
                    document.getElementById('srv-end-date').value = srv.end_date || '';
                } else {
                    document.getElementById('srv-input-basic').checked = true;
                }
                window.toggleServiceFields(); 
                
                window.openModal('service-modal');
            }
        };

        window.saveServiceAction = async function() {
            const title = document.getElementById('srv-input-name').value.trim();
            const price = document.getElementById('srv-input-price').value.trim();
            const isOffer = document.getElementById('srv-input-offer').checked;
            if(!title || !price) return window.showToast('يرجى ملء جميع البيانات!');

            const payload = {
                title: title, price: Number(price), type: isOffer ? 'offer' : 'basic',
                description: isOffer ? document.getElementById('srv-desc').value : null,
                original_price: isOffer ? Number(document.getElementById('srv-original-price').value) : null,
                end_date: isOffer ? (document.getElementById('srv-end-date').value || null) : null,
                salon_id: null, 
                is_active: true
            };

            window.showLoader(100, null);
            let result = state.editingServiceId 
                ? await supabaseClient.from('services').update(payload).eq('id', state.editingServiceId) 
                : await supabaseClient.from('services').insert([payload]);
            window.hideLoader();

            if(result.error) { 
                window.showToast('حدث خطأ أثناء الحفظ.'); 
                console.error(result.error); 
            } else { 
                window.showToast(state.editingServiceId ? 'تم التعديل بنجاح!' : 'تم النشر بنجاح!'); 
                window.closeModal('service-modal'); 
                loadServicesList(); 
                state.editingServiceId = null; 
            }
        };

        window.deleteServiceAction = async function(id) {
            if(confirm('هل أنت متأكد من حذف هذه الخدمة نهائياً؟')) {
                window.showLoader(100, null);
                const { error } = await supabaseClient.from('services').delete().eq('id', id);
                window.hideLoader();
                if(!error) { window.showToast('تم الحذف بنجاح.'); loadServicesList(); } 
                else { window.showToast('حدث خطأ أثناء الحذف.'); }
            }
        };

        window.deleteAdminAction = async function(id) {
            if(confirm('هل أنت متأكد من سحب صلاحيات الإدارة من هذا المستخدم؟')) {
                window.showLoader(100, null);
                const { error } = await supabaseClient.from('profiles').update({ role: 'customer' }).eq('id', id);
                window.hideLoader();
                if(!error) { window.showToast('تم سحب صلاحيات الإدارة بنجاح.'); loadAdminsList(); } 
                else { window.showToast('حدث خطأ في تنفيذ العملية.'); }
            }
        };

        window.saveAdminAction = async function() {
            const newPhone = document.getElementById('admin-new-phone').value.trim();
            const roleSelection = document.getElementById('admin-new-role').value; 
            const dbRole = roleSelection === 'full' ? 'admin' : 'sub_admin';

            if(!newPhone) return window.showToast('يرجى إدخال رقم هاتف المدير الجديد.');
            
            window.showLoader();
            const { data: user, error: searchError } = await supabaseClient.from('profiles').select('*').eq('phone', newPhone).single();
            
            if (searchError || !user) { 
                window.hideLoader(); 
                alert('رقم الهاتف غير مسجل كعميل! يجب أن يقوم بإنشاء حساب أولاً.'); 
                return; 
            }
            
            const { error: updateError } = await supabaseClient.from('profiles').update({ role: dbRole }).eq('id', user.id);
            window.hideLoader();
            
            if (!updateError) { 
                window.showToast(`تم إضافة المدير وتحديد صلاحياته بنجاح!`); 
                window.closeModal('add-admin-modal'); 
                loadAdminsList(); 
            } else {
                window.showToast(`حدث خطأ أثناء حفظ الصلاحيات.`);
            }
        };

        window.toggleServiceFields = function() {
            const isOffer = document.getElementById('srv-input-offer').checked;
            const extraFields = document.getElementById('offer-extra-fields');
            if(extraFields) extraFields.classList.toggle('hidden', !isOffer);
        };

        window.openBarberDetailHistory = async function(barberId, barberName) {
            window.showLoader(100, null);
            document.getElementById('history-barber-name').innerText = `الكابتن: ${window.escapeHTML(barberName)}`;
            
            const { data: finances } = await supabaseClient.from('barber_finances').select('*').eq('barber_id', barberId).maybeSingle();
            document.getElementById('barber-modal-balance').innerHTML = `${finances ? Number(finances.available_balance).toFixed(0) : 0} <span class="text-[10px] font-bold text-gray-400">ج.م</span>`;
            document.getElementById('barber-modal-debt').innerHTML = `${finances ? Number(finances.platform_debt).toFixed(0) : 0} <span class="text-[10px] font-bold text-red-400">ج.م</span>`;

            const container = document.getElementById('admin-barber-history-list');
            container.innerHTML = '';
            const { data: orders } = await supabaseClient.from('orders')
                .select('*, customer:customer_id(full_name, phone)')
                .eq('barber_id', barberId).eq('status', 'completed')
                .order('created_at', {ascending: false});

            window.hideLoader();

            if (!orders || orders.length === 0) {
                container.innerHTML = `<div class="text-center py-10 text-gray-400 font-bold text-sm">لا توجد عمليات مكتملة لهذا الكابتن.</div>`;
            } else {
                orders.forEach(order => {
                    const dateStr = new Date(order.created_at).toLocaleDateString('ar-EG', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
                    const typeIcon = order.booking_type === 'salon' ? `<i class="fa-solid fa-shop text-purple-500 bg-purple-50 p-2 rounded-xl"></i>` : `<i class="fa-solid fa-house text-blue-500 bg-blue-50 p-2 rounded-xl"></i>`;
                    const stars = order.rating_score ? `<span class="text-amber-500 font-black"><i class="fa-solid fa-star"></i> ${order.rating_score}</span>` : `<span class="text-gray-300 text-[10px] font-bold">بلا تقييم</span>`;
                    
                    const safeCustomerName = window.escapeHTML(order.customer?.full_name || 'عميل');
                    const safeCustomerPhone = window.escapeHTML(order.customer?.phone || '');
                    const safeServicesText = window.escapeHTML(order.services_text);

                    container.innerHTML += `
                        <div class="bg-white border border-gray-100 p-4 rounded-[1.5rem] shadow-sm flex flex-col gap-3">
                            <div class="flex justify-between items-start">
                                <div class="flex items-center gap-3">
                                    ${typeIcon}
                                    <div>
                                        <span class="font-black text-gray-900 block text-sm">${safeCustomerName}</span>
                                        <span class="text-[9px] text-gray-400 font-bold" dir="ltr">${safeCustomerPhone} | ${dateStr}</span>
                                    </div>
                                </div>
                                <div class="text-left">
                                    <p class="font-black text-gray-900">${order.final_total} ج.م</p>
                                    ${stars}
                                </div>
                            </div>
                            <div class="bg-gray-50 p-3 rounded-xl text-[10px] text-gray-600 font-bold border border-gray-100">
                                <i class="fa-solid fa-scissors text-gray-400 ml-1"></i> ${safeServicesText}
                            </div>
                        </div>`;
                });
            }
            
            window.openModal('barber-history-modal');
        };

        window.warnBarber = async function(id, name) {
            const msg = prompt(`اكتب رسالة التحذير لـ ${window.escapeHTML(name)}:`);
            if (msg) {
                await supabaseClient.from('profiles').update({ warning_msg: window.escapeHTML(msg) }).eq('id', id);
                window.showToast('تم إرسال التحذير بنجاح');
            }
        };

        window.approveBarberAction = async function(id) {
            await supabaseClient.from('profiles').update({ status: 'active' }).eq('id', id);
            window.showToast('تم تفعيل حساب الكابتن بنجاح!');
            loadPendingBarbers(); loadActiveBarbers(); loadDashboardStats();
        };

        window.rejectBarberAction = async function(id) {
            if(confirm('هل أنت متأكد من رفض هذا الكابتن وحذفه؟')) {
                await supabaseClient.from('profiles').delete().eq('id', id);
                window.showToast('تم رفض وحذف الطلب.'); loadPendingBarbers(); loadDashboardStats();
            }
        };

        window.suspendBarberAction = async function(id) {
            if(confirm('هل أنت متأكد من إيقاف هذا الكابتن مؤقتاً؟')) {
                await supabaseClient.from('profiles').update({ status: 'suspended' }).eq('id', id);
                window.showToast('تم إيقاف الكابتن بنجاح.'); loadActiveBarbers(); loadDashboardStats();
            }
        };

        window.openNotificationModal = function() {
            document.getElementById('notif-title').value = '';
            document.getElementById('notif-message').value = '';
            if(document.getElementById('notif-target-role')) document.getElementById('notif-target-role').value = 'all';
            if(document.getElementById('notif-alert-type')) document.getElementById('notif-alert-type').value = 'info';
            
            window.openModal('admin-notification-modal');
        };

        window.sendGeneralNotification = async function() {
            const title = document.getElementById('notif-title').value.trim();
            const message = document.getElementById('notif-message').value.trim();
            const targetRole = document.getElementById('notif-target-role') ? document.getElementById('notif-target-role').value : 'all';
            const alertType = document.getElementById('notif-alert-type') ? document.getElementById('notif-alert-type').value : 'info';

            if (!title || !message) {
                return window.showToast('يرجى كتابة عنوان ورسالة الإشعار أولاً!');
            }

            window.showLoader();

            await supabaseClient.from('global_alerts').insert([{
                title: title,
                message: message,
                target_role: targetRole, 
                alert_type: alertType,   
                is_active: true
            }]);

            const APP_ID = "b42c9e5d-cad6-470f-9eea-31f07b195168"; 
            const WORKER_URL = "https://barber-notifications.the-world22925.workers.dev"; 

            const body = {
                app_id: APP_ID,
                target_channel: "push",
                headings: { "en": title, "ar": title },
                contents: { "en": message, "ar": message }
            };

            if (targetRole === 'all') {
                body.included_segments = ["Total Subscriptions"];
            } else {
                body.filters = [
                    {"field": "tag", "key": "user_type", "relation": "=", "value": targetRole}
                ];
            }

            try {
                await fetch(WORKER_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });
                
                window.hideLoader();
                window.showToast('تم إرسال ونشر الإشعار بنجاح! 🚀');
                window.closeModal('admin-notification-modal');
                
            } catch(e) {
                console.error("Worker Error:", e);
                window.hideLoader();
                window.showToast('تم الحفظ داخلياً، لكن فشل الاتصال بخادم الإشعارات الخارجية.');
            }
        };

        // ==========================================
        // دوال المساعدة للواجهة (Modals & Loaders)
        // ==========================================
        window.openModal = function(modalId) {
            const modal = document.getElementById(modalId);
            if(modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                modal.style.zIndex = "5000"; 
                setTimeout(() => {
                    const content = modal.querySelector('.modal-content');
                    if(content) content.classList.remove('translate-y-full', 'opacity-0');
                }, 10);
            }
        };

        window.closeModal = function(modalId) {
            const modal = document.getElementById(modalId);
            if(modal) {
                const content = modal.querySelector('.modal-content');
                if(content) content.classList.add('translate-y-full', 'opacity-0');
                setTimeout(() => {
                    modal.classList.add('hidden');
                    modal.classList.remove('flex');
                }, 300);
            }
        };

        window.showLoader = function(timeout = 0, callback = null) {
            const loader = document.getElementById('global-loader');
            if(loader) {
                loader.classList.remove('hidden');
                loader.classList.add('flex'); 
            }
            if (timeout > 0 && callback) {
                setTimeout(() => { callback(); }, timeout);
            }
        };

        window.hideLoader = function() {
            const loader = document.getElementById('global-loader');
            if(loader) {
                loader.classList.add('hidden');
                loader.classList.remove('flex');
            }
        };

        window.playAdminSound = function(type) {
            const sound = document.getElementById(type === 'order' ? 'sound-new-order' : 'sound-payment');
            if (sound) {
                sound.currentTime = 0; 
                sound.play().catch(e => console.log("الصوت محظور حتى يتفاعل المستخدم مع الصفحة"));
            }
        };

    })();

    // دالة الموافقة على شحن الرصيد
window.approveWalletCharge = async function(requestId, userId, amount) {
    window.showLoader();

    // 1. تحديث حالة الطلب لـ Approved
    const { error: updateError } = await supabaseClient
        .from('wallet_requests')
        .update({ status: 'approved' })
        .eq('id', requestId);

    if (!updateError) {
        // 2. إضافة الرصيد لحساب المستخدم (RPC أو Update مباشر)
        // بنجيب الرصيد الحالي ونزود عليه
        const { data: profile } = await supabaseClient.from('profiles').select('wallet_balance').eq('id', userId).single();
        const newBalance = parseFloat(profile.wallet_balance) + parseFloat(amount);

        await supabaseClient.from('profiles').update({ wallet_balance: newBalance }).eq('id', userId);
        
        window.showToast("تم تأكيد الشحن وإضافة الرصيد للعميل 🚀");
        // هنا ممكن تبعت إشعار للعميل عبر OneSignal
    }
    window.hideLoader();
};