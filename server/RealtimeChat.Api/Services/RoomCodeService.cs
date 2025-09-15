using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace RealtimeChat.Api.Services;

public class RoomCodeService(IConfiguration configuration) : IRoomCodeService
{
    private readonly string _secret = configuration["ROOM:Secret"] ?? configuration["JWT:Key"] ?? "dev_room_secret_please_change";

    public string Generate(Guid conversationId)
    {
        var data = Encoding.UTF8.GetBytes(conversationId.ToString("N") + ":" + _secret);
        using var sha = SHA256.Create();
        var hash = sha.ComputeHash(data);
        // Base32 without padding, 8 chars
        var b32 = ToBase32(hash).TrimEnd('=');
        return b32[..8].ToLowerInvariant();
    }

    public bool Validate(Guid conversationId, string? code)
        => !string.IsNullOrWhiteSpace(code) && string.Equals(code.Trim(), Generate(conversationId), StringComparison.OrdinalIgnoreCase);

    private static string ToBase32(byte[] bytes)
    {
        const string alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        var output = new StringBuilder();
        int bits = 0;
        int value = 0;
        foreach (var b in bytes)
        {
            value = (value << 8) | b;
            bits += 8;
            while (bits >= 5)
            {
                output.Append(alphabet[(value >> (bits - 5)) & 31]);
                bits -= 5;
            }
        }
        if (bits > 0)
        {
            output.Append(alphabet[(value << (5 - bits)) & 31]);
        }
        return output.ToString();
    }
}

