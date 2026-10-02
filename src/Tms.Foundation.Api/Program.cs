using Tms.Foundation.Infrastructure;

var migrationMode = args.Contains("--migrate", StringComparer.Ordinal);
var verificationMode = args.Contains("--verify", StringComparer.Ordinal);
if (migrationMode && verificationMode) { Console.Error.WriteLine("Select one foundation operation."); return 2; }
FoundationSettings settings;
try { settings = FoundationSettings.Load(migrationMode ? FoundationRole.Migrator : FoundationRole.Api, Environment.GetEnvironmentVariable, File.ReadAllText); }
catch (Exception) { Console.Error.WriteLine("Foundation configuration is unavailable."); return 1; }
await using var dataSource = settings.CreateDataSource();
if (migrationMode) {
    try { await FoundationMigration.ApplyAsync(dataSource, default); Console.WriteLine("Foundation migration applied."); return 0; }
    catch (Exception) { Console.Error.WriteLine("Foundation migration failed."); return 1; }
}
using var http = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false }) { Timeout = TimeSpan.FromSeconds(4) };
var database = new PostgresFoundationDatabase(dataSource, settings.DatabaseRole);
var readiness = new FoundationReadiness(database, new StorageReadiness(http, settings.StorageReadinessUri));
if (verificationMode) {
    var result = await CheckReadyAsync(default);
    Console.WriteLine(result.Ready ? "Foundation ready." : "Foundation not ready.");
    return result.Ready ? 0 : 1;
}
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls("http://0.0.0.0:8080");
var app = builder.Build();
app.UseExceptionHandler(handler => handler.Run(async context => {
    context.Response.StatusCode = 503;
    context.Response.Headers.CacheControl = "no-store";
    await context.Response.WriteAsJsonAsync(new { status = "unavailable" });
}));
app.MapGet("/health/live", (HttpContext context) => {
    context.Response.Headers.CacheControl = "no-store";
    return Results.Json(new { status = "live" });
});
app.MapGet("/health/ready", async (HttpContext context) => {
    context.Response.Headers.CacheControl = "no-store";
    var result = await CheckReadyAsync(context.RequestAborted);
    return Results.Json(new { status = result.Status }, statusCode: result.Ready ? 200 : 503);
});
app.MapGet("/api/foundation", async (HttpContext context) => {
    context.Response.Headers.CacheControl = "no-store";
    var result = await CheckReadyAsync(context.RequestAborted);
    return Results.Json(FoundationSummary.Create(result), statusCode: result.Ready ? 200 : 503);
});
await app.RunAsync();
return 0;

async Task<ReadinessOutcome> CheckReadyAsync(CancellationToken requestCancellation) {
    using var timeout = CancellationTokenSource.CreateLinkedTokenSource(requestCancellation);
    timeout.CancelAfter(TimeSpan.FromSeconds(8));
    try { return await readiness.CheckAsync(timeout.Token); }
    catch (OperationCanceledException) when (!requestCancellation.IsCancellationRequested) { return new(false); }
}

