-- ============================================================
-- Supabase setup สำหรับแอพ Papi & Mami
-- วางทั้งไฟล์นี้ใน Supabase → SQL Editor แล้วกด Run
-- (ข้อมูลถูกเข้ารหัส E2E จากฝั่งเครื่องก่อนส่ง — Supabase เก็บได้แค่ข้อความที่อ่านไม่ออก)
-- ============================================================

create table if not exists public.w12sync (
  room       text not null,
  device     text not null,
  updated_at timestamptz not null default now(),
  data       text not null,
  primary key (room, device)
);

alter table public.w12sync enable row level security;

-- อนุญาตให้ anon (คีย์สาธารณะในแอพ) อ่าน/เขียนได้
-- ปลอดภัยเพราะข้อมูลเข้ารหัส E2E ต้องมีรหัสผ่านของแอพจึงจะอ่านออก
drop policy if exists "w12 anon all" on public.w12sync;
create policy "w12 anon all" on public.w12sync
  for all to anon using (true) with check (true);

-- เปิด Realtime ให้ตารางนี้ (เพื่อให้ Papi/Mami เห็นกันแบบทันที)
-- ถ้าบรรทัดนี้ error ว่า "already member" ไม่เป็นไร ข้ามได้เลย
alter publication supabase_realtime add table public.w12sync;
