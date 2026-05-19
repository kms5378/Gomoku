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

drop policy if exists "room players can read their rooms" on public.rooms;
create policy "room players can read their rooms"
on public.rooms for select
to authenticated
using (status = 'waiting' or black_player = auth.uid() or white_player = auth.uid());

grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.choose_side(text, public.stone_color) to authenticated;

notify pgrst, 'reload schema';
