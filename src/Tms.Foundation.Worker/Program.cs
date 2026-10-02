using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.DependencyInjection;
using Tms.Foundation.Infrastructure;

FoundationSettings settings;
try { settings = FoundationSettings.Load(FoundationRole.Worker, Environment.GetEnvironmentVariable, File.ReadAllText); }
catch (Exception) { Console.Error.WriteLine("Foundation worker configuration is unavailable."); return 1; }
await using var dataSource = settings.CreateDataSource();
var database = new PostgresFoundationDatabase(dataSource, settings.DatabaseRole);
if (args.Contains("--verify", StringComparer.Ordinal)) {
    try {
        var state = await database.CheckAsync(default);
        var last = await database.ReadHeartbeatAsync(default);
        var ready = state.MigrationCurrent && state.RuntimeRestricted && last.HasValue &&
            last.Value <= DateTimeOffset.UtcNow.AddSeconds(5) && last.Value >= DateTimeOffset.UtcNow.AddSeconds(-30);
        Console.WriteLine(ready ? "Foundation worker ready." : "Foundation worker not ready.");
        return ready ? 0 : 1;
    } catch (Exception) { Console.Error.WriteLine("Foundation worker not ready."); return 1; }
}
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddSingleton(database);
builder.Services.AddSingleton<IFoundationDatabase>(database);
builder.Services.AddSingleton(new FoundationHeartbeat(database, TimeProvider.System));
builder.Services.AddHostedService<HeartbeatService>();
using var host = builder.Build();
await host.RunAsync();
return 0;

sealed class HeartbeatService(IFoundationDatabase database, FoundationHeartbeat heartbeat, ILogger<HeartbeatService> logger) : BackgroundService {
    protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
        using var tick = new PeriodicTimer(TimeSpan.FromSeconds(5));
        do {
            try {
                var status = await database.CheckAsync(stoppingToken);
                if (!status.MigrationCurrent || !status.RuntimeRestricted) logger.LogWarning("Foundation worker dependencies unavailable.");
                else await heartbeat.RunOnceAsync(stoppingToken);
            } catch (Exception) when (!stoppingToken.IsCancellationRequested) {
                logger.LogWarning("Foundation heartbeat persistence unavailable.");
            }
        } while (await tick.WaitForNextTickAsync(stoppingToken));
    }
}

