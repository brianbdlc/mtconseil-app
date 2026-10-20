-- Durcissement sécurité (advisors) : search_path figé + retrait de l'exposition RPC
-- des fonctions trigger. Les triggers continuent de tourner (l'exécution d'un trigger
-- ne requiert pas le privilège EXECUTE).

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke execute on function public.handle_new_user()  from public, anon, authenticated;
revoke execute on function public.log_change()       from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
