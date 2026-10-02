using Npgsql;

namespace Tms.Foundation.Infrastructure;

public sealed class PostgresFoundationDatabase(NpgsqlDataSource dataSource, string expectedRole) : IFoundationDatabase {
    public async Task<DatabaseReadiness> CheckAsync(CancellationToken cancellationToken) =>
        new(await MigrationCurrentAsync(cancellationToken), await RuntimeRestrictedAsync(cancellationToken));

    public async Task<bool> MigrationCurrentAsync(CancellationToken cancellationToken) {
        try {
            await using var command = dataSource.CreateCommand("""
                SELECT count(*) = 1 AND bool_and(version = $1 AND checksum = $2)
                    AND to_regclass('foundation.worker_heartbeats') IS NOT NULL
                    AND to_regclass('foundation.retention_markers') IS NOT NULL
                FROM foundation.schema_migrations
                """);
            command.Parameters.AddWithValue(FoundationMigration.Version);
            command.Parameters.AddWithValue(FoundationMigration.Checksum);
            return await command.ExecuteScalarAsync(cancellationToken) is true;
        } catch (PostgresException error) when (error.SqlState is PostgresErrorCodes.UndefinedTable or PostgresErrorCodes.InvalidSchemaName or PostgresErrorCodes.InsufficientPrivilege) {
            return false;
        }
    }

    public async Task<bool> RuntimeRestrictedAsync(CancellationToken cancellationToken) {
        if (expectedRole is not ("tms_api" or "tms_worker")) return false;
        await using var command = dataSource.CreateCommand("""
            SELECT current_user = $1 AND NOT rolsuper AND NOT rolbypassrls
                AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolinherit
                AND NOT pg_has_role(current_user, 'tms_migrator', 'MEMBER')
                AND NOT has_database_privilege(current_user, current_database(), 'CREATE')
                AND NOT has_database_privilege(current_user, current_database(), 'TEMP')
                AND NOT has_schema_privilege(current_user, 'foundation', 'CREATE')
                AND NOT has_schema_privilege(current_user, 'public', 'CREATE')
                AND NOT EXISTS (
                    SELECT 1 FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
                    WHERE n.nspname = 'foundation' AND pg_get_userbyid(c.relowner) = current_user)
                AND (SELECT pg_get_userbyid(datdba) <> current_user FROM pg_database WHERE datname = current_database())
            FROM pg_roles WHERE rolname = current_user
            """);
        command.Parameters.AddWithValue(expectedRole);
        return await command.ExecuteScalarAsync(cancellationToken) is true;
    }

    public async Task WriteHeartbeatAsync(string component, DateTimeOffset observedAtUtc, CancellationToken cancellationToken) {
        if (component != "foundation-worker" || observedAtUtc.Offset != TimeSpan.Zero)
            throw new InvalidOperationException("Invalid foundation heartbeat.");
        await using var command = dataSource.CreateCommand("""
            INSERT INTO foundation.worker_heartbeats(component, observed_at_utc) VALUES ($1, $2)
            ON CONFLICT(component) DO UPDATE SET observed_at_utc = EXCLUDED.observed_at_utc
            WHERE foundation.worker_heartbeats.observed_at_utc <= EXCLUDED.observed_at_utc
            """);
        command.Parameters.AddWithValue(component);
        command.Parameters.AddWithValue(observedAtUtc);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<DateTimeOffset?> ReadHeartbeatAsync(CancellationToken cancellationToken) {
        await using var command = dataSource.CreateCommand("SELECT observed_at_utc FROM foundation.worker_heartbeats WHERE component = 'foundation-worker'");
        var value = await command.ExecuteScalarAsync(cancellationToken);
        return value is DateTime time ? new DateTimeOffset(DateTime.SpecifyKind(time, DateTimeKind.Utc)) : null;
    }

    public async Task WriteRetentionMarkerAsync(CancellationToken cancellationToken) {
        await using var command = dataSource.CreateCommand("""
            INSERT INTO foundation.retention_markers(marker_id, value)
            VALUES ('70201001-0000-4000-8000-000000000001', 'm02-foundation-retention-v1')
            ON CONFLICT(marker_id) DO NOTHING
            """);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<bool> RetentionMarkerPresentAsync(CancellationToken cancellationToken) {
        await using var command = dataSource.CreateCommand("""
            SELECT EXISTS(SELECT 1 FROM foundation.retention_markers
                WHERE marker_id = '70201001-0000-4000-8000-000000000001' AND value = 'm02-foundation-retention-v1')
            """);
        return await command.ExecuteScalarAsync(cancellationToken) is true;
    }
}
