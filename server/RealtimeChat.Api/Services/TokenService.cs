using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using RealtimeChat.Api.Models;

namespace RealtimeChat.Api.Services;

public class TokenService(IConfiguration configuration) : ITokenService
{
    public string CreateToken(User user)
    {
        var keyString = configuration["JWT:Key"]
                        ?? configuration["JWT__Key"]
                        ?? "super_dev_secret_change_me_super_dev_secret_change_me"; // >= 32 bytes

        // Ensure key length >= 32 bytes to avoid IDX10720
        var bytes = Encoding.UTF8.GetBytes(keyString);
        if (bytes.Length < 32)
        {
            // Fall back to a deterministic padded key in dev scenarios
            keyString = keyString + "_pad_for_dev_only________________________________________";
        }
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(keyString));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username)
        };

        var issuer = configuration["JWT:Issuer"] ?? configuration["JWT__Issuer"] ?? "RealtimeChat";

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: null,
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
