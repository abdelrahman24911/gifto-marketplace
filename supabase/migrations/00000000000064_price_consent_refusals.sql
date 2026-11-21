-- Migration 64 — Record PRICE_CHANGED refusals (re-audit v7, S-08, LOW):
-- a refused price change left no audit trail.
--
-- Migration 62 records the consent for every *placed* order, but a
-- PRICE_CHANGED refusal raises inside _create_order, so its transaction
-- rolls back — an audit row written in that same transaction would roll
-- back with it. A dispute about a refused attempt ("I was shown X, then
-- checkout refused me") therefore could not be answered from the system.
--
-- A refusal cannot be recorded inside the refusing transaction (there is
-- no autonomous-transaction mechanism available to a SECURITY DEFINER
-- function on hosted Supabase), so the refusal is recorded in a *separate*
-- transaction by the checkout server action, which already catches the
-- PRICE_CHANGED error and shows the diff. The new pieces:
--   * price_consent_refusals: one row per refused checkout attempt,
--     keyed by the attempt's idempotency key (unique, so a retried
--     recording is a no-op), with who attempted (user_id for signed-in,
--     guest_token_hash for guests), the expected prices/total the
--     customer saw, and the live total at recording time. It has NO
--     order_id — no order was created — so it is a separate table in
--     the same family as price_consent_events, not a nullable column
--     on it (the events table's one-row-per-order invariant stays
--     intact).
--   * Writes go only through _record_price_consent_refusal, a SECURITY
--     DEFINER helper granted to service_role only (the checkout server
--     action's client) and revoked from every API role; RLS grants
--     select only (platform admin, and the consenting signed-in
--     customer). No insert/update/delete policy exists, so the trail
--     cannot be edited through the API.
--   * The recorder is self-validating: it recomputes the live total
--     from the cart items and the live product prices, and refuses to
--     record (22023) unless the expected prices genuinely mismatch the
--     live ones — a stale or spurious call records nothing. Malformed
--     items / expected prices, a missing product, or a missing actor
--     are refused the same way.
--   * The live total is read at recording time, not at refusal time:
--     a price changed again in between is recorded as the live total
--     then, which is the truthful audit fact for that moment.
--   * TEST 20(e) in rls_orders_test.sql changes with this migration:
--     a PRICE_CHANGED refusal still records no *consent* row, but it
--     now records exactly one *refusal* row. That is the intentional
--     new invariant, not a regression of the old one.

-- ---------------------------------------------------------------------------
-- price_consent_refusals — append-only refusal trail, one row per attempt
-- ---------------------------------------------------------------------------

create table public.price_consent_refusals (
  id                   uuid primary key default gen_random_uuid(),
  idempotency_key      uuid not null,
  user_id              uuid references public.profiles (id) on delete set null,
  guest_token_hash     text,
  expected_prices      jsonb not null,
  expected_total_minor int not null check (expected_total_minor >= 0),
  live_total_minor     int not null check (live_total_minor >= 0),
  created_at           timestamptz not null default now(),
  constraint price_consent_refusals_one_per_attempt unique (idempotency_key),
  constraint price_consent_refusals_actor_matches check (
    (user_id is not null and guest_token_hash is null)
    or (user_id is null and guest_token_hash is not null
        and guest_token_hash ~ '^[0-9a-f]{64}$')
  )
);

comment on table public.price_consent_refusals is
  'Price-change refusal trail (S-08, migration 64): one append-only row per refused checkout attempt (PRICE_CHANGED), keyed by the attempt idempotency key. No order was created, so there is no order_id. Written only by _record_price_consent_refusal, which verifies the mismatch against live prices before recording.';

alter table public.price_consent_refusals enable row level security;

create index price_consent_refusals_key_idx
  on public.price_consent_refusals (idempotency_key);

create policy "price_consent_refusals: customer read"
  on public.price_consent_refusals for select
  using (user_id = auth.uid());

create policy "price_consent_refusals: platform admin read"
  on public.price_consent_refusals for select
  using (public.is_platform_admin());

revoke all on table public.price_consent_refusals from public, anon, authenticated;
grant select on table public.price_consent_refusals to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- _record_price_consent_refusal — internal helper, service-role only
-- ---------------------------------------------------------------------------

create or replace function public._record_price_consent_refusal(
  p_idempotency_key uuid,
  p_items jsonb,
  p_user_id uuid,
  p_guest_token_hash text,
  p_expected_prices jsonb,
  p_expected_total_minor int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live_total int;
  v_groups int;
  v_expected_groups int;
  v_line record;
  v_live_price int;
  v_mismatch boolean := false;
begin
  if p_idempotency_key is null then
    raise exception 'A checkout attempt key is required.' using errcode = '22023';
  end if;

  if (p_user_id is null and p_guest_token_hash is null)
     or (p_user_id is not null and p_guest_token_hash is not null) then
    raise exception 'A refusal needs exactly one actor.' using errcode = '22023';
  end if;

  if p_guest_token_hash is not null
     and p_guest_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid guest order credential.' using errcode = '22023';
  end if;

  if p_expected_total_minor is null or p_expected_total_minor < 0 then
    raise exception 'Invalid expected total.' using errcode = '22023';
  end if;

  -- Items: a non-empty array of {product_id (uuid), quantity (positive int)}.
  if coalesce(jsonb_typeof(p_items), 'null') <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Invalid cart items.' using errcode = '22023';
  end if;
  for v_line in select * from jsonb_array_elements(p_items) loop
    if (v_line.value ->> 'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (v_line.value ->> 'quantity') !~ '^[0-9]+$'
       or (v_line.value ->> 'quantity')::int <= 0 then
      raise exception 'Invalid cart items.' using errcode = '22023';
    end if;
  end loop;

  -- Expected prices: a non-empty array of {product_id (uuid),
  -- unit_price_minor (non-negative int)} covering exactly the cart.
  if coalesce(jsonb_typeof(p_expected_prices), 'null') <> 'array'
     or jsonb_array_length(p_expected_prices) = 0 then
    raise exception 'Invalid expected prices.' using errcode = '22023';
  end if;
  for v_line in select * from jsonb_array_elements(p_expected_prices) loop
    if (v_line.value ->> 'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (v_line.value ->> 'unit_price_minor') !~ '^[0-9]+$' then
      raise exception 'Invalid expected prices.' using errcode = '22023';
    end if;
  end loop;

  -- Live total from the live product prices, aggregated per product.
  -- A missing product drops its group from the join, so the group
  -- count check below refuses the recording instead of silently
  -- pricing a product that no longer exists.
  select coalesce(sum(p.price_minor * t.qty), 0), count(*)
    into v_live_total, v_groups
    from (
      select (value ->> 'product_id')::uuid as pid,
             sum((value ->> 'quantity')::int) as qty
        from jsonb_array_elements(p_items)
       group by 1
    ) t
    join public.products p on p.id = t.pid;

  select count(distinct (value ->> 'product_id'))
    into v_expected_groups
    from jsonb_array_elements(p_expected_prices);

  if v_groups <>
     (select count(distinct (value ->> 'product_id'))
        from jsonb_array_elements(p_items))
     or v_expected_groups <> v_groups
     or exists (
       select 1
         from jsonb_array_elements(p_expected_prices) as e(value)
        where (e.value ->> 'product_id') not in (
          select distinct (value ->> 'product_id')
            from jsonb_array_elements(p_items)
        )
     ) then
    raise exception 'The prices you saw could not be verified.'
      using errcode = '22023';
  end if;

  -- Per-line mismatch against the live prices.
  for v_line in
    select (e.value ->> 'product_id')::uuid as pid,
           (e.value ->> 'unit_price_minor')::int as expected_price
      from jsonb_array_elements(p_expected_prices) as e(value)
  loop
    select price_minor into v_live_price
      from public.products where id = v_line.pid;
    if not found then
      raise exception 'The prices you saw could not be verified.'
        using errcode = '22023';
    end if;
    if v_line.expected_price <> v_live_price then
      v_mismatch := true;
    end if;
  end loop;

  -- Self-validation: only a genuine mismatch is recorded. A call with
  -- matching prices (stale, retried after a price moved back, or
  -- spurious) records nothing.
  if not v_mismatch and p_expected_total_minor = v_live_total then
    raise exception 'No price mismatch to record.' using errcode = '22023';
  end if;

  insert into public.price_consent_refusals (
    idempotency_key, user_id, guest_token_hash,
    expected_prices, expected_total_minor, live_total_minor
  ) values (
    p_idempotency_key, p_user_id, p_guest_token_hash,
    p_expected_prices, p_expected_total_minor, v_live_total
  )
  on conflict (idempotency_key) do nothing;
end;
$$;

revoke all on function public._record_price_consent_refusal(
  uuid, jsonb, uuid, text, jsonb, int
) from public, anon, authenticated;
grant execute on function public._record_price_consent_refusal(
  uuid, jsonb, uuid, text, jsonb, int
) to service_role;
