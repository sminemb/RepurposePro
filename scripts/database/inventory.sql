-- Run in a repeatable-read snapshot. Only metadata and data digests leave PostgreSQL.
SELECT json_build_object(
  'major_version', current_setting('server_version_num')::int / 10000,
  'database_configuration', (SELECT json_build_object('encoding',pg_encoding_to_char(encoding),
    'collation',datcollate,'ctype',datctype,'provider',datlocprovider) FROM pg_database WHERE datname=current_database()),
  'other_schemas', (SELECT coalesce(json_agg(nspname ORDER BY nspname),'[]') FROM pg_namespace
    WHERE nspname NOT IN ('public','drizzle','information_schema','neon') AND nspname NOT LIKE 'pg\_%'),
  'extensions', (SELECT coalesce(json_agg(x ORDER BY x::text), '[]') FROM
    (SELECT extname, extversion FROM pg_extension WHERE extname <> 'plpgsql') x),
  'tables', (SELECT coalesce(json_agg(x ORDER BY x::text), '[]') FROM
    (SELECT n.nspname AS schema, c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p')) x),
  'objects', (SELECT coalesce(json_agg(x ORDER BY x::text), '[]') FROM (
    SELECT 'relation' AS kind, n.nspname AS schema, c.relname AS name,
      r.rolname AS owner, md5(json_build_array(c.relkind, c.relrowsecurity, c.relforcerowsecurity,
        (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(coalesce(c.relacl,acldefault((CASE WHEN c.relkind='S' THEN 'S' ELSE 'r' END)::"char",c.relowner))) a))::text) AS digest
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner
      WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p','v','m','S')
    UNION ALL
    SELECT 'column', n.nspname, c.relname||'.'||a.attname, r.rolname,
      md5(json_build_array(format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
        pg_get_expr(d.adbin,d.adrelid),(SELECT array_agg(acl::text ORDER BY acl::text) FROM unnest(a.attacl) acl))::text)
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_roles r ON r.oid=c.relowner LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname IN ('public','drizzle') AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m')
    UNION ALL
    SELECT 'function', n.nspname, p.proname||'('||pg_get_function_identity_arguments(p.oid)||')', r.rolname,
      md5(pg_get_functiondef(p.oid)||coalesce((SELECT array_agg(a::text ORDER BY a::text)::text FROM unnest(coalesce(p.proacl,acldefault('f',p.proowner))) a),''))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
      WHERE n.nspname IN ('public','drizzle') AND p.prokind IN ('f','p')
    UNION ALL
    SELECT 'constraint', n.nspname, c.conrelid::regclass::text||'.'||c.conname, '', md5(pg_get_constraintdef(c.oid,true))
      FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('public','drizzle')
    UNION ALL
    SELECT 'index', n.nspname, c.relname, '', md5(pg_get_indexdef(c.oid))
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND c.relkind='i'
    UNION ALL
    SELECT 'trigger', n.nspname, c.relname||'.'||t.tgname, '', md5(pg_get_triggerdef(t.oid,true))
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','drizzle') AND NOT t.tgisinternal
    UNION ALL
    SELECT 'policy', n.nspname, c.relname||'.'||p.polname, '',
      md5(json_build_array(p.polcmd,p.polpermissive,
        (SELECT array_agg(r.rolname ORDER BY r.rolname) FROM pg_roles r WHERE r.oid=ANY(p.polroles)),
        pg_get_expr(p.polqual,p.polrelid),pg_get_expr(p.polwithcheck,p.polrelid))::text)
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname IN ('public','drizzle')
    UNION ALL
    SELECT 'schema', n.nspname, n.nspname, r.rolname, md5(coalesce((SELECT array_agg(a::text ORDER BY a::text)::text FROM unnest(coalesce(n.nspacl,acldefault('n',n.nspowner))) a),''))
      FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname IN ('public','drizzle')
    UNION ALL
    SELECT 'enum', n.nspname, t.typname, r.rolname,
      md5(json_build_array((SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),(SELECT array_agg(a::text ORDER BY a::text) FROM unnest(coalesce(t.typacl,acldefault('T',t.typowner))) a))::text)
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_roles r ON r.oid=t.typowner
      WHERE n.nspname IN ('public','drizzle') AND t.typtype='e'
    UNION ALL
    SELECT 'default_acl', coalesce(n.nspname,''), d.defaclobjtype::text, r.rolname, md5((SELECT array_agg(a::text ORDER BY a::text)::text FROM unnest(d.defaclacl) a))
      FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
      WHERE r.rolname='repurposepro_owner'
  ) x),
  'schema_permissions', (SELECT coalesce(json_agg(x ORDER BY x::text),'[]') FROM (
    SELECT n.nspname AS schema, (SELECT coalesce(json_agg(g ORDER BY g::text),'[]') FROM (
      SELECT coalesce(r.rolname,'PUBLIC') AS grantee,a.privilege_type,a.is_grantable
      FROM aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a LEFT JOIN pg_roles r ON r.oid=a.grantee
    ) g) AS grants FROM pg_namespace n WHERE n.nspname IN ('public','drizzle')
  ) x),
  'default_permissions', (SELECT coalesce(json_agg(x ORDER BY x::text),'[]') FROM (
    SELECT coalesce(n.nspname,'') AS schema,d.defaclobjtype AS kind,
      (SELECT coalesce(json_agg(g ORDER BY g::text),'[]') FROM (
        SELECT coalesce(r.rolname,'PUBLIC') AS grantee,a.privilege_type,a.is_grantable
        FROM aclexplode(d.defaclacl) a LEFT JOIN pg_roles r ON r.oid=a.grantee
      ) g) AS grants
      FROM pg_default_acl d JOIN pg_roles owner ON owner.oid=d.defaclrole LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
      WHERE owner.rolname='repurposepro_owner'
  ) x),
  'sequences', (SELECT coalesce(json_agg(x ORDER BY x::text), '[]') FROM
    (SELECT schemaname, sequencename FROM pg_sequences WHERE schemaname IN ('public','drizzle')) x),
  'roles', (SELECT coalesce(json_agg(x ORDER BY x::text), '[]') FROM
    (SELECT rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls, rolconfig
      FROM pg_roles WHERE rolname IN ('repurposepro_owner','repurposepro_runtime','repurposepro_checkout',
      'repurposepro_webhook','repurposepro_processing','repurposepro_admin')) x),
  'memberships', (SELECT coalesce(json_agg(x ORDER BY x::text), '[]') FROM
    (SELECT parent.rolname AS parent, member.rolname AS member, m.admin_option, m.inherit_option, m.set_option
      FROM pg_auth_members m JOIN pg_roles parent ON parent.oid=m.roleid JOIN pg_roles member ON member.oid=m.member
      WHERE member.rolname IN ('repurposepro_owner','repurposepro_runtime','repurposepro_checkout',
      'repurposepro_webhook','repurposepro_processing','repurposepro_admin')) x),
  'unexpected_grantees', (SELECT coalesce(json_agg(DISTINCT r.rolname), '[]') FROM (
    SELECT (aclexplode(c.relacl)).grantee AS grantee FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle')
    UNION ALL SELECT (aclexplode(p.proacl)).grantee FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','drizzle')
    UNION ALL SELECT (aclexplode(nspacl)).grantee FROM pg_namespace WHERE nspname IN ('public','drizzle')
    UNION ALL SELECT (aclexplode(a.attacl)).grantee FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle')
    UNION ALL SELECT (aclexplode(d.defaclacl)).grantee FROM pg_default_acl d JOIN pg_roles r ON r.oid=d.defaclrole WHERE r.rolname='repurposepro_owner'
  ) a JOIN pg_roles r ON r.oid=a.grantee WHERE r.rolname NOT IN ('repurposepro_owner','repurposepro_runtime',
    'repurposepro_checkout','repurposepro_webhook','repurposepro_processing','repurposepro_admin'))
);
