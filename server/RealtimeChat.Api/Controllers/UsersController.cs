using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using RealtimeChat.Api.Data;

namespace RealtimeChat.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class UsersController(AppDbContext db, IWebHostEnvironment env) : ControllerBase
{
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
}
