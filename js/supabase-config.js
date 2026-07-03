import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://iksjymqykbptdtyjbqva.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fp1VIVmax6ckJWllyLnB8w_qPn8ie3e';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default supabase;
