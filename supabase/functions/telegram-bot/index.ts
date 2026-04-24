import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// إعدادات الـ CORS اللي بتسمح للمتصفح يكلم السيرفر بدون مشاكل
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 1. التعامل مع طلب الـ CORS (Preflight) من المتصفح
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { phone, otp, newPassword } = await req.json();

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // استخدام Service Role للاتصال بقاعدة البيانات (مهم جداً لتخطي القيود وتعديل بيانات المستخدمين)
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 2. التحقق من الكود (OTP)
    const cleanPhone = phone.slice(-10);
    const { data: otpData, error: otpError } = await supabaseAdmin
      .from('otp_codes')
      .select('otp')
      .like('phone', `%${cleanPhone}`)
      .maybeSingle();

    if (!otpData || otpData.otp !== otp) {
      return new Response(
        JSON.stringify({ success: false, error: 'الكود غير صحيح أو منتهي الصلاحية' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // 3. البحث عن المستخدم برقم الهاتف
    const { data: profileData, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .like('phone', `%${cleanPhone}`)
      .maybeSingle();

    if (!profileData || profileError) {
      return new Response(
        JSON.stringify({ success: false, error: 'رقم الهاتف غير مسجل' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
      );
    }

    // 4. تغيير كلمة المرور باستخدام واجهة الإدارة (Admin API)
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      profileData.id,
      { password: newPassword }
    );

    if (updateError) {
      throw updateError;
    }

    // 5. مسح كود الـ OTP بعد الاستخدام الناجح لحماية الحساب
    await supabaseAdmin.from('otp_codes').delete().like('phone', `%${cleanPhone}`);

    // 6. إرجاع رسالة نجاح للمتصفح
    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
})