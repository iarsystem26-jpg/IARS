-- Cover the creator foreign key for account maintenance and audit lookups.
create index rmc_calendar_closures_creator_idx on public.rmc_calendar_closures(created_by);
