-- HandyOS AWS PostgreSQL schema v0.6
-- Apply ONLY to a NEW isolated HandyOS database after review.
-- Auth identity: Cognito verified access token sub, stored as text.
-- No automatic owner enrollment via public API. Bootstrap via protected admin process.
begin;
create extension if not exists pgcrypto;
create table if not exists tenants (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(name) between 2 and 160),
 created_at timestamptz not null default now()
);
create table if not exists memberships (
 tenant_id uuid not null references tenants(id) on delete cascade,
 cognito_sub text not null check(length(cognito_sub) between 8 and 255),
 role text not null check(role in ('owner','manager','worker','homeowner')),
 status text not null default 'active' check(status in ('active','disabled')),
 created_at timestamptz not null default now(),
 primary key(tenant_id,cognito_sub)
);
create index if not exists memberships_by_sub on memberships(cognito_sub) where status='active';
create table if not exists jobs (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references tenants(id) on delete cascade,
 name text not null check(length(name) between 2 and 200),
 code text not null default '',
 stage text not null default 'survey' check(stage in ('survey','scope','estimate','quoted','approved','scheduled','active','handover','closed')),
 notes text not null default '',
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(tenant_id,id)
);
create index if not exists jobs_by_tenant on jobs(tenant_id,created_at desc);
create table if not exists job_members (
 tenant_id uuid not null,
 job_id uuid not null,
 cognito_sub text not null,
 access_level text not null check(access_level in ('worker','homeowner')),
 primary key (job_id,cognito_sub),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id) on delete cascade,
 foreign key(tenant_id,cognito_sub) references memberships(tenant_id,cognito_sub) on delete cascade
);
create table if not exists work_categories (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 job_id uuid not null,
 name text not null check(length(name) between 1 and 160),
 position integer not null default 0,
 foreign key(tenant_id,job_id) references jobs(tenant_id,id) on delete cascade,
 unique(tenant_id,id)
);
create table if not exists tasks (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 job_id uuid not null,
 category_id uuid,
 title text not null check(length(title) between 1 and 200),
 notes text not null default '',
 status text not null default 'todo' check(status in ('todo','in_progress','blocked','done')),
 client_visible boolean not null default false,
 qty numeric(12,3) not null default 1 check(qty>=0),
 unit text not null default 'item',
 unit_cost_ex_gst numeric(14,2) not null default 0 check(unit_cost_ex_gst>=0),
 position integer not null default 0,
 assigned_to text,
 due_on date,
 created_at timestamptz not null default now(),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id) on delete cascade,
 foreign key(tenant_id,category_id) references work_categories(tenant_id,id),
 unique(tenant_id,id)
);
create index if not exists tasks_by_job on tasks(tenant_id,job_id,position);
create table if not exists cost_entries (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 job_id uuid not null,
 kind text not null check(kind in ('material','labour','subcontractor','equipment','other')),
 description text not null,
 amount_ex_gst numeric(14,2) not null check(amount_ex_gst>=0),
 gst_amount numeric(14,2) not null default 0 check(gst_amount>=0),
 incurred_on date not null default current_date,
 created_at timestamptz not null default now(),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id) on delete cascade
);
create table if not exists quotes (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 job_id uuid not null,
 reference text not null,
 status text not null default 'draft' check(status in ('draft','sent','accepted','declined','superseded')),
 version integer not null default 1 check(version>0),
 markup_percent numeric(6,2) not null default 0 check(markup_percent>=0),
 created_at timestamptz not null default now(),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id) on delete cascade,
 unique(tenant_id,id)
);
create table if not exists quote_lines (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 quote_id uuid not null,
 description text not null,
 qty numeric(12,3) not null check(qty>=0),
 unit text not null,
 unit_cost_ex_gst numeric(14,2) not null check(unit_cost_ex_gst>=0),
 gst_rate numeric(6,4) not null default 0.10 check(gst_rate between 0 and 1),
 foreign key(tenant_id,quote_id) references quotes(tenant_id,id) on delete cascade
);
create table if not exists progress_claims (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 job_id uuid not null,
 reference text not null,
 amount_ex_gst numeric(14,2) not null check(amount_ex_gst>=0),
 gst_amount numeric(14,2) not null check(gst_amount>=0),
 due_on date,
 status text not null default 'draft' check(status in ('draft','issued','part_paid','paid','void')),
 foreign key(tenant_id,job_id) references jobs(tenant_id,id) on delete cascade
);
create table if not exists payments (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null,
 claim_id uuid not null,
 amount numeric(14,2) not null check(amount>0),
 paid_on date not null,
 foreign key(tenant_id,claim_id) references progress_claims(tenant_id,id)
);
create table if not exists audit_events (
 id uuid primary key default gen_random_uuid(),
 tenant_id uuid not null references tenants(id),
 actor_sub text not null,
 action text not null,
 entity_type text not null,
 entity_id uuid not null,
 occurred_at timestamptz not null default now()
);
-- Restrict DB login to app role, no direct internet access.
-- Every query must scope by tenant_id; API resolves tenant from verified Cognito sub.
-- No public tenant/membership insert endpoint. RLS is defense-in-depth, not a replacement
-- for API role checks. DB role should not own tables or have BYPASSRLS.
commit;
