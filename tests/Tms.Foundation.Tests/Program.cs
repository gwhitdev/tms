using Tms.Foundation.Infrastructure;
using System.Text.Json;

var tests = new List<(string Id, Action Run)>();
tests.Add(("FND-READY-01", () => Equal("ready", Check(new(true, true), true).Status)));
tests.Add(("FND-READY-02", () => Equal("not_ready", Check(new(false, true), true).Status)));
tests.Add(("FND-READY-03", () => Equal("not_ready", Check(new(true, false), true).Status)));
tests.Add(("FND-READY-04", () => Equal("not_ready", Check(new(true, true), false).Status)));
tests.Add(("FND-READY-05", () => {
    var db = new FakeDatabase { Error = new InvalidOperationException("private-password database-host sql-detail") };
    var outcome = new FoundationReadiness(db, new FakeStorage(true)).CheckAsync(default).GetAwaiter().GetResult();
    Equal("not_ready", outcome.Status);
    True(!outcome.ToString().Contains("private-password", StringComparison.Ordinal));
}));
tests.Add(("FND-READY-06", () => {
    using var cancellation = new CancellationTokenSource();
    cancellation.Cancel();
    Throws<OperationCanceledException>(() => new FoundationReadiness(new FakeDatabase(), new FakeStorage(true)).CheckAsync(cancellation.Token).GetAwaiter().GetResult());
}));
tests.Add(("FND-CONFIG-01", () => {
    foreach (var pair in new[] {
        (FoundationRole.Api, "tms_api", "/run/secrets/api_password"),
        (FoundationRole.Worker, "tms_worker", "/run/secrets/worker_password"),
        (FoundationRole.Migrator, "tms_migrator", "/run/secrets/migrator_password") }) {
        string? requested = null;
        var settings = FoundationSettings.Load(pair.Item1, _ => null, path => { requested = path; return "fixture-secret-do-not-use-in-production"; });
        Equal(pair.Item2, settings.DatabaseRole);
        Equal(pair.Item3, requested);
        Equal(pair.Item3, settings.SecretFile);
    }
}));
tests.Add(("FND-CONFIG-02", () => Throws<InvalidOperationException>(() => FoundationSettings.Load(FoundationRole.Api, _ => null, _ => " \n"))));
tests.Add(("FND-CONFIG-03", () => {
    foreach (var value in new[] { "ftp://storage/file", "http://user:password@storage:9333/cluster/status", "http://external.example/" })
        Throws<InvalidOperationException>(() => FoundationSettings.Load(FoundationRole.Api, name => name == "STORAGE_READINESS_URI" ? value : null, _ => "fixture-secret"));
}));
tests.Add(("FND-CONFIG-04", () => {
    var settings = FoundationSettings.Load(FoundationRole.Api, _ => null, _ => "private-password");
    True(!settings.ToString().Contains("private-password", StringComparison.Ordinal));
}));
tests.Add(("FND-HEARTBEAT-01", () => {
    var db = new FakeDatabase();
    var now = new DateTimeOffset(2026, 10, 2, 12, 0, 0, TimeSpan.Zero);
    new FoundationHeartbeat(db, new FixedClock(now)).RunOnceAsync(default).GetAwaiter().GetResult();
    Equal("foundation-worker", db.Component);
    Equal(now, db.ObservedAtUtc);
    Equal(1, db.Writes);
}));
tests.Add(("FND-HEARTBEAT-02", () => {
    var db = new FakeDatabase { Error = new InvalidOperationException("persistence unavailable") };
    Throws<InvalidOperationException>(() => new FoundationHeartbeat(db, TimeProvider.System).RunOnceAsync(default).GetAwaiter().GetResult());
    Equal(0, db.Writes);
}));
tests.Add(("FND-API-01", () => {
    using var json = JsonDocument.Parse(JsonSerializer.Serialize(FoundationSummary.Create(new(true)), new JsonSerializerOptions(JsonSerializerDefaults.Web)));
    Equal(5, json.RootElement.EnumerateObject().Count());
    Equal("foundation", json.RootElement.GetProperty("stage").GetString());
    Equal("m02-foundation", json.RootElement.GetProperty("release").GetString());
    True(json.RootElement.GetProperty("ready").GetBoolean());
    Equal("not_implemented", json.RootElement.GetProperty("identityAndTenancy").GetString());
    Equal("not_implemented", json.RootElement.GetProperty("businessOperations").GetString());
}));
tests.Add(("FND-API-02", () => {
    var summary = FoundationSummary.Create(new(false));
    Equal("foundation", summary.Stage);
    Equal("m02-foundation", summary.Release);
    True(!summary.Ready);
}));
var passed = 0;
foreach (var test in tests) {
    try { test.Run(); passed++; Console.WriteLine($"PASS {test.Id}"); }
    catch (Exception error) { Console.WriteLine($"FAIL {test.Id} | {error.GetType().Name}: {error.Message}"); }
}
Console.WriteLine($"RESULT passed={passed} failed={tests.Count - passed} total={tests.Count}");
Console.WriteLine("LIMITATION: readiness/configuration/heartbeat policy tests use fakes; PostgreSQL and container proof require M02.FoundationSmoke.");
return passed == tests.Count ? 0 : 1;

static ReadinessOutcome Check(DatabaseReadiness db, bool storage) => new FoundationReadiness(new FakeDatabase { State = db }, new FakeStorage(storage)).CheckAsync(default).GetAwaiter().GetResult();
static void Equal<T>(T expected, T actual) { if (!EqualityComparer<T>.Default.Equals(expected, actual)) throw new Exception($"Expected {expected}; got {actual}"); }
static void True(bool value) { if (!value) throw new Exception("Expected true"); }
static void Throws<T>(Action action) where T : Exception { try { action(); } catch (T) { return; } throw new Exception($"Expected {typeof(T).Name}"); }
sealed class FakeDatabase : IFoundationDatabase {
    public DatabaseReadiness State { get; init; } = new(true, true);
    public Exception? Error { get; init; }
    public string? Component { get; private set; }
    public DateTimeOffset ObservedAtUtc { get; private set; }
    public int Writes { get; private set; }
    public Task<DatabaseReadiness> CheckAsync(CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        if (Error is not null) throw Error;
        return Task.FromResult(State);
    }
    public Task WriteHeartbeatAsync(string component, DateTimeOffset observedAtUtc, CancellationToken cancellationToken) {
        cancellationToken.ThrowIfCancellationRequested();
        if (Error is not null) throw Error;
        Component = component; ObservedAtUtc = observedAtUtc; Writes++;
        return Task.CompletedTask;
    }
}
sealed class FakeStorage(bool ready) : IStorageReadiness {
    public Task<bool> CheckAsync(CancellationToken cancellationToken) { cancellationToken.ThrowIfCancellationRequested(); return Task.FromResult(ready); }
}
sealed class FixedClock(DateTimeOffset now) : TimeProvider { public override DateTimeOffset GetUtcNow() => now; }

