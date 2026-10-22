-- =====================================================================
--  MFZ INVOICE SYSTEM  -  Skema Pangkalan Data Supabase (PostgreSQL)
--  Cara guna: Supabase Dashboard > SQL Editor > New query > tampal semua
--  kandungan fail ini > Run.  Boleh dijalankan berulang kali (idempotent):
--  data contoh hanya dimasukkan jika jadual masih kosong.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TETAPAN SYARIKAT (satu baris sahaja, id = 1)
-- ---------------------------------------------------------------------
create table if not exists company_settings (
  id              int primary key default 1 check (id = 1),
  company_name    text not null default 'MFZ ENTERPRISE',
  reg_no          text,
  address         text,
  phone           text,
  email           text,
  website         text,
  tax_no          text,
  bank_name       text,
  bank_account    text,
  bank_holder     text,
  invoice_prefix  text not null default 'INV-',
  quote_prefix    text not null default 'QT-',
  tax_label       text not null default 'SST',
  tax_rate        numeric(5,2) not null default 0,
  invoice_terms   text,
  invoice_footer  text,
  updated_at      timestamptz not null default now()
);

insert into company_settings
  (id, company_name, reg_no, address, phone, email, website, tax_no,
   bank_name, bank_account, bank_holder, invoice_prefix, quote_prefix,
   tax_label, tax_rate, invoice_terms, invoice_footer)
values
  (1, 'MFZ ENTERPRISE', '(002345678-A)',
   E'No. 12, Jalan Perdana 3,\nTaman Perdana,\n50000 Kuala Lumpur',
   '03-1234 5678', 'admin@mfz.com.my', 'www.mfz.com.my', '',
   'Maybank', '5123 4567 8901', 'MFZ ENTERPRISE', 'INV-', 'QT-',
   'SST', 0,
   E'Bayaran hendaklah dibuat dalam tempoh 30 hari.\nBarang yang telah dijual tidak boleh dipulangkan.',
   'Terima kasih atas sokongan anda. Dokumen ini dijana oleh komputer.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. PELANGGAN
-- ---------------------------------------------------------------------
create table if not exists customers (
  id             uuid primary key default gen_random_uuid(),
  code           text unique,
  name           text not null,
  contact_person text,
  email          text,
  phone          text,
  address        text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. INVENTORI / PRODUK
-- ---------------------------------------------------------------------
create table if not exists products (
  id            uuid primary key default gen_random_uuid(),
  sku           text unique,
  name          text not null,
  description   text,
  category      text,
  unit          text not null default 'unit',
  cost_price    numeric(12,2) not null default 0,
  sell_price    numeric(12,2) not null default 0,
  stock_qty     numeric(12,2) not null default 0,
  reorder_level numeric(12,2) not null default 0,
  track_stock   boolean not null default true,   -- false = perkhidmatan
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. INVOIS
-- ---------------------------------------------------------------------
create table if not exists invoices (
  id          uuid primary key default gen_random_uuid(),
  invoice_no  text not null unique,
  customer_id uuid references customers(id) on delete restrict,
  issue_date  date not null default current_date,
  due_date    date,
  status      text not null default 'unpaid'
              check (status in ('draft','unpaid','partial','paid','void')),
  reference   text,
  subtotal    numeric(14,2) not null default 0,
  discount    numeric(14,2) not null default 0,
  tax_rate    numeric(5,2)  not null default 0,
  tax_amount  numeric(14,2) not null default 0,
  total       numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0,
  notes       text,
  terms       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_invoices_date     on invoices(issue_date);
create index if not exists idx_invoices_customer on invoices(customer_id);
create index if not exists idx_invoices_status   on invoices(status);

create table if not exists invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  product_id  uuid references products(id) on delete set null,
  line_no     int  not null default 1,
  description text not null,
  qty         numeric(12,2) not null default 1,
  unit_price  numeric(12,2) not null default 0,
  discount    numeric(12,2) not null default 0,
  line_total  numeric(14,2) not null default 0
);
create index if not exists idx_invoice_items_inv on invoice_items(invoice_id);

-- ---------------------------------------------------------------------
-- 5. BAYARAN INVOIS
-- ---------------------------------------------------------------------
create table if not exists payments (
  id         uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  pay_date   date not null default current_date,
  amount     numeric(14,2) not null check (amount > 0),
  method     text not null default 'cash'
             check (method in ('cash','bank','card','ewallet','cheque')),
  reference  text,
  notes      text,
  created_at timestamptz not null default now()
);
create index if not exists idx_payments_inv on payments(invoice_id);

-- ---------------------------------------------------------------------
-- 6. SEBUT HARGA (QUOTATION)
-- ---------------------------------------------------------------------
create table if not exists quotations (
  id                   uuid primary key default gen_random_uuid(),
  quotation_no         text not null unique,
  customer_id          uuid references customers(id) on delete restrict,
  issue_date           date not null default current_date,
  valid_until          date,
  status               text not null default 'draft'
                       check (status in ('draft','sent','accepted','rejected','expired','invoiced')),
  reference            text,
  subtotal             numeric(14,2) not null default 0,
  discount             numeric(14,2) not null default 0,
  tax_rate             numeric(5,2)  not null default 0,
  tax_amount           numeric(14,2) not null default 0,
  total                numeric(14,2) not null default 0,
  notes                text,
  terms                text,
  converted_invoice_id uuid references invoices(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists idx_quotations_date on quotations(issue_date);

create table if not exists quotation_items (
  id           uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  product_id   uuid references products(id) on delete set null,
  line_no      int  not null default 1,
  description  text not null,
  qty          numeric(12,2) not null default 1,
  unit_price   numeric(12,2) not null default 0,
  discount     numeric(12,2) not null default 0,
  line_total   numeric(14,2) not null default 0
);
create index if not exists idx_quotation_items_q on quotation_items(quotation_id);

-- ---------------------------------------------------------------------
-- 7. PENGIRA NOMBOR DOKUMEN  (INV-2026-0001, QT-2026-0001 ...)
-- ---------------------------------------------------------------------
create table if not exists doc_counters (
  key     text primary key,
  last_no int not null default 0
);

create or replace function next_doc_no(p_kind text) returns text
language plpgsql as $$
declare
  v_year   text := to_char(current_date, 'YYYY');
  v_n      int;
  v_prefix text;
begin
  select case when p_kind = 'invoice' then invoice_prefix else quote_prefix end
    into v_prefix from company_settings where id = 1;
  insert into doc_counters(key, last_no) values (p_kind || '-' || v_year, 1)
  on conflict (key) do update set last_no = doc_counters.last_no + 1
  returning last_no into v_n;
  return coalesce(v_prefix, 'DOC-') || v_year || '-' || lpad(v_n::text, 4, '0');
end $$;

-- ---------------------------------------------------------------------
-- 8. TRIGGER: STOK BERKURANG / BERTAMBAH MENGIKUT BARISAN INVOIS
-- ---------------------------------------------------------------------
create or replace function trg_invoice_item_stock() returns trigger
language plpgsql as $$
begin
  if tg_op in ('DELETE','UPDATE') and old.product_id is not null then
    update products set stock_qty = stock_qty + old.qty, updated_at = now()
     where id = old.product_id and track_stock;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.product_id is not null then
    update products set stock_qty = stock_qty - new.qty, updated_at = now()
     where id = new.product_id and track_stock;
  end if;
  return null;
end $$;

drop trigger if exists invoice_item_stock on invoice_items;
create trigger invoice_item_stock
after insert or update or delete on invoice_items
for each row execute function trg_invoice_item_stock();

-- ---------------------------------------------------------------------
-- 9. BAYARAN -> KEMASKINI JUMLAH DIBAYAR & STATUS INVOIS
-- ---------------------------------------------------------------------
create or replace function refresh_invoice_payment(p_id uuid) returns void
language plpgsql as $$
declare
  v_paid   numeric;
  v_total  numeric;
  v_status text;
begin
  select total, status into v_total, v_status from invoices where id = p_id;
  if not found then return; end if;
  select coalesce(sum(amount), 0) into v_paid from payments where invoice_id = p_id;
  update invoices set
    paid_amount = v_paid,
    status = case
      when v_status in ('draft','void')          then v_status
      when v_total > 0 and v_paid >= v_total     then 'paid'
      when v_paid > 0                            then 'partial'
      else 'unpaid' end,
    updated_at = now()
  where id = p_id;
end $$;

create or replace function trg_payment_refresh() returns trigger
language plpgsql as $$
begin
  if tg_op in ('UPDATE','DELETE') then perform refresh_invoice_payment(old.invoice_id); end if;
  if tg_op in ('INSERT','UPDATE') then perform refresh_invoice_payment(new.invoice_id); end if;
  return null;
end $$;

drop trigger if exists payment_refresh on payments;
create trigger payment_refresh
after insert or update or delete on payments
for each row execute function trg_payment_refresh();

-- ---------------------------------------------------------------------
-- 10. SIMPAN INVOIS (cipta / kemaskini + barisan, dalam satu transaksi)
--     p = { id?, invoice_no?, customer_id, issue_date, due_date, status,
--           reference, notes, terms, discount, tax_rate,
--           items:[{product_id, description, qty, unit_price, discount}] }
-- ---------------------------------------------------------------------
create or replace function save_invoice(p jsonb) returns uuid
language plpgsql as $$
declare
  v_id   uuid := nullif(p->>'id', '')::uuid;
  v_item jsonb;
  v_i    int := 0;
  v_sub  numeric := 0;
  v_line numeric;
  v_disc numeric := coalesce(nullif(p->>'discount','')::numeric, 0);
  v_rate numeric := coalesce(nullif(p->>'tax_rate','')::numeric, 0);
  v_tax  numeric;
begin
  if v_id is null then
    insert into invoices(invoice_no, customer_id, issue_date, due_date, status,
                         reference, notes, terms, discount, tax_rate)
    values (coalesce(nullif(p->>'invoice_no',''), next_doc_no('invoice')),
            nullif(p->>'customer_id','')::uuid,
            coalesce(nullif(p->>'issue_date','')::date, current_date),
            nullif(p->>'due_date','')::date,
            coalesce(nullif(p->>'status',''), 'unpaid'),
            p->>'reference', p->>'notes', p->>'terms', v_disc, v_rate)
    returning id into v_id;
  else
    update invoices set
      invoice_no  = coalesce(nullif(p->>'invoice_no',''), invoice_no),
      customer_id = nullif(p->>'customer_id','')::uuid,
      issue_date  = coalesce(nullif(p->>'issue_date','')::date, issue_date),
      due_date    = nullif(p->>'due_date','')::date,
      status      = coalesce(nullif(p->>'status',''), status),
      reference   = p->>'reference',
      notes       = p->>'notes',
      terms       = p->>'terms',
      discount    = v_disc,
      tax_rate    = v_rate,
      updated_at  = now()
    where id = v_id;
    if not found then raise exception 'Invois tidak dijumpai'; end if;
    delete from invoice_items where invoice_id = v_id;   -- trigger pulangkan stok
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    v_i := v_i + 1;
    v_line := round(coalesce((v_item->>'qty')::numeric,0) * coalesce((v_item->>'unit_price')::numeric,0)
                    - coalesce((v_item->>'discount')::numeric,0), 2);
    insert into invoice_items(invoice_id, product_id, line_no, description, qty, unit_price, discount, line_total)
    values (v_id, nullif(v_item->>'product_id','')::uuid, v_i, v_item->>'description',
            coalesce((v_item->>'qty')::numeric,0), coalesce((v_item->>'unit_price')::numeric,0),
            coalesce((v_item->>'discount')::numeric,0), v_line);
    v_sub := v_sub + v_line;
  end loop;

  v_tax := round((v_sub - v_disc) * v_rate / 100, 2);
  update invoices set subtotal = v_sub, tax_amount = v_tax, total = v_sub - v_disc + v_tax
   where id = v_id;
  perform refresh_invoice_payment(v_id);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 11. SIMPAN SEBUT HARGA
-- ---------------------------------------------------------------------
create or replace function save_quotation(p jsonb) returns uuid
language plpgsql as $$
declare
  v_id   uuid := nullif(p->>'id', '')::uuid;
  v_item jsonb;
  v_i    int := 0;
  v_sub  numeric := 0;
  v_line numeric;
  v_disc numeric := coalesce(nullif(p->>'discount','')::numeric, 0);
  v_rate numeric := coalesce(nullif(p->>'tax_rate','')::numeric, 0);
  v_tax  numeric;
begin
  if v_id is null then
    insert into quotations(quotation_no, customer_id, issue_date, valid_until, status,
                           reference, notes, terms, discount, tax_rate)
    values (coalesce(nullif(p->>'quotation_no',''), next_doc_no('quotation')),
            nullif(p->>'customer_id','')::uuid,
            coalesce(nullif(p->>'issue_date','')::date, current_date),
            nullif(p->>'valid_until','')::date,
            coalesce(nullif(p->>'status',''), 'draft'),
            p->>'reference', p->>'notes', p->>'terms', v_disc, v_rate)
    returning id into v_id;
  else
    update quotations set
      quotation_no = coalesce(nullif(p->>'quotation_no',''), quotation_no),
      customer_id  = nullif(p->>'customer_id','')::uuid,
      issue_date   = coalesce(nullif(p->>'issue_date','')::date, issue_date),
      valid_until  = nullif(p->>'valid_until','')::date,
      status       = coalesce(nullif(p->>'status',''), status),
      reference    = p->>'reference',
      notes        = p->>'notes',
      terms        = p->>'terms',
      discount     = v_disc,
      tax_rate     = v_rate,
      updated_at   = now()
    where id = v_id;
    if not found then raise exception 'Sebut harga tidak dijumpai'; end if;
    delete from quotation_items where quotation_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
    v_i := v_i + 1;
    v_line := round(coalesce((v_item->>'qty')::numeric,0) * coalesce((v_item->>'unit_price')::numeric,0)
                    - coalesce((v_item->>'discount')::numeric,0), 2);
    insert into quotation_items(quotation_id, product_id, line_no, description, qty, unit_price, discount, line_total)
    values (v_id, nullif(v_item->>'product_id','')::uuid, v_i, v_item->>'description',
            coalesce((v_item->>'qty')::numeric,0), coalesce((v_item->>'unit_price')::numeric,0),
            coalesce((v_item->>'discount')::numeric,0), v_line);
    v_sub := v_sub + v_line;
  end loop;

  v_tax := round((v_sub - v_disc) * v_rate / 100, 2);
  update quotations set subtotal = v_sub, tax_amount = v_tax, total = v_sub - v_disc + v_tax
   where id = v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- 12. TUKAR SEBUT HARGA -> INVOIS
-- ---------------------------------------------------------------------
create or replace function convert_quotation(p_id uuid) returns uuid
language plpgsql as $$
declare
  q     quotations%rowtype;
  v_inv uuid;
begin
  select * into q from quotations where id = p_id;
  if not found then raise exception 'Sebut harga tidak dijumpai'; end if;
  if q.converted_invoice_id is not null then
    raise exception 'Sebut harga ini sudah ditukar kepada invois';
  end if;

  v_inv := save_invoice(jsonb_build_object(
    'customer_id', q.customer_id,
    'issue_date',  current_date,
    'due_date',    current_date + 30,
    'status',      'unpaid',
    'reference',   q.quotation_no,
    'discount',    q.discount,
    'tax_rate',    q.tax_rate,
    'notes',       q.notes,
    'terms',       q.terms,
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
                'product_id', qi.product_id, 'description', qi.description,
                'qty', qi.qty, 'unit_price', qi.unit_price, 'discount', qi.discount)
                order by qi.line_no), '[]'::jsonb)
              from quotation_items qi where qi.quotation_id = q.id)));

  update quotations set status = 'invoiced', converted_invoice_id = v_inv, updated_at = now()
   where id = p_id;
  return v_inv;
end $$;

-- ---------------------------------------------------------------------
-- 13. FUNGSI LAPORAN
--     Jualan dikira daripada invois yang bukan 'draft' / 'void'.
-- ---------------------------------------------------------------------
-- 13a. Jualan mengikut tempoh: day | week | month | year
create or replace function report_sales(p_period text, p_from date, p_to date)
returns table(period_start date, label text, invoice_count bigint, subtotal numeric,
              discount numeric, tax numeric, total numeric, collected numeric, outstanding numeric)
language sql stable as $$
  with s as (
    select generate_series(date_trunc(p_period, p_from::timestamp), p_to::timestamp,
                           ('1 ' || p_period)::interval)::date as ps
  ), a as (
    select date_trunc(p_period, i.issue_date::timestamp)::date as ps,
           count(*) as c, sum(i.subtotal) as sub, sum(i.discount) as d,
           sum(i.tax_amount) as t, sum(i.total) as tot, sum(i.paid_amount) as paid
    from invoices i
    where i.status not in ('draft','void') and i.issue_date between p_from and p_to
    group by 1
  )
  select s.ps,
         case p_period
           when 'day'   then to_char(s.ps, 'DD/MM/YYYY')
           when 'week'  then 'Mgg ' || to_char(s.ps, 'IW') || ' (' || to_char(s.ps, 'DD/MM') || ')'
           when 'month' then to_char(s.ps, 'YYYY-MM')
           else to_char(s.ps, 'YYYY') end,
         coalesce(a.c, 0), coalesce(a.sub, 0), coalesce(a.d, 0), coalesce(a.t, 0),
         coalesce(a.tot, 0), coalesce(a.paid, 0), coalesce(a.tot, 0) - coalesce(a.paid, 0)
  from s left join a on a.ps = s.ps
  order by s.ps
$$;

-- 13b. Ringkasan untuk julat tarikh
create or replace function report_summary(p_from date, p_to date)
returns table(invoice_count bigint, sales_total numeric, collected numeric, outstanding numeric,
              tax_total numeric, quote_count bigint, quote_total numeric,
              quote_accepted bigint, new_customers bigint)
language sql stable as $$
  select
    (select count(*) from invoices i where i.status not in ('draft','void') and i.issue_date between p_from and p_to),
    (select coalesce(sum(i.total),0) from invoices i where i.status not in ('draft','void') and i.issue_date between p_from and p_to),
    (select coalesce(sum(i.paid_amount),0) from invoices i where i.status not in ('draft','void') and i.issue_date between p_from and p_to),
    (select coalesce(sum(i.total - i.paid_amount),0) from invoices i where i.status not in ('draft','void') and i.issue_date between p_from and p_to),
    (select coalesce(sum(i.tax_amount),0) from invoices i where i.status not in ('draft','void') and i.issue_date between p_from and p_to),
    (select count(*) from quotations q where q.issue_date between p_from and p_to),
    (select coalesce(sum(q.total),0) from quotations q where q.issue_date between p_from and p_to),
    (select count(*) from quotations q where q.status in ('accepted','invoiced') and q.issue_date between p_from and p_to),
    (select count(*) from customers c where c.created_at::date between p_from and p_to)
$$;

-- 13c. Produk terlaris
create or replace function report_top_products(p_from date, p_to date, p_limit int default 100)
returns table(name text, sku text, qty numeric, revenue numeric, invoice_count bigint)
language sql stable as $$
  select coalesce(p.name, ii.description), p.sku, sum(ii.qty), sum(ii.line_total),
         count(distinct ii.invoice_id)
  from invoice_items ii
  join invoices i on i.id = ii.invoice_id
  left join products p on p.id = ii.product_id
  where i.status not in ('draft','void') and i.issue_date between p_from and p_to
  group by coalesce(p.name, ii.description), p.sku
  order by 4 desc
  limit p_limit
$$;

-- 13d. Pelanggan teratas
create or replace function report_top_customers(p_from date, p_to date, p_limit int default 100)
returns table(customer text, code text, invoice_count bigint, total numeric,
              collected numeric, outstanding numeric)
language sql stable as $$
  select coalesce(c.name, '(Tiada pelanggan)'), c.code, count(*), sum(i.total),
         sum(i.paid_amount), sum(i.total - i.paid_amount)
  from invoices i
  left join customers c on c.id = i.customer_id
  where i.status not in ('draft','void') and i.issue_date between p_from and p_to
  group by c.id, c.name, c.code
  order by 4 desc
  limit p_limit
$$;

-- ---------------------------------------------------------------------
-- 14. KESELAMATAN
--     Backend menggunakan SERVICE ROLE key (memintas RLS). Semua jadual
--     dikunci untuk anon / authenticated supaya data tidak boleh diakses
--     terus dari pelayar menggunakan anon key.
-- ---------------------------------------------------------------------
alter table company_settings enable row level security;
alter table customers        enable row level security;
alter table products         enable row level security;
alter table invoices         enable row level security;
alter table invoice_items    enable row level security;
alter table payments         enable row level security;
alter table quotations       enable row level security;
alter table quotation_items  enable row level security;
alter table doc_counters     enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on all functions in schema public from public, anon, authenticated';
    execute 'grant  execute on all functions in schema public to service_role';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 15. DATA DEFAULT (hanya dimasukkan jika jadual kosong)
-- ---------------------------------------------------------------------
insert into customers (code, name, contact_person, email, phone, address, notes)
select * from (values
  ('C001', 'Syarikat Maju Jaya Sdn Bhd',   'Encik Razak',  'razak@majujaya.com.my',  '03-8888 1001', E'Lot 5, Jalan Industri 2,\n43000 Kajang, Selangor', 'Pelanggan korporat'),
  ('C002', 'Kedai Runcit Berkat',          'Puan Salmah',  'berkat@contoh.my',       '012-345 6701', E'No. 8, Jalan Pasar,\n20000 Kuala Terengganu',     null),
  ('C003', 'Pusat Tuisyen Cemerlang',      'Cikgu Aminah', 'cemerlang@contoh.my',    '019-222 3344', E'No. 21, Jalan Pendidikan 4,\n81100 Johor Bahru',   null),
  ('C004', 'Bengkel Auto Hasrul',          'Hasrul',       'hasrul.auto@contoh.my',  '017-555 6677', E'Lot 3, Jalan Bengkel,\n70200 Seremban, N. Sembilan', null),
  ('C005', 'Klinik Mesra Sihat',           'Dr. Farah',    'mesrasihat@contoh.my',   '04-777 8899',  E'No. 15, Jalan Kesihatan,\n10250 Georgetown, Pulau Pinang', null),
  ('C006', 'Pelanggan Tunai (Walk-in)',    null,           null,                     null,           null,                                       'Untuk jualan tunai tanpa butiran pelanggan')
) as v(code, name, contact_person, email, phone, address, notes)
where not exists (select 1 from customers);

insert into products (sku, name, description, category, unit, cost_price, sell_price, stock_qty, reorder_level, track_stock)
select * from (values
  ('P001', 'Kertas A4 80gsm (Rim)',        '500 helai sebungkus',        'Alat Tulis',        'rim',   10.50,  14.90, 400::numeric, 30::numeric, true),
  ('P002', 'Pen Biru 0.7mm (Kotak)',       '12 batang sekotak',          'Alat Tulis',        'kotak',  6.00,   9.50, 300, 20, true),
  ('P003', 'Fail Plastik A4',              null,                         'Alat Tulis',        'unit',   0.80,   1.50, 800, 50, true),
  ('P004', 'Stapler Besar',                null,                         'Peralatan Pejabat', 'unit',   7.00,  12.00, 200, 10, true),
  ('P005', 'Tinta Printer Hitam 100ml',    'Serasi pelbagai printer',    'Peralatan Pejabat', 'botol', 18.00,  29.00, 150, 20, true),
  ('P006', 'Kalkulator Saintifik',         null,                         'Elektronik',        'unit',  22.00,  35.00, 120, 10, true),
  ('P007', 'USB Flash Drive 32GB',         null,                         'Elektronik',        'unit',  15.00,  24.90, 200, 15, true),
  ('P008', 'Servis Penyelenggaraan (Sejam)','Caj mengikut jam',          'Perkhidmatan',      'jam',    0.00,  80.00, 0, 0, false),
  ('P009', 'Kos Penghantaran',             null,                         'Perkhidmatan',      'trip',   0.00,  15.00, 0, 0, false),
  ('P010', 'Pemasangan & Konfigurasi',     null,                         'Perkhidmatan',      'kali',   0.00, 150.00, 0, 0, false)
) as v(sku, name, description, category, unit, cost_price, sell_price, stock_qty, reorder_level, track_stock)
where not exists (select 1 from products);

-- 30 invois contoh (tersebar sepanjang ~12 bulan) + bayaran, supaya laporan
-- Harian / Mingguan / Bulanan / Tahunan ada data untuk dilihat.
do $$
declare
  i int; n int; cids uuid[]; pids uuid[]; v_cust uuid;
  r1 record; r2 record; v_date date; v_id uuid; v_total numeric; v_rate numeric;
begin
  if exists (select 1 from invoices) then return; end if;
  select array_agg(id order by code) into cids from customers;
  select array_agg(id order by sku)  into pids from products;
  select tax_rate into v_rate from company_settings where id = 1;
  n := array_length(pids, 1);

  for i in 1..30 loop
    v_date := case when i <= 5  then current_date - (i - 1)
                   when i <= 10 then current_date - (i * 3)
                   else current_date - (30 + (i - 10) * 15) end;
    v_cust := cids[1 + (i % array_length(cids, 1))];
    select id, name, sell_price into r1 from products where id = pids[1 + (i % n)];
    select id, name, sell_price into r2 from products where id = pids[1 + ((i * 3) % n)];

    v_id := save_invoice(jsonb_build_object(
      'customer_id', v_cust, 'issue_date', v_date, 'due_date', v_date + 30,
      'status', 'unpaid', 'tax_rate', coalesce(v_rate, 0),
      'notes', 'Terima kasih atas urusniaga anda.',
      'items', jsonb_build_array(
        jsonb_build_object('product_id', r1.id, 'description', r1.name, 'qty', 1 + (i % 4),       'unit_price', r1.sell_price, 'discount', 0),
        jsonb_build_object('product_id', r2.id, 'description', r2.name, 'qty', 1 + ((i * 2) % 5), 'unit_price', r2.sell_price, 'discount', 0))));

    select total into v_total from invoices where id = v_id;
    if i % 4 = 1 then
      insert into payments(invoice_id, pay_date, amount, method)
      values (v_id, least(v_date + 3, current_date), round(v_total / 2, 2), 'bank');
    elsif i % 4 in (2, 3) then
      insert into payments(invoice_id, pay_date, amount, method)
      values (v_id, least(v_date + 3, current_date), v_total,
              case when i % 2 = 0 then 'cash' else 'ewallet' end);
    end if;                                  -- i % 4 = 0  -> kekal belum bayar
  end loop;
end $$;

do $$
declare cids uuid[]; pids uuid[];
begin
  if exists (select 1 from quotations) then return; end if;
  select array_agg(id order by code) into cids from customers;
  select array_agg(id order by sku)  into pids from products;

  perform save_quotation(jsonb_build_object(
    'customer_id', cids[1], 'issue_date', current_date - 12, 'valid_until', current_date + 18,
    'status', 'sent', 'notes', 'Harga sah selama 30 hari.',
    'items', (select jsonb_agg(jsonb_build_object('product_id', id, 'description', name, 'qty', 20, 'unit_price', sell_price, 'discount', 0))
              from products where sku in ('P001','P002'))));
  perform save_quotation(jsonb_build_object(
    'customer_id', cids[3], 'issue_date', current_date - 40, 'valid_until', current_date - 10,
    'status', 'expired',
    'items', (select jsonb_agg(jsonb_build_object('product_id', id, 'description', name, 'qty', 5, 'unit_price', sell_price, 'discount', 0))
              from products where sku in ('P006','P007'))));
  perform save_quotation(jsonb_build_object(
    'customer_id', cids[5], 'issue_date', current_date - 3, 'valid_until', current_date + 27,
    'status', 'draft',
    'items', (select jsonb_agg(jsonb_build_object('product_id', id, 'description', name, 'qty', 1, 'unit_price', sell_price, 'discount', 0))
              from products where sku in ('P008','P010'))));
  perform save_quotation(jsonb_build_object(
    'customer_id', cids[2], 'issue_date', current_date - 20, 'valid_until', current_date + 10,
    'status', 'accepted',
    'items', (select jsonb_agg(jsonb_build_object('product_id', id, 'description', name, 'qty', 10, 'unit_price', sell_price, 'discount', 0))
              from products where sku in ('P003','P004'))));
end $$;
