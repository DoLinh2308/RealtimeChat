using System;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RealtimeChat.Api.Data;
using RealtimeChat.Api.Services;

namespace RealtimeChat.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController(AppDbContext db, IWebHostEnvironment env, PresenceService presence) : ControllerBase
{
    public record UpdateProfileDto(string? DisplayName, string? Username, string? CurrentPassword, string? NewPassword);

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var me = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var users = await db.Users
            .Where(u => u.Id != me)
            .Select(u => new { u.Id, u.Username, u.DisplayName, u.AvatarUrl })
            .ToListAsync();
        return Ok(users);
    }

    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        var id = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await db.Users.FindAsync(id);
        return Ok(new { user!.Id, user.Username, user.DisplayName, user.AvatarUrl });
    }

    [HttpPut("me")]
    public async Task<IActionResult> UpdateMe([FromBody] UpdateProfileDto dto)
    {
        var id = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await db.Users.FindAsync(id);
        if (user == null) return NotFound();

        if (!string.IsNullOrWhiteSpace(dto.Username) && !string.Equals(dto.Username, user.Username, StringComparison.OrdinalIgnoreCase))
        {
            var exists = await db.Users.AnyAsync(u => u.Username == dto.Username && u.Id != id);
            if (exists)
            {
                return BadRequest(new { message = "Username already exists" });
            }
            user.Username = dto.Username!;
        }

        if (dto.DisplayName != null)
        {
            user.DisplayName = string.IsNullOrWhiteSpace(dto.DisplayName) ? null : dto.DisplayName.Trim();
        }

        if (!string.IsNullOrWhiteSpace(dto.NewPassword))
        {
            if (string.IsNullOrWhiteSpace(dto.CurrentPassword) || !string.Equals(user.PasswordHash, Hash(dto.CurrentPassword)))
            {
                return BadRequest(new { message = "Mật khẩu hiện tại không đúng" });
            }
            user.PasswordHash = Hash(dto.NewPassword);
        }

        await db.SaveChangesAsync();
        return Ok(new { user.Id, user.Username, user.DisplayName, user.AvatarUrl });
    }

    [HttpPost("avatar")]
    [RequestSizeLimit(20_000_000)]
    public async Task<IActionResult> UploadAvatar(IFormFile file)
    {
        if (file == null || file.Length == 0) return BadRequest();
        var id = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!);
        var user = await db.Users.FindAsync(id);
        if (user == null) return NotFound();
        var uploads = Path.Combine(env.ContentRootPath, "uploads");
        Directory.CreateDirectory(uploads);
        var ext = Path.GetExtension(file.FileName);
        var stored = $"avatar_{id}{ext}";
        var path = Path.Combine(uploads, stored);
        await using var fs = new FileStream(path, FileMode.Create);
        await file.CopyToAsync(fs);
        user.AvatarUrl = $"/uploads/{stored}";
        await db.SaveChangesAsync();
        return Ok(new { user.AvatarUrl });
    }

    private static string Hash(string input)
    {
        using var sha = SHA256.Create();
        var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(bytes);
    }
}




