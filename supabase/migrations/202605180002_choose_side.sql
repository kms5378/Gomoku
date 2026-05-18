alter table public.rooms
alter column black_player drop not null;

create or replace function public.create_room(p_nickname text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_room public.rooms;
  v_code text;
  v_attempts integer := 0;
begin
  v_profile := public.ensure_profile(p_nickname);

  loop
    v_attempts := v_attempts + 1;
    v_code := public.generate_room_code();

    begin
      insert into public.rooms (code)
      values (v_code)
      returning * into v_room;

      return v_room;
    exception
      when unique_violation then
        if v_attempts >= 20 then
          raise exception 'Could not generate a unique room code.';
        end if;
    end;
  end loop;
end;
$$;

create or replace function public.join_room(p_code text, p_nickname text)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_room public.rooms;
  v_code text := upper(trim(p_code));
begin
  v_profile := public.ensure_profile(p_nickname);

  select *
  into v_room
  from public.rooms
  where code = v_code
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.black_player = v_profile.id or v_room.white_player = v_profile.id then
    return v_room;
  end if;

  if v_room.black_player is not null and v_room.white_player is not null then
    raise exception 'Room is full.';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Room is not joinable.';
  end if;

  return v_room;
end;
$$;

create or replace function public.choose_side(p_code text, p_side public.stone_color)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
begin
  if v_user is null then
    raise exception 'Authentication is required.';
  end if;

  if p_side is null then
    raise exception 'Side is required.';
  end if;

  select *
  into v_room
  from public.rooms
  where code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'Room not found.';
  end if;

  if v_room.status <> 'waiting' then
    raise exception 'Side can only be selected before the game starts.';
  end if;

  if p_side = 'black' then
    if v_room.black_player is not null and v_room.black_player <> v_user then
      raise exception 'Black side is already taken.';
    end if;

    update public.rooms
    set black_player = v_user,
        white_player = case when white_player = v_user then null else white_player end,
        restart_black = false,
        restart_white = false
    where id = v_room.id
    returning * into v_room;
  else
    if v_room.white_player is not null and v_room.white_player <> v_user then
      raise exception 'White side is already taken.';
    end if;

    update public.rooms
    set white_player = v_user,
        black_player = case when black_player = v_user then null else black_player end,
        restart_black = false,
        restart_white = false
    where id = v_room.id
    returning * into v_room;
  end if;

  update public.rooms
  set status = case
        when black_player is null or white_player is null then 'waiting'::public.room_status
        else 'playing'::public.room_status
      end,
      current_turn = 'black',
      restart_black = false,
      restart_white = false
  where id = v_room.id
  returning * into v_room;

  return v_room;
end;
$$;

create or replace function public.submit_move(p_code text, p_row integer, p_col integer)
returns public.rooms
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room public.rooms;
  v_color public.stone_color;
  v_next_turn public.stone_color;
  v_move_number integer;
  v_opponent uuid;
  v_forbidden_reason text;
begin
  if v_user is null then
    raise exception 'Authentication is required.';
  end if;

  if p_row not between 0 and 14 or p_col not between 0 and 14 then
    raise exception 'Move is outside the board.';
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

  if v_room.black_player is null or v_room.white_player is null then
    raise exception 'Waiting for both players.';
  end if;

  if v_room.black_player = v_user then
    v_color := 'black';
    v_next_turn := 'white';
    v_opponent := v_room.white_player;
  elsif v_room.white_player = v_user then
    v_color := 'white';
    v_next_turn := 'black';
    v_opponent := v_room.black_player;
  else
    raise exception 'Only room players can move.';
  end if;

  if v_room.current_turn <> v_color then
    raise exception 'It is not your turn.';
  end if;

  if exists (
    select 1
    from public.moves
    where room_id = v_room.id
      and game_index = v_room.game_index
      and row = p_row
      and col = p_col
  ) then
    raise exception 'Cell is already occupied.';
  end if;

  select coalesce(max(move_number), 0) + 1
  into v_move_number
  from public.moves
  where room_id = v_room.id
    and game_index = v_room.game_index;

  insert into public.moves (room_id, game_index, player_id, color, row, col, move_number)
  values (v_room.id, v_room.game_index, v_user, v_color, p_row, p_col, v_move_number);

  if v_color = 'black' then
    v_forbidden_reason := public.black_forbidden_reason(v_room.id, v_room.game_index, p_row, p_col);

    if v_forbidden_reason is not null then
      raise exception '%', v_forbidden_reason;
    end if;
  end if;

  if public.has_five_or_more(v_room.id, v_room.game_index, v_color, p_row, p_col) then
    update public.rooms
    set status = 'finished',
        winner = v_color,
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
      case when v_color = 'black' then 'black_win' else 'white_win' end
    )
    on conflict (room_id, game_index) do nothing;

    update public.profiles
    set rating = rating + 3,
        wins = wins + 1
    where id = v_user;

    update public.profiles
    set losses = losses + 1
    where id = v_opponent;

    return v_room;
  end if;

  if v_move_number >= 225 then
    update public.rooms
    set status = 'finished',
        winner = null,
        winning_player = null,
        finished_at = now(),
        restart_black = false,
        restart_white = false
    where id = v_room.id
    returning * into v_room;

    insert into public.game_results (room_id, game_index, black_player, white_player, winner_player, outcome)
    values (v_room.id, v_room.game_index, v_room.black_player, v_room.white_player, null, 'draw')
    on conflict (room_id, game_index) do nothing;

    update public.profiles
    set rating = rating + 1,
        draws = draws + 1
    where id in (v_room.black_player, v_room.white_player);

    return v_room;
  end if;

  update public.rooms
  set current_turn = v_next_turn
  where id = v_room.id
  returning * into v_room;

  return v_room;
end;
$$;

drop policy if exists "room players can read their rooms" on public.rooms;
create policy "room players can read their rooms"
on public.rooms for select
to authenticated
using (status = 'waiting' or black_player = auth.uid() or white_player = auth.uid());

grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.choose_side(text, public.stone_color) to authenticated;
grant execute on function public.submit_move(text, integer, integer) to authenticated;
