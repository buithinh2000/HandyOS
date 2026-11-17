-- Other approved employee expenses are reimbursable payroll additions, not base wages.
-- Payable as a separate weekly line and included once in job labour-related costs.
begin;
alter table weekly_wage_adjustments drop constraint weekly_wage_adjustments_kind_check;
alter table weekly_wage_adjustments add constraint weekly_wage_adjustments_kind_check
 check(kind in ('bonus','allowance','expense'));
commit;
