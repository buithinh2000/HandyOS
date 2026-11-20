-- Each independently added bonus, allowance or expense is a separate audited
-- ONE-TIME payroll entry. Period labels describe attribution, NOT auto recurrence.
-- This avoids retroactively changing closed weeks or silently multiplying pay.
begin;
alter table weekly_wage_adjustments
 add column label text not null default '',
 add column period text not null default 'week',
 add column effective_on date;
alter table weekly_wage_adjustments
 add constraint weekly_adjustment_period_check
 check (period in ('day','week','month'));
alter table weekly_wage_adjustments
 add constraint weekly_adjustment_label_check
 check (length(label)<=120);
alter table weekly_wage_adjustments
 add constraint weekly_adjustment_effective_check
 check ((period='week' and effective_on is null)
        or (period in ('day','month') and effective_on is not null));
commit;
