// js/supabase-config.js

// آدرس پروژه تو بر اساس آی‌دی تصویر
const SUPABASE_URL = 'https://iksjymqykbptdtyjbqva.supabase.co'; 
// کلید anon رو از پنل کپی کن و اینجا بذار
const SUPABASE_KEY = 'sb_publishable_fp1VIVmax6ckJWllyLnB8w_qPn8ie3e'; 

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

export default supabase;
