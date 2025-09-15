using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RealtimeChat.Api.Data;
using RealtimeChat.Api.Models;
using RealtimeChat.Api.Services;
using Npgsql;

namespace RealtimeChat.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(AppDbContext db, ITokenService tokens) : ControllerBase
{
    public record RegisterDto(string Username, string Password, string? DisplayName);
    public record LoginDto(string Username, string Password);

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.Username) || string.IsNullOrWhiteSpace(dto.Password))
            return BadRequest(new { message = "Username and password are required" });
        if (await db.Users.AnyAsync(u => u.Username == dto.Username))
            return BadRequest(new { message = "Username already exists" });
        var user = new User
        {
            Username = dto.Username,
            DisplayName = dto.DisplayName,
            PasswordHash = Hash(dto.Password)
        };
        db.Users.Add(user);
        try
        {
            await db.SaveChangesAsync();
        }
        catch (DbUpdateException ex)
        {
            var baseEx = ex.GetBaseException();
            if (baseEx is PostgresException pex && pex.SqlState == "23505")
            {
                return BadRequest(new { message = "Username already exists" });
            }
            return StatusCode(500, new { message = "Registration failed" });
        }
        var token = tokens.CreateToken(user);
        return Ok(new { token, user.Id, user.Username, user.DisplayName, user.AvatarUrl });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginDto dto)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.Username == dto.Username);
        if (user == null || user.PasswordHash != Hash(dto.Password))
            return Unauthorized();
        var token = tokens.CreateToken(user);
        return Ok(new { token, user.Id, user.Username, user.DisplayName, user.AvatarUrl });
    }

    private static string Hash(string input)
    {
        using var sha = SHA256.Create();
        var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes);
    }
}
