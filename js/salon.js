// اسم الملف: salon.js
// المسار: js/salon.js
// الوظيفة: لوحة إدارة الصالونات (النسخة الشاملة 🛡️ + ضغط شامل للصور 🗜️ + نظام الحظر + CRM)

(() => {
    // ==========================================
    // 📦 1. إدارة الحالة (State Management)
    // ==========================================
    const state = {
        ownerId: null,
        salonId: null,
        salonLat: null,
        salonLng: null,
        activeTeamMembers: [], 
        editingSalonServiceId: null,
        featuresList: [], // مصفوفة لتخزين المميزات (Tags)
        currentBarberReportText: "" // لحفظ نص التقرير للمشاركة
    };

    // ==========================================
    // 🔊 2. نظام الصوت المدمج الداخلي
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
        } else {
            const sounds = { 'new': '../assets/sounds/new-order.mp3', 'success': '../assets/sounds/success.mp3', 'error': '../assets/sounds/error.mp3' };
            if (sounds[type]) { const audio = new Audio(sounds[type]); audio.play().catch(e=>console.log(e)); }
        }
    };

    // ==========================================
    // 🗜️ دالة مساعدة لضغط الصور (Client-Side Compression)
    // ==========================================
    const compressImageAsync = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
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
                    
                    // تحويل إلى JPEG بجودة 70% لتصغير الحجم بشكل هائل
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    fetch(dataUrl).then(res => res.blob()).then(blob => resolve(blob));
                };
            };
        });
    };

    // ==========================================
    // 🚀 3. التهيئة وبدء التشغيل 
    // ==========================================
    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof supabaseClient === 'undefined') return;

        const { data: { user }, error } = await supabaseClient.auth.getUser();
        if (error || !user) return window.location.replace('../index.html');
        
        state.ownerId = user.id;

        let { data: salonData } = await supabaseClient.from('salons').select('*').eq('owner_id', state.ownerId).maybeSingle();
        const { data: ownerProfile } = await supabaseClient.from('profiles').select('warning_msg').eq('id', state.ownerId).single();
        
        if (!salonData) {
            const { data: profile } = await supabaseClient.from('profiles').select('full_name').eq('id', state.ownerId).single();
            const { data: newSalon } = await supabaseClient.from('salons').insert([{ owner_id: state.ownerId, name: profile?.full_name || 'صالون جديد', is_active: false }]).select().single();
            salonData = newSalon;
        }

        // 🚨 التحقق من حالة الإيقاف (الحظر)
        if (salonData.status === 'suspended') {
            const defaultMsg = "تم إيقاف حساب الصالون مؤقتاً لعدم سداد المديونية المستحقة للمنصة. يرجى التوجه لصفحة الماليات وسداد المديونية فوراً لإعادة تفعيل الحساب واستقبال الطلبات.";
            const finalMsg = (ownerProfile && ownerProfile.warning_msg) ? ownerProfile.warning_msg : defaultMsg;
            
            const bannerHtml = `
            <div class="fixed top-0 left-0 w-full bg-red-600 text-white z-[99999] p-4 flex flex-col items-center justify-center shadow-2xl border-b-4 border-red-800 animate-[slideDown_0.5s_ease-out]">
                <div class="flex items-center gap-3 mb-2">
                    <i class="fa-solid fa-triangle-exclamation text-4xl animate-pulse text-yellow-300"></i>
                    <h3 class="font-black text-xl">عفواً، حساب الصالون موقوف!</h3>
                </div>
                <p class="text-sm font-bold text-center max-w-md leading-relaxed text-red-50">${window.escapeHTML(finalMsg)}</p>
                <button onclick="window.location.reload()" class="mt-4 bg-white text-red-600 px-6 py-2.5 rounded-xl font-black text-xs hover:bg-red-50 transition active:scale-95 shadow-md flex items-center gap-2">
                    <i class="fa-solid fa-rotate-right"></i> تحديث الصفحة (بعد السداد)
                </button>
            </div>
            <style>@keyframes slideDown { from { transform: translateY(-100%); } to { transform: translateY(0); } } body { padding-top: 140px !important; }</style>`;
            
            document.body.insertAdjacentHTML('afterbegin', bannerHtml);
            
            const activeCheck = document.getElementById('salon-active-check');
            if (activeCheck) { activeCheck.checked = false; activeCheck.disabled = true; }
        }

        // تفريغ البيانات في الواجهة
        state.salonId = salonData.id;
        state.salonLat = salonData.lat;
        state.salonLng = salonData.lng;

        const safeName = window.escapeHTML(salonData.name || 'صالون جديد');
        const headerName = document.getElementById('header-salon-name');
        if(headerName) headerName.innerText = safeName;
        
        const nameInput = document.getElementById('salon-name-input');
        if(nameInput) nameInput.value = salonData.name || '';
        
        const addressInput = document.getElementById('salon-address-input');
        if(addressInput) addressInput.value = salonData.address || '';
        
        const activeCheck = document.getElementById('salon-active-check');
        if (activeCheck && salonData.status !== 'suspended') activeCheck.checked = salonData.is_active || false;
        
        if (salonData.main_image) {
            const mainImg = document.getElementById('main-image-preview');
            if(mainImg) mainImg.src = salonData.main_image;
        }
        if (salonData.cover_image) {
            const coverImg = document.getElementById('cover-image-preview');
            if(coverImg) coverImg.src = salonData.cover_image;
        }

        // 🌟 تفعيل نظام الـ Tags للمميزات
        const featuresString = salonData.features || '';
        state.featuresList = featuresString.split('،').map(f => f.trim()).filter(f => f.length > 0);
        window.renderFeatures();

        const featuresInput = document.getElementById('salon-features-input');
        if(featuresInput) {
            featuresInput.addEventListener('keydown', (e) => {
                if(e.key === 'Enter') {
                    e.preventDefault();
                    const val = e.target.value.trim();
                    if(val && !state.featuresList.includes(val)) {
                        state.featuresList.push(val);
                        window.renderFeatures();
                    }
                    e.target.value = '';
                }
            });
        }

        await window.loadSalonTeam(); 
        window.loadSalonOrders();
        window.loadSalonFinances();
        window.loadSalonServices(); 

        setupRealtimeListeners();
    });

    // ==========================================
    // 🏷️ 4. إدارة المميزات (Tags System)
    // ==========================================
    window.renderFeatures = function() {
        const container = document.getElementById('salon-features-tags');
        if(!container) return;
        container.innerHTML = '';
        state.featuresList.forEach((feature, index) => {
            container.innerHTML += `
                <span class="bg-purple-100 border border-purple-200 text-purple-700 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm animate-[scaleIn_0.2s_ease-out]">
                    ${window.escapeHTML(feature)}
                    <button type="button" onclick="removeFeature(${index})" class="text-purple-400 hover:text-red-500 transition active:scale-90">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </span>
            `;
        });
    };

    window.removeFeature = function(index) {
        state.featuresList.splice(index, 1);
        window.renderFeatures();
    };

    // ==========================================
    // 📡 5. الرادار المباشر (Real-time)
    // ==========================================
    function setupRealtimeListeners() {
        if (!state.salonId) return;

        supabaseClient.channel('salon-orders')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `salon_id=eq.${state.salonId}` }, payload => {
                window.loadSalonOrders(); 
                window.loadSalonFinances(); 
                window.loadSalonTeam();
                if(payload.eventType === 'INSERT') { 
                    window.playSound('new'); 
                    window.showToast('طلب حجز جديد لصالونك ✂️'); 
                }
            }).subscribe();
            
        supabaseClient.channel('salon-finances')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'salon_finances', filter: `salon_id=eq.${state.salonId}` }, payload => {
                window.loadSalonFinances();
            }).subscribe();

        supabaseClient.channel('salon-team-updates')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'salon_team', filter: `salon_id=eq.${state.salonId}` }, payload => {
                window.loadSalonTeam();
                if(payload.new.status === 'accepted' && payload.old.status === 'pending') {
                    window.playSound('new');
                    window.showToast('كابتن جديد وافق على الانضمام لفريقك! 🎉');
                }
            }).subscribe();
    }

    // ==========================================
    // 🌐 6. التنقل والواجهات
    // ==========================================
    window.switchSalonView = function(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active', 'block'));
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        
        const targetView = document.getElementById(viewId);
        targetView.classList.remove('hidden');
        targetView.classList.add('active', 'block');
        
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        if(viewId === 'salon-dash') document.getElementById('s-nav-dash').classList.add('active');
        if(viewId === 'salon-services') document.getElementById('s-nav-services').classList.add('active');
        if(viewId === 'salon-team') document.getElementById('s-nav-team').classList.add('active');
        if(viewId === 'salon-finance') document.getElementById('s-nav-finance').classList.add('active');
        if(viewId === 'salon-profile') document.getElementById('s-nav-profile').classList.add('active');
        if(viewId === 'salon-gallery') document.getElementById('s-nav-gallery').classList.add('active');
        if(viewId === 'salon-crm') {
            document.getElementById('s-nav-crm')?.classList.add('active');
            if (typeof window.loadCustomerCRM === 'function') window.loadCustomerCRM();
        }
        
        window.scrollTo(0,0);
    };

    window.switchMenuTab = function(tabName) {
        const btnServices = document.getElementById('tab-services-btn');
        const btnProducts = document.getElementById('tab-products-btn');
        if(btnServices && btnProducts) {
            btnServices.className = "flex-1 py-2.5 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition active:scale-95";
            btnProducts.className = "flex-1 py-2.5 rounded-lg text-xs font-bold text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition active:scale-95";
        }
        
        document.getElementById('salon-services-list')?.classList.add('hidden');
        document.getElementById('salon-products-list')?.classList.add('hidden');

        if(tabName === 'services') {
            if(btnServices) btnServices.className = "flex-1 py-2.5 rounded-lg text-xs font-black bg-gray-900 text-white shadow-sm transition active:scale-95";
            document.getElementById('salon-services-list')?.classList.remove('hidden');
        } else {
            if(btnProducts) btnProducts.className = "flex-1 py-2.5 rounded-lg text-xs font-black bg-gray-900 text-white shadow-sm transition active:scale-95";
            document.getElementById('salon-products-list')?.classList.remove('hidden');
        }
    };

    // ==========================================
    // 🛍️ 7. إدارة الخدمات والمنتجات (مع الصور)
    // ==========================================
    window.loadSalonServices = async function() {
        const { data: services } = await supabaseClient.from('services').select('*').eq('salon_id', state.salonId).order('created_at', { ascending: false });
        const srvContainer = document.getElementById('salon-services-list');
        const prodContainer = document.getElementById('salon-products-list');
        
        if(!srvContainer || !services) return;
        
        srvContainer.innerHTML = '';
        if(prodContainer) prodContainer.innerHTML = '';
        
        let srvCount = 0, prodCount = 0;

        services.forEach(srv => {
            const safeTitle = window.escapeHTML(srv.title);
            
            if (srv.type === 'product' && prodContainer) {
                prodCount++;
                const stock = srv.original_price || 0; 
                const stockBadge = stock > 0 ? `<span class="text-green-600 bg-green-50 px-2 py-0.5 rounded text-[10px] font-bold border border-green-100">بالمخزن: ${stock}</span>` : `<span class="text-red-600 bg-red-50 px-2 py-0.5 rounded text-[10px] font-bold border border-red-100">نفذت الكمية</span>`;
                
                const imgHtml = srv.image_url 
                    ? `<img src="${window.escapeHTML(srv.image_url)}" class="w-full h-full object-cover rounded-xl shadow-inner">`
                    : `<i class="fa-solid fa-box-open"></i>`;

                prodContainer.innerHTML += `
                    <div class="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm flex justify-between items-center transition hover:shadow-md">
                        <div class="w-14 h-14 bg-blue-50 text-blue-400 rounded-xl flex items-center justify-center text-2xl shrink-0 ml-4 border border-blue-100 shadow-sm relative overflow-hidden">
                            ${imgHtml}
                        </div>
                        <div class="flex-1 pr-1">
                            <h4 class="font-black text-sm text-gray-900 mb-1">${safeTitle}</h4>
                            <div class="flex items-center gap-2 mb-1">${stockBadge}</div>
                            <p class="font-black text-lg text-blue-600">${srv.price} <span class="text-[10px] text-gray-400">ج.م</span></p>
                        </div>
                        <div class="flex flex-col gap-2">
                            <button onclick="editSalonService('${srv.id}')" class="w-8 h-8 bg-gray-50 text-gray-600 rounded-full hover:bg-gray-200 transition flex items-center justify-center shadow-sm border border-gray-100"><i class="fa-solid fa-pen text-xs"></i></button>
                            <button onclick="deleteSalonService('${srv.id}')" class="w-8 h-8 bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition flex items-center justify-center shadow-sm border border-red-100"><i class="fa-solid fa-trash text-xs"></i></button>
                        </div>
                    </div>`;
            } else {
                srvCount++;
                const typeBadge = srv.type === 'offer' ? '<span class="bg-red-50 text-red-600 px-2 py-0.5 rounded border border-red-100 text-[10px] font-bold"><i class="fa-solid fa-fire mr-1"></i>عرض خاص</span>' : '<span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-bold">خدمة أساسية</span>';
                
                srvContainer.innerHTML += `
                    <div class="bg-white p-5 rounded-[1.5rem] border border-gray-100 shadow-sm flex justify-between items-center transition hover:shadow-md">
                        <div class="flex-1 pr-1">
                            <h4 class="font-black text-sm text-gray-900 mb-1">${safeTitle}</h4>
                            <div class="flex items-center gap-2 mb-1">${typeBadge}</div>
                            <p class="font-black text-lg text-purple-600">${srv.price} <span class="text-[10px] text-gray-400">ج.م</span></p>
                        </div>
                        <div class="flex flex-col gap-2">
                            <button onclick="editSalonService('${srv.id}')" class="w-8 h-8 bg-gray-50 text-gray-600 rounded-full hover:bg-gray-200 transition flex items-center justify-center shadow-sm border border-gray-100"><i class="fa-solid fa-pen text-xs"></i></button>
                            <button onclick="deleteSalonService('${srv.id}')" class="w-8 h-8 bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition flex items-center justify-center shadow-sm border border-red-100"><i class="fa-solid fa-trash text-xs"></i></button>
                        </div>
                    </div>`;
            }
        });

        if (srvCount === 0) srvContainer.innerHTML = '<div class="text-center p-8 bg-white rounded-[2rem] border border-gray-100 border-dashed"><i class="fa-solid fa-list-ul text-3xl text-gray-200 mb-3 block"></i><p class="text-gray-500 font-bold text-sm">لا توجد خدمات مضافة.</p></div>';
        if (prodContainer && prodCount === 0) prodContainer.innerHTML = '<div class="text-center p-8 bg-white rounded-[2rem] border border-gray-100 border-dashed"><i class="fa-solid fa-box-open text-3xl text-gray-200 mb-3 block"></i><p class="text-gray-500 font-bold text-sm">لا توجد منتجات معروضة للبيع.</p></div>';
    };

    window.openServiceModal = function() {
        state.editingSalonServiceId = null; 
        const titleEl = document.getElementById('salon-srv-modal-title');
        if(titleEl) titleEl.innerText = 'إضافة للمنيو';
        
        const nameInput = document.getElementById('salon-srv-input-name');
        if(nameInput) nameInput.value = ''; 
        
        const priceInput = document.getElementById('salon-srv-input-price');
        if(priceInput) priceInput.value = '';
        
        const stockInput = document.getElementById('salon-srv-stock');
        if(stockInput) stockInput.value = '';

        const imgInput = document.getElementById('salon-srv-product-image');
        const imgPreview = document.getElementById('salon-srv-product-image-preview');
        const imgPlaceholder = document.getElementById('salon-srv-product-image-placeholder');
        if (imgInput) imgInput.value = '';
        if (imgPreview && imgPlaceholder) {
            imgPreview.src = '';
            imgPreview.classList.add('hidden');
            imgPlaceholder.classList.remove('hidden');
        }

        const basicInput = document.getElementById('salon-srv-input-basic');
        if(basicInput) basicInput.checked = true;
        
        if (document.getElementById('salon-srv-desc')) document.getElementById('salon-srv-desc').value = '';
        window.toggleSalonServiceFields(); 
        
        const modal = document.getElementById('salon-service-modal');
        if(modal) {
            modal.style.zIndex = '99999'; 
            modal.classList.remove('hidden'); modal.classList.add('flex');
            setTimeout(() => { modal.querySelector('.modal-content')?.classList.remove('translate-y-full'); }, 10);
        }
    };

    window.toggleSalonServiceFields = function() {
        const typeRadio = document.querySelector('input[name="salon_srv_type"]:checked');
        if(!typeRadio) return;
        const type = typeRadio.value;
        const offerFields = document.getElementById('salon-offer-extra-fields');
        const productFields = document.getElementById('salon-product-extra-fields');
        
        if(offerFields) offerFields.classList.toggle('hidden', type !== 'offer');
        if(productFields) productFields.classList.toggle('hidden', type !== 'product');
        
        const nameLabel = document.getElementById('label-name-input');
        if(nameLabel) nameLabel.innerText = type === 'product' ? 'اسم المنتج' : 'اسم الخدمة';
    };

    window.saveSalonServiceAction = async function() {
        const title = document.getElementById('salon-srv-input-name').value.trim();
        const price = Math.max(0, Number(document.getElementById('salon-srv-input-price').value.trim()) || 0);
        const typeRadio = document.querySelector('input[name="salon_srv_type"]:checked');
        const type = typeRadio ? typeRadio.value : 'basic';
        const stockInput = document.getElementById('salon-srv-stock');
        const stock = stockInput ? Math.max(0, Number(stockInput.value.trim()) || 0) : 0;
        
        if(!title || price <= 0) return window.showToast('يرجى كتابة الاسم والسعر بشكل صحيح!');

        window.showLoader(100, null);

        let finalImageUrl = null;

        if (type === 'product') {
            const imageInput = document.getElementById('salon-srv-product-image');
            if (imageInput && imageInput.files && imageInput.files.length > 0) {
                const file = imageInput.files[0];
                const compressedBlob = await compressImageAsync(file); // 🗜️ ضغط صورة المنتج
                const fileName = `prod_${state.salonId}_${Date.now()}.jpg`;
                
                const { error: uploadError } = await supabaseClient.storage.from('salon_works').upload(fileName, compressedBlob, { contentType: 'image/jpeg' });
                if (!uploadError) {
                    const { data } = supabaseClient.storage.from('salon_works').getPublicUrl(fileName);
                    finalImageUrl = data.publicUrl;
                }
            } else if (state.editingSalonServiceId) {
                const { data: existingSrv } = await supabaseClient.from('services').select('image_url').eq('id', state.editingSalonServiceId).single();
                if(existingSrv && existingSrv.image_url) finalImageUrl = existingSrv.image_url;
            }
        }

        const payload = {
            title: title, 
            price: price, 
            type: type,
            description: type === 'offer' ? document.getElementById('salon-srv-desc')?.value : null,
            original_price: type === 'product' ? stock : null,
            salon_id: state.salonId, 
            is_active: true
        };

        if (type === 'product' && finalImageUrl) {
            payload.image_url = finalImageUrl;
        }

        let result = state.editingSalonServiceId 
            ? await supabaseClient.from('services').update(payload).eq('id', state.editingSalonServiceId) 
            : await supabaseClient.from('services').insert([payload]);
            
        window.hideLoader();

        if(result.error) { window.showToast('حدث خطأ أثناء الحفظ.'); console.error(result.error); } 
        else { 
            window.playSound('success');
            window.showToast('تم الحفظ بنجاح! 🛍️'); 
            if(typeof window.closeModal === 'function') window.closeModal('salon-service-modal'); 
            window.loadSalonServices(); 
            state.editingSalonServiceId = null;
        }
    };

    window.editSalonService = async function(id) {
        state.editingSalonServiceId = id; 
        window.showLoader(100, null);
        const { data: srv } = await supabaseClient.from('services').select('*').eq('id', id).single();
        window.hideLoader();
        
        if (srv) {
            const titleEl = document.getElementById('salon-srv-modal-title');
            if(titleEl) titleEl.innerText = 'تعديل العنصر';
            
            document.getElementById('salon-srv-input-name').value = srv.title;
            document.getElementById('salon-srv-input-price').value = srv.price;
            
            if (srv.type === 'offer') {
                const offerRadio = document.getElementById('salon-srv-input-offer');
                if(offerRadio) offerRadio.checked = true;
                const descInput = document.getElementById('salon-srv-desc');
                if(descInput) descInput.value = srv.description || '';
            } else if (srv.type === 'product') {
                const prodRadio = document.getElementById('salon-srv-input-product');
                if(prodRadio) prodRadio.checked = true;
                const stockInput = document.getElementById('salon-srv-stock');
                if(stockInput) stockInput.value = srv.original_price || 0;
                
                const preview = document.getElementById('salon-srv-product-image-preview');
                const placeholder = document.getElementById('salon-srv-product-image-placeholder');
                const imgInput = document.getElementById('salon-srv-product-image');
                if (imgInput) imgInput.value = '';
                
                if (srv.image_url && preview && placeholder) {
                    preview.src = srv.image_url;
                    preview.classList.remove('hidden');
                    placeholder.classList.add('hidden');
                } else if (preview && placeholder) {
                    preview.src = '';
                    preview.classList.add('hidden');
                    placeholder.classList.remove('hidden');
                }
            } else {
                const basicRadio = document.getElementById('salon-srv-input-basic');
                if(basicRadio) basicRadio.checked = true;
            }
            window.toggleSalonServiceFields(); 
            
            const modal = document.getElementById('salon-service-modal');
            if(modal) {
                modal.style.zIndex = '99999'; 
                modal.classList.remove('hidden'); modal.classList.add('flex');
                setTimeout(() => { modal.querySelector('.modal-content')?.classList.remove('translate-y-full'); }, 10);
            }
        }
    };

    window.deleteSalonService = async function(id) {
        if(confirm('هل أنت متأكد من حذف هذا العنصر نهائياً؟')) {
            window.showLoader(100, null);
            const { error } = await supabaseClient.from('services').delete().eq('id', id);
            window.hideLoader();
            if(!error) { window.playSound('success'); window.showToast('تم المسح بنجاح.'); window.loadSalonServices(); } 
            else { window.playSound('error'); window.showToast('حدث خطأ أثناء الحذف.'); }
        }
    };

    // ==========================================
    // 👑 8. إدارة ولاء العملاء (CRM)
    // ==========================================
    window.loadCustomerCRM = async function() {
        const listContainer = document.getElementById('crm-customers-list');
        const totalCustomersEl = document.getElementById('crm-total-customers');
        if(!listContainer) return;
        listContainer.innerHTML = '<div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin text-amber-500 text-2xl"></i></div>';

        try {
            const { data: orders } = await supabaseClient.from('orders')
                .select('customer_id, final_total, customer:customer_id(full_name)')
                .eq('salon_id', state.salonId)
                .eq('status', 'completed');

            if(!orders || orders.length === 0) {
                listContainer.innerHTML = '<div class="text-center p-8 bg-white rounded-2xl border border-dashed border-gray-200"><i class="fa-solid fa-users-slash text-4xl text-gray-300 mb-3 block"></i><p class="text-sm font-bold text-gray-500">لا يوجد عملاء مكتملين حتى الآن.</p></div>';
                if(totalCustomersEl) totalCustomersEl.innerText = '0';
                return;
            }

            const customersMap = {};
            orders.forEach(order => {
                if(!order.customer_id) return;
                if(!customersMap[order.customer_id]) {
                    customersMap[order.customer_id] = {
                        id: order.customer_id,
                        name: order.customer ? order.customer.full_name : 'عميل',
                        orderCount: 0,
                        totalSpent: 0
                    };
                }
                customersMap[order.customer_id].orderCount++;
                customersMap[order.customer_id].totalSpent += Number(order.final_total) || 0;
            });

            const customersArray = Object.values(customersMap).sort((a, b) => b.orderCount - a.orderCount);
            
            if(totalCustomersEl) totalCustomersEl.innerText = customersArray.length;
            listContainer.innerHTML = '';

            customersArray.forEach((c, index) => {
                const badge = index < 3 ? `<span class="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-black border border-amber-200"><i class="fa-solid fa-crown"></i> VIP</span>` : '';
                const actualName = window.escapeHTML(c.name);
                const maskedPhone = `رقم مخفي 🔒`;

                listContainer.innerHTML += `
                    <div class="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex items-center justify-between transition hover:shadow-md">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 bg-gray-50 text-gray-400 rounded-full flex items-center justify-center text-xl font-black border border-gray-200">#${index + 1}</div>
                            <div>
                                <h4 class="font-black text-gray-900 text-sm flex items-center gap-2">${actualName} ${badge}</h4>
                                <p class="text-[10px] text-gray-400 font-bold mt-1" dir="ltr"><i class="fa-solid fa-shield-halved ml-1"></i>${maskedPhone}</p>
                            </div>
                        </div>
                        <div class="text-left flex flex-col items-end gap-2">
                            <span class="text-xs font-black text-purple-600">${c.orderCount} زيارات</span>
                            <button onclick="openRewardModal('${c.id}', '${actualName}')" class="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold shadow-sm hover:bg-black active:scale-95 transition flex items-center gap-1"><i class="fa-solid fa-gift text-amber-500"></i> إهداء خصم</button>
                        </div>
                    </div>`;
            });

        } catch (e) {
            console.error("CRM Error:", e);
            listContainer.innerHTML = '<p class="text-center text-red-500 text-xs font-bold">حدث خطأ في جلب بيانات العملاء.</p>';
        }
    };

    window.openRewardModal = function(customerId, customerName) {
        const idInput = document.getElementById('reward-customer-id');
        const nameEl = document.getElementById('reward-customer-name');
        const msgInput = document.getElementById('reward-message');
        
        if(idInput) idInput.value = customerId;
        if(nameEl) nameEl.innerText = `إرسال هدية إلى: ${customerName}`;
        if(msgInput) msgInput.value = '';
        
        const modal = document.getElementById('salon-reward-modal');
        if(modal) {
            modal.classList.remove('hidden'); modal.classList.add('flex');
            setTimeout(() => { modal.querySelector('.modal-content')?.classList.remove('translate-y-full'); }, 10);
        }
    };

    window.sendRewardNotification = async function() {
        const customerId = document.getElementById('reward-customer-id')?.value;
        const msg = document.getElementById('reward-message')?.value.trim();
        const salonName = document.getElementById('header-salon-name')?.innerText || 'الصالون';

        if(!msg) return window.showToast('يرجى كتابة رسالة أو كود الخصم!');
        
        window.showLoader();
        try {
            const codeMatch = msg.match(/[A-Za-z0-9]{4,10}/);
            if (codeMatch) {
                const promoCode = codeMatch[0].toUpperCase();
                const percentageMatch = promoCode.match(/\d+/);
                const percentage = percentageMatch ? parseInt(percentageMatch[0]) : 15; 
                
                await supabaseClient.from('promo_codes').upsert([{
                    code: promoCode,
                    discount_percentage: percentage,
                    salon_id: state.salonId,
                    is_active: true
                }], { onConflict: 'code' });
            }

            if(typeof window.sendAppNotification === 'function') {
                await window.sendAppNotification(
                    customerId, 
                    `هدية خاصة من ${salonName} 🎁`, 
                    msg, 
                    "https://barberhome.pages.dev/pages/customer.html", 
                    "reward"
                );
            }
            window.playSound('success');
            window.showToast('تم إرسال الإشعار للعميل (وتفعيل الكود إن وجد)! 🚀');
            if(typeof window.closeModal === 'function') window.closeModal('salon-reward-modal');
        } catch(e) {
            window.playSound('error');
            window.showToast('حدث خطأ في الإرسال.');
        } finally {
            window.hideLoader();
        }
    };

    // ==========================================
    // 📍 9. بيانات الصالون والصور (مع نظام الضغط 🗜️)
    // ==========================================
    window.toggleSalonStatus = async function(checkbox) {
        window.showLoader();
        const { data: checkSalon } = await supabaseClient.from('salons').select('status').eq('id', state.salonId).single();
        if (checkSalon && checkSalon.status === 'suspended') {
            window.hideLoader(); checkbox.checked = false; window.playSound('error');
            return window.showToast('حساب الصالون موقوف! لا يمكنك استقبال الطلبات حتى سداد المديونية.');
        }

        const { error } = await supabaseClient.from('salons').update({ is_active: checkbox.checked }).eq('id', state.salonId);
        window.hideLoader();
        if (error) { checkbox.checked = !checkbox.checked; window.playSound('error'); window.showToast('فشل التحديث'); } 
        else { window.playSound('success'); window.showToast(checkbox.checked ? 'الصالون متاح الآن لاستقبال الطلبات 🟢' : 'تم إغلاق استقبال الطلبات مؤقتاً 🔴'); }
    };

    window.getSalonLocation = function() {
        if (!navigator.geolocation) return window.showToast("المتصفح لا يدعم تحديد الموقع.");
        window.showLoader();
        navigator.geolocation.getCurrentPosition(async (position) => {
            state.salonLat = position.coords.latitude; state.salonLng = position.coords.longitude;
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${state.salonLat}&lon=${state.salonLng}&zoom=18&addressdetails=1&accept-language=ar`);
                const data = await response.json();
                if (data) {
                    let parts = []; const a = data.address || {};
                    if (a.state || a.county || a.region) parts.push(a.state || a.county || a.region);
                    if (a.city || a.town || a.village || a.municipality) parts.push(a.city || a.town || a.village || a.municipality);
                    if (a.suburb || a.neighbourhood || a.district || a.quarter) parts.push(a.suburb || a.neighbourhood || a.district || a.quarter);
                    if (a.road || a.pedestrian || a.street) parts.push(a.road || a.pedestrian || a.street);
                    parts = [...new Set(parts)];
                    const fullAddress = parts.length > 0 ? parts.join('، ') : data.display_name;
                    document.getElementById('salon-address-input').value = fullAddress || "تم تحديد الإحداثيات";
                }
            } catch(e) { document.getElementById('salon-address-input').value = "تم تحديد الإحداثيات"; }
            window.hideLoader(); window.showToast("تم سحب الموقع بنجاح");
        }, () => { window.hideLoader(); window.showToast("يرجى تفعيل صلاحية الـ GPS"); }, { enableHighAccuracy: true });
    };

    window.saveSalonProfile = async function() {
        const name = document.getElementById('salon-name-input').value.trim();
        const address = document.getElementById('salon-address-input').value.trim();
        const features = state.featuresList.join('، '); 
        
        if(!name || !address) return window.showToast("يرجى إدخال الاسم والعنوان.");
        window.showLoader();
        const { error } = await supabaseClient.from('salons').update({ name: name, address: address, features: features, lat: state.salonLat, lng: state.salonLng }).eq('id', state.salonId);
        window.hideLoader();
        if(error) { window.playSound('error'); window.showToast("حدث خطأ في الحفظ"); } 
        else { window.playSound('success'); document.getElementById('header-salon-name').innerText = window.escapeHTML(name); window.showToast("تم حفظ بيانات الصالون بنجاح ✨"); }
    };

    window.uploadMainImage = async function(input) {
        if (!input.files || input.files.length === 0) return;
        window.showLoader(100, null);
        try {
            const file = input.files[0]; 
            const compressedBlob = await compressImageAsync(file); // 🗜️ ضغط اللوجو
            const fileName = `main_${state.salonId}_${Date.now()}.jpg`;
            
            await supabaseClient.storage.from('salon_works').upload(fileName, compressedBlob, { contentType: 'image/jpeg' });
            const { data: { publicUrl } } = supabaseClient.storage.from('salon_works').getPublicUrl(fileName);
            await supabaseClient.from('salons').update({ main_image: publicUrl }).eq('id', state.salonId);
            const preview = document.getElementById('main-image-preview'); if(preview) preview.src = publicUrl; 
            window.playSound('success'); window.showToast('تم تحديث اللوجو بنجاح 🖼️');
        } catch (e) { window.playSound('error'); window.showToast('حدث خطأ أثناء الرفع'); } finally { window.hideLoader(); input.value = ''; }
    };

    window.uploadCoverImage = async function(input) {
        if (!input.files || input.files.length === 0) return;
        window.showLoader(100, null);
        try {
            const file = input.files[0]; 
            const compressedBlob = await compressImageAsync(file); // 🗜️ ضغط الغلاف
            const fileName = `cover_${state.salonId}_${Date.now()}.jpg`;
            
            await supabaseClient.storage.from('salon_works').upload(fileName, compressedBlob, { contentType: 'image/jpeg' });
            const { data: { publicUrl } } = supabaseClient.storage.from('salon_works').getPublicUrl(fileName);
            await supabaseClient.from('salons').update({ cover_image: publicUrl }).eq('id', state.salonId);
            const preview = document.getElementById('cover-image-preview'); if(preview) preview.src = publicUrl; 
            window.playSound('success'); window.showToast('تم تحديث الغلاف بنجاح 🖼️');
        } catch (e) { window.playSound('error'); window.showToast('حدث خطأ أثناء الرفع'); } finally { window.hideLoader(); input.value = ''; }
    };

    // ==========================================
    // 👥 10. فريق العمل (الدعوات والمزامنة)
    // ==========================================
    window.sendTeamInvite = async function() {
        const phone = document.getElementById('team-phone-input').value.trim();
        const specialty = document.getElementById('team-specialty-input').value.trim();
        if (!phone || !specialty) return window.showToast("أدخل الرقم والتخصص.");
        window.showLoader();
        const { data: barber } = await supabaseClient.from('profiles').select('id, full_name').eq('phone', phone).eq('role', 'barber').maybeSingle();
        if (!barber) { window.hideLoader(); window.playSound('error'); return window.showToast("رقم الكابتن غير مسجل ككابتن"); }
        const { data: existing } = await supabaseClient.from('salon_team').select('id').eq('salon_id', state.salonId).eq('barber_id', barber.id).maybeSingle();
        if (existing) { window.hideLoader(); return window.showToast("موجود بالفعل في فريقك أو بانتظار الموافقة"); }
        const { error } = await supabaseClient.from('salon_team').insert([{ salon_id: state.salonId, barber_id: barber.id, specialty: specialty, status: 'pending', commission_rate: 0, owed_balance: 0 }]);
        window.hideLoader();
        if (!error) { window.playSound('success'); window.showToast(`تمت دعوة ${window.escapeHTML(barber.full_name)} بنجاح`); window.loadSalonTeam(); }
    };

    window.loadSalonTeam = async function() {
        const { data: team } = await supabaseClient.from('salon_team').select(`id, specialty, status, commission_rate, owed_balance, barber_id, barber:barber_id (full_name, phone)`).eq('salon_id', state.salonId);
        const container = document.getElementById('salon-team-list'); if (!container) return; container.innerHTML = '';
        state.activeTeamMembers = []; 
        if (!team || team.length === 0) { container.innerHTML = '<div class="text-center p-4 text-xs text-gray-400 font-bold bg-gray-50 rounded-xl border border-dashed"><i class="fa-solid fa-user-xmark text-2xl mb-2 block"></i>لا يوجد أعضاء بالفريق</div>'; return; }

        team.forEach(member => {
            const isPending = member.status === 'pending';
            if(!isPending) state.activeTeamMembers.push(member); 
            const safeName = window.escapeHTML(member.barber?.full_name || 'كابتن');
            const safeSpecialty = window.escapeHTML(member.specialty);
            const safePhone = window.escapeHTML(member.barber?.phone || '');
            container.innerHTML += `
                <div class="floating-card p-4 border-r-4 ${isPending ? 'border-amber-500' : 'border-purple-500'} bg-white flex justify-between items-center transition hover:shadow-md">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-500"><i class="fa-solid fa-user"></i></div>
                        <div>
                            <h4 class="font-bold text-gray-900 text-sm">${safeName}</h4>
                            <p class="text-[10px] text-gray-500 mt-1"><i class="fa-solid fa-briefcase ml-1 text-purple-400"></i>${safeSpecialty}</p>
                            <p class="text-[10px] text-gray-400 mt-0.5" dir="ltr"><i class="fa-solid fa-phone ml-1 text-gray-300"></i>${safePhone}</p>
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-2">
                        ${isPending ? `<span class="bg-amber-100 text-amber-700 px-2 py-1 rounded text-[10px] font-bold"><i class="fa-regular fa-clock ml-1"></i>بانتظار الموافقة</span>` : `<span class="bg-green-100 text-green-700 px-2 py-1 rounded text-[10px] font-bold"><i class="fa-solid fa-check ml-1"></i>عضو بالفريق</span>`}
                        <button onclick="removeTeamMember('${member.id}')" class="text-red-500 text-[10px] font-bold hover:underline"><i class="fa-solid fa-trash ml-1"></i>إزالة</button>
                    </div>
                </div>`;
        });
        window.loadTeamStats();
    };

    window.removeTeamMember = async function(id) {
        if(!confirm('تأكيد إزالة الكابتن من الفريق؟')) return;
        window.showLoader(); await supabaseClient.from('salon_team').delete().eq('id', id); window.hideLoader(); window.loadSalonTeam();
    };

    window.updateCommission = async function(teamId) {
        const rateInput = Math.max(0, Math.min(100, Number(document.getElementById(`comm-${teamId}`).value) || 0));
        window.showLoader();
        const { error } = await supabaseClient.from('salon_team').update({ commission_rate: rateInput }).eq('id', teamId);
        window.hideLoader(); 
        if(error) { window.playSound('error'); window.showToast("فشل التحديث!"); } 
        else { window.playSound('success'); window.showToast("تم حفظ النسبة بنجاح ✅"); }
    };

    window.syncBarberEarnings = async function(barberId, teamId) {
        if(!confirm('هل تود إعادة حساب أرباح الكابتن عن جميع طلباته السابقة بناءً على النسبة المكتوبة الآن؟')) return;
        window.showLoader(100, null);
        try {
            const rateInput = Math.max(0, Math.min(100, Number(document.getElementById(`comm-${teamId}`).value) || 0));
            await supabaseClient.from('salon_team').update({ commission_rate: rateInput }).eq('id', teamId);
            const { data: orders } = await supabaseClient.from('orders').select('final_total').eq('salon_id', state.salonId).eq('barber_id', barberId).eq('status', 'completed');
            let totalNet = 0;
            if (orders) { orders.forEach(o => { const total = Number(o.final_total) || 0; totalNet += (total - (total * 0.15)); }); }
            const newBalance = totalNet * (rateInput / 100);
            await supabaseClient.from('salon_team').update({ owed_balance: newBalance }).eq('id', teamId);
            window.playSound('success'); window.showToast(`تمت مزامنة الحساب! الرصيد: ${newBalance.toFixed(0)} ج.م ✅`);
            window.loadSalonTeam();
        } catch(e) { window.showToast("حدث خطأ أثناء المزامنة."); } finally { window.hideLoader(); }
    };

    window.settleBarberAccount = async function(teamId) {
        if(!confirm('تنبيه: سيتم تصفير الرصيد الحالي للكابتن واعتباره "تم الدفع". هل أنت متأكد؟')) return;
        window.showLoader();
        const { error } = await supabaseClient.from('salon_team').update({ owed_balance: 0 }).eq('id', teamId);
        window.hideLoader();
        if(!error) { window.playSound('success'); window.showToast('تم تصفير الحساب بنجاح ✅'); await window.loadSalonTeam(); } 
        else { window.playSound('error'); window.showToast('حدث خطأ أثناء التصفير!'); }
    };

    // ==========================================
    // ✂️ 11. إدارة الطلبات والعمليات
    // ==========================================
    window.loadSalonOrders = async function() {
        if (state.activeTeamMembers.length === 0) await window.loadSalonTeam();
        const { data: orders } = await supabaseClient.from('orders').select(`*, customer:customer_id (full_name, phone), barber:barber_id(full_name)`).eq('salon_id', state.salonId).in('status', ['pending', 'accepted']).order('created_at', { ascending: false });
        const container = document.getElementById('salon-orders-container'); if (!container) return; container.innerHTML = '';
        if (!orders || orders.length === 0) { container.innerHTML = `<div class="text-center p-8 bg-white rounded-2xl shadow-sm border border-gray-100 border-dashed"><i class="fa-solid fa-mug-hot text-4xl text-gray-200 mb-3 block"></i><p class="text-gray-500 font-bold text-sm">لا توجد طلبات في الانتظار حالياً.</p></div>`; return; }

        orders.forEach(order => {
            const isPending = order.status === 'pending';
            let barbersOptions = `<option value="">-- اختر كابتن للتنفيذ --</option>`;
            state.activeTeamMembers.forEach(m => { barbersOptions += `<option value="${m.barber_id}">${window.escapeHTML(m.barber.full_name)} (${window.escapeHTML(m.specialty)})</option>`; });
            const safeCustomerName = window.escapeHTML(order.customer?.full_name || 'عميل');
            let actionButtons = ''; 
            if (isPending) {
                actionButtons = `
                    <select id="assign-barber-${order.id}" class="w-full bg-gray-50 border border-gray-200 p-2 rounded-lg text-xs font-bold mb-2 outline-none focus:border-purple-400">${barbersOptions}</select>
                    <div class="flex gap-2">
                        <button onclick="handleSalonOrder('accept', '${order.id}')" class="flex-1 bg-amber-500 text-black py-2.5 rounded-xl font-bold text-xs shadow-sm hover:bg-amber-400 transition"><i class="fa-solid fa-check ml-1"></i> تعيين وقبول</button>
                        <button onclick="handleSalonOrder('ignore', '${order.id}')" class="px-4 bg-gray-100 text-gray-600 py-2.5 rounded-xl font-bold text-xs hover:bg-gray-200 transition"><i class="fa-solid fa-xmark"></i></button>
                    </div>`;
            } else {
                actionButtons = `<button onclick="handleSalonOrder('complete', '${order.id}')" class="w-full bg-purple-600 text-white py-3 rounded-xl font-bold text-xs shadow-md hover:bg-purple-700 transition"><i class="fa-solid fa-flag-checkered ml-1"></i> إنهاء الخدمة (مكتمل)</button>`;
            }
            container.innerHTML += `
                <div class="floating-card p-5 border-r-4 ${isPending ? 'border-amber-500' : 'border-purple-500'} bg-white relative transition hover:shadow-md">
                    <div class="mb-3">
                        <h4 class="font-bold text-gray-900">${safeCustomerName}</h4>
                        <p class="text-xs text-gray-500 mt-1"><i class="fa-regular fa-clock text-amber-500 ml-1"></i> ${window.escapeHTML(order.booking_date)} - ${window.escapeHTML(order.booking_time)}</p>
                    </div>
                    <div class="bg-gray-50 p-3 rounded-xl text-xs mb-3 border border-gray-100">
                        <div class="flex justify-between mb-2"><span class="font-bold text-gray-600">الخدمات:</span><span class="font-bold truncate w-2/3 text-left text-gray-900">${window.escapeHTML(order.services_text)}</span></div>
                        <div class="flex justify-between pt-2 border-t border-gray-200"><span class="font-bold text-gray-600">التحصيل:</span><span class="font-black text-purple-700">${order.final_total} ج.م</span></div>
                    </div>
                    ${actionButtons}
                </div>`;
        });
    };

    window.handleSalonOrder = async function(actionType, orderId) {
        window.showLoader();
        const { data: orderNotifyData } = await supabaseClient.from('orders').select('customer_id').eq('id', orderId).single();
        if (actionType === 'accept') {
            const selectedBarber = document.getElementById(`assign-barber-${orderId}`).value;
            if(!selectedBarber) { window.hideLoader(); return window.showToast("يجب اختيار الكابتن"); }
            await supabaseClient.from('orders').update({ status: 'accepted', barber_id: selectedBarber }).eq('id', orderId);
            window.playSound('success'); window.showToast('تم قبول الطلب وتعيين الكابتن'); 
        } else if (actionType === 'ignore') {
            await supabaseClient.from('orders').update({ status: 'cancelled' }).eq('id', orderId);
            window.playSound('error'); window.showToast('تم إلغاء الطلب.');
        } else if (actionType === 'complete') {
            const { data: order } = await supabaseClient.from('orders').select('final_total, barber_id, payment_method').eq('id', orderId).single();
            const platformCut = (Number(order.final_total) || 0) * 0.15; 
            const netSalon = (Number(order.final_total) || 0) - platformCut; 

            let { data: fin } = await supabaseClient.from('salon_finances').select('*').eq('salon_id', state.salonId).limit(1);
            fin = fin && fin.length > 0 ? fin[0] : { available_balance: 0, platform_debt: 0 };
            
            if (order.payment_method === 'instapay' || order.payment_method === 'online') fin.available_balance += netSalon;
            else fin.platform_debt += platformCut;

            await supabaseClient.from('salon_finances').upsert([{ salon_id: state.salonId, available_balance: fin.available_balance, platform_debt: fin.platform_debt }]);

            if (order.barber_id) {
                const { data: teamData } = await supabaseClient.from('salon_team').select('id, commission_rate, owed_balance').eq('salon_id', state.salonId).eq('barber_id', order.barber_id).limit(1);
                if (teamData && teamData.length > 0) {
                    const barberCut = netSalon * ((Number(teamData[0].commission_rate) || 0) / 100); 
                    await supabaseClient.from('salon_team').update({ owed_balance: (Number(teamData[0].owed_balance) || 0) + barberCut }).eq('id', teamData[0].id);
                }
            }
            await supabaseClient.from('orders').update({ status: 'completed' }).eq('id', orderId);
            window.playSound('success'); window.showToast('تم إنهاء الخدمة بنجاح 💸');
        }
        window.loadSalonOrders(); window.loadSalonFinances(); window.loadSalonTeam(); window.hideLoader();
    };

    // ==========================================
    // 📊 12. الماليات والتقارير الاحترافية 
    // ==========================================
    window.loadSalonFinances = async function() {
        try {
            let { data: finances } = await supabaseClient.from('salon_finances').select('*').eq('salon_id', state.salonId).maybeSingle();
            if(document.getElementById('salon-available-balance')) document.getElementById('salon-available-balance').innerText = Math.max(0, Number(finances?.available_balance) || 0).toFixed(0);
            if(document.getElementById('salon-platform-debt')) document.getElementById('salon-platform-debt').innerText = Math.max(0, Number(finances?.platform_debt) || 0).toFixed(0);
        } catch(e) {}
    };

    window.loadTeamStats = async function() {
        if(state.activeTeamMembers.length === 0) return;
        const period = document.getElementById('stats-time-filter')?.value || 'month';
        let startDate = new Date();
        if(period === 'today') startDate.setHours(0,0,0,0); else if(period === 'week') startDate.setDate(startDate.getDate() - 7); else startDate.setDate(1);

        const { data: orders } = await supabaseClient.from('orders').select('barber_id, final_total').eq('salon_id', state.salonId).eq('status', 'completed').gte('created_at', startDate.toISOString());
        const container = document.getElementById('team-stats-container'); if(!container) return; container.innerHTML = '';

        state.activeTeamMembers.forEach(member => {
            const barberOrders = orders ? orders.filter(o => o.barber_id === member.barber_id) : [];
            let totalGross = 0; barberOrders.forEach(o => { totalGross += Math.max(0, Number(o.final_total) || 0); });
            const currentOwed = Math.max(0, Number(member.owed_balance) || 0);
            const safeName = window.escapeHTML(member.barber?.full_name || 'كابتن');
            const currentComm = Number(member.commission_rate) || 0;

            container.innerHTML += `
                <div class="p-4 border border-gray-100 rounded-2xl bg-white shadow-sm mb-4 transition hover:shadow-md">
                    <div class="flex justify-between items-start mb-3">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center text-lg shadow-inner"><i class="fa-solid fa-user-tie"></i></div>
                            <div>
                                <h5 class="font-bold text-sm text-gray-900">${safeName}</h5>
                                <button onclick="openBarberReport('${member.barber_id}', '${member.id}', '${safeName}', '${currentComm}')" class="text-[10px] text-purple-600 font-bold hover:underline flex items-center gap-1 mt-0.5"><i class="fa-solid fa-file-invoice"></i> عرض كشف الحساب</button>
                            </div>
                        </div>
                        <div class="bg-gray-50 border border-gray-200 px-2 py-1.5 rounded-lg flex items-center gap-1">
                            <span class="text-[10px] font-bold text-gray-500">النسبة:</span>
                            <input type="number" id="comm-${member.id}" value="${currentComm}" onblur="updateCommission('${member.id}')" class="w-10 text-center bg-transparent outline-none text-xs font-bold text-purple-700 p-0 m-0">
                            <span class="text-[10px] font-bold text-gray-500">%</span>
                        </div>
                    </div>
                    <div class="grid grid-cols-3 gap-2 text-center bg-gray-50 p-2 rounded-xl border border-gray-100 mb-3">
                        <div class="border-l border-gray-200"><p class="text-[10px] text-gray-500 font-bold">الطلبات</p><p class="text-sm font-bold text-gray-900">${barberOrders.length}</p></div>
                        <div class="border-l border-gray-200"><p class="text-[10px] text-gray-500 font-bold">الدخل</p><p class="text-sm font-bold text-gray-900">${totalGross.toFixed(0)} <span class="text-[8px] text-gray-400">ج.م</span></p></div>
                        <div><p class="text-[10px] text-purple-600 font-bold">حسابه</p><p class="text-sm font-bold text-purple-700">${currentOwed.toFixed(0)} <span class="text-[8px] text-purple-400">ج.م</span></p></div>
                    </div>
                    <button onclick="syncBarberEarnings('${member.barber_id}', '${member.id}')" class="w-full mb-2 bg-blue-50 text-blue-600 border border-blue-200 text-xs font-bold py-2 rounded-lg hover:bg-blue-100 transition"><i class="fa-solid fa-rotate text-[10px] ml-1"></i> مزامنة الأرباح القديمة</button>
                    <button onclick="settleBarberAccount('${member.id}')" class="w-full bg-green-50 text-green-700 border border-green-200 text-xs font-bold py-2.5 rounded-lg hover:bg-green-100 transition"><i class="fa-solid fa-hand-holding-dollar ml-1"></i> تسديد وتصفير (تم الدفع)</button>
                </div>`;
        });
    };

    window.openBarberReport = async function(barberId, teamId, barberName, commRate) {
        window.showLoader();
        const periodValue = document.getElementById('stats-time-filter')?.value || 'month';
        const periodText = periodValue === 'today' ? 'اليوم' : (periodValue === 'week' ? 'هذا الأسبوع' : 'هذا الشهر');
        let startDate = new Date(); if(periodValue === 'today') startDate.setHours(0,0,0,0); else if(periodValue === 'week') startDate.setDate(startDate.getDate() - 7); else startDate.setDate(1);

        const { data: orders } = await supabaseClient.from('orders').select('*').eq('salon_id', state.salonId).eq('barber_id', barberId).eq('status', 'completed').gte('created_at', startDate.toISOString()).order('created_at', { ascending: false });
        window.hideLoader();

        document.getElementById('report-barber-name').innerText = window.escapeHTML(barberName);
        document.getElementById('report-period-text').innerHTML = `<i class="fa-regular fa-calendar ml-1"></i>الفترة: ${periodText}`;
        const safeCommRate = Math.max(0, Math.min(100, Number(commRate) || 0));
        document.getElementById('report-commission-rate').innerText = safeCommRate;

        const listContainer = document.getElementById('report-orders-list'); listContainer.innerHTML = '';
        let totalGross = 0, totalNetSalon = 0;
        let textForSharing = `📋 *كشف حساب الكابتن: ${barberName}*\n📅 الفترة: ${periodText}\n\n`;

        if (!orders || orders.length === 0) {
            listContainer.innerHTML = `<div class="text-center p-8 text-gray-400 font-bold text-xs bg-gray-50 rounded-xl border border-dashed">لا توجد عمليات مسجلة</div>`;
            textForSharing += `لا توجد عمليات مسجلة في هذه الفترة.\n`;
        } else {
            orders.forEach((order, index) => {
                const safeFinalTotal = Math.max(0, Number(order.final_total) || 0);
                const platformCut = safeFinalTotal * 0.15; totalGross += safeFinalTotal;
                const netAfterPlatform = safeFinalTotal - platformCut; totalNetSalon += netAfterPlatform;
                const orderBarberCut = netAfterPlatform * (safeCommRate / 100); 

                const orderDate = new Date(order.created_at);
                const dateStr = orderDate.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' });
                const timeStr = orderDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
                const safeServices = window.escapeHTML(order.services_text);

                textForSharing += `✂️ *طلب #${index + 1}*\n- الوقت: ${dateStr} ${timeStr}\n- الخدمات: ${safeServices}\n- الإجمالي: ${safeFinalTotal} ج.م\n- نصيب الكابتن: ${orderBarberCut.toFixed(2)} ج.م\n---\n`;

                listContainer.innerHTML += `
                    <div class="p-3 border border-gray-100 rounded-xl bg-gray-50 relative transition hover:shadow-sm mb-2">
                        <div class="flex justify-between items-start mb-2 border-b border-gray-200 pb-2">
                            <span class="text-[10px] text-gray-600 bg-gray-200 px-2 py-1 rounded-md font-bold"><i class="fa-regular fa-clock ml-1"></i>${dateStr} - ${timeStr}</span>
                            <span class="text-xs font-bold text-gray-900 bg-white px-2 py-1 rounded border border-gray-200">${safeFinalTotal} ج.م</span>
                        </div>
                        <p class="text-xs text-gray-700 font-bold mb-3 truncate"><i class="fa-solid fa-scissors ml-1 text-gray-400"></i>${safeServices}</p>
                        <div class="flex justify-between bg-white p-2 rounded border border-gray-100">
                            <span class="text-[10px] text-gray-500 font-bold">عمولة المنصة: <span class="text-red-500">${platformCut.toFixed(0)}</span> ج.م</span>
                            <span class="text-[10px] text-purple-600 font-bold">نصيب الكابتن: <span class="text-purple-700">${orderBarberCut.toFixed(0)}</span> ج.م</span>
                        </div>
                    </div>`;
            });
        }

        const finalBarberCut = totalNetSalon * (safeCommRate / 100);
        document.getElementById('report-total-cuts').innerText = orders?.length || 0;
        document.getElementById('report-total-gross').innerText = totalGross.toFixed(0);
        document.getElementById('report-total-net').innerText = finalBarberCut.toFixed(0);

        textForSharing += `\n💰 *الإحصائيات النهائية:*\n- إجمالي الطلبات: ${orders?.length || 0}\n- نسبة الكابتن المتفق عليها: ${safeCommRate}%\n- *الصافي المستحق للكابتن: ${finalBarberCut.toFixed(2)} ج.م*\n\nمع تحيات صالونك 🤝`;
        state.currentBarberReportText = textForSharing;

        if(typeof window.openModal === 'function') window.openModal('barber-report-modal');
    };

    window.shareBarberReport = function() {
        if (!state.currentBarberReportText) return window.showToast('لا يوجد تقرير لمشاركته.');
        const encodedText = encodeURIComponent(state.currentBarberReportText);
        window.open(`https://wa.me/?text=${encodedText}`, '_blank');
        window.playSound('click');
    };

    // ==========================================
    // ⚙️ 13. إعدادات السحب والصور الداخلية (Portfolio) مع نظام الضغط 🗜️
    // ==========================================
    window.toggleSalonWithdrawFields = function() {
        const method = document.querySelector('input[name="salon_withdraw_method"]:checked').value;
        document.getElementById('salon-withdraw-instapay-fields').classList.toggle('hidden', method !== 'instapay');
        document.getElementById('salon-withdraw-visa-fields').classList.toggle('hidden', method !== 'visa');
    };

    window.confirmSalonWithdraw = async function() {
        const method = document.querySelector('input[name="salon_withdraw_method"]:checked').value;
        let details = method === 'instapay' ? document.getElementById('salon-withdraw-instapay-address').value.trim() : `الاسم: ${document.getElementById('salon-withdraw-visa-name').value.trim()} | الحساب: ${document.getElementById('salon-withdraw-visa-card').value.trim()}`;
        const currentBalance = Math.max(0, Number(document.getElementById('salon-available-balance').innerText) || 0);
        if(currentBalance <= 0 || !details || details.includes('undefined')) return window.showToast("البيانات أو الرصيد غير كافي");
        window.showLoader();
        const { error } = await supabaseClient.from('salon_payout_requests').insert([{ salon_id: state.salonId, amount: currentBalance, method: method, account_details: details }]);
        if(error) { window.hideLoader(); return window.showToast('حدث خطأ'); }
        await supabaseClient.from('salon_finances').update({ available_balance: 0 }).eq('salon_id', state.salonId);
        window.hideLoader(); window.playSound('success'); window.closeModal('salon-withdraw-modal'); window.showToast('تم إرسال الطلب بنجاح ✅'); window.loadSalonFinances();
    };

    window.handleSalonAction = function(actionType) {
        if(actionType === 'pay') {
            const currentDebt = Math.max(0, Number(document.getElementById('salon-platform-debt').innerText) || 0);
            if(currentDebt <= 0) return window.showToast('ليس عليك مديونية حالياً ✅');
            document.getElementById('salon-modal-debt-amount').innerText = `${currentDebt} ج.م`; window.openModal('salon-pay-debt-modal');
        }
    };
    
    window.copyAdminInstapaySalon = function() { document.getElementById("salon-admin-instapay-address").select(); document.execCommand("copy"); window.showToast("تم النسخ!"); };
    window.notifyAdminDebtPaidSalon = async function() { window.showLoader(); await supabaseClient.from('salon_finances').update({ debt_payment_pending: true }).eq('salon_id', state.salonId); window.hideLoader(); window.closeModal('salon-pay-debt-modal'); window.showToast("تم إرسال التأكيد للإدارة."); };

    window.openManagePortfolio = function() { window.openModal('manage-portfolio-modal'); window.loadManagePortfolio(); };
    
    window.loadManagePortfolio = async function() {
        const { data: works } = await supabaseClient.from('salon_works').select('*').eq('salon_id', state.salonId).order('created_at', { ascending: false });
        const grid = document.getElementById('portfolio-manage-grid'); grid.innerHTML = '';
        if (works && works.length > 0) works.forEach(w => { grid.innerHTML += `<div class="relative rounded-2xl overflow-hidden aspect-square border"><img src="${window.escapeHTML(w.image_url)}" class="w-full h-full object-cover"><button onclick="deletePortfolioImage('${w.id}', '${window.escapeHTML(w.image_url)}')" class="absolute top-2 right-2 bg-red-500 text-white w-8 h-8 rounded-xl hover:bg-red-600 transition shadow-sm"><i class="fa-solid fa-trash-can"></i></button></div>`; });
        else grid.innerHTML = '<p class="col-span-2 text-center text-gray-400">لا توجد صور في المعرض</p>';
    };

    window.uploadSalonPortfolioImage = async function(event) {
        if(!event.target.files[0]) return; 
        window.showLoader();
        
        // 🚀 حماية السيرفر: فحص العدد (أقصى حد 6 صور لمعرض الصالون)
        const { count } = await supabaseClient.from('salon_works')
            .select('*', { count: 'exact', head: true })
            .eq('salon_id', state.salonId);
            
        if (count >= 6) {
            window.hideLoader();
            window.playSound('error');
            event.target.value = '';
            return window.showToast('الحد الأقصى لمعرض الأعمال هو 6 صور. يرجى حذف صورة قديمة أولاً 🛑');
        }

        try {
            const file = event.target.files[0]; 
            const compressedBlob = await compressImageAsync(file); // 🗜️ ضغط الصورة
            const fileName = `${state.salonId}_${Date.now()}.jpg`;
            
            const { error } = await supabaseClient.storage.from('salon_works').upload(fileName, compressedBlob, { contentType: 'image/jpeg' });
            if(error) throw error;
            
            const { data } = supabaseClient.storage.from('salon_works').getPublicUrl(fileName); 
            await supabaseClient.from('salon_works').insert([{ salon_id: state.salonId, image_url: data.publicUrl }]); 
            
            window.playSound('success'); window.showToast('تمت الإضافة لمعرض الصالون ✅');
        } catch(e) {
             window.playSound('error'); window.showToast('حدث خطأ أثناء الرفع');
        } finally {
            window.hideLoader(); 
            window.loadManagePortfolio();
            event.target.value = '';
        }
    };

    window.deletePortfolioImage = async function(id, imageUrl) { 
        if(!confirm('هل تود حذف هذه الصورة؟')) return; 
        window.showLoader(); 
        try {
            if(imageUrl) {
                // حذف الصورة من ملفات السيرفر لتوفير المساحة 🗑️
                const fileName = imageUrl.split('/').pop();
                await supabaseClient.storage.from('salon_works').remove([fileName]); 
            }
            await supabaseClient.from('salon_works').delete().eq('id', id); 
            window.playSound('success'); window.showToast('تم الحذف بنجاح');
        } catch(e) {
            console.error(e);
            window.playSound('error'); window.showToast('حدث خطأ أثناء الحذف');
        } finally {
            window.hideLoader(); window.loadManagePortfolio(); 
        }
    };

})();