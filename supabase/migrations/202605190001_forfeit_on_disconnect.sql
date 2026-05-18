create table if not exists public.room_presence (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  primary key (room_id, player_id)
);

create index if not exists room_presence_room_last_seen_idx
on public.room_presence (room_id, last_seen_at desc);

create or replace function public.touch_room_presence(p_code text)
returns public.room_presence
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
  v_presence public.room_presence;
begin
  if v_user is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into v_room
  from public.rooms
  where code = upper(trim(p_code));

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.black_player is distinct from v_user and v_room.white_player is distinct from v_user then
    raise exception 'Only room players can update presence.';
  end if;

  insert into public.room_presence (room_id, player_id, last_seen_at)
  values (v_room.id, v_user, now())
  on conflict (room_id, player_id)
  do update set last_seen_at = excluded.last_seen_at
  returning * into v_presence;

  return v_presence;
end;
$$;

create or replace function public.claim_forfeit_win(p_code text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
  v_winner_color public.stone_color;
  v_loser uuid;
  v_loser_last_seen timestamptz;
begin
  if v_user is null then
    raise exception 'Authentication is required.';
  end if;

  select *
  into v_room
  from public.rooms
  where code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.status <> 'playing' then
    raise exception 'Game is not active.';
  end if;

  if v_room.black_player = v_user then
    v_winner_color := 'black';
    v_loser := v_room.white_player;
  elsif v_room.white_player = v_user then
    v_winner_color := 'white';
    v_loser := v_room.black_player;
  else
    raise exception 'Only room players can claim forfeit.';
  end if;

  if v_loser is null then
    raise exception 'Waiting for both players.';
  end if;

  select last_seen_at
  into v_loser_last_seen
  from public.room_presence
  where room_id = v_room.id
    and player_id = v_loser;

  if v_loser_last_seen is null then
    raise exception 'Opponent connection has not been observed.';
  end if;

  if v_loser_last_seen > now() - interval '15 seconds' then
    raise exception 'Opponent is still connected.';
  end if;

  update public.rooms
  set status = 'finished',
      winner = v_winner_color,
      winning_player = v_user,
      finished_at = now(),
      restart_black = false,
      restart_white = false
  where id = v_room.id
  returning * into v_room;

  insert into public.game_results (room_id, game_index, black_player, white_player, winner_player, outcome)
  values (
    v_room.id,
    v_room.game_index,
    v_room.black_player,
    v_room.white_player,
    v_user,
    case when v_winner_color = 'black' then 'black_win' else 'white_win' end
  )
  on conflict (room_id, game_index) do nothing;

  update public.profiles
  set rating = rating + 3,
      wins = wins + 1
  where id = v_user;

  update public.profiles
  set losses = losses + 1
  where id = v_loser;

  return v_room;
end;
$$;

alter table public.room_presence enable row level security;

drop policy if exists "room players can read room presence" on public.room_presence;
create policy "room players can read room presence"
on public.room_presence for select
to authenticated
using (
  exists (
    select 1
    from public.rooms
    where rooms.id = room_presence.room_id
      and (rooms.black_player = auth.uid() or rooms.white_player = auth.uid())
  )
);

grant select on public.room_presence to authenticated;
grant execute on function public.touch_room_presence(text) to authenticated;
grant execute on function public.claim_forfeit_win(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.room_presence;
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;
