using Npgsql;

namespace Tms.Foundation.Infrastructure;

public enum FoundationRole { Api, Worker, Migrator }
public sealed class FoundationSettings {
    private readonly string password;
    public string DatabaseRole { get; }
    public string SecretFile { get; }
    public Uri StorageReadinessUri { get; }
    private FoundationSettings(string databaseRole, string secretFile, string password, Uri storageReadinessUri) {
        DatabaseRole = databaseRole; SecretFile = secretFile; this.password = password; StorageReadinessUri = storageReadinessUri;
    }
    public static FoundationSettings Load(FoundationRole role, Func<string, string?> environment, Func<string, string> readFile) {
        var (databaseRole, secretFile) = role switch {
            FoundationRole.Api => ("tms_api", "/run/secrets/api_password"),
            FoundationRole.Worker => ("tms_worker", "/run/secrets/worker_password"),
            FoundationRole.Migrator => ("tms_migrator", "/run/secrets/migrator_password"),
            _ => throw new InvalidOperationException("Invalid foundation role.")
        };
        var password = readFile(secretFile).TrimEnd('\r', '\n');
        if (string.IsNullOrWhiteSpace(password)) throw new InvalidOperationException("Required foundation secret is unavailable.");
        var uriText = environment("STORAGE_READINESS_URI") ?? "http://storage:9333/cluster/status";
        if (!Uri.TryCreate(uriText, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
            uri.Host != "storage" || uri.UserInfo.Length > 0 || uri.Query.Length > 0 || uri.Fragment.Length > 0)
            throw new InvalidOperationException("Invalid internal storage readiness URI.");
        return new FoundationSettings(databaseRole, secretFile, password, uri);
    }
    public NpgsqlDataSource CreateDataSource() => NpgsqlDataSource.Create(new NpgsqlConnectionStringBuilder {
        Host = "database", Database = "tms", Username = DatabaseRole, Password = password,
        Timeout = 5, CommandTimeout = 5, IncludeErrorDetail = false, ApplicationName = "tms-foundation"
    }.ConnectionString);
    public override string ToString() => $"FoundationSettings(Role={DatabaseRole}, Credentials=redacted)";
}
public sealed record DatabaseReadiness(bool MigrationCurrent, bool RuntimeRestricted);
public interface IFoundationDatabase {
    Task<DatabaseReadiness> CheckAsync(CancellationToken cancellationToken);
    Task WriteHeartbeatAsync(string component, DateTimeOffset observedAtUtc, CancellationToken cancellationToken);
}
public interface IStorageReadiness { Task<bool> CheckAsync(CancellationToken cancellationToken); }
public sealed record ReadinessOutcome(bool Ready) { public string Status => Ready ? "ready" : "not_ready"; }
public sealed record FoundationSummary(string Stage, string Release, bool Ready, string IdentityAndTenancy, string BusinessOperations) {
    public static FoundationSummary Create(ReadinessOutcome outcome) => new("foundation", "m02-foundation", outcome.Ready, "not_implemented", "not_implemented");
}
public sealed class FoundationReadiness(IFoundationDatabase database, IStorageReadiness storage) {
    public async Task<ReadinessOutcome> CheckAsync(CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        try {
            var db = database.CheckAsync(cancellationToken);
            var objectStorage = storage.CheckAsync(cancellationToken);
            await Task.WhenAll(db, objectStorage);
            var state = await db;
            return new(state.MigrationCurrent && state.RuntimeRestricted && await objectStorage);
        } catch (Exception) when (!cancellationToken.IsCancellationRequested) {
            return new(false);
        }
    }
}
public sealed class FoundationHeartbeat(IFoundationDatabase database, TimeProvider clock) {
    public Task RunOnceAsync(CancellationToken cancellationToken) => database.WriteHeartbeatAsync("foundation-worker", clock.GetUtcNow(), cancellationToken);
}
