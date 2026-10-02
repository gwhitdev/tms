namespace Tms.Foundation.Infrastructure;

public sealed class StorageReadiness(HttpClient client, Uri readinessUri) : IStorageReadiness {
    public async Task<bool> CheckAsync(CancellationToken cancellationToken) {
        using var response = await client.GetAsync(readinessUri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        return response.IsSuccessStatusCode;
    }
}
