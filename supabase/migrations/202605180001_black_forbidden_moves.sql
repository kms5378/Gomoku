create or replace function public.is_empty_intersection(
  p_room_id uuid,
  p_game_index integer,
  p_row integer,
  p_col integer
)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_row between 0 and 14
    and p_col between 0 and 14
    and not exists (
      select 1
      from public.moves
      where room_id = p_room_id
        and game_index = p_game_index
        and row = p_row
        and col = p_col
    );
$$;

create or replace function public.would_make_five_in_direction(
  p_room_id uuid,
  p_game_index integer,
  p_color public.stone_color,
  p_row integer,
  p_col integer,
  p_row_direction integer,
  p_col_direction integer
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
begin
  if not public.is_empty_intersection(p_room_id, p_game_index, p_row, p_col) then
    return false;
  end if;

  return 1 + public.count_stones_in_direction(p_room_id, p_game_index, p_color, p_row, p_col, p_row_direction, p_col_direction)
           + public.count_stones_in_direction(p_room_id, p_game_index, p_color, p_row, p_col, -p_row_direction, -p_col_direction) >= 5;
end;
$$;

create or replace function public.would_make_open_four_in_direction(
  p_room_id uuid,
  p_game_index integer,
  p_color public.stone_color,
  p_row integer,
  p_col integer,
  p_row_direction integer,
  p_col_direction integer
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_forward integer;
  v_backward integer;
  v_before_row integer;
  v_before_col integer;
  v_after_row integer;
  v_after_col integer;
begin
  if p_color <> 'black' then
    return false;
  end if;

  if not public.is_empty_intersection(p_room_id, p_game_index, p_row, p_col) then
    return false;
  end if;

  v_forward := public.count_stones_in_direction(p_room_id, p_game_index, p_color, p_row, p_col, p_row_direction, p_col_direction);
  v_backward := public.count_stones_in_direction(p_room_id, p_game_index, p_color, p_row, p_col, -p_row_direction, -p_col_direction);

  if 1 + v_forward + v_backward <> 4 then
    return false;
  end if;

  v_before_row := p_row - p_row_direction * (v_backward + 1);
  v_before_col := p_col - p_col_direction * (v_backward + 1);
  v_after_row := p_row + p_row_direction * (v_forward + 1);
  v_after_col := p_col + p_col_direction * (v_forward + 1);

  return public.is_empty_intersection(p_room_id, p_game_index, v_before_row, v_before_col)
     and public.is_empty_intersection(p_room_id, p_game_index, v_after_row, v_after_col);
end;
$$;

create or replace function public.direction_has_four_threat(
  p_room_id uuid,
  p_game_index integer,
  p_anchor_row integer,
  p_anchor_col integer,
  p_row_direction integer,
  p_col_direction integer
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_offset integer;
  v_row integer;
  v_col integer;
begin
  for v_offset in -4..4 loop
    v_row := p_anchor_row + p_row_direction * v_offset;
    v_col := p_anchor_col + p_col_direction * v_offset;

    if public.would_make_five_in_direction(p_room_id, p_game_index, 'black', v_row, v_col, p_row_direction, p_col_direction) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.direction_has_open_three_threat(
  p_room_id uuid,
  p_game_index integer,
  p_anchor_row integer,
  p_anchor_col integer,
  p_row_direction integer,
  p_col_direction integer
)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_offset integer;
  v_row integer;
  v_col integer;
begin
  for v_offset in -4..4 loop
    v_row := p_anchor_row + p_row_direction * v_offset;
    v_col := p_anchor_col + p_col_direction * v_offset;

    if public.would_make_open_four_in_direction(p_room_id, p_game_index, 'black', v_row, v_col, p_row_direction, p_col_direction) then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.black_forbidden_reason(
  p_room_id uuid,
  p_game_index integer,
  p_row integer,
  p_col integer
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_four_count integer := 0;
  v_three_count integer := 0;
begin
  if public.has_five_or_more(p_room_id, p_game_index, 'black', p_row, p_col) then
    return null;
  end if;

  v_four_count :=
    case when public.direction_has_four_threat(p_room_id, p_game_index, p_row, p_col, 0, 1) then 1 else 0 end +
    case when public.direction_has_four_threat(p_room_id, p_game_index, p_row, p_col, 1, 0) then 1 else 0 end +
    case when public.direction_has_four_threat(p_room_id, p_game_index, p_row, p_col, 1, 1) then 1 else 0 end +
    case when public.direction_has_four_threat(p_room_id, p_game_index, p_row, p_col, 1, -1) then 1 else 0 end;

  if v_four_count >= 2 then
    return 'Black double-four is forbidden.';
  end if;

  v_three_count :=
    case when public.direction_has_open_three_threat(p_room_id, p_game_index, p_row, p_col, 0, 1) then 1 else 0 end +
    case when public.direction_has_open_three_threat(p_room_id, p_game_index, p_row, p_col, 1, 0) then 1 else 0 end +
    case when public.direction_has_open_three_threat(p_room_id, p_game_index, p_row, p_col, 1, 1) then 1 else 0 end +
    case when public.direction_has_open_three_threat(p_room_id, p_game_index, p_row, p_col, 1, -1) then 1 else 0 end;

  if v_three_count >= 2 then
    return 'Black double-three is forbidden.';
  end if;

  return null;
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

  if v_room.white_player is null then
    raise exception 'Waiting for another player.';
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

grant execute on function public.submit_move(text, integer, integer) to authenticated;
