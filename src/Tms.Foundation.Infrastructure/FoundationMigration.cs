using System.Security.Cryptography;
using System.Text;
using Npgsql;

namespace Tms.Foundation.Infrastructure;

// Foundation-only migration. Bootstrap creates this schema and scoped roles.
// This mode never creates roles/databases or tenant/business tables.
public static class FoundationMigration {
    public const int Version = 1;
    private const string MigrationSql = """
        CREATE TABLE foundation.worker_heartbeats (
            component text PRIMARY KEY CHECK (component = 'foundation-worker'),
            observed_at_utc timestamptz NOT NULL
        );
        CREATE TABLE foundation.retention_markers (
            marker_id uuid PRIMARY KEY,
            value text NOT NULL CHECK (value = 'm02-foundation-retention-v1'),
            created_at_utc timestamptz NOT NULL DEFAULT now()
        );
        REVOKE ALL ON ALL TABLES IN SCHEMA foundation FROM PUBLIC;
        GRANT USAGE ON SCHEMA foundation TO tms_api, tms_worker;
        GRANT SELECT ON foundation.schema_migrations TO tms_api, tms_worker;
        GRANT SELECT, INSERT, UPDATE ON foundation.worker_heartbeats TO tms_worker;
        GRANT SELECT, INSERT ON foundation.retention_markers TO tms_worker;
        """;
    public static string Checksum { get; } = Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(MigrationSql)));
    public static async Task ApplyAsync(NpgsqlDataSource dataSource, CancellationToken cancellationToken) {
        await using var connection = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var transaction = await connection.BeginTransactionAsync(cancellationToken);
        await using (var identity = new NpgsqlCommand("""
            SELECT current_user = 'tms_migrator' AND NOT rolsuper AND NOT rolbypassrls
                AND NOT rolcreaterole AND NOT rolcreatedb
                AND (SELECT pg_get_userbyid(nspowner) = current_user FROM pg_namespace WHERE nspname = 'foundation')
            FROM pg_roles WHERE rolname = current_user
            """, connection, transaction)) {
            if (await identity.ExecuteScalarAsync(cancellationToken) is not true)
                throw new InvalidOperationException("Migration identity is not the scoped foundation owner.");
        }
        await using (var initialise = new NpgsqlCommand("""
            SELECT pg_advisory_xact_lock(70201001);
            CREATE TABLE IF NOT EXISTS foundation.schema_migrations (
                version integer PRIMARY KEY,
                checksum text NOT NULL,
                applied_at_utc timestamptz NOT NULL DEFAULT now()
            );
            REVOKE ALL ON foundation.schema_migrations FROM PUBLIC;
            """, connection, transaction)) await initialise.ExecuteNonQueryAsync(cancellationToken);
        await using (var existing = new NpgsqlCommand("SELECT version, checksum FROM foundation.schema_migrations ORDER BY version", connection, transaction)) {
            await using var reader = await existing.ExecuteReaderAsync(cancellationToken);
            if (await reader.ReadAsync(cancellationToken)) {
                if (reader.GetInt32(0) != Version || reader.GetString(1) != Checksum || await reader.ReadAsync(cancellationToken))
                    throw new InvalidOperationException("Foundation migration history is incompatible.");
                await reader.DisposeAsync();
                await transaction.CommitAsync(cancellationToken);
                return;
            }
        }
        await using (var migration = new NpgsqlCommand(MigrationSql, connection, transaction)) await migration.ExecuteNonQueryAsync(cancellationToken);
        await using (var record = new NpgsqlCommand("INSERT INTO foundation.schema_migrations(version, checksum) VALUES ($1, $2)", connection, transaction)) {
            record.Parameters.AddWithValue(Version);
            record.Parameters.AddWithValue(Checksum);
            await record.ExecuteNonQueryAsync(cancellationToken);
        }
        await transaction.CommitAsync(cancellationToken);
    }
}
