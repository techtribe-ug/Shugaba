-- Row level security (spec 4, "Supabase security rules"). Drizzle owns the tables; this file owns access.
-- The server and worker use the service connection, which bypasses RLS. Browsers only ever read.

create or replace function public.is_circle_member(cid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
    where m.circle_id = cid and m.member_id = auth.uid()::text and m.status <> 'REMOVED'
  );
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'members','circles','circle_rules','memberships','rounds','contributions','collection_mandates','payouts',
    'pool_ledger','global_reserve','recoveries','turn_trades','score_events','ledger_events','webhook_events',
    'agent_messages','member_memories','notification_channels','outbound_messages','agent_traces','fraud_flags',
    'clock','rate_limits','proposals'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Members see themselves. private_key_enc is never granted to browser roles.
revoke select on public.members from anon, authenticated;
grant select (id, name, country, language, circle_score, created_at) on public.members to authenticated;
create policy members_self on public.members for select to authenticated using (id = auth.uid()::text);
create policy members_same_circle on public.members for select to authenticated using (
  exists (select 1 from memberships a join memberships b on a.circle_id = b.circle_id
          where a.member_id = auth.uid()::text and b.member_id = members.id)
);

create policy circles_read on public.circles for select to authenticated using (public.is_circle_member(id));
create policy circle_rules_read on public.circle_rules for select to authenticated using (public.is_circle_member(circle_id));
create policy memberships_read on public.memberships for select to authenticated using (public.is_circle_member(circle_id));
create policy rounds_read on public.rounds for select to authenticated using (public.is_circle_member(circle_id));
create policy contributions_read on public.contributions for select to authenticated using (
  exists (select 1 from rounds r where r.id = round_id and public.is_circle_member(r.circle_id))
);
create policy payouts_read on public.payouts for select to authenticated using (
  exists (select 1 from rounds r where r.id = round_id and public.is_circle_member(r.circle_id))
);
create policy pool_ledger_read on public.pool_ledger for select to authenticated using (circle_id is not null and public.is_circle_member(circle_id));
create policy trades_read on public.turn_trades for select to authenticated using (public.is_circle_member(circle_id));
create policy ledger_read on public.ledger_events for select to authenticated using (public.is_circle_member(circle_id));
create policy clock_read on public.clock for select to anon, authenticated using (true);

-- Private to the member: their recoveries, score events, chat, memories, channels, proposals.
create policy recoveries_own on public.recoveries for select to authenticated using (
  exists (select 1 from memberships m where m.id = membership_id and m.member_id = auth.uid()::text)
);
create policy score_events_own on public.score_events for select to authenticated using (member_id = auth.uid()::text);
create policy agent_messages_own on public.agent_messages for select to authenticated using (member_id = auth.uid()::text);
create policy memories_own on public.member_memories for select to authenticated using (member_id = auth.uid()::text);
create policy channels_own on public.notification_channels for select to authenticated using (member_id = auth.uid()::text);
create policy proposals_own on public.proposals for select to authenticated using (member_id = auth.uid()::text);
-- webhook_events, agent_traces, fraud_flags, outbound_messages, rate_limits, global_reserve: no browser policies (server only).
