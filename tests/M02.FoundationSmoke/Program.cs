using Npgsql;
using Tms.Foundation.Infrastructure;

// Real-boundary smoke: parent runs this inside the declared Compose network.
// It never chooses a host/database/user from client input and never prints secrets.
var mode = args.Length == 0 ? "--verify" : args[0];
if (args.Length > 1 || mode is not ("--verify" or "--write-marker" or "--verify-marker")) {
    Console.Error.WriteLine("Use --verify, --write-marker or --verify-marker.");
    return 2;
}
try {
    var settings = FoundationSettings.Load(FoundationRole.Worker, Environment.GetEnvironmentVariable, File.ReadAllText);
    await using var dataSource = settings.CreateDataSource();
    var database = new PostgresFoundationDatabase(dataSource, settings.DatabaseRole);
    var passed = 0;
    await Require("FND-PG-01", await database.MigrationCurrentAsync(default), "Current migration and foundation objects");
    await Require("FND-PG-02", await database.RuntimeRestrictedAsync(default), "Restricted nonowner worker role");
    await Require("FND-PG-03", await IsDenied("CREATE TABLE foundation.forbidden_runtime_probe(id integer)"), "Runtime cannot create schema objects");
    await Require("FND-PG-04", await IsDenied("UPDATE foundation.schema_migrations SET checksum = checksum WHERE false"), "Runtime cannot change migration history");
    await Require("FND-PG-05", await IsDenied("SET ROLE tms_migrator"), "Runtime cannot assume migrator role");
    var heartbeat = await database.ReadHeartbeatAsync(default);
    await Require("FND-PG-06", heartbeat.HasValue && heartbeat.Value <= DateTimeOffset.UtcNow.AddSeconds(5) && heartbeat.Value >= DateTimeOffset.UtcNow.AddSeconds(-30), "Durable current worker heartbeat");
    if (mode == "--write-marker") {
        await database.WriteRetentionMarkerAsync(default);
        await Require("FND-PG-07", await database.RetentionMarkerPresentAsync(default), "Controlled retention marker committed");
    }
    if (mode == "--verify-marker")
        await Require("FND-PG-08", await database.RetentionMarkerPresentAsync(default), "Existing marker retained after recreation");
    Console.WriteLine($"RESULT passed={passed} failed=0");
    Console.WriteLine("LIMITATION: foundation privileges/readiness/persistence only; no tenant isolation, identity or business capabilities.");
    return 0;

    Task Require(string id, bool outcome, string description) {
        if (!outcome) throw new SmokeFailure(id);
        passed++;
        Console.WriteLine($"PASS {id} | {description}");
        return Task.CompletedTask;
    }
    async Task<bool> IsDenied(string sql) {
        await using var connection = await dataSource.OpenConnectionAsync();
        await using var transaction = await connection.BeginTransactionAsync();
        try {
            await using var command = new NpgsqlCommand(sql, connection, transaction);
            await command.ExecuteNonQueryAsync();
            return false;
        } catch (PostgresException error) when (error.SqlState == PostgresErrorCodes.InsufficientPrivilege) { return true; }
        finally { await transaction.RollbackAsync(); }
    }
} catch (SmokeFailure failure) {
    Console.Error.WriteLine($"FAIL {failure.CaseId} | Foundation boundary expectation failed.");
    return 1;
} catch (Exception) {
    Console.Error.WriteLine("FAIL FND-PG-CONNECTION | Foundation boundary unavailable.");
    return 1;
}
sealed class SmokeFailure(string caseId) : Exception { public string CaseId { get; } = caseId; }

