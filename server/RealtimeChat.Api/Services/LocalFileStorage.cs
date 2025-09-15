using Microsoft.AspNetCore.StaticFiles;

namespace RealtimeChat.Api.Services;

public class LocalFileStorage(IWebHostEnvironment env) : IFileStorage
{
    private string Root
    {
        get
        {
            var webroot = env.WebRootPath;
            if (string.IsNullOrWhiteSpace(webroot))
            {
                webroot = Path.Combine(env.ContentRootPath, "wwwroot");
                Directory.CreateDirectory(webroot);
            }
            var uploads = Path.Combine(webroot, "uploads");
            return uploads;
        }
    }

    public async Task<string> SaveAsync(Stream stream, string fileName, string contentType, CancellationToken ct = default)
    {
        Directory.CreateDirectory(Root);
        var safeName = Path.GetFileName(fileName);
        var id = Guid.NewGuid().ToString("N");
        var ext = Path.GetExtension(safeName);
        var storedName = id + ext;
        var path = Path.Combine(Root, storedName);
        await using var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.None);
        await stream.CopyToAsync(fs, ct);
        var url = $"/uploads/{storedName}";
        return url;
    }

    public Task<bool> DeleteAsync(string url, CancellationToken ct = default)
    {
        try
        {
            var file = url.Replace("/uploads/", string.Empty);
            var path = Path.Combine(Root, file);
            if (File.Exists(path)) File.Delete(path);
            return Task.FromResult(true);
        }
        catch
        {
            return Task.FromResult(false);
        }
    }
}
