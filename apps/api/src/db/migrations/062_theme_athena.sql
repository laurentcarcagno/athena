-- 062 : le thème « hemeria » devient « athena » et « hemeria-arrondi » « athena-arrondi ». Les valeurs déjà enregistrées suivent :
-- thème par défaut et thèmes proposés de l'organisation, famille choisie par chaque compte, images de marque par thème.
-- (Les clés du stockage d'objets des images ne changent pas : elles sont lues dans storage_key.)
alter table organization_appearance alter column default_theme set default 'athena';
update organization_appearance set default_theme = case default_theme when 'hemeria' then 'athena' when 'hemeria-arrondi' then 'athena-arrondi' else default_theme end
  where default_theme in ('hemeria', 'hemeria-arrondi');
update organization_appearance set allowed_themes = array(
    select case t when 'hemeria' then 'athena' when 'hemeria-arrondi' then 'athena-arrondi' else t end from unnest(allowed_themes) as t)
  where allowed_themes && array['hemeria', 'hemeria-arrondi'];
update user_preference set theme_family = case theme_family when 'hemeria' then 'athena' else 'athena-arrondi' end
  where theme_family in ('hemeria', 'hemeria-arrondi');
update organization_brand set theme = case theme when 'hemeria' then 'athena' else 'athena-arrondi' end
  where theme in ('hemeria', 'hemeria-arrondi');
