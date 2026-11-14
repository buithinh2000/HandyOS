-- HandyOS v0.5 database foundation — NOT APPLIED
-- Intentionally owner-only until role-aware policies are fully implemented and tested.
-- Every business table has company_id and RLS. Public anon has no access.
create extension if not exists pgcrypto;
create table if not exists public.companies (
 id uuid primary key default gen_random_uuid(),
 
 name text not null, owner_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.companies enable row level security;
revoke all on public.companies from anon;
grant select,insert,update,delete on public.companies to authenticated;
create policy "companies_owner_read" on public.companies for select to authenticated using (owner_id = (select auth.uid()));
create policy "companies_owner_insert" on public.companies for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "companies_owner_update" on public.companies for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create table if not exists public.profiles (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 display_name text, phone text, auth_user_id uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
grant select,insert,update,delete on public.profiles to authenticated;
create policy "profiles_owner_read" on public.profiles for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "profiles_owner_insert" on public.profiles for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "profiles_owner_update" on public.profiles for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.company_members (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 auth_user_id uuid not null references auth.users(id), role text not null check (role in ('owner','manager','worker','client')),
 created_at timestamptz not null default now()
);
alter table public.company_members enable row level security;
revoke all on public.company_members from anon;
grant select,insert,update,delete on public.company_members to authenticated;
create policy "company_members_owner_read" on public.company_members for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "company_members_owner_insert" on public.company_members for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "company_members_owner_update" on public.company_members for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.projects (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 name text not null, code text, status text not null default 'planning', client_name text, site_address text, contract_amount numeric(14,2) not null default 0, notes text,
 created_at timestamptz not null default now()
);
alter table public.projects enable row level security;
revoke all on public.projects from anon;
grant select,insert,update,delete on public.projects to authenticated;
create policy "projects_owner_read" on public.projects for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "projects_owner_insert" on public.projects for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "projects_owner_update" on public.projects for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.job_categories (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, name text not null, sort_order integer not null default 0, source_template text,
 created_at timestamptz not null default now()
);
alter table public.job_categories enable row level security;
revoke all on public.job_categories from anon;
grant select,insert,update,delete on public.job_categories to authenticated;
create policy "job_categories_owner_read" on public.job_categories for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "job_categories_owner_insert" on public.job_categories for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "job_categories_owner_update" on public.job_categories for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.tasks (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, category_id uuid references public.job_categories(id) on delete set null, title text not null, notes text, status text not null default 'todo', quantity numeric(12,3) not null default 1, unit text not null default 'item', unit_cost_ex_gst numeric(14,2) not null default 0, assignee_id uuid references auth.users(id), due_date date, position integer not null default 0,
 created_at timestamptz not null default now()
);
alter table public.tasks enable row level security;
revoke all on public.tasks from anon;
grant select,insert,update,delete on public.tasks to authenticated;
create policy "tasks_owner_read" on public.tasks for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "tasks_owner_insert" on public.tasks for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "tasks_owner_update" on public.tasks for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.timesheets (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, worker_id uuid references auth.users(id), work_date date not null, hours numeric(6,2) not null default 0, hourly_rate numeric(12,2) not null default 0, notes text, approval_status text not null default 'pending',
 created_at timestamptz not null default now()
);
alter table public.timesheets enable row level security;
revoke all on public.timesheets from anon;
grant select,insert,update,delete on public.timesheets to authenticated;
create policy "timesheets_owner_read" on public.timesheets for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "timesheets_owner_insert" on public.timesheets for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "timesheets_owner_update" on public.timesheets for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.materials (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid references public.projects(id) on delete set null, name text not null, supplier text, supplier_url text, sku text, unit text not null default 'each', unit_price_inc_gst numeric(14,2) not null default 0, verified_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.materials enable row level security;
revoke all on public.materials from anon;
grant select,insert,update,delete on public.materials to authenticated;
create policy "materials_owner_read" on public.materials for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "materials_owner_insert" on public.materials for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "materials_owner_update" on public.materials for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.expenses (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, category text not null, supplier text, description text, amount_inc_gst numeric(14,2) not null default 0, incurred_on date not null default current_date, receipt_path text,
 created_at timestamptz not null default now()
);
alter table public.expenses enable row level security;
revoke all on public.expenses from anon;
grant select,insert,update,delete on public.expenses to authenticated;
create policy "expenses_owner_read" on public.expenses for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "expenses_owner_insert" on public.expenses for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "expenses_owner_update" on public.expenses for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.quotes (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, reference text not null, status text not null default 'draft', markup_pct numeric(6,2) not null default 0, notes text, issued_at timestamptz, approved_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.quotes enable row level security;
revoke all on public.quotes from anon;
grant select,insert,update,delete on public.quotes to authenticated;
create policy "quotes_owner_read" on public.quotes for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "quotes_owner_insert" on public.quotes for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "quotes_owner_update" on public.quotes for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.quote_lines (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 quote_id uuid not null references public.quotes(id) on delete cascade, description text not null, unit text not null default 'item', quantity numeric(12,3) not null default 1, unit_cost_ex_gst numeric(14,2) not null default 0, gst_rate numeric(5,4) not null default .1, sort_order integer not null default 0,
 created_at timestamptz not null default now()
);
alter table public.quote_lines enable row level security;
revoke all on public.quote_lines from anon;
grant select,insert,update,delete on public.quote_lines to authenticated;
create policy "quote_lines_owner_read" on public.quote_lines for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "quote_lines_owner_insert" on public.quote_lines for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "quote_lines_owner_update" on public.quote_lines for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.invoices (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, quote_id uuid references public.quotes(id), reference text not null, amount_inc_gst numeric(14,2) not null default 0, status text not null default 'draft', due_date date, issued_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.invoices enable row level security;
revoke all on public.invoices from anon;
grant select,insert,update,delete on public.invoices to authenticated;
create policy "invoices_owner_read" on public.invoices for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "invoices_owner_insert" on public.invoices for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "invoices_owner_update" on public.invoices for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.payments (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, invoice_id uuid references public.invoices(id), amount numeric(14,2) not null default 0, received_at timestamptz, reference text,
 created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
revoke all on public.payments from anon;
grant select,insert,update,delete on public.payments to authenticated;
create policy "payments_owner_read" on public.payments for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "payments_owner_insert" on public.payments for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "payments_owner_update" on public.payments for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.schedule_events (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, title text not null, starts_at timestamptz not null, ends_at timestamptz, visible_to_client boolean not null default false, notes text,
 created_at timestamptz not null default now()
);
alter table public.schedule_events enable row level security;
revoke all on public.schedule_events from anon;
grant select,insert,update,delete on public.schedule_events to authenticated;
create policy "schedule_events_owner_read" on public.schedule_events for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "schedule_events_owner_insert" on public.schedule_events for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "schedule_events_owner_update" on public.schedule_events for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, sender_id uuid not null references auth.users(id), body text not null, client_visible boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.messages enable row level security;
revoke all on public.messages from anon;
grant select,insert,update,delete on public.messages to authenticated;
create policy "messages_owner_read" on public.messages for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "messages_owner_insert" on public.messages for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "messages_owner_update" on public.messages for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create table if not exists public.attachments (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade, task_id uuid references public.tasks(id), uploaded_by uuid not null references auth.users(id), storage_path text not null, media_type text, client_visible boolean not null default false,
 created_at timestamptz not null default now()
);
alter table public.attachments enable row level security;
revoke all on public.attachments from anon;
grant select,insert,update,delete on public.attachments to authenticated;
create policy "attachments_owner_read" on public.attachments for select to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "attachments_owner_insert" on public.attachments for insert to authenticated with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));
create policy "attachments_owner_update" on public.attachments for update to authenticated using (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid()))) with check (exists (select 1 from public.companies c where c.id = company_id and c.owner_id = (select auth.uid())));

-- OWNER-ONLY gate: members and clients cannot read anything yet.
-- Before enabling employee/client access, write role-specific RLS and test isolation
-- for two companies and two projects (including cross-project access).
-- Attachments must use a private storage bucket with its own storage.objects RLS.
-- No public buckets, no anonymous inserts, no service-role keys in browser.
