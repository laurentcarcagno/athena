import { migrate } from './db/migrate';

/**
 * Applique les migrations de base de données. S'exécute avec un compte propriétaire (MIGRATION_DATABASE_URL),
 * distinct du compte applicatif (RLS appliquée) : l'application ne peut jamais modifier le schéma.
 * Utilisé comme job de pré-installation/mise à jour (Helm hook) ou à la main.
 */
async function main(): Promise<void> {
  const url = process.env['MIGRATION_DATABASE_URL'];
  if (!url) throw new Error('MIGRATION_DATABASE_URL est obligatoire');
  const result = await migrate(url);
  console.log(`migrations : ${result.applied.length} appliquée(s), ${result.skipped.length} déjà en place`);
  for (const name of result.applied) console.log(`  + ${name}`);
}

main().catch((error: Error) => {
  console.error(`échec des migrations : ${error.message}`);
  process.exit(1);
});
