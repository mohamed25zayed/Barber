// اسم الملف: auth.js
// المسار: js/auth.js
// الوظيفة: إدارة المصادقة، التسجيل، الدخول التلقائي، ونسيان كلمة المرور 
// 🛡️ التحديث الأمني (V2): الاعتماد بالكامل على RPC لمنع تسريب الأكواد وتأمين جدول otp_codes مع نظام Deep Linking و Upsert

(() => {
    // ==========================================
    // 🛡️ 1. دوال داخلية (Private) للحماية والمساعدة
    // ==========================================

    let resendInterval; // متغير لحفظ حالة عداد إعادة إرسال الكود

    // دالة للتحقق من صحة الرقم الدولي برمجياً
    function isValidPhoneNumber(phone) {
        const regex = /^\+?[0-9]{8,15}$/;
        return regex.test(phone);
    }

    // دالة توجيه المستخدم حسب الصلاحية
    function loginAs(role) {
        if(role === 'customer') {
            window.location.replace('pages/customer.html');
        } else if (role === 'barber') {
            window.location.replace('pages/barber.html');
        } else if (role === 'admin' || role === 'sub_admin') {
            window.location.replace('pages/admin.html');
        } else if (role === 'salon_admin') {
            window.location.replace('pages/salon.html'); 
        }
    }

    // ==========================================
    // 🔄 2. الدخول التلقائي (Auto-Login Check)
    // ==========================================
    document.addEventListener('DOMContentLoaded', async () => {
        if (typeof supabaseClient === 'undefined') return;

        const { data: { session } } = await supabaseClient.auth.getSession();
        
        if (session) {
            if(typeof window.showLoader === 'function') window.showLoader(0, null);
            
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('role')
                .eq('id', session.user.id)
                .maybeSingle();

            if (profile) {
                loginAs(profile.role);
            } else {
                if(typeof window.hideLoader === 'function') window.hideLoader();
            }
        }
    });

    // ==========================================
    // 🖥️ 3. إدارة واجهة المستخدم (Public API)
    // ==========================================
    window.toggleAuthTab = function(tab) {
        const loginBtn = document.getElementById('tab-login');
        const regBtn = document.getElementById('tab-register');
        const regFields = document.getElementById('register-fields');
        const forgotPassLink = document.getElementById('forgot-password-link');
        const authSubmitBtn = document.getElementById('auth-submit-btn');
        const authBtnText = document.getElementById('auth-btn-text');
        const authBtnIcon = document.getElementById('auth-btn-icon');
        const otpSection = document.getElementById('otp-section');
        
        if (tab === 'login') {
            loginBtn.className = "flex-1 py-3 text-sm font-bold bg-white shadow-sm rounded-xl text-gray-900 transition-all";
            regBtn.className = "flex-1 py-3 text-sm font-bold text-gray-500 rounded-xl transition hover:text-gray-700";
            
            regFields.classList.add('hidden');
            if (forgotPassLink) forgotPassLink.classList.remove('hidden');
            
            if (authSubmitBtn) {
                authSubmitBtn.classList.remove('hidden');
                authSubmitBtn.setAttribute('onclick', 'window.handleAuthSubmit()');
            }
            if (otpSection) {
                otpSection.classList.add('hidden');
                otpSection.innerHTML = ''; 
            }
            
            if (authBtnText) authBtnText.innerText = "تسجيل الدخول";
            if (authBtnIcon) authBtnIcon.className = "fa-solid fa-arrow-left text-sm mt-0.5";
            
        } else {
            regBtn.className = "flex-1 py-3 text-sm font-bold bg-white shadow-sm rounded-xl text-gray-900 transition-all";
            loginBtn.className = "flex-1 py-3 text-sm font-bold text-gray-500 rounded-xl transition hover:text-gray-700";
            
            regFields.classList.remove('hidden');
            if (forgotPassLink) forgotPassLink.classList.add('hidden');
            
            if (authSubmitBtn) {
                authSubmitBtn.classList.remove('hidden');
                authSubmitBtn.setAttribute('onclick', 'window.requestTelegramOTP()');
            }
            if (otpSection) {
                otpSection.classList.add('hidden');
                otpSection.innerHTML = ''; 
            }
            
            if (authBtnText) authBtnText.innerText = "طلب كود التفعيل";
            if (authBtnIcon) authBtnIcon.className = "fa-brands fa-telegram text-lg mt-0.5";
        }
    };

    window.toggleBarberFields = function(isBarber) {
        const extraFields = document.getElementById('barber-extra-fields');
        if(extraFields) {
            if(isBarber) {
                extraFields.classList.remove('hidden');
            } else {
                extraFields.classList.add('hidden');
            }
        }
    };

    // ==========================================
    // 📲 4. نظام التفعيل عبر تليجرام (OTP) المحمي بالـ RPC
    // ==========================================
    
    window.startResendTimer = function(seconds) {
        let timeLeft = seconds;
        const resendBtn = document.getElementById('resend-otp-btn');
        if (!resendBtn) return;
        
        clearInterval(resendInterval);
        resendBtn.disabled = true;
        resendBtn.classList.replace('text-amber-600', 'text-gray-500');
        
        resendInterval = setInterval(() => {
            timeLeft--;
            resendBtn.innerText = `إعادة إرسال الكود (${timeLeft} ثانية)`;
            if (timeLeft <= 0) {
                clearInterval(resendInterval);
                resendBtn.disabled = false;
                resendBtn.innerText = "إعادة إرسال الكود الآن";
                resendBtn.classList.replace('text-gray-500', 'text-amber-600');
            }
        }, 1000);
    };

    window.resendTelegramOTP = function() {
        const resendBtn = document.getElementById('resend-otp-btn');
        if (resendBtn && resendBtn.disabled) return;
        window.requestTelegramOTP(true);
    };

    window.requestTelegramOTP = async function(isResend = false) {
        const phoneInput = document.getElementById('login-phone').value.trim();
        const passInput = document.getElementById('login-pass').value.trim();
        const isRegActive = !document.getElementById('register-fields').classList.contains('hidden');

        // 1. التحقق من صحة الرقم
        if (!isValidPhoneNumber(phoneInput)) {
            if(typeof window.playSound === 'function') window.playSound('error');
            return window.showToast("يرجى إدخال رقم هاتف صحيح");
        }

        // 2. التحقق من ملء كل الخانات قبل إرسال الكود
        if (isRegActive) {
            const fullName = document.getElementById('reg-fullname').value.trim();
            const roleEl = document.querySelector('input[name="role"]:checked');
            const role = roleEl ? roleEl.value : 'customer';
            const nationalId = document.getElementById('reg-national-id')?.value.trim();
            const avatarInput = document.getElementById('reg-avatar');

            if (!fullName) return window.showToast('يرجى إدخال الاسم بالكامل');
            if (passInput.length < 6) return window.showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
            
            if (role === 'barber') {
                if (!nationalId) return window.showToast('يرجى إدخال الرقم القومي/الهوية للكابتن');
                if (!avatarInput || avatarInput.files.length === 0) return window.showToast('عفواً، الصورة الشخصية إجبارية للكابتن.');
            }
        }

        window.showLoader(100, null);
        
        try {
            // توليد كود جلسة فريد للربط مع تليجرام
            const sessionId = crypto.randomUUID();

            // 🛡️ تحديث أمني: إرسال الطلب للسيرفر لتوليد وحفظ الكود مع الـ sessionId
            const { error } = await supabaseClient.rpc('generate_otp', { 
                p_phone: phoneInput,
                p_session: sessionId 
            });

            if (error) throw error;

            window.showToast("تم تجهيز الكود! انتقل لتليجرام لاستلامه.");
            
            const otpSection = document.getElementById('otp-section');
            const submitBtn = document.getElementById('auth-submit-btn');
            
            if(otpSection) {
                otpSection.classList.remove('hidden');
                otpSection.innerHTML = `
                    <div class="p-4 bg-amber-50 rounded-xl border border-amber-100 mt-4 text-center animate-fade-in">
                        <p class="text-sm text-gray-800 mb-3 font-bold">تم تجهيز الكود بنجاح! 🚀</p>
                        
                        <a href="https://t.me/barberhome_otp_bot?start=${sessionId}" target="_blank" class="inline-block bg-blue-500 hover:bg-blue-600 text-white px-4 py-3 rounded-xl font-bold text-sm mb-4 w-full shadow-md transition-all">
                            <i class="fa-brands fa-telegram mr-2"></i> اضغط هنا لفتح بوت تليجرام
                        </a>
                        
                        <input type="number" id="otp-input" placeholder="أدخل كود التفعيل هنا (4 أرقام)" class="w-full bg-white border border-gray-300 text-gray-900 text-sm rounded-xl focus:ring-amber-500 focus:border-amber-500 block p-3 text-center tracking-widest font-bold mb-3" maxlength="4">
                        
                        <button onclick="window.verifyOTPAndProceed()" class="w-full bg-green-600 hover:bg-green-700 text-white rounded-xl py-3 text-sm font-bold shadow-md transition-all mb-2">
                            تأكيد الكود وإنشاء الحساب ✅
                        </button>

                        <button id="resend-otp-btn" onclick="window.resendTelegramOTP()" class="text-gray-500 text-xs font-bold w-full mt-2 transition-all p-2" disabled>
                            إعادة إرسال الكود (60 ثانية)
                        </button>
                    </div>
                `;
                window.startResendTimer(60);
            }
            if(submitBtn) submitBtn.classList.add('hidden');
            
            // الفتح التلقائي لغير الآيفون
            if(!isResend) {
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                if(!isIOS) {
                    window.open(`https://t.me/barberhome_otp_bot?start=${sessionId}`, '_blank');
                }
            }

        } catch (e) {
            if(typeof window.playSound === 'function') window.playSound('error');
            window.showToast("حدث خطأ في النظام، يرجى المحاولة لاحقاً.");
            console.error('OTP Generation Error:', e);
        } finally {
            window.hideLoader();
        }
    };

    window.verifyOTPAndProceed = async function() {
        const phoneInput = document.getElementById('login-phone').value.trim();
        const userOtpInput = document.getElementById('otp-input')?.value.trim();

        if (!userOtpInput) {
            if(typeof window.playSound === 'function') window.playSound('error');
            return window.showToast("يرجى إدخال الكود الذي وصلك على تليجرام");
        }

        if (!phoneInput) {
            return window.showToast("حدث خطأ: رقم الهاتف غير موجود، يرجى كتابته مرة أخرى.");
        }

        window.showLoader(100, null);

        try {
            // 🛡️ تحديث أمني: إرسال الكود للسيرفر لمطابقته (بدون قراءة الداتا في المتصفح)
            const { data: isValid, error } = await supabaseClient.rpc('verify_otp', { 
                p_phone: phoneInput, 
                p_otp: userOtpInput 
            });

            if (error) throw error;

            if (isValid) {
                if(typeof window.playSound === 'function') window.playSound('success');
                window.showToast("تم تأكيد رقم الهاتف بنجاح! ✅");
                
                window.hideLoader();
                // السيرفر بيمسح الكود لوحده لو كان صح، بنكمل الدخول مباشرة
                await window.handleAuthSubmit(true);
            } else {
                window.hideLoader();
                if(typeof window.playSound === 'function') window.playSound('error');
                window.showToast("الكود خاطئ، يرجى التأكد من الرقم والمحاولة مرة أخرى ❌");
            }
        } catch(e) {
            window.hideLoader();
            window.showToast("حدث خطأ أثناء التحقق من الكود.");
            console.error('OTP Verification Error:', e);
        }
    };

    // ==========================================
    // 🔐 5. نظام التسجيل وتسجيل الدخول الأساسي
    // ==========================================
    window.handleAuthSubmit = async function(isPhoneVerified = false) {
        if (typeof supabaseClient === 'undefined') {
            return window.showToast('خطأ: لم يتم الاتصال بقاعدة البيانات!');
        }

        const phoneInput = document.getElementById('login-phone').value.trim();
        const passInput = document.getElementById('login-pass').value.trim();
        const isRegActive = !document.getElementById('register-fields').classList.contains('hidden');

        if (!phoneInput || !passInput) return window.showToast('يرجى إدخال رقم الهاتف وكلمة المرور');
        if (!isValidPhoneNumber(phoneInput)) return window.showToast("يرجى إدخال رقم هاتف صحيح");

        const fakeEmail = `${phoneInput}@barberhome.com`;

        if (isRegActive) {
            // --- إنشاء حساب جديد ---
            if (!isPhoneVerified) {
                if(typeof window.playSound === 'function') window.playSound('error');
                return window.showToast("يرجى الضغط على زر 'طلب كود التفعيل' وتأكيد رقمك أولاً.");
            }

            const fullName = document.getElementById('reg-fullname').value.trim();
            const roleEl = document.querySelector('input[name="role"]:checked');
            const role = roleEl ? roleEl.value : 'customer';
            const nationalId = document.getElementById('reg-national-id')?.value.trim();
            const avatarInput = document.getElementById('reg-avatar');

            window.showLoader(100, null);

            try {
                const { data: authData, error: authError } = await supabaseClient.auth.signUp({
                    email: fakeEmail,
                    password: passInput,
                });

                // ⬇️ هنا تم إضافة كود طباعة الخطأ في الـ Console ⬇️
                if (authError) {
                    console.error("الخطأ الحقيقي من السيرفر:", authError); // طباعة الخطأ لمعرفة السبب
                    window.hideLoader();
                    if (authError.message.includes('already registered') || authError.message.includes('User already exists')) {
                        return window.showToast('رقم الهاتف مسجل بالفعل، يرجى تسجيل الدخول.');
                    }
                    return window.showToast('حدث خطأ أثناء إنشاء الحساب، يرجى المحاولة لاحقاً.');
                }

                const userId = authData.user.id;
                let avatarUrl = null;

                if (role === 'barber' && avatarInput && avatarInput.files.length > 0) {
                    window.showToast('جاري رفع الصورة وإعداد الحساب...');
                    if(typeof window.uploadAvatar === 'function') {
                        avatarUrl = await window.uploadAvatar(avatarInput.files[0], userId);
                    }
                }

                // 🛠️ الحل الجذري: استخدام upsert لتحديث الصف الذي أنشأه الـ Trigger (إن وجد)
                const { error: profileError } = await supabaseClient
                    .from('profiles')
                    .upsert([
                        { 
                            id: userId, 
                            full_name: window.escapeHTML ? window.escapeHTML(fullName) : fullName, 
                            phone: phoneInput, 
                            role: role, 
                            national_id: role === 'barber' ? (window.escapeHTML ? window.escapeHTML(nationalId) : nationalId) : null,
                            status: role === 'barber' ? 'pending' : 'active',
                            portfolio_url: avatarUrl
                        }
                    ]);

                if (role === 'salon_admin') {
                    await supabaseClient.from('salons').insert([
                        { 
                            owner_id: userId, 
                            name: window.escapeHTML ? window.escapeHTML(fullName) : fullName,
                            is_active: false,
                            status: 'pending'
                        }
                    ]);
                }

                window.hideLoader();

                if (profileError) return window.showToast('تم إنشاء الحساب ولكن حدث خطأ في حفظ البيانات.');

                if (role === 'barber' || role === 'salon_admin') {
                    window.showToast('تم إرسال طلب الانضمام بنجاح! يرجى انتظار موافقة الإدارة.');
                    window.toggleAuthTab('login'); 
                    document.getElementById('login-pass').value = '';
                } else {
                    if (window.OneSignalDeferred) {
                        window.OneSignalDeferred.push(async function(OneSignal) {
                            await OneSignal.login(userId);
                        });
                    }
                    loginAs(role); 
                }
            } catch(e) {
                window.hideLoader();
                window.showToast('حدث خطأ غير متوقع أثناء التسجيل.');
                console.error(e);
            }

        } else {
            // --- تسجيل الدخول ---
            window.showLoader(100, null);
            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({
                    email: fakeEmail,
                    password: passInput
                });

                if (error) {
                    window.hideLoader();
                    return window.showToast('رقم الهاتف أو كلمة المرور غير صحيحة!');
                }

                const { data: profileData } = await supabaseClient
                    .from('profiles')
                    .select('role, status')
                    .eq('id', data.user.id)
                    .maybeSingle();

                window.hideLoader();

                if (!profileData) {
                    await supabaseClient.auth.signOut();
                    return window.showToast('هذا الحساب غير مكتمل البيانات! يرجى التواصل مع الإدارة.');
                }

                if (profileData.role === 'barber' && profileData.status === 'pending') {
                    window.showToast('حسابك قيد المراجعة من الإدارة، يرجى الانتظار.');
                } else {
                    if (window.OneSignalDeferred) {
                        window.OneSignalDeferred.push(async function(OneSignal) {
                            await OneSignal.login(data.user.id);
                        });
                    }
                    loginAs(profileData.role);
                }
            } catch(e) {
                window.hideLoader();
                window.showToast('حدث خطأ أثناء تسجيل الدخول.');
            }
        }
    };

    // ==========================================
    // 🔄 6. دوال استعادة كلمة المرور
    // ==========================================
    window.requestPasswordResetOTP = async function() {
        const phoneInput = document.getElementById('reset-phone').value.trim();
        
        if (!isValidPhoneNumber(phoneInput)) return window.showToast("يرجى إدخال رقم هاتف صحيح");

        window.showLoader(100, null);

        try {
            // توليد كود جلسة فريد
            const sessionId = crypto.randomUUID();

            // 🛡️ التحديث الأمني: مناداة السيرفر لتوليد الكود مع الـ sessionId
            const { error } = await supabaseClient.rpc('generate_otp', { 
                p_phone: phoneInput,
                p_session: sessionId
            });

            window.hideLoader();

            if (!error) {
                window.showToast("تم إرسال الكود! انتقل لتليجرام لاستلامه.");
                document.getElementById('reset-step-1').classList.add('hidden');
                document.getElementById('reset-step-2').classList.remove('hidden');
                
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                if(!isIOS) window.open(`https://t.me/barberhome_otp_bot?start=${sessionId}`, '_blank');
                
            } else throw error;
        } catch(e) {
            window.hideLoader();
            window.showToast("حدث خطأ، يرجى المحاولة لاحقاً.");
            console.error('Password Reset OTP Error:', e);
        }
    };

    window.submitNewPassword = async function() {
        const phone = document.getElementById('reset-phone').value.trim();
        const otp = document.getElementById('reset-otp').value.trim();
        const newPassword = document.getElementById('reset-new-pass').value.trim();

        if (!otp || !newPassword) return window.showToast('يرجى إدخال الكود وكلمة المرور الجديدة');
        if (newPassword.length < 6) return window.showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل');

        window.showLoader(100, null);

        try {
            // 🛡️ التحقق الأمني من الكود الأول قبل تفعيل الباسورد الجديد
            const { data: isValid, error: otpError } = await supabaseClient.rpc('verify_otp', { 
                p_phone: phone, 
                p_otp: otp 
            });

            if (otpError || !isValid) {
                window.hideLoader();
                if(typeof window.playSound === 'function') window.playSound('error');
                return window.showToast('الكود خاطئ، يرجى التأكد من الرقم والمحاولة مرة أخرى ❌');
            }

            // لو الكود صح، نكلم الدالة الخاصة بتغيير الباسورد
            const { data, error } = await supabaseClient.functions.invoke('reset-password', {
                body: { phone: phone, otp: otp, newPassword: newPassword }
            });

            window.hideLoader();

            if (error) throw new Error(error.message);

            if (data && data.success) {
                if(typeof window.playSound === 'function') window.playSound('success');
                window.showToast('تم تغيير كلمة المرور بنجاح! جاري الدخول... ✅');
                
                if(typeof window.closeModal === 'function') window.closeModal('forgot-pass-modal');
                document.getElementById('login-phone').value = phone;
                document.getElementById('login-pass').value = newPassword;
                
                window.handleAuthSubmit(); 
            } else {
                if(typeof window.playSound === 'function') window.playSound('error');
                window.showToast(data.error || 'حدث خطأ أثناء تغيير كلمة المرور ❌');
            }
        } catch (err) {
            window.hideLoader();
            window.showToast('حدث خطأ، تأكد من صحة الكود والمحاولة لاحقاً.');
        }
    };

})();