import {describe,it,expect,vi} from 'vitest';
vi.mock('@supabase/supabase-js',()=>({createClient:vi.fn()}));
import {createClient} from '@supabase/supabase-js';
import {previewDayTransport} from './dayCasSupabasePreview';
describe('preview transport isolation',()=>{
 it('rejects a different endpoint before creating client',async()=>{
 await expect(previewDayTransport('https://example.invalid','key','token')).rejects.toThrow('Preview database required');
 expect(createClient).not.toHaveBeenCalled();
 });
 it('rejects missing token before creating client',async()=>{
 await expect(previewDayTransport('https://pnqeznuzxrzybanuhwnr.supabase.co','key','')).rejects.toThrow('Authentication required');
 expect(createClient).not.toHaveBeenCalled();
 });
});
