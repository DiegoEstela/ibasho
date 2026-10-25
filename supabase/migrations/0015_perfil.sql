-- Ibasho · 0015 · Editar tu perfil (nombre y color), aunque tu cuenta no tuviera uno
-- Se puede ejecutar más de una vez sin errores.

-- Crea o actualiza TU perfil y lo refleja en los gastos donde apareces como participante
-- (el nombre se copia ahí al crearlos, así que si no se actualiza, seguirías saliendo como «Alguien»).
create or replace function public.set_my_profile(p_name text, p_color text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  clean text := btrim(coalesce(p_name, ''));
begin
  if uid is null then
    raise exception 'No autenticado';
  end if;
  if char_length(clean) not between 1 and 40 then
    raise exception 'El nombre debe tener entre 1 y 40 caracteres';
  end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Color no válido';
  end if;

  insert into public.profiles (id, display_name, color)
  values (uid, clean, p_color)
  on conflict (id) do update
    set display_name = excluded.display_name, color = excluded.color, updated_at = now();

  update public.expense_participants set name = clean, color = p_color where user_id = uid;
end;
$$;

revoke all on function public.set_my_profile(text, text) from public, anon;
grant execute on function public.set_my_profile(text, text) to authenticated;

notify pgrst, 'reload schema';
