namespace RealtimeChat.Api.Services;

public interface IFileStorage
{
    Task<string> SaveAsync(Stream stream, string fileName, string contentType, CancellationToken ct = default);
    Task<bool> DeleteAsync(string url, CancellationToken ct = default);
}

